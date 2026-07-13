import React, { useState, useRef } from 'react';
import { Mic, Brain, MapPin, User, Activity, AlertCircle, CheckCircle, TrendingUp, Upload, Download } from 'lucide-react';
import axios from 'axios';
import { saveReport } from '../api/reportApi';
import { useAuth } from '../context/AuthContext';

const API_BASE = process.env.REACT_APP_SPEECH_API_URL || 'http://localhost:8000';

const ACCENT       = '#f59e0b';
const ACCENT_DARK  = '#d97706';
const ACCENT_LIGHT = '#fef3c7';

function severityFromRate(rate) {
  if (rate < 0.10) return { label: 'Minimal',  color: '#16a34a', bg: '#dcfce7', borderColor: '#16a34a' };
  if (rate < 0.25) return { label: 'Mild',     color: '#ca8a04', bg: '#fef9c3', borderColor: '#ca8a04' };
  if (rate < 0.50) return { label: 'Moderate', color: '#ea580c', bg: '#ffedd5', borderColor: '#ea580c' };
  return               { label: 'Severe',   color: '#dc2626', bg: '#fee2e2', borderColor: '#dc2626' };
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const SpeechDisorderScreener = () => {
  const { token } = useAuth();
  const [step,      setStep]      = useState(1);
  const [saveState, setSaveState] = useState('idle');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [userInfo,  setUserInfo]  = useState({ name: '', age: '', pincode: '' });
  const [audioFile, setAudioFile] = useState(null);
  const [threshold, setThreshold] = useState(0.5);
  const [analysis,  setAnalysis]  = useState(null);
  const fileInputRef = useRef(null);

  // ── Step 1 → 2 ────────────────────────────────────────────────────────────
  const handleUserInfoSubmit = () => {
    if (!userInfo.name || !userInfo.age || !userInfo.pincode || userInfo.pincode.length !== 6) {
      setError('Please fill all fields correctly');
      return;
    }
    const age = parseInt(userInfo.age);
    if (age < 4 || age > 7) {
      setError('Age must be between 4 and 7 years');
      return;
    }
    setError(null);
    setStep(2);
  };

  // ── Audio upload ───────────────────────────────────────────────────────────
  const handleAudioUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setError('Audio file must be less than 50MB');
      return;
    }
    setAudioFile(file);
    setError(null);
  };

  // ── Analyse ───────────────────────────────────────────────────────────────
  const handleFinalAnalysis = async () => {
    if (!audioFile) {
      setError('Please upload an audio recording.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append('file', audioFile, audioFile.name);

      const res = await fetch(
        `${API_BASE}/predict?threshold=${threshold}&return_windows=true`,
        { method: 'POST', body: form }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server returned ${res.status}`);
      }

      const audioResult = await res.json();

      // Gemini narrative
      let narrative = null;
      try {
        const nr = await axios.post(`${API_BASE}/generate-analysis`, {
          userInfo,
          positive_rate:       audioResult.positive_rate,
          prediction:          audioResult.prediction,
          confidence:          audioResult.confidence,
          n_windows_total:     audioResult.n_windows_total,
          n_windows_positive:  audioResult.n_windows_positive,
          duration_sec:        audioResult.duration_sec,
        });
        narrative = nr.data.analysis || null;
      } catch {}

      // Doctor recommendations
      let doctors = [];
      try {
        const dr = await axios.post(`${API_BASE}/find-doctors`, { pincode: userInfo.pincode });
        doctors = dr.data.doctors || [];
      } catch {}

      const speechResult = { ...audioResult, narrative, doctors };
      setAnalysis(speechResult);
      setStep(3);
    } catch (e) {
      setError(
        e.message.includes('Failed to fetch')
          ? `Cannot reach the API at ${API_BASE}. Is the server running?`
          : e.message
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetApp = () => {
    setStep(1);
    setUserInfo({ name: '', age: '', pincode: '' });
    setAudioFile(null);
    setAnalysis(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sev = analysis ? severityFromRate(analysis.positive_rate) : null;

  return (
    <div className="min-h-screen bg-[#f7f8fc] p-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="flex items-center justify-center mb-4">
            <Mic className="w-12 h-12 mr-3" style={{ color: ACCENT }} />
            <h1 className="text-4xl font-bold text-[#1a1a2e]">Developmental Stuttering Screener</h1>
          </div>
          <p className="text-gray-600 text-lg">AI-Powered Early Detection & Assessment</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Progress — 3 steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center mb-2 gap-0">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
                  style={step >= s
                    ? { background: ACCENT, color: '#fff' }
                    : { background: '#d1d5db', color: '#6b7280' }}
                >
                  {s}
                </div>
                {s < 3 && (
                  <div className="w-32 h-1" style={{ background: step > s ? ACCENT : '#d1d5db' }} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm text-gray-600 max-w-xs mx-auto">
            <span>Info</span>
            <span>Audio</span>
            <span>Results</span>
          </div>
        </div>

        {/* ── Step 1: Child Information ── */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border-[1.5px] border-[#f59e0b]/20 p-8">
            <div className="flex items-center mb-6">
              <User className="w-6 h-6 mr-2" style={{ color: ACCENT }} />
              <h2 className="text-2xl font-bold text-[#1a1a2e]">Child Information</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Child's Name</label>
                <input
                  type="text"
                  value={userInfo.name}
                  onChange={(e) => setUserInfo({ ...userInfo, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none"
                  onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${ACCENT}40`}
                  onBlur={e => e.target.style.boxShadow = ''}
                  placeholder="Enter child's name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Age (4–7 years)</label>
                <input
                  type="number"
                  min="4"
                  max="7"
                  value={userInfo.age}
                  onChange={(e) => setUserInfo({ ...userInfo, age: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none"
                  onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${ACCENT}40`}
                  onBlur={e => e.target.style.boxShadow = ''}
                  placeholder="Enter age"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="inline w-4 h-4 mr-1" />
                  Pincode (for specialist recommendations)
                </label>
                <input
                  type="text"
                  value={userInfo.pincode}
                  onChange={(e) => setUserInfo({ ...userInfo, pincode: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none"
                  onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${ACCENT}40`}
                  onBlur={e => e.target.style.boxShadow = ''}
                  placeholder="6-digit Indian pincode"
                  maxLength="6"
                />
              </div>

              <button
                onClick={handleUserInfoSubmit}
                className="w-full text-white py-4 rounded-lg font-semibold transition"
                style={{ background: ACCENT }}
                onMouseEnter={e => e.currentTarget.style.background = ACCENT_DARK}
                onMouseLeave={e => e.currentTarget.style.background = ACCENT}
              >
                Continue to Audio Upload
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Audio Upload ── */}
        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-sm border-[1.5px] border-[#f59e0b]/20 p-8">
            <div className="flex items-center mb-6">
              <Upload className="w-6 h-6 mr-2" style={{ color: ACCENT }} />
              <h2 className="text-2xl font-bold text-[#1a1a2e]">Audio Recording</h2>
            </div>
            <p className="text-gray-600 mb-6">
              Upload a clear audio recording of {userInfo.name} speaking
            </p>

            {/* Upload zone */}
            <div className="mb-6">
              <div
                className="border-4 border-dashed border-gray-300 rounded-xl p-8 text-center transition cursor-pointer"
                onMouseEnter={e => e.currentTarget.style.borderColor = ACCENT}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#d1d5db'}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".wav"
                  onChange={handleAudioUpload}
                  className="hidden"
                  id="audio-upload"
                />
                <label htmlFor="audio-upload" className="cursor-pointer">
                  {audioFile ? (
                    <div>
                      <Mic className="w-12 h-12 mx-auto mb-3" style={{ color: ACCENT }} />
                      <p className="font-semibold text-gray-800">{audioFile.name}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {(audioFile.size / 1024).toFixed(0)} KB · Click to change
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 font-medium">Click to upload audio recording</p>
                      <p className="text-sm text-gray-500 mt-2">WAV only · up to 50 MB</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Audio preview */}
            {audioFile && (
              <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                <audio controls src={URL.createObjectURL(audioFile)} className="w-full" />
              </div>
            )}

            {/* Threshold */}
            <div className="mb-6 p-4 rounded-lg border" style={{ background: ACCENT_LIGHT, borderColor: `${ACCENT}50` }}>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold text-amber-900">Detection Threshold</label>
                <span className="text-sm font-bold text-amber-900">{threshold.toFixed(2)}</span>
              </div>
              <input
                type="range" min="0.1" max="0.9" step="0.05"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full accent-amber-500"
              />
              <p className="text-xs text-amber-700 mt-1">Lower = more sensitive · Higher = more conservative</p>
            </div>

            <div className="rounded-lg p-4 mb-4 flex items-start gap-3 bg-red-50 border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800">
                <strong>Important:</strong> Please upload only <strong>.WAV</strong> audio files. Other formats (MP3, M4A, OGG, FLAC) are not supported and will cause analysis to fail.
              </p>
            </div>

            <div className="rounded-lg p-4 mb-6" style={{ background: ACCENT_LIGHT, border: `1px solid ${ACCENT}50` }}>
              <p className="text-sm text-amber-800">
                <strong>Tips for best results:</strong> Use a quiet room, speak naturally,
                record at least 30 seconds of continuous speech, avoid background noise
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition text-gray-700"
              >
                Back
              </button>
              <button
                onClick={handleFinalAnalysis}
                disabled={loading || !audioFile}
                className="flex-1 text-white py-3 rounded-lg font-semibold transition flex items-center justify-center disabled:opacity-50"
                style={{ background: ACCENT }}
                onMouseEnter={e => { if (!loading && audioFile) e.currentTarget.style.background = ACCENT_DARK; }}
                onMouseLeave={e => e.currentTarget.style.background = ACCENT}
              >
                {loading ? (
                  <>
                    <Activity className="animate-spin w-5 h-5 mr-2" />
                    Analysing Audio…
                  </>
                ) : 'Analyse Recording'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Results ── */}
        {step === 3 && analysis && sev && (
          <div className="space-y-6">

            {/* Score Summary */}
            <div className="bg-white rounded-2xl shadow-sm border-[1.5px] border-[#f59e0b]/20 p-8">
              <div className="flex items-center mb-6">
                <TrendingUp className="w-6 h-6 mr-2" style={{ color: ACCENT }} />
                <h2 className="text-2xl font-bold text-[#1a1a2e]">Screening Results</h2>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-lg text-center" style={{ background: ACCENT_LIGHT }}>
                  <p className="text-sm text-gray-600 mb-2">SLD Rate</p>
                  <p className="text-3xl font-bold" style={{ color: ACCENT }}>
                    {(analysis.positive_rate * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500">of recording</p>
                </div>
                <div className="bg-[#1a1a2e] p-4 rounded-lg text-center">
                  <p className="text-sm text-gray-400 mb-2">Severity</p>
                  <p className="text-3xl font-bold" style={{ color: ACCENT }}>{sev.label}</p>
                  <p className="text-xs text-gray-400">overall</p>
                </div>
              </div>

              {/* Severity banner */}
              <div
                className="p-4 rounded-lg border-l-4"
                style={{ background: sev.bg, borderColor: sev.borderColor }}
              >
                <div className="flex items-center mb-1">
                  {sev.label === 'Minimal'
                    ? <CheckCircle className="w-5 h-5 mr-2" style={{ color: sev.color }} />
                    : <AlertCircle className="w-5 h-5 mr-2" style={{ color: sev.color }} />
                  }
                  <span className="font-bold text-lg" style={{ color: sev.color }}>
                    {sev.label} Developmental Stuttering
                  </span>
                </div>
                <p className="text-sm text-gray-600 ml-7">
                  {analysis.prediction === 'stuttering_detected'
                    ? `Developmental stuttering detected in ${(analysis.positive_rate * 100).toFixed(1)}% of the recording`
                    : 'No significant stuttering detected in this recording'}
                </p>
              </div>
            </div>

            {/* Acoustic Metrics */}
            <div className="bg-white rounded-2xl shadow-sm border-[1.5px] border-[#f59e0b]/20 p-8">
              <div className="flex items-center mb-6">
                <Activity className="w-6 h-6 mr-2" style={{ color: ACCENT }} />
                <h3 className="text-xl font-bold text-[#1a1a2e]">Acoustic Metrics</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'SLD Rate',   value: `${(analysis.positive_rate * 100).toFixed(1)}%` },
                  { label: 'Windows',    value: `${analysis.n_windows_positive} / ${analysis.n_windows_total}` },
                  { label: 'Confidence', value: analysis.confidence
                      ? analysis.confidence.charAt(0).toUpperCase() + analysis.confidence.slice(1)
                      : '—' },
                  { label: 'Duration',   value: fmtTime(analysis.duration_sec) },
                ].map((m) => (
                  <div key={m.label} className="p-4 bg-gray-50 rounded-xl text-center">
                    <p className="text-2xl font-bold text-[#1a1a2e]">{m.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Timeline */}
              {analysis.window_scores && analysis.window_scores.length > 0 && (
                <div className="mt-6">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-sm font-semibold text-gray-700">Stuttering Timeline</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded bg-red-500" /> SLD
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded bg-green-600" /> Fluent
                      </span>
                    </div>
                  </div>
                  <div className="flex items-end gap-px h-24 bg-gray-50 rounded-xl p-2">
                    {analysis.window_scores.map((w) => (
                      <div
                        key={w.window_idx}
                        title={`${w.start_sec}s–${w.end_sec}s · ${(w.sld_prob * 100).toFixed(0)}%`}
                        className="flex-1 rounded-t-sm min-w-0.5"
                        style={{
                          height: `${Math.max(w.sld_prob * 100, 3)}%`,
                          background: w.prediction === 'SLD' ? '#dc2626' : '#16a34a',
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0s</span>
                    <span>{fmtTime(analysis.duration_sec)}</span>
                  </div>
                </div>
              )}

              {analysis.processing_time_sec && (
                <p className="text-xs text-gray-400 text-right mt-3">
                  Processed in {analysis.processing_time_sec}s
                </p>
              )}
            </div>

            {/* AI Narrative */}
            {analysis.narrative && (
              <div className="bg-white rounded-2xl shadow-sm border-[1.5px] border-[#f59e0b]/20 p-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <Brain className="w-6 h-6 mr-2" style={{ color: ACCENT }} />
                    <h3 className="text-xl font-bold text-[#1a1a2e]">AI-Powered Analysis</h3>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const res = await axios.post(
                          `${API_BASE}/download-report`,
                          { report: analysis.narrative, name: userInfo.name },
                          { responseType: 'blob' }
                        );
                        const url = URL.createObjectURL(res.data);
                        const a   = document.createElement('a');
                        a.href     = url;
                        a.download = `${userInfo.name.replace(/ /g,'_')}_NeuroSage_Speech_Report.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {}
                    }}
                    className="flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-lg border transition"
                    style={{ color: ACCENT, borderColor: `${ACCENT}50` }}
                  >
                    <Download className="w-4 h-4" /> Download Report
                  </button>
                </div>
                <div className="prose max-w-none text-gray-700">
                  <div style={{ whiteSpace: 'pre-line', lineHeight: '1.8' }}>
                    {analysis.narrative}
                  </div>
                </div>
              </div>
            )}

            {/* Doctor Recommendations */}
            <div className="bg-white rounded-2xl shadow-sm border-[1.5px] border-[#f59e0b]/20 p-8">
              <div className="flex items-center mb-4">
                <MapPin className="w-6 h-6 mr-2" style={{ color: ACCENT }} />
                <h3 className="text-xl font-bold text-[#1a1a2e]">Specialists Near You</h3>
              </div>
              <p className="text-gray-600 mb-6">Based on pincode: {userInfo.pincode}</p>
              {analysis.doctors && analysis.doctors.length > 0 ? (
                <div className="space-y-4">
                  {analysis.doctors.slice(0, 3).map((doc, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                      <h4 className="font-bold text-gray-800">{doc.name}</h4>
                      <p className="text-sm mb-2" style={{ color: ACCENT }}>{doc.specialty}</p>
                      <p className="text-sm text-gray-600">{doc.address}</p>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-gray-500">{doc.distance}</span>
                        <span className="text-xs text-gray-700">{doc.phone}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg p-4 border" style={{ background: ACCENT_LIGHT, borderColor: `${ACCENT}40` }}>
                  <p className="text-sm font-semibold text-amber-900 mb-2">Find a Specialist Near You</p>
                  <p className="text-sm text-amber-800 mb-3">
                    Search for <strong>Speech-Language Pathologists</strong> or <strong>Developmental Stuttering specialists</strong> near pincode <strong>{userInfo.pincode}</strong> using:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`https://www.practo.com/search/doctors?results_type=doctor&q=%5B%7B%22word%22%3A%22speech+therapist%22%2C%22autocompleted%22%3Atrue%2C%22category%22%3A%22subspeciality%22%7D%5D&city=${userInfo.pincode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium px-3 py-1.5 rounded-full border transition"
                      style={{ color: ACCENT, borderColor: ACCENT, background: '#fff' }}
                    >
                      🔍 Search on Practo
                    </a>
                    <a
                      href={`https://www.google.com/maps/search/speech+language+pathologist+near+${userInfo.pincode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium px-3 py-1.5 rounded-full border transition"
                      style={{ color: ACCENT, borderColor: ACCENT, background: '#fff' }}
                    >
                      📍 Search on Google Maps
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Save Report */}
            <button
              onClick={async () => {
                setSaveState('saving');
                try {
                  await saveReport({
                    module:      'speech',
                    child_name:  userInfo.name,
                    child_age:   String(userInfo.age),
                    result_json: { ...analysis, userInfo },
                    token,
                  });
                  setSaveState('saved');
                } catch {
                  setSaveState('error');
                }
              }}
              disabled={saveState === 'saving' || saveState === 'saved'}
              className="w-full py-3 rounded-xl font-semibold text-sm mb-2 border-2 transition"
              style={saveState === 'saved'
                ? { background: '#dcfce7', borderColor: '#16a34a', color: '#16a34a' }
                : saveState === 'error'
                ? { background: '#fee2e2', borderColor: '#dc2626', color: '#dc2626' }
                : { background: '#fff', borderColor: ACCENT, color: ACCENT }}
            >
              {saveState === 'saving' ? '⏳ Saving...' :
               saveState === 'saved'  ? '✅ Report Saved to My Reports' :
               saveState === 'error'  ? '❌ Save Failed — Try Again' :
               '💾 Save Report to My Reports'}
            </button>

            {/* Clinical note */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800">
                ⚕️ This is a screening aid, not a clinical diagnosis. Results should be reviewed
                by a qualified Speech-Language Pathologist before any conclusions are drawn.
              </p>
            </div>

            <div className="text-center">
              <button
                onClick={resetApp}
                className="px-8 py-3 text-white rounded-lg font-semibold transition"
                style={{ background: ACCENT }}
                onMouseEnter={e => e.currentTarget.style.background = ACCENT_DARK}
                onMouseLeave={e => e.currentTarget.style.background = ACCENT}
              >
                Start New Assessment
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-center mt-12 pb-8 text-gray-500 text-sm">
        <p>⚠️ Screening tool only. Consult a Speech-Language Pathologist for proper evaluation.</p>
      </div>
    </div>
  );
};

export default SpeechDisorderScreener;
