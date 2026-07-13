// api/client.js
// All calls to the NeuroSage FastAPI backend

//const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const BASE_URL = process.env.REACT_APP_ASD_API_URL || 'http://localhost:8001'
// ── GAZE ───────────────────────────────────────────────────────
export async function processGaze(fixations, imageWidth, imageHeight) {
  const res = await fetch(`${BASE_URL}/api/gaze/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fixations,
      image_width: imageWidth,
      image_height: imageHeight,
    }),
  })
  if (!res.ok) throw new Error(`Gaze API error: ${res.status}`)
  return res.json()
}

// ── PREDICT ────────────────────────────────────────────────────
export async function fusePrediction(p_gaze, aq10Answers, gazeSkipped = false) {
  const res = await fetch(`${BASE_URL}/api/predict/fuse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_gaze,
      aq10_answers: aq10Answers,
      gaze_skipped: gazeSkipped,
    }),
  })
  if (!res.ok) throw new Error(`Predict API error: ${res.status}`)
  return res.json()
}

// ── REPORT ─────────────────────────────────────────────────────
export async function generateReport(predictionData, childInfo) {
  const res = await fetch(`${BASE_URL}/api/report/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...predictionData,
      child_age:  childInfo.age,
      child_name: childInfo.name,
      city:       childInfo.city,
    }),
  })
  if (!res.ok) throw new Error(`Report API error: ${res.status}`)
  return res.json()
}