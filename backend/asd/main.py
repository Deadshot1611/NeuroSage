"""
main.py — NeuroSage FastAPI Backend Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.gaze import router as gaze_router
from routes.predict import router as predict_router
from routes.report import router as report_router

app = FastAPI(
    title="NeuroSage API",
    description="Backend for NeuroSage neurodevelopmental screening platform",
    version="1.0.0"
)

# ── CORS ───────────────────────────────────────────────────────
# Allows React frontend (localhost:5173) to talk to backend (localhost:8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── ROUTERS ────────────────────────────────────────────────────
app.include_router(gaze_router,    prefix="/api/gaze",    tags=["Gaze"])
app.include_router(predict_router, prefix="/api/predict", tags=["Predict"])
app.include_router(report_router,  prefix="/api/report",  tags=["Report"])

@app.get("/")
def root():
    return {"status": "NeuroSage API running"}

@app.get("/api/health")
def health():
    return {"status": "ok"}