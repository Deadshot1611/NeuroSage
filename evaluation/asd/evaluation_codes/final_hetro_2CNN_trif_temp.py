"""
final_heterogeneous_pipeline.py
==============================================================
Final Deployment Architecture:
- FixMaps Backbone : MobileNet-V2
- FixPts Backbone  : EfficientNet-B0
- Temporal/Spatial : GAT (Graph Attention Network)
- Global Features  : Statistical MLP
- Fusion Strategy  : Bayesian Log-Odds (T=0.25)
Includes Comprehensive Telemetry and Advanced Metrics.
"""

import os
os.environ["TORCHDYNAMO_DISABLE"]        = "1"
os.environ["CUBLAS_WORKSPACE_CONFIG"]    = ":4096:8"

import time
import datetime
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.backends.cudnn as cudnn
import numpy as np
import random
import pickle
from pathlib import Path
from PIL import Image
from scipy.ndimage import gaussian_filter
from scipy.spatial.distance import pdist, squareform
import torchvision.transforms as T
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights, efficientnet_b0, EfficientNet_B0_Weights
from torch_geometric.nn import GATConv, global_mean_pool
from torch_geometric.data import Data, Batch
from sklearn.metrics import f1_score, accuracy_score, precision_score, recall_score, roc_auc_score
from tqdm import tqdm

# ── CONFIG ─────────────────────────────────────────────────────
SEED         = 42
IMG_W, IMG_H = 1280, 1024
HEATMAP_SZ   = 224
SEQ_LEN      = 20
MIN_FIX      = 3
HIDDEN       = 128
STAT_DIM     = 16
BATCH_SIZE   = 32
MAX_EPOCHS   = 50
PATIENCE     = 10
LR           = 3e-4
WD           = 0.01
N_SUBJECTS   = 15
TEMPERATURE  = 0.25  # Calibrated for organic variance

BASE_PATH  = Path(r'C:\Users\kutus\OneDrive\Documents\autism\data\raw\saliency4asd\training_data')
OUT_DIR    = Path(r'C:\Users\kutus\OneDrive\Documents\autism\models\gaze\multiview')
CACHE_DIR  = OUT_DIR / 'cache_hetero'
OUT_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

def get_time(): return datetime.datetime.now().strftime("%H:%M:%S")

def set_seed(seed: int):
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    cudnn.deterministic = True; cudnn.benchmark = False
    torch.use_deterministic_algorithms(True, warn_only=True)

# ── DATASET PROCESSING ─────────────────────────────────────────
def parse_scanpath_file(fp):
    s, c = [], []; lines = Path(fp).read_text().splitlines()
    for l in lines:
        if not l.strip() or l.startswith('Idx'): continue
        p = l.split(',')
        if len(p)<4: continue
        try: i, x, y, d = int(p[0]), float(p[1]), float(p[2]), float(p[3])
        except: continue
        if i==0 and c: s.append(c); c=[]
        c.append({'x':x,'y':y,'duration':d})
    if c: s.append(c)
    return s

def gen_view(fix, mode='map', out_sz=HEATMAP_SZ):
    arr = np.zeros((out_sz, out_sz), dtype=np.float32)
    sx, sy = out_sz/IMG_W, out_sz/IMG_H
    for f in fix:
        x, y = int(np.clip(f['x']*sx, 0, out_sz-1)), int(np.clip(f['y']*sy, 0, out_sz-1))
        arr[y,x] += (f['duration']/1000.0)
    if mode=='map': arr = gaussian_filter(arr, sigma=20)
    mx = arr.max()
    if mx>0: arr/=mx
    return arr

_tx = T.Compose([T.ToTensor(), T.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225])])
def a2t(arr): return _tx(Image.fromarray((arr*255).astype(np.uint8)).convert('RGB'))

def ext_stat(fix):
    x, y, d = np.array([f['x'] for f in fix]), np.array([f['y'] for f in fix]), np.array([f['duration'] for f in fix])
    n = len(fix); xn, yn = x/IMG_W, y/IMG_H
    md, std_d, mxd, td = d.mean(), d.std() if n>1 else 0, d.max(), d.sum()
    fr = n/(td/1000.0+1e-6)
    if n>1:
        dx, dy = np.diff(xn), np.diff(yn); sac = np.sqrt(dx**2+dy**2)
        ms, ss, mxs, ts = sac.mean(), sac.std(), sac.max(), sac.sum()
    else: ms=ss=mxs=ts=0.0
    sp = np.sqrt((xn.std() if n>1 else 0)**2 + (yn.std() if n>1 else 0)**2)
    cd = np.sqrt((xn-0.5)**2 + (yn-0.5)**2).mean()
    h, _ = np.histogram(xn, bins=8, range=(0,1)); h = h/(h.sum()+1e-6)
    f = np.array([md, std_d, mxd, td, fr, ms, ss, mxs, ts, 0, 0, sp, cd, 0, -np.sum(h*np.log(h+1e-9)), float(n)], dtype=np.float32)
    return np.clip(np.log1p(np.abs(f))*np.sign(f), -10, 10).astype(np.float32)

def s2g(fix):
    n = len(fix)
    if n<MIN_FIX: return None
    xn, yn, dn = np.array([f['x'] for f in fix])/IMG_W, np.array([f['y'] for f in fix])/IMG_H, np.log1p(np.array([f['duration'] for f in fix]))/6.0
    nf = [[xn[i], yn[i], dn[i], i/SEQ_LEN, np.sqrt((xn[i]-xn[i-1])**2+(yn[i]-yn[i-1])**2)*10 if i>0 else 0, np.sqrt((xn[i]-0.5)**2+(yn[i]-0.5)**2)] for i in range(n)]
    ei, ea = [], []
    for i in range(n-1):
        dx, dy = xn[i+1]-xn[i], yn[i+1]-yn[i]
        ei.append([i, i+1]); ea.append([np.sqrt(dx**2+dy**2), np.sin(np.arctan2(dy,dx)), np.cos(np.arctan2(dy,dx))])
    if not ei: ei=[[i,i] for i in range(n)]; ea=[[0.,0.,1.]]*n
    return Data(x=torch.tensor(nf, dtype=torch.float), edge_index=torch.tensor(ei, dtype=torch.long).t().contiguous(), edge_attr=torch.tensor(ea, dtype=torch.float))

def load_all_subjects():
    ad = {}
    print(f"[{get_time()}] Loading Dataset into Memory...")
    start_time = time.time()
    for cn, l in [('ASD',1), ('TD',0)]:
        s = {}; files = sorted((BASE_PATH/cn).glob(f'{cn}_scanpath_*.txt'))
        for f in tqdm(files, leave=False, desc=f"Parsing {cn}"):
            try: id = int(f.stem.split('_')[-1])
            except: continue
            for i, fix in enumerate(parse_scanpath_file(f)):
                g = s2g(fix)
                if len(fix)<MIN_FIX or g is None: continue
                if i not in s: s[i]=[]
                s[i].append({'img_id':id, 'fixations':fix, 'stats':ext_stat(fix), 'graph':g, 'map_arr':gen_view(fix,'map'), 'pt_arr':gen_view(fix,'pts'), 'label':l})
        s = {k: s[k] for k in sorted(s.keys(), key=lambda k: len(s[k]), reverse=True)[:N_SUBJECTS]}
        ad[cn] = {'subjects':s, 'label':l}
    print(f"[{get_time()}] Dataset loading completed in {time.time()-start_time:.1f}s.")
    return ad

# ── HETEROGENEOUS CACHE (MOBILE = MAPS, EFFICIENT = PTS) ───────
def cache_views(all_data):
    m_p = CACHE_DIR / 'mobile_maps.pkl'; e_p = CACHE_DIR / 'efficient_pts.pkl'
    if m_p.exists() and e_p.exists():
        print(f"[{get_time()}] Found Heterogeneous Caches on disk. Loading...")
        return pickle.load(open(m_p,'rb')), pickle.load(open(e_p,'rb'))
        
    print(f"[{get_time()}] Generating CNN Features (Maps: MobileNet, Pts: EfficientNet)...")
    start_time = time.time()
    bb_map = mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1).to(device).eval()
    bb_pt = efficientnet_b0(weights=EfficientNet_B0_Weights.IMAGENET1K_V1).to(device).eval()
    for m in [bb_map, bb_pt]:
        for p in m.parameters(): p.requires_grad=False
        
    mc, pc = {}, {}
    for cn, cd in all_data.items():
        for i, smp in cd['subjects'].items():
            keys = [(cn, i, s['img_id']) for s in smp]
            for j in range(0, len(smp), 32):
                with torch.no_grad():
                    mt = torch.stack([a2t(s['map_arr']) for s in smp[j:j+32]]).to(device)
                    pt = torch.stack([a2t(s['pt_arr']) for s in smp[j:j+32]]).to(device)
                    mf = F.adaptive_avg_pool2d(bb_map.features(mt), (1,1)).flatten(1).cpu().numpy()
                    pf = bb_pt.avgpool(bb_pt.features(pt)).flatten(1).cpu().numpy()
                for k, m, p in zip(keys[j:j+32], mf, pf): mc[k], pc[k] = m, p
                
    with open(m_p,'wb') as f: pickle.dump(mc,f)
    with open(e_p,'wb') as f: pickle.dump(pc,f)
    print(f"[{get_time()}] Caching completed in {time.time()-start_time:.1f}s.")
    return mc, pc

# ── TRIFUSION ARCHITECTURE ─────────────────────────────────────
class TriFusionFixed(nn.Module):
    def __init__(self):
        super().__init__()
        self.cnn_proj = nn.Sequential(nn.Linear(1280, HIDDEN), nn.LayerNorm(HIDDEN), nn.GELU())
        self.g1 = GATConv(6, HIDDEN, heads=4, concat=True)
        self.g2 = GATConv(HIDDEN*4, HIDDEN, heads=4, concat=True)
        self.g3 = GATConv(HIDDEN*4, HIDDEN, heads=1, concat=False)
        self.gnorm = nn.LayerNorm(HIDDEN)
        self.sproj = nn.Sequential(nn.Linear(STAT_DIM, HIDDEN), nn.LayerNorm(HIDDEN), nn.GELU())
        self.attn = nn.MultiheadAttention(HIDDEN, 4, batch_first=True)
        self.outp = nn.Sequential(nn.Linear(HIDDEN*2, HIDDEN), nn.LayerNorm(HIDDEN), nn.GELU(), nn.Dropout(0.3))
        self.clf = nn.Sequential(nn.Linear(HIDDEN, 64), nn.GELU(), nn.Dropout(0.3), nn.Linear(64, 2))
        
    def forward(self, cnn, g, s):
        gx = self.gnorm(global_mean_pool(self.g3(F.elu(self.g2(F.elu(self.g1(g.x, g.edge_index, g.edge_attr)), g.edge_index, g.edge_attr)), g.edge_index, g.edge_attr), g.batch))
        kv = torch.stack([self.cnn_proj(cnn), gx], dim=1); q = self.sproj(s).unsqueeze(1)
        a, _ = self.attn(q, kv, kv)
        return self.clf(self.outp(torch.cat([a.squeeze(1), q.squeeze(1)], dim=1)))

class SubjDS(torch.utils.data.Dataset):
    def __init__(self, s, c): self.s, self.c = s, c
    def __len__(self): return len(self.s)
    def __getitem__(self, i): return self.s[i]['graph'], torch.tensor(self.s[i]['stats'], dtype=torch.float), torch.tensor(self.c[(self.s[i]['cls'], self.s[i]['subj_idx'], self.s[i]['img_id'])], dtype=torch.float), torch.tensor(self.s[i]['label'], dtype=torch.long)

def col(b): return Batch.from_data_list([i[0] for i in b]), torch.stack([i[1] for i in b]), torch.stack([i[2] for i in b]), torch.stack([i[3] for i in b])

# ── BAYESIAN FUSION & TRAINING ─────────────────────────────────
def bayesian_fusion(p_map, p_pt, temp):
    p1 = np.clip(p_map, 1e-5, 1-1e-5); p2 = np.clip(p_pt, 1e-5, 1-1e-5)
    return float(1 / (1 + np.exp(-((np.log(p1/(1-p1)) + np.log(p2/(1-p2))) / temp))))

def get_conf(p): return p if p > 0.5 else 1 - p

def train_eval_view(tr, te, cache, w, view_name):
    trl = torch.utils.data.DataLoader(SubjDS(tr, cache), batch_size=BATCH_SIZE, shuffle=True, collate_fn=col)
    tel = torch.utils.data.DataLoader(SubjDS(te, cache), batch_size=BATCH_SIZE, shuffle=False, collate_fn=col)
    m = TriFusionFixed().to(device)
    opt = torch.optim.AdamW(m.parameters(), lr=LR, weight_decay=WD)
    sch = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(opt, 10)
    crit = nn.CrossEntropyLoss(weight=w)
    
    bl, ni, bs = float('inf'), 0, None
    for ep in range(MAX_EPOCHS):
        m.train(); tot = 0
        for g, s, c, l in trl:
            opt.zero_grad()
            out = m(c.to(device), g.to(device), s.to(device))
            loss = crit(out, l.to(device))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0)
            opt.step()
            tot += loss.item()
        sch.step()
        if tot < bl: bl, bs, ni = tot, {k: v.cpu().clone() for k, v in m.state_dict().items()}, 0
        else: ni += 1
        if ni >= PATIENCE: 
            print(f"      [{view_name}] Early stopping Ep {ep+1:02d} | Loss: {bl:.4f}")
            break
            
    m.load_state_dict({k: v.to(device) for k, v in bs.items()}); m.eval(); pr = []
    with torch.no_grad():
        for g, s, c, _ in tel: 
            pr.extend(F.softmax(m(c.to(device), g.to(device), s.to(device)), dim=1)[:, 1].cpu().numpy().tolist())
    return float(np.mean(pr))

# ── MAIN LOSO LOOP ─────────────────────────────────────────────
def run_loso(all_data, map_cache, pt_cache):
    all_s = [s | {'cls': c, 'subj_idx': i} for c, cd in all_data.items() for i, s_list in cd['subjects'].items() for s in s_list]
    keys = sorted(set((s['cls'], s['subj_idx']) for s in all_s))
    
    print(f"\n[{get_time()}] Commencing 30-Fold LOSO Evaluation...")
    print("="*80)
    
    trues, preds, probs_fused = [], [], []
    map_confs, pt_confs, fused_confs = [], [], []
    
    total_start = time.time()
    
    for fold_i, (t_cls, t_subj) in enumerate(keys):
        fold_start = time.time()
        print(f"\n[{get_time()}] --- Fold {fold_i+1:02d}/30: Target {t_cls}_Subj{t_subj} ---")
        
        true_l = all_data[t_cls]['label']
        trues.append(true_l)
        
        tr = [s for s in all_s if not (s['cls']==t_cls and s['subj_idx']==t_subj)]
        te = [s for s in all_s if s['cls']==t_cls and s['subj_idx']==t_subj]
        
        n_asd = sum(1 for s in tr if s['label']==1)
        w = torch.tensor([1.0, (len(tr)-n_asd)/max(n_asd, 1)], dtype=torch.float).to(device)
        
        set_seed(SEED + fold_i)
        p_map = train_eval_view(tr, te, map_cache, w, "Mobile-Maps")
        set_seed(SEED + fold_i)
        p_pt  = train_eval_view(tr, te, pt_cache, w, "Effic-Pts  ")
        
        p_fused = bayesian_fusion(p_map, p_pt, TEMPERATURE)
        pred_l = 1 if p_fused > 0.5 else 0
        preds.append(pred_l)
        probs_fused.append(p_fused)
        
        c_map, c_pt, c_fus = get_conf(p_map), get_conf(p_pt), get_conf(p_fused)
        map_confs.append(c_map); pt_confs.append(c_pt); fused_confs.append(c_fus)
        
        correct_str = "✓ CORRECT" if pred_l == true_l else "✗ INCORRECT"
        pred_str = "ASD" if pred_l == 1 else "TD "
        
        print(f"  > Fold Results: P(Map)={p_map:.3f} [{c_map:.1%}] | P(Pt)={p_pt:.3f} [{c_pt:.1%}]")
        print(f"  > Fusion (T={TEMPERATURE}): P(ASD)={p_fused:.3f} [{c_fus:.1%}] -> Predicted: {pred_str} | {correct_str}")
        print(f"  > Fold Duration: {time.time()-fold_start:.1f}s")
        
    print(f"\n[{get_time()}] ALL FOLDS COMPLETE. Total processing time: {(time.time() - total_start)/60:.1f} minutes.")
    
    # Calculate Advanced Metrics
    acc  = accuracy_score(trues, preds)
    f1   = f1_score(trues, preds)
    prec = precision_score(trues, preds, zero_division=0)
    rec  = recall_score(trues, preds, zero_division=0)
    try: auc = roc_auc_score(trues, probs_fused)
    except: auc = 0.0
    
    print("\n" + "="*60)
    print("  FINAL HETEROGENEOUS PIPELINE METRICS")
    print("="*60)
    print(f"  Accuracy             : {acc:.2%}")
    print(f"  F1-Score             : {f1:.4f}")
    print(f"  Precision            : {prec:.4f}")
    print(f"  Recall               : {rec:.4f}")
    print(f"  AUC-ROC              : {auc:.4f}")
    print("-" * 60)
    print("  AVERAGE CONFIDENCE RATINGS:")
    print(f"  FixMaps (MobileNet)  : {np.mean(map_confs):.2%}")
    print(f"  FixPts (EfficientNet): {np.mean(pt_confs):.2%}")
    print(f"  Fused (T={TEMPERATURE})        : {np.mean(fused_confs):.2%}")
    print("="*60)

def main():
    print("="*80)
    print("  Initializing Heterogeneous TriFusion Pipeline (MobileNet + EfficientNet)")
    print("="*80)
    set_seed(SEED)
    ad = load_all_subjects()
    mc, pc = cache_views(ad)
    run_loso(ad, mc, pc)

if __name__ == "__main__": main()