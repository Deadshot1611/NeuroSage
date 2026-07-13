"""
routes/gaze.py
==============================================================
Receives raw webcam gaze coordinates from the frontend,
generates fixation maps, fixation points, GAT graphs, and
statistical features, then runs the QuadFusion model to
produce P_gaze (probability of ASD from gaze data alone).
==============================================================
"""

import os
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from pathlib import Path
from PIL import Image
from scipy.ndimage import gaussian_filter
import torchvision.transforms as T
from torchvision.models import (mobilenet_v2, MobileNet_V2_Weights,
                                efficientnet_b0, EfficientNet_B0_Weights)
from torch_geometric.nn import GATConv, global_mean_pool
from torch_geometric.data import Data, Batch
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

# ── CONFIG (must match training exactly) ───────────────────────
IMG_W      = 1280
IMG_H      = 1024
HEATMAP_SZ = 224
SEQ_LEN    = 20
MIN_FIX    = 3
HIDDEN     = 128
STAT_DIM   = 16
TEMPERATURE = 0.25

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# ── MODEL ARCHITECTURE (identical to training) ─────────────────
class TriFusionFixed(nn.Module):
    def __init__(self):
        super().__init__()
        self.cnn_proj = nn.Sequential(
            nn.Linear(1280, HIDDEN), nn.LayerNorm(HIDDEN), nn.GELU())
        self.g1 = GATConv(6, HIDDEN, heads=4, concat=True)
        self.g2 = GATConv(HIDDEN*4, HIDDEN, heads=4, concat=True)
        self.g3 = GATConv(HIDDEN*4, HIDDEN, heads=1, concat=False)
        self.gnorm = nn.LayerNorm(HIDDEN)
        self.sproj = nn.Sequential(
            nn.Linear(STAT_DIM, HIDDEN), nn.LayerNorm(HIDDEN), nn.GELU())
        self.attn = nn.MultiheadAttention(HIDDEN, 4, batch_first=True)
        self.outp = nn.Sequential(
            nn.Linear(HIDDEN*2, HIDDEN), nn.LayerNorm(HIDDEN),
            nn.GELU(), nn.Dropout(0.3))
        self.clf = nn.Sequential(
            nn.Linear(HIDDEN, 64), nn.GELU(),
            nn.Dropout(0.3), nn.Linear(64, 2))

    def forward(self, cnn, g, s):
        # --- 1. Flattened Graph Convolutions ---
        # Layer 1
        x = self.g1(g.x, g.edge_index, g.edge_attr)
        x = F.elu(x)
        
        # Layer 2
        x = self.g2(x, g.edge_index, g.edge_attr)
        x = F.elu(x)
        
        # Layer 3
        x = self.g3(x, g.edge_index, g.edge_attr)
        
        # Pool and Normalize
        gx = self.gnorm(global_mean_pool(x, g.batch))
        # ---------------------------------------

        # --- 2. Attention and Classification ---
        kv = torch.stack([self.cnn_proj(cnn), gx], dim=1)
        q  = self.sproj(s).unsqueeze(1)
        a, _ = self.attn(q, kv, kv)
        
        return self.clf(self.outp(
            torch.cat([a.squeeze(1), q.squeeze(1)], dim=1)))


# ── MODEL LOADER (loads once on startup, reuses after) ─────────
class ModelLoader:
    _instance = None

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls._load()
        return cls._instance

    @classmethod
    def _load(cls):
        mobile_path = Path(os.getenv(
            "MOBILENET_MODEL_PATH",
            r"C:\Users\kutus\OneDrive\Documents\autism\models\gaze\multiview\fixmaps_mobilenet_final.pth"
        ))
        effnet_path = Path(os.getenv(
            "EFFICIENTNET_MODEL_PATH",
            r"C:\Users\kutus\OneDrive\Documents\autism\models\gaze\multiview\fixpts_efficientnet_final.pth"
        ))

        if not mobile_path.exists() or not effnet_path.exists():
            raise RuntimeError(
                f"Model weights not found. Expected:\n"
                f"  {mobile_path}\n  {effnet_path}\n"
                f"Run train_final_models.py first."
            )

        print(f"Loading models from disk...")

        # Load TriFusion models
        model_map = TriFusionFixed().to(device)
        model_map.load_state_dict(
            torch.load(mobile_path, map_location=device))
        model_map.eval()

        model_pt = TriFusionFixed().to(device)
        model_pt.load_state_dict(
            torch.load(effnet_path, map_location=device))
        model_pt.eval()

        # Load frozen CNN backbones for feature extraction
        bb_map = mobilenet_v2(
            weights=MobileNet_V2_Weights.IMAGENET1K_V1).to(device).eval()
        bb_pt  = efficientnet_b0(
            weights=EfficientNet_B0_Weights.IMAGENET1K_V1).to(device).eval()
        for m in [bb_map, bb_pt]:
            for p in m.parameters():
                p.requires_grad = False

        print(f"Models loaded successfully on {device}.")
        return {
            'model_map': model_map,
            'model_pt':  model_pt,
            'bb_map':    bb_map,
            'bb_pt':     bb_pt,
        }


# ── IMAGE TRANSFORM ────────────────────────────────────────────
_tx = T.Compose([
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225])
])

def arr_to_tensor(arr):
    return _tx(Image.fromarray(
        (arr * 255).astype(np.uint8)).convert('RGB'))


# ── FEATURE GENERATION (identical to training pipeline) ────────
def gen_fixmap(fixations, out_sz=HEATMAP_SZ):
    """Generate Gaussian-blurred fixation map."""
    arr = np.zeros((out_sz, out_sz), dtype=np.float32)
    sx, sy = out_sz / IMG_W, out_sz / IMG_H
    for f in fixations:
        x = int(np.clip(f['x'] * sx, 0, out_sz - 1))
        y = int(np.clip(f['y'] * sy, 0, out_sz - 1))
        arr[y, x] += (f['duration'] / 1000.0)
    arr = gaussian_filter(arr, sigma=20)
    mx = arr.max()
    if mx > 0: arr /= mx
    return arr

def gen_fixpts(fixations, out_sz=HEATMAP_SZ):
    """Generate raw fixation point image (no blur)."""
    arr = np.zeros((out_sz, out_sz), dtype=np.float32)
    sx, sy = out_sz / IMG_W, out_sz / IMG_H
    for f in fixations:
        x = int(np.clip(f['x'] * sx, 0, out_sz - 1))
        y = int(np.clip(f['y'] * sy, 0, out_sz - 1))
        arr[y, x] += (f['duration'] / 1000.0)
    mx = arr.max()
    if mx > 0: arr /= mx
    return arr

def gen_stats(fixations):
    """Extract 16 statistical features (identical to training)."""
    x = np.array([f['x'] for f in fixations])
    y = np.array([f['y'] for f in fixations])
    d = np.array([f['duration'] for f in fixations])
    n = len(fixations)
    xn, yn = x / IMG_W, y / IMG_H

    md    = d.mean()
    std_d = d.std() if n > 1 else 0
    mxd   = d.max()
    td    = d.sum()
    fr    = n / (td / 1000.0 + 1e-6)

    if n > 1:
        dx, dy = np.diff(xn), np.diff(yn)
        sac    = np.sqrt(dx**2 + dy**2)
        ms, ss, mxs, ts = sac.mean(), sac.std(), sac.max(), sac.sum()
    else:
        ms = ss = mxs = ts = 0.0

    sp  = np.sqrt((xn.std() if n > 1 else 0)**2 +
                  (yn.std() if n > 1 else 0)**2)
    cd  = np.sqrt((xn - 0.5)**2 + (yn - 0.5)**2).mean()
    h, _ = np.histogram(xn, bins=8, range=(0, 1))
    h   = h / (h.sum() + 1e-6)
    ent = -np.sum(h * np.log(h + 1e-9))

    feat = np.array([md, std_d, mxd, td, fr,
                     ms, ss, mxs, ts,
                     0, 0, sp, cd, 0, ent, float(n)],
                    dtype=np.float32)
    return np.clip(np.log1p(np.abs(feat)) * np.sign(feat),
                   -10, 10).astype(np.float32)

def gen_graph(fixations):
    """Build GAT graph from fixation sequence."""
    n  = len(fixations)
    if n < MIN_FIX:
        return None
    xn = np.array([f['x'] for f in fixations]) / IMG_W
    yn = np.array([f['y'] for f in fixations]) / IMG_H
    dn = np.log1p(np.array([f['duration'] for f in fixations])) / 6.0

    nf = [[xn[i], yn[i], dn[i], i / SEQ_LEN,
           np.sqrt((xn[i]-xn[i-1])**2+(yn[i]-yn[i-1])**2)*10
           if i > 0 else 0,
           np.sqrt((xn[i]-0.5)**2+(yn[i]-0.5)**2)]
          for i in range(n)]

    ei, ea = [], []
    for i in range(n - 1):
        dx, dy = xn[i+1] - xn[i], yn[i+1] - yn[i]
        ei.append([i, i+1])
        ea.append([np.sqrt(dx**2+dy**2),
                   np.sin(np.arctan2(dy, dx)),
                   np.cos(np.arctan2(dy, dx))])
    if not ei:
        ei = [[i, i] for i in range(n)]
        ea = [[0., 0., 1.]] * n

    return Data(
        x=torch.tensor(nf, dtype=torch.float),
        edge_index=torch.tensor(ei, dtype=torch.long).t().contiguous(),
        edge_attr=torch.tensor(ea, dtype=torch.float)
    )


# ── BAYESIAN FUSION ────────────────────────────────────────────
def bayesian_fusion(p_map, p_pt, temp=TEMPERATURE):
    p1 = np.clip(p_map, 1e-5, 1-1e-5)
    p2 = np.clip(p_pt,  1e-5, 1-1e-5)
    return float(1 / (1 + np.exp(
        -((np.log(p1/(1-p1)) + np.log(p2/(1-p2))) / temp))))

def get_conf(p):
    return p if p > 0.5 else 1 - p


# ── REQUEST / RESPONSE MODELS ──────────────────────────────────
class Fixation(BaseModel):
    x: float         # screen x coordinate (pixels, 0-1280)
    y: float         # screen y coordinate (pixels, 0-1024)
    duration: float  # fixation duration in milliseconds

class GazeRequest(BaseModel):
    fixations: List[Fixation]   # all fixations for this subject
    image_width: float = 1280   # actual display width (for scaling)
    image_height: float = 1024  # actual display height (for scaling)

class GazeResponse(BaseModel):
    p_gaze: float       # P(ASD) from gaze pipeline
    confidence: float   # how confident (0.5-1.0)
    p_map: float        # MobileNet branch probability
    p_pt: float         # EfficientNet branch probability
    n_fixations: int    # number of fixations processed
    valid: bool         # whether enough fixations were found


# ── INFERENCE ──────────────────────────────────────────────────
def run_inference_single(fixations_list, models):
    """
    Run QuadFusion on a list of fixation dicts.
    Returns p_map, p_pt, p_fused.
    """
    if len(fixations_list) < MIN_FIX:
        return None, None, None

    # Generate representations
    map_arr = gen_fixmap(fixations_list)
    pt_arr  = gen_fixpts(fixations_list)
    stats   = gen_stats(fixations_list)
    graph   = gen_graph(fixations_list)

    if graph is None:
        return None, None, None

    # CNN feature extraction
    with torch.no_grad():
        mt = arr_to_tensor(map_arr).unsqueeze(0).to(device)
        pt = arr_to_tensor(pt_arr).unsqueeze(0).to(device)
        map_feat = F.adaptive_avg_pool2d(
            models['bb_map'].features(mt), (1,1)).flatten(1)
        pt_feat  = models['bb_pt'].avgpool(
            models['bb_pt'].features(pt)).flatten(1)

    # Stats and graph to tensors
    s_tensor = torch.tensor(
        stats, dtype=torch.float).unsqueeze(0).to(device)
    g_batch  = Batch.from_data_list([graph]).to(device)

    # Run both models
    with torch.no_grad():
        out_map = F.softmax(
            models['model_map'](map_feat, g_batch, s_tensor),
            dim=1)[:, 1].item()
        out_pt  = F.softmax(
            models['model_pt'](pt_feat, g_batch, s_tensor),
            dim=1)[:, 1].item()

    p_fused = bayesian_fusion(out_map, out_pt)
    return out_map, out_pt, p_fused


# ── ROUTE ──────────────────────────────────────────────────────
@router.post("/process", response_model=GazeResponse)
async def process_gaze(request: GazeRequest):
    """
    Receives webcam fixation data from frontend.
    Scales coordinates to 1280x1024 space if needed.
    Returns P(ASD) from QuadFusion gaze pipeline.
    """
    try:
        models = ModelLoader.get()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # Scale coordinates to 1280x1024 if display size differs
    scale_x = IMG_W / request.image_width
    scale_y = IMG_H / request.image_height

    fixations = [
        {
            'x':        f.x * scale_x,
            'y':        f.y * scale_y,
            'duration': f.duration
        }
        for f in request.fixations
    ]

    if len(fixations) < MIN_FIX:
        return GazeResponse(
            p_gaze=0.5, confidence=0.5,
            p_map=0.5, p_pt=0.5,
            n_fixations=len(fixations),
            valid=False
        )

    p_map, p_pt, p_fused = run_inference_single(fixations, models)

    if p_fused is None:
        return GazeResponse(
            p_gaze=0.5, confidence=0.5,
            p_map=0.5, p_pt=0.5,
            n_fixations=len(fixations),
            valid=False
        )

    return GazeResponse(
        p_gaze=round(p_fused, 4),
        confidence=round(get_conf(p_fused), 4),
        p_map=round(p_map, 4),
        p_pt=round(p_pt, 4),
        n_fixations=len(fixations),
        valid=True
    )