"""
routes/predict.py
==============================================================
Receives P_gaze (from gaze pipeline) and AQ-10(Child) answers,
applies Adaptive Confidence Gating (ACG) to produce final
classification and confidence score.
==============================================================
"""

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

router = APIRouter()

# ── ACG PARAMETERS (from grid search, τ=0.165, w_a=0.80, w_d=0.63) ──
TAU         = 0.165
W_AGREE     = 0.80
W_DISAGREE  = 0.63
THRESHOLD   = 7      # AQ-10 Child: score >= 7 = ASD


# ── HELPERS ────────────────────────────────────────────────────
def logit(p: float) -> float:
    p = np.clip(p, 1e-9, 1 - 1e-9)
    return float(np.log(p / (1 - p)))

def sigmoid(x: float) -> float:
    return float(1.0 / (1.0 + np.exp(-x)))

def score_to_prob(score: int) -> float:
    """Convert AQ-10 raw score to probability via IRT sigmoid.
    θ=6.5 is decision boundary midpoint, k=0.8 controls steepness."""
    return sigmoid(0.8 * (score - 6.5))

def get_conf(p: float) -> float:
    return p if p > 0.5 else 1.0 - p


# ── REQUEST / RESPONSE MODELS ──────────────────────────────────
class PredictRequest(BaseModel):
    p_gaze: float                    # from /api/gaze/process (0.5 if skipped)
    aq10_answers: List[int]          # 10 binary answers (0 or 1 each)
    gaze_skipped: bool = False       # True if user skipped eye tracking

class PredictResponse(BaseModel):
    prediction: str         # "ASD" or "TD"
    p_fused: float          # final fused probability
    confidence: float       # 0.5 - 1.0
    branch: str             # "AGREE" or "REVIEW"
    p_gaze: float           # gaze-only probability (passed through)
    p_quest: float          # questionnaire probability
    aq10_score: int         # raw AQ-10 score (0-10)
    flag_review: bool       # True if clinical review recommended
    gaze_skipped: bool      # True if eye tracking was skipped


# ── ROUTE ──────────────────────────────────────────────────────
@router.post("/fuse", response_model=PredictResponse)
async def fuse_prediction(request: PredictRequest):
    """
    Applies ACG to combine gaze pipeline output with AQ-10 score.
    
    ACG logic:
      gap = |P_gaze - P_quest|
      if gap < τ  → AGREE branch: weighted log-odds fusion
      if gap >= τ → REVIEW branch: gaze-dominant fusion + clinical flag
    """

    # ── Step 1: Compute AQ-10 score and probability ────────────
    # Clamp each answer to 0 or 1 for safety
    answers    = [max(0, min(1, int(a))) for a in request.aq10_answers]
    aq10_score = sum(answers)
    p_quest    = score_to_prob(aq10_score)

    # ── Step 2: Compute inter-modality gap ─────────────────────
    p_gaze = float(request.p_gaze)
    gap    = abs(p_gaze - p_quest)

    # ── Step 3: ACG routing ────────────────────────────────────
    if gap < TAU:
        # AGREE branch — both modalities consistent
        p_fused    = sigmoid(
            W_AGREE * logit(p_gaze) +
            (1 - W_AGREE) * logit(p_quest)
        )
        branch      = "AGREE"
        flag_review = False
    else:
        # REVIEW branch — modalities conflict, flag for specialist
        p_fused    = sigmoid(
            W_DISAGREE * logit(p_gaze) +
            (1 - W_DISAGREE) * logit(p_quest)
        )
        branch      = "REVIEW"
        flag_review = True

    # ── Step 4: Final classification ───────────────────────────
    prediction = "ASD" if p_fused > 0.5 else "TD"
    confidence = get_conf(p_fused)

    # If gaze was skipped, always flag for review regardless of branch
    # since we only have questionnaire evidence
    if request.gaze_skipped:
        flag_review = True
        branch = "QUESTIONNAIRE_ONLY"

    return PredictResponse(
        prediction=prediction,
        p_fused=round(p_fused, 4),
        confidence=round(confidence, 4),
        branch=branch,
        p_gaze=round(p_gaze, 4),
        p_quest=round(p_quest, 4),
        aq10_score=aq10_score,
        flag_review=flag_review,
        gaze_skipped=request.gaze_skipped
    )