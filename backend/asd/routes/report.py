"""
routes/report.py - AI-powered screening report generation
Uses Gemini 2.0 Flash (Primary) -> Groq (Fallback 1) -> Hardcoded Stats (Fallback 2)
"""

import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

class ReportRequest(BaseModel):
    prediction: str
    confidence: float
    p_fused: float
    p_gaze: float
    p_quest: float
    aq10_score: int
    branch: str
    flag_review: bool
    gaze_skipped: bool = False
    child_age: Optional[int] = None
    child_name: Optional[str] = None
    city: Optional[str] = None

class DoctorInfo(BaseModel):
    name: str
    address: str

class ReportResponse(BaseModel):
    report: str
    summary: str
    recommendation: str
    doctor_search_query: str
    local_doctors: list[DoctorInfo] = []
    has_local_doctors: bool = False

@router.post("/generate", response_model=ReportResponse)
async def generate_report(request: ReportRequest):
    child_name     = request.child_name or "your child"
    age_ref        = f"{request.child_age} years old" if request.child_age else ""
    confidence_pct = round(request.confidence * 100, 1)
    gaze_pct       = round(request.p_gaze * 100, 1)
    aq_score       = request.aq10_score

    # Determine AQ-10 interpretation
    if aq_score >= 8:
        aq_desc = f"a high score of {aq_score} out of 10, indicating significant behavioural indicators commonly associated with ASD"
    elif aq_score >= 6:
        aq_desc = f"a score of {aq_score} out of 10, which crosses the clinical referral threshold and suggests notable behavioural indicators worth investigating"
    elif aq_score >= 4:
        aq_desc = f"a moderate score of {aq_score} out of 10, showing some behavioural indicators that may benefit from monitoring"
    else:
        aq_desc = f"a low score of {aq_score} out of 10, suggesting few behavioural indicators of ASD at this time"

    # Gaze description
    if request.gaze_skipped:
        gaze_desc = "Eye-tracking was not performed in this session, so this report is based on the questionnaire responses only."
    elif gaze_pct >= 75:
        gaze_desc = f"The eye-tracking analysis showed {gaze_pct}% probability of atypical gaze patterns, which are commonly observed in children with ASD — such as reduced attention to faces and more scattered visual exploration."
    elif gaze_pct >= 50:
        gaze_desc = f"The eye-tracking analysis showed {gaze_pct}% probability of some atypical gaze patterns, which is in an uncertain range and worth noting."
    else:
        gaze_desc = f"The eye-tracking analysis showed {gaze_pct}% probability of atypical gaze patterns, suggesting gaze behaviour more typical of neurotypical development."

    # Determine if we actually need to search for doctors
    needs_doctors = (request.prediction == "ASD" or request.flag_review) and bool(request.city)

    prompt = f"""You are a warm, caring screening assistant at NeuroSage. 
Generate a JSON response containing exactly two keys: "report" and "doctors".

For the "report" key, write a highly concise, easily readable screening report for the parents of {child_name}{', ' + age_ref if age_ref else ''}.
Use EXACTLY these TWO section headers in ALL CAPS (DO NOT use asterisks, markdown, or HTML tags):
SCREENING SUMMARY
SCORE & NEXT STEPS

Guidelines for the report text:
- Address parents directly and warmly, use "{child_name}" by name throughout.
- Under SCREENING SUMMARY: Write one warm, cohesive paragraph blending the questionnaire results ({aq_desc}) and the eye-tracking results ({gaze_desc}). Keep it conversational and easy to digest.
- Under SCORE & NEXT STEPS: Mention the overall confidence of {confidence_pct}%. If the outcome is {request.prediction} and indicates ASD, gently suggest a specialist evaluation. If no strong indicators are present, suggest routine monitoring. 
- End the report with exactly this sentence: "Remember, you know your child best. Trust your instincts and don't hesitate to seek a second opinion."
- Do NOT mention "modalities", "ACG", "p_gaze", "branch", "AGREE", "REVIEW" or any technical AI terms.
- Do NOT say "AI generated".
- Keep total length around 250-300 words. Keep it brief.
- DO NOT USE ANY MARKDOWN OR ASTERISKS. JUST PLAIN TEXT.

For the "doctors" key:
{"Since ASD indicators were detected, act as a local search assistant and list 3 real, highly-rated pediatric neurologists or ASD specialist centers in " + request.city + ". Return them as a list of objects with 'name' and 'address' keys." if needs_doctors else "Return an empty list [] since no specialist referral is strictly required at this stage."}

Respond ONLY with valid JSON. Do not include any other text outside the JSON block.
"""

    report_text = ""
    local_doctors = []

    # --- TIER 1: GEMINI API (Primary) ---
    try:
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY missing")
            
        from google import genai
        from google.genai import types
        
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        
        data = json.loads(response.text)
        report_text = data.get("report", "")
        local_doctors = data.get("doctors", [])
        
    except Exception as gemini_e:
        print(f"Gemini API failed: {gemini_e}. Falling back to Groq.")
        
        # --- TIER 2: GROQ API (Fallback 1) ---
        try:
            if not GROQ_API_KEY:
                raise ValueError("GROQ_API_KEY missing")
                
            from groq import Groq
            client = Groq(api_key=GROQ_API_KEY)
            
            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.65,
                max_tokens=1024,
                response_format={"type": "json_object"}
            )
            
            data = json.loads(response.choices[0].message.content)
            report_text = data.get("report", "")
            local_doctors = data.get("doctors", [])
            
        except Exception as groq_e:
            print(f"Groq API failed: {groq_e}. Falling back to basic safety text.")
            
            # --- TIER 3: HARDCODED REPORT (Fallback 2) ---
            report_text = f"""SCREENING SUMMARY
This is an automated fallback report generated due to system load. 
{child_name}'s screening resulted in a prediction of {request.prediction} with {confidence_pct}% confidence.

UNDERSTANDING THE QUESTIONNAIRE RESULTS
The questionnaire resulted in {aq_desc}.

UNDERSTANDING THE GAZE ANALYSIS
{gaze_desc}

OVERALL ASSESSMENT
Based on the combined data, the system flags an outcome of {request.prediction}.

RECOMMENDED NEXT STEPS
Please consult a specialist for a formal evaluation. Remember, you know your child best. Trust your instincts and don't hesitate to seek a second opinion.
"""
            local_doctors = []

    # Summary logic
    if request.prediction == "ASD":
        summary = (f"Screening indicates strong ASD indicators ({confidence_pct}% confidence). Specialist evaluation recommended."
                   if confidence_pct >= 85
                   else f"Screening indicates possible ASD indicators ({confidence_pct}% confidence). Further evaluation advised.")
    else:
        summary = (f"Screening indicates no strong ASD indicators ({confidence_pct}% confidence)."
                   if confidence_pct >= 85
                   else f"Screening inconclusive ({confidence_pct}% confidence). Follow-up recommended.")

    recommendation = (
        "Please consult a paediatric neurologist or developmental paediatrician for a comprehensive clinical evaluation."
        if (request.flag_review or request.prediction == "ASD")
        else "Continue regular developmental monitoring. Re-screen if any concerns arise."
    )

    city_part = f"in {request.city}" if request.city else "near me"
    doctor_search_query = f"paediatric neurologist developmental paediatrician ASD specialist {city_part}"

    # Map the dynamic JSON doctors to the DoctorInfo Pydantic model
    doctor_list = []
    if local_doctors:
        for d in local_doctors:
            if isinstance(d, dict) and "name" in d and "address" in d:
                doctor_list.append(DoctorInfo(name=d["name"], address=d["address"]))

    return ReportResponse(
        report=report_text,
        summary=summary,
        recommendation=recommendation,
        doctor_search_query=doctor_search_query,
        local_doctors=doctor_list,
        has_local_doctors=len(doctor_list) > 0,
    )