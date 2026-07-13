"""
ablation_multiview_cnns.py
==============================================================
Experiment A & B: Multiview Backbone Benchmarking.
Evaluates ResNet, MobileNet, and EfficientNet on BOTH FixMaps 
and FixPts, using exact TriFusion architecture and metrics.
"""

import os
os.environ["TORCHDYNAMO_DISABLE"]        = "1"
os.environ["CUBLAS_WORKSPACE_CONFIG"]    = ":4096:8"

import torch
import torch.nn as nn
import torch.backends.cudnn as cudnn
import numpy as np
import random
import pickle
import time
from pathlib import Path
from PIL import Image
from scipy.ndimage import gaussian_filter
import torchvision.transforms as T
from torchvision.models import (
    resnet18, ResNet18_Weights,
    mobilenet_v2, MobileNet_V2_Weights,
    efficientnet_b0, EfficientNet_B0_Weights
)
from sklearn.metrics import f1_score, accuracy_score, precision_score, recall_score, roc_auc_score
from tqdm import tqdm

# ── CONFIG ─────────────────────────────────────────────────────
SEED         = 42
IMG_W, IMG_H = 1280, 1024
HEATMAP_SZ   = 224
HIDDEN       = 128
BATCH_SIZE   = 32
MAX_EPOCHS   = 50
PATIENCE     = 10
LR           = 3e-4
WD           = 0.01
N_SUBJECTS   = 15

BASE_PATH  = Path(r'C:\Users\kutus\OneDrive\Documents\autism\data\raw\saliency4asd\training_data')
OUT_DIR    = Path(r'C:\Users\kutus\OneDrive\Documents\autism\models\gaze\ablation')
CACHE_DIR  = OUT_DIR / 'cache'
OUT_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

def set_seed(seed: int):
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    cudnn.deterministic = True; cudnn.benchmark = False
    torch.use_deterministic_algorithms(True, warn_only=True)

# ── 1. DATASET PROCESSING ──────────────────────────────────────
def parse_scanpath_file(filepath):
    subjects, current = [], []
    try: lines = Path(filepath).read_text().splitlines()
    except: return []
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

def generate_view(fixations, mode='map', out_sz=HEATMAP_SZ):
    arr = np.zeros((out_sz, out_sz), dtype=np.float32)
    sx, sy = out_sz / IMG_W, out_sz / IMG_H
    for fix in fixations:
        x = int(np.clip(fix['x'] * sx, 0, out_sz - 1))
        y = int(np.clip(fix['y'] * sy, 0, out_sz - 1))
        arr[y, x] += (fix['duration'] / 1000.0)
    if mode == 'map': arr = gaussian_filter(arr, sigma=20)
    mx = arr.max()
    if mx > 0: arr /= mx
    return arr

_tx = T.Compose([T.ToTensor(), T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])])
def arr_to_tensor(arr): return _tx(Image.fromarray((arr * 255).astype(np.uint8)).convert('RGB'))

def load_multiview_dataset():
    all_data = {}
    print("\n[1/4] Loading Scanpaths from Disk...")
    for cls_name, label in [('ASD', 1), ('TD', 0)]:
        subjects = {}
        files = sorted((BASE_PATH / cls_name).glob(f'{cls_name}_scanpath_*.txt'))
        for f in tqdm(files, desc=f"Parsing {cls_name}", leave=False):
            try: img_id = int(f.stem.split('_')[-1])
            except: continue
            for subj_idx, fixations in enumerate(parse_scanpath_file(f)):
                if len(fixations) < 3: continue
                if subj_idx not in subjects: subjects[subj_idx] = []
                subjects[subj_idx].append({
                    'img_id': img_id, 
                    'map_tensor': arr_to_tensor(generate_view(fixations, 'map')), 
                    'pt_tensor': arr_to_tensor(generate_view(fixations, 'pts')),
                    'label': label
                })
        sorted_subjs = sorted(subjects.keys(), key=lambda s: len(subjects[s]), reverse=True)
        subjects = {k: subjects[k] for k in sorted_subjs[:N_SUBJECTS]}
        all_data[cls_name] = {'subjects': subjects, 'label': label}
    return all_data

# ── 2. TRIFUSION CACHE GENERATION ──────────────────────────────
def extract_features(model, x, model_name):
    if model_name == 'resnet':
        x = model.conv1(x); x = model.bn1(x); x = model.relu(x); x = model.maxpool(x)
        x = model.layer1(x); x = model.layer2(x); x = model.layer3(x); x = model.layer4(x)
        x = model.avgpool(x)
        return x.flatten(1)
    elif model_name == 'mobilenet':
        x = model.features(x)
        x = nn.functional.adaptive_avg_pool2d(x, (1, 1))
        return x.flatten(1)
    elif model_name == 'efficientnet':
        return model.avgpool(model.features(x)).flatten(1)

def cache_all_backbones(all_data):
    models = {
        'resnet': resnet18(weights=ResNet18_Weights.IMAGENET1K_V1).to(device),
        'mobilenet': mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1).to(device),
        'efficientnet': efficientnet_b0(weights=EfficientNet_B0_Weights.IMAGENET1K_V1).to(device)
    }
    for m in models.values():
        m.eval()
        for p in m.parameters(): p.requires_grad = False
    
    caches = {'FixMaps': {'resnet': {}, 'mobilenet': {}, 'efficientnet': {}},
              'FixPts':  {'resnet': {}, 'mobilenet': {}, 'efficientnet': {}}}
    
    cache_paths = {mod: {name: CACHE_DIR / f'{name}_{mod}_cache.pkl' for name in models.keys()} for mod in ['FixMaps', 'FixPts']}
    
    # Check if all exist
    all_exist = all(p.exists() for mods in cache_paths.values() for p in mods.values())
    if all_exist:
        print("[2/4] Loading all Multiview CNN caches from disk...")
        for mod in ['FixMaps', 'FixPts']:
            for name in models.keys():
                caches[mod][name] = pickle.load(open(cache_paths[mod][name], 'rb'))
        return caches

    print("[2/4] Generating Multiview CNN features (This only happens once)...")
    for cls_name, cls_data in all_data.items():
        for subj_idx, samples in tqdm(cls_data['subjects'].items(), desc=f"Caching {cls_name}", leave=False):
            keys = [(cls_name, subj_idx, s['img_id']) for s in samples]
            map_tensors = torch.stack([s['map_tensor'] for s in samples]).to(device)
            pt_tensors = torch.stack([s['pt_tensor'] for s in samples]).to(device)
            
            with torch.no_grad():
                for name, model in models.items():
                    map_feats = extract_features(model, map_tensors, name).cpu().numpy()
                    pt_feats = extract_features(model, pt_tensors, name).cpu().numpy()
                    for k, mf, pf in zip(keys, map_feats, pt_feats):
                        caches['FixMaps'][name][k] = mf
                        caches['FixPts'][name][k] = pf
                        
    for mod in ['FixMaps', 'FixPts']:
        for name in models.keys():
            with open(cache_paths[mod][name], 'wb') as f: pickle.dump(caches[mod][name], f)
            
    del models; torch.cuda.empty_cache()
    return caches

# ── 3. EXACT TRIFUSION CNN CLASSIFIER ──────────────────────────
class TriFusionCNNBranch(nn.Module):
    def __init__(self, in_features):
        super().__init__()
        self.cnn_proj = nn.Sequential(nn.Linear(in_features, HIDDEN), nn.LayerNorm(HIDDEN), nn.GELU())
        self.classifier = nn.Sequential(nn.Linear(HIDDEN, 64), nn.GELU(), nn.Dropout(0.3), nn.Linear(64, 2))
        
    def forward(self, cnn_feats):
        return self.classifier(self.cnn_proj(cnn_feats))

class CacheDataset(torch.utils.data.Dataset):
    def __init__(self, samples, cache):
        self.samples, self.cache = samples, cache
    def __len__(self): return len(self.samples)
    def __getitem__(self, idx):
        s = self.samples[idx]
        return torch.tensor(self.cache[(s['cls'], s['subj_idx'], s['img_id'])], dtype=torch.float), torch.tensor(s['label'], dtype=torch.long)

# ── 4. TRAINING & EVAL ─────────────────────────────────────────
def train_and_eval_branch(train_samples, test_samples, cache, in_features, w):
    train_dl = torch.utils.data.DataLoader(CacheDataset(train_samples, cache), batch_size=BATCH_SIZE, shuffle=True)
    test_dl  = torch.utils.data.DataLoader(CacheDataset(test_samples, cache), batch_size=BATCH_SIZE, shuffle=False)

    model = TriFusionCNNBranch(in_features).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WD)
    criterion = nn.CrossEntropyLoss(weight=w, label_smoothing=0.05)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(optimizer, T_0=10)

    best_loss, no_improve, best_state = float('inf'), 0, None
    for epoch in range(MAX_EPOCHS):
        model.train()
        total_loss = 0.0
        for feats, labels in train_dl:
            optimizer.zero_grad()
            out = model(feats.to(device))
            loss = criterion(out, labels.to(device))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item()
        
        scheduler.step()
        if total_loss < best_loss:
            best_loss, best_state, no_improve = total_loss, {k: v.cpu().clone() for k, v in model.state_dict().items()}, 0
        else: no_improve += 1
        if no_improve >= PATIENCE: break

    model.load_state_dict({k: v.to(device) for k, v in best_state.items()}); model.eval()
    probs = []
    with torch.no_grad():
        for feats, _ in test_dl: probs.extend(torch.softmax(model(feats.to(device)), dim=1)[:, 1].cpu().numpy().tolist())
    del model; torch.cuda.empty_cache()
    return float(np.mean(probs))

# ── 5. ABLATION LOSO LOOP ──────────────────────────────────────
def run_full_ablation(all_data, caches):
    all_samples = [{'cls': c, 'subj_idx': i, **s} for c, cd in all_data.items() for i, smps in cd['subjects'].items() for s in smps]
    keys = sorted(set((s['cls'], s['subj_idx']) for s in all_samples))
    models_to_test = [('resnet', 512), ('mobilenet', 1280), ('efficientnet', 1280)]
    
    true_labels = [all_data[c]['label'] for c, _ in keys]
    final_metrics = {}

    print("\n[3/4] Running Multiview 30-Fold Cross-Validation...")
    
    for modality in ['FixMaps', 'FixPts']:
        final_metrics[modality] = {}
        for model_name, in_features in models_to_test:
            print(f"\n>> Commencing: {model_name.upper()} on {modality}")
            preds, probs = [], []
            
            # THE PROGRESS BAR (Shows ETA, Folds/sec)
            for fold_i, (t_cls, t_subj) in enumerate(tqdm(keys, desc=f"30-Fold CV")):
                train_samples = [s for s in all_samples if not (s['cls']==t_cls and s['subj_idx']==t_subj)]
                test_samples  = [s for s in all_samples if s['cls']==t_cls and s['subj_idx']==t_subj]
                
                n_asd = sum(1 for s in train_samples if s['label'] == 1)
                w = torch.tensor([1.0, (len(train_samples)-n_asd)/max(n_asd, 1)], dtype=torch.float).to(device)

                set_seed(SEED + fold_i)
                p_asd = train_and_eval_branch(train_samples, test_samples, caches[modality][model_name], in_features, w)
                
                probs.append(p_asd)
                preds.append(1 if p_asd > 0.5 else 0)
            
            # Compute Advanced Metrics
            final_metrics[modality][model_name] = {
                'acc': accuracy_score(true_labels, preds),
                'f1': f1_score(true_labels, preds),
                'prec': precision_score(true_labels, preds, zero_division=0),
                'rec': recall_score(true_labels, preds, zero_division=0),
                'auc': roc_auc_score(true_labels, probs)
            }

    print("\n[4/4] Ablation Complete. Generating Final Report...\n")
    print("="*85)
    print("  MULTIVIEW CNN BACKBONE ABLATION (ADVANCED METRICS)")
    print("="*85)
    print(f"{'Modality':<10} | {'Architecture':<14} | {'Acc (%)':<8} | {'F1':<7} | {'Prec':<7} | {'Recall':<7} | {'AUC':<7}")
    print("-" * 85)
    
    for modality in ['FixMaps', 'FixPts']:
        for model_name, _ in models_to_test:
            m = final_metrics[modality][model_name]
            print(f"{modality:<10} | {model_name.capitalize():<14} | {m['acc']:>7.2%} | {m['f1']:.4f} | {m['prec']:.4f} | {m['rec']:.4f} | {m['auc']:.4f}")
        if modality == 'FixMaps': print("-" * 85)
    print("="*85)

def main():
    print("="*85)
    print("  Experiment: CNN Backbone vs. Modality Ablation")
    print("="*85)
    set_seed(SEED)
    all_data = load_multiview_dataset()
    caches = cache_all_backbones(all_data)
    run_full_ablation(all_data, caches)

if __name__ == "__main__":
    main()