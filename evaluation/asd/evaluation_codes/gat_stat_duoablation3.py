"""
ablation_stats_gatplus.py
==============================================================
Runs Stats Only + GAT+Stats ablation only.
GAT Only already done separately (90.00%).
Final table includes GAT Only + TriFusion as hardcoded refs.
"""

import os
os.environ["TORCHDYNAMO_DISABLE"]     = "1"
os.environ["CUBLAS_WORKSPACE_CONFIG"] = ":4096:8"

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.backends.cudnn as cudnn
import numpy as np
import random
import json
from pathlib import Path
from torch_geometric.nn import GATConv, global_mean_pool
from torch_geometric.data import Data, Batch
from sklearn.metrics import (accuracy_score, precision_recall_fscore_support,
                              roc_auc_score, confusion_matrix)
from tqdm import tqdm

# ── CONFIG ─────────────────────────────────────────────────────
SEED         = 42
IMG_W, IMG_H = 1280, 1024
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

BASE_PATH = Path(r'C:\Users\kutus\OneDrive\Documents\autism\data\raw\saliency4asd\training_data')
OUT_DIR   = Path(r'C:\Users\kutus\OneDrive\Documents\autism\models\gaze\ablation')
OUT_DIR.mkdir(parents=True, exist_ok=True)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Device: {device}")


# ── DETERMINISM ────────────────────────────────────────────────
def set_seed(seed: int):
    random.seed(seed); np.random.seed(seed)
    torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)
    cudnn.deterministic = True; cudnn.benchmark = False
    torch.use_deterministic_algorithms(True, warn_only=True)


# ── DATA LOADING ───────────────────────────────────────────────
def parse_scanpath_file(filepath):
    subjects, current = [], []
    try: lines = Path(filepath).read_text().splitlines()
    except Exception: return []
    for line in lines:
        line = line.strip()
        if not line or line.startswith('Idx'): continue
        parts = line.split(',')
        if len(parts) < 4: continue
        try: idx, x, y, dur = int(parts[0]), float(parts[1]), float(parts[2]), float(parts[3])
        except ValueError: continue
        if idx == 0 and current: subjects.append(current); current = []
        current.append({'x': x, 'y': y, 'duration': dur})
    if current: subjects.append(current)
    return subjects

def extract_stats(fixations):
    x   = np.array([f['x']        for f in fixations], np.float64)
    y   = np.array([f['y']        for f in fixations], np.float64)
    dur = np.array([f['duration'] for f in fixations], np.float64)
    n   = len(fixations); xn = x / IMG_W; yn = y / IMG_H
    mean_dur = dur.mean(); std_dur = dur.std() if n > 1 else 0.0
    max_dur  = dur.max();  total_dur = dur.sum()
    fix_rate = n / (total_dur / 1000.0 + 1e-6)
    if n > 1:
        dx = np.diff(xn); dy = np.diff(yn); sac = np.sqrt(dx**2 + dy**2)
        mean_sac = sac.mean(); std_sac = sac.std(); max_sac = sac.max(); total_path = sac.sum()
    else: mean_sac = std_sac = max_sac = total_path = 0.0
    spread = np.sqrt((xn.std() if n > 1 else 0)**2 + (yn.std() if n > 1 else 0)**2)
    cdist  = np.sqrt((xn - 0.5)**2 + (yn - 0.5)**2).mean()
    hist, _ = np.histogram(xn, bins=8, range=(0, 1)); hist = hist / (hist.sum() + 1e-6)
    feats = np.array([mean_dur, std_dur, max_dur, total_dur, fix_rate,
                      mean_sac, std_sac, max_sac, total_path,
                      0.0, 0.0, spread, cdist, 0.0,
                      -np.sum(hist * np.log(hist + 1e-9)), float(n)], dtype=np.float32)
    return np.clip(np.log1p(np.abs(feats)) * np.sign(feats), -10, 10).astype(np.float32)

def scanpath_to_graph(fixations):
    n = len(fixations)
    if n < MIN_FIX: return None
    xn = np.array([f['x'] for f in fixations], np.float32) / IMG_W
    yn = np.array([f['y'] for f in fixations], np.float32) / IMG_H
    dn = np.log1p(np.array([f['duration'] for f in fixations], np.float32)) / 6.0
    node_feat = []
    for i in range(n):
        vel = np.sqrt((xn[i]-xn[i-1])**2 + (yn[i]-yn[i-1])**2)*10.0 if i > 0 else 0.0
        node_feat.append([xn[i], yn[i], dn[i], i/SEQ_LEN, vel,
                          np.sqrt((xn[i]-0.5)**2 + (yn[i]-0.5)**2)])
    ei, ea = [], []
    for i in range(n - 1):
        dx, dy = xn[i+1]-xn[i], yn[i+1]-yn[i]
        d = np.sqrt(dx**2 + dy**2); a = np.arctan2(dy, dx)
        ei.append([i, i+1]); ea.append([d, np.sin(a), np.cos(a)])
    if not ei: ei = [[i, i] for i in range(n)]; ea = [[0., 0., 1.]] * n
    return Data(
        x          = torch.tensor(np.array(node_feat, np.float32), dtype=torch.float),
        edge_index = torch.tensor(ei, dtype=torch.long).t().contiguous(),
        edge_attr  = torch.tensor(ea, dtype=torch.float),
    )

def load_all_subjects():
    all_data = {}
    for cls_name, label in [('ASD', 1), ('TD', 0)]:
        print(f"  Loading {cls_name}...")
        subjects = {}
        files = sorted((BASE_PATH / cls_name).glob(f'{cls_name}_scanpath_*.txt'))
        for f in tqdm(files, leave=False):
            try: img_id = int(f.stem.split('_')[-1])
            except: continue
            for subj_idx, fixations in enumerate(parse_scanpath_file(f)):
                if len(fixations) < MIN_FIX: continue
                graph = scanpath_to_graph(fixations)
                if graph is None: continue
                if subj_idx not in subjects: subjects[subj_idx] = []
                subjects[subj_idx].append({
                    'img_id': img_id, 'fixations': fixations,
                    'stats':  extract_stats(fixations),
                    'graph':  graph, 'label': label,
                })
        sorted_subjs = sorted(subjects.keys(),
                              key=lambda s: len(subjects[s]), reverse=True)
        subjects = {k: subjects[k] for k in sorted_subjs[:N_SUBJECTS]}
        n_samps  = sum(len(v) for v in subjects.values())
        print(f"  {cls_name}: {len(subjects)} subjects, {n_samps} samples")
        all_data[cls_name] = {'subjects': subjects, 'label': label}
    return all_data


# ══════════════════════════════════════════════════════════════
# MODEL 1: STATS ONLY
# ══════════════════════════════════════════════════════════════
class StatsOnly(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(STAT_DIM, 64), nn.LayerNorm(64), nn.GELU(), nn.Dropout(0.3),
            nn.Linear(64, 32),       nn.GELU(),         nn.Dropout(0.3),
            nn.Linear(32, 2),
        )
    def forward(self, graph=None, stats=None):
        return self.net(stats)


# ══════════════════════════════════════════════════════════════
# MODEL 2: GAT + STATS (no CNN)
# ══════════════════════════════════════════════════════════════
class GATplusStats(nn.Module):
    def __init__(self):
        super().__init__()
        H = HIDDEN
        self.gat1  = GATConv(6,   H, heads=4, edge_dim=3, dropout=0.3, concat=True)
        self.gat2  = GATConv(H*4, H, heads=4, edge_dim=3, dropout=0.3, concat=True)
        self.gat3  = GATConv(H*4, H, heads=1, edge_dim=3, dropout=0.3, concat=False)
        self.gnorm = nn.LayerNorm(H)
        self.stat_proj = nn.Sequential(
            nn.Linear(STAT_DIM, H), nn.LayerNorm(H), nn.GELU()
        )
        self.gate = nn.Sequential(
            nn.Linear(H * 2, H), nn.LayerNorm(H), nn.GELU(), nn.Dropout(0.3)
        )
        self.classifier = nn.Sequential(
            nn.Linear(H, 64), nn.GELU(), nn.Dropout(0.3), nn.Linear(64, 2)
        )
    def forward(self, graph, stats):
        x = F.elu(self.gat1(graph.x, graph.edge_index, graph.edge_attr))
        x = F.elu(self.gat2(x,       graph.edge_index, graph.edge_attr))
        x = self.gat3(x,             graph.edge_index, graph.edge_attr)
        gat_emb  = self.gnorm(global_mean_pool(x, graph.batch))
        stat_emb = self.stat_proj(stats)
        fused    = self.gate(torch.cat([gat_emb, stat_emb], dim=1))
        return self.classifier(fused)


# ── DATASET ────────────────────────────────────────────────────
class AblationDS(torch.utils.data.Dataset):
    def __init__(self, samples):
        self.samples = samples
    def __len__(self): return len(self.samples)
    def __getitem__(self, i):
        s = self.samples[i]
        return (s['graph'],
                torch.tensor(s['stats'], dtype=torch.float),
                torch.tensor(s['label'], dtype=torch.long))

def collate_fn(batch):
    return (Batch.from_data_list([b[0] for b in batch]),
            torch.stack([b[1] for b in batch]),
            torch.stack([b[2] for b in batch]))


# ── TRAIN / EVAL ───────────────────────────────────────────────
def train_epoch(model, loader, optimizer, criterion):
    model.train(); total = 0.0
    for graphs, stats, labels in loader:
        graphs = graphs.to(device); stats = stats.to(device); labels = labels.to(device)
        optimizer.zero_grad()
        loss = criterion(model(graphs, stats), labels)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step(); total += loss.item()
    return total / max(len(loader), 1)

def eval_model(model, loader):
    model.eval(); probs_all, preds_all, targets_all = [], [], []
    with torch.no_grad():
        for graphs, stats, labels in loader:
            graphs = graphs.to(device); stats = stats.to(device)
            probs  = F.softmax(model(graphs, stats), dim=1)[:, 1].cpu().numpy()
            probs_all.extend(probs.tolist())
            preds_all.extend((probs > 0.5).astype(int).tolist())
            targets_all.extend(labels.numpy().tolist())
    return preds_all, probs_all, targets_all


# ── LOSO ───────────────────────────────────────────────────────
def run_loso(model_class, model_name, all_data):
    print(f"\n{'='*55}")
    print(f"  Ablation: {model_name}")
    print(f"{'='*55}")

    all_samples = []
    for cls_name, cls_data in all_data.items():
        for subj_idx, samples in cls_data['subjects'].items():
            for s in samples:
                all_samples.append({**s, 'cls': cls_name, 'subj_idx': subj_idx})

    subject_keys = sorted(set((s['cls'], s['subj_idx']) for s in all_samples))
    fold_results = []

    for fold_i, (test_cls, test_subj) in enumerate(subject_keys):
        set_seed(SEED + fold_i)
        true_label    = all_data[test_cls]['label']
        train_samples = [s for s in all_samples
                         if not (s['cls'] == test_cls and s['subj_idx'] == test_subj)]
        test_samples  = [s for s in all_samples
                         if s['cls'] == test_cls and s['subj_idx'] == test_subj]
        if not test_samples: continue

        train_loader = torch.utils.data.DataLoader(
            AblationDS(train_samples), batch_size=BATCH_SIZE,
            shuffle=True, num_workers=0, collate_fn=collate_fn)
        test_loader  = torch.utils.data.DataLoader(
            AblationDS(test_samples), batch_size=BATCH_SIZE,
            shuffle=False, num_workers=0, collate_fn=collate_fn)

        n_asd = sum(1 for s in train_samples if s['label'] == 1)
        n_td  = len(train_samples) - n_asd
        w     = torch.tensor([1.0, n_td / max(n_asd, 1)], dtype=torch.float).to(device)

        model     = model_class().to(device)
        optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WD)
        criterion = nn.CrossEntropyLoss(weight=w, label_smoothing=0.05)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(optimizer, T_0=10)

        best_loss, no_improve, best_state = float('inf'), 0, None
        for epoch in range(MAX_EPOCHS):
            loss = train_epoch(model, train_loader, optimizer, criterion)
            scheduler.step()
            if loss < best_loss:
                best_loss  = loss
                best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
                no_improve = 0
            else:
                no_improve += 1
            if no_improve >= PATIENCE: break

        model.load_state_dict({k: v.to(device) for k, v in best_state.items()})
        preds, probs, targets = eval_model(model, test_loader)

        avg_prob   = float(np.mean(probs))
        final_pred = 1 if avg_prob > 0.5 else 0
        correct    = (final_pred == true_label)
        conf       = avg_prob if true_label == 1 else 1 - avg_prob

        print(f"  Fold {fold_i+1:02d} — {test_cls}_subj{test_subj}  "
              f"P(ASD)={avg_prob:.3f}  conf={conf:.3f}  "
              f"pred={'ASD' if final_pred else 'TD '}  "
              f"true={'ASD' if true_label else 'TD '}  "
              f"{'✓' if correct else '✗'}")

        fold_results.append({
            'cls': test_cls, 'subj_idx': test_subj,
            'true_label': true_label, 'pred_label': final_pred,
            'avg_prob': avg_prob, 'correct': correct, 'conf': conf,
        })
        del model; torch.cuda.empty_cache()

    return fold_results


# ── METRICS ────────────────────────────────────────────────────
def summarize(fold_results, model_name):
    targets = [r['true_label'] for r in fold_results]
    preds   = [r['pred_label'] for r in fold_results]
    probs   = [r['avg_prob']   for r in fold_results]
    confs   = [r['conf']       for r in fold_results]

    acc              = accuracy_score(targets, preds)
    prec, rec, f1, _ = precision_recall_fscore_support(
        targets, preds, average='binary', zero_division=0)
    cm = confusion_matrix(targets, preds)
    try:    auc = roc_auc_score(targets, probs)
    except: auc = float('nan')

    tn, fp, fn, tp = cm.ravel() if cm.shape == (2, 2) else (0, 0, 0, 0)
    specificity    = tn / (tn + fp) if (tn + fp) > 0 else float('nan')

    n_correct     = sum(r['correct'] for r in fold_results)
    correct_confs = [r['conf'] for r in fold_results if     r['correct']]
    wrong_confs   = [r['conf'] for r in fold_results if not r['correct']]
    avg_prob_asd  = float(np.mean([r['avg_prob'] for r in fold_results if r['true_label'] == 1]))
    avg_prob_td   = float(np.mean([r['avg_prob'] for r in fold_results if r['true_label'] == 0]))

    # ── fixed f-string (no conditional inside format spec) ────
    wrong_conf_str = f"{float(np.mean(wrong_confs)):.3f}" if wrong_confs else "n/a"

    print(f"\n  ── {model_name} Results ──")
    print(f"  Accuracy    : {acc:.4f} ({acc:.2%})   ({n_correct}/{len(fold_results)} correct)")
    print(f"  Precision   : {prec:.4f}")
    print(f"  Recall/Sens : {rec:.4f}")
    print(f"  Specificity : {specificity:.4f}")
    print(f"  F1-Score    : {f1:.4f}")
    print(f"  ROC-AUC     : {auc:.4f}")
    print(f"  Avg Conf    : {float(np.mean(confs)):.3f}  "
          f"(correct: {float(np.mean(correct_confs)):.3f}  wrong: {wrong_conf_str})")
    print(f"  Avg P(ASD)  : ASD subj={avg_prob_asd:.3f}  TD subj={avg_prob_td:.3f}")
    print(f"  Confusion   : TP={tp} TN={tn} FP={fp} FN={fn}")

    return {
        'model': model_name, 'accuracy': acc, 'precision': prec,
        'recall': rec, 'specificity': specificity, 'f1': f1, 'auc': auc,
        'avg_conf': float(np.mean(confs)),
        'avg_conf_correct': float(np.mean(correct_confs)) if correct_confs else None,
        'avg_conf_wrong':   float(np.mean(wrong_confs))   if wrong_confs   else None,
        'avg_prob_asd': avg_prob_asd, 'avg_prob_td': avg_prob_td,
        'n_correct': n_correct, 'n_total': len(fold_results),
        'tp': int(tp), 'tn': int(tn), 'fp': int(fp), 'fn': int(fn),
        'cm': cm.tolist(),
    }


# ── FINAL TABLE ────────────────────────────────────────────────
def print_comparison_table(all_metrics):
    # Hardcoded from completed runs
    gat_only_ref = {
        'model': 'GAT Only', 'accuracy': 0.9000, 'precision': 0.8750,
        'recall': 0.9333, 'specificity': 0.8667, 'f1': 0.9032,
        'auc': 0.9689, 'avg_conf': 0.556, 'avg_prob_asd': 0.535,
        'avg_prob_td': 0.443, 'n_correct': 27, 'n_total': 30,
    }
    trifusion_ref = {
        'model': 'TriFusion (Full)', 'accuracy': 0.9667, 'precision': 1.0000,
        'recall': 0.9333, 'specificity': 1.0000, 'f1': 0.9655,
        'auc': 0.9956, 'avg_conf': 0.577, 'avg_prob_asd': 0.578,
        'avg_prob_td': 0.419, 'n_correct': 29, 'n_total': 30,
    }

    rows = [gat_only_ref] + all_metrics + [trifusion_ref]

    print("\n" + "="*105)
    print("  ABLATION STUDY — COMPONENT CONTRIBUTION (Subject-Level LOSO, 15 ASD + 15 TD)")
    print("="*105)
    print(f"  {'Model':<22} {'Acc':>8} {'Prec':>7} {'Rec':>7} {'Spec':>7} "
          f"{'F1':>7} {'AUC':>8} {'AvgConf':>9} {'P(ASD)|ASD':>11} {'P(ASD)|TD':>10} {'Correct':>9}")
    print("-"*105)
    for r in rows:
        print(f"  {r['model']:<22} "
              f"{r['accuracy']:>7.2%} "
              f"{r['precision']:>7.4f} "
              f"{r['recall']:>7.4f} "
              f"{r.get('specificity', float('nan')):>7.4f} "
              f"{r['f1']:>7.4f} "
              f"{r['auc']:>8.4f} "
              f"{r['avg_conf']:>9.3f} "
              f"{r.get('avg_prob_asd', float('nan')):>11.3f} "
              f"{r.get('avg_prob_td',  float('nan')):>10.3f} "
              f"{r['n_correct']}/{r['n_total']}")
    print("="*105)

    ablation_only = [gat_only_ref] + all_metrics
    best_acc = max(ablation_only, key=lambda x: x['accuracy'])
    best_auc = max(ablation_only, key=lambda x: x['auc'])
    best_f1  = max(ablation_only, key=lambda x: x['f1'])
    print("\n  Key takeaways for paper:")
    print(f"  • Best ablation by Accuracy : {best_acc['model']} ({best_acc['accuracy']:.2%})")
    print(f"  • Best ablation by AUC      : {best_auc['model']} ({best_auc['auc']:.4f})")
    print(f"  • Best ablation by F1       : {best_f1['model']} ({best_f1['f1']:.4f})")
    print(f"  • TriFusion Full improvement: "
          f"Acc +{(0.9667 - best_acc['accuracy'])*100:.2f}pp  |  "
          f"AUC +{(0.9956 - best_auc['auc']):.4f}  |  "
          f"F1 +{(0.9655 - best_f1['f1']):.4f}")
    print("="*105)


# ── MAIN ───────────────────────────────────────────────────────
def main():
    print("="*60)
    print("  Ablation: Stats Only + GAT+Stats")
    print("  GAT Only reference: 90.00% (already completed)")
    print("="*60)

    set_seed(SEED)
    print("\n[1/3] Loading dataset...")
    all_data = load_all_subjects()

    ablations = [
        (StatsOnly,    "Stats Only"),
        (GATplusStats, "GAT + Stats"),
    ]

    all_metrics = []
    for model_class, model_name in ablations:
        fold_results = run_loso(model_class, model_name, all_data)
        metrics      = summarize(fold_results, model_name)
        all_metrics.append(metrics)

        out_file = OUT_DIR / f"ablation_{model_name.lower().replace(' ', '_').replace('+', 'plus')}.json"
        with open(out_file, 'w') as f:
            json.dump({**metrics, 'fold_results': fold_results}, f, indent=2)
        print(f"  Saved -> {out_file}")

    print_comparison_table(all_metrics)

    summary_path = OUT_DIR / 'ablation_summary_stats_gatplus.json'
    with open(summary_path, 'w') as f:
        json.dump(all_metrics, f, indent=2)
    print(f"\n  Summary saved -> {summary_path}")


if __name__ == "__main__":
    main()