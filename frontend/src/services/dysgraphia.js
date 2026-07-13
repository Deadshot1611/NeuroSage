import React, { useState } from 'react';
import { Upload, Brain, MapPin, User, FileText, Activity, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';
import axios from 'axios';
import { saveReport } from '../api/reportApi';
import { useAuth } from '../context/AuthContext';


const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const ACCENT       = '#6366f1';
const ACCENT_DARK  = '#4f46e5';
const ACCENT_LIGHT = '#eef2ff';

const DysgraphiaScreener = () => {
  const { token } = useAuth();
  const [step, setStep] = useState(1);
  const [saveState, setSaveState] = useState('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userInfo, setUserInfo] = useState({
    name: '',
    age: '',
    pincode: ''
  });
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  // Step 1: Collect user information
  const handleUserInfoSubmit = async () => {
    if (!userInfo.name || !userInfo.age || !userInfo.pincode || userInfo.pincode.length !== 6) {
      setError('Please fill all fields correctly');
      return;
    }

    const age = parseInt(userInfo.age);
    if (age < 7 || age > 12) {
      setError('Age must be between 7 and 12 years');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_URL}/generate-questions`, {
        name: userInfo.name,
        age: parseInt(userInfo.age)
      });

      setQuestions(response.data.questions);
      setStep(2);
    } catch (err) {
      setError('Failed to generate questions. Please check your connection and try again.');
      console.error(err);
    }

    setLoading(false);
  };

  // Step 2: Handle questionnaire
  const handleQuestionnaireSubmit = () => {
    if (Object.keys(answers).length < questions.length) {
      setError('Please answer all questions before proceeding.');
      return;
    }
    setError(null);
    setStep(3);
  };

  // Step 3: Handle image upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError('Image size must be less than 10MB');
        return;
      }

      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  // Final analysis
  const handleFinalAnalysis = async () => {
    if (!imageFile) {
      setError('Please upload a handwriting sample.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Analyze image
      const formData = new FormData();
      formData.append('image', imageFile);

      const imageResponse = await axios.post(`${API_URL}/analyze-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const imageScore = imageResponse.data.anomaly_score;

      // 2. Compute exact 80/20 weighted fusion math via backend
      const scoreResponse = await axios.post(`${API_URL}/compute-score`, {
        answers: answers,
        image_score: imageScore
      });

      const { combined } = scoreResponse.data;
      const finalScore = combined.combined_score;
      const questionnaireScore = combined.q_normalized_score;
      const imageAnomalyDetected = combined.dysgraphia_detected;

      // 3. Get AI narrative (Gemini acts only as copywriter — no math inside)
      const analysisResponse = await axios.post(`${API_URL}/generate-analysis`, {
        userInfo,
        questions,
        answers,
        questionnaireScore,
        imageScore,
        finalScore
      });

      const detailedAnalysis = analysisResponse.data.analysis;

      // 4. Get doctor recommendations
      const doctorsResponse = await axios.post(`${API_URL}/find-doctors`, {
        pincode: userInfo.pincode
      });
      const doctors = doctorsResponse.data.doctors || [];

      const analysisResult = {
        questionnaireScore,
        imageScore,
        imageAnomalyDetected,
        finalScore,
        detailedAnalysis,
        doctors
      };
      setAnalysis(analysisResult);
      setStep(4);
    } catch (err) {
      setError('Analysis failed. Please try again.');
      console.error(err);
    }

    setLoading(false);
  };

  const resetApp = () => {
    setStep(1);
    setUserInfo({name: '', age: '', pincode: ''});
    setQuestions([]);
    setAnswers({});
    setImageFile(null);
    setImagePreview(null);
    setAnalysis(null);
    setError(null);
  };

  const handleDownloadReport = async () => {
    try {
      const response = await axios.post(`${API_URL}/download-report`, {
        report: analysis.detailedAnalysis,
        name: userInfo.name
      }, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${userInfo.name.replace(/ /g, '_')}_NeuroSage_Report.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download report', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8fc] p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="flex items-center justify-center mb-4">
            <Brain className="w-12 h-12 mr-3" style={{ color: ACCENT }} />
            <h1 className="text-4xl font-bold text-[#1a1a2e]">Dysgraphia Screener</h1>
          </div>
          <p className="text-gray-600 text-lg">AI-Powered Early Detection & Assessment</p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center mb-2 gap-0">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
                  style={step >= s ? { background: ACCENT, color: '#fff' } : { background: '#d1d5db', color: '#6b7280' }}
                >
                  {s}
                </div>
                {s < 4 && (
                  <div className="w-24 h-1" style={{ background: step > s ? ACCENT : '#d1d5db' }} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm text-gray-600 max-w-xs mx-auto">
            <span>Info</span>
            <span>Questions</span>
            <span>Image</span>
            <span>Results</span>
          </div>
        </div>

        {/* Step 1: User Information */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border-[1.5px] p-8" style={{ borderColor: `${ACCENT}30` }}>
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
                  onChange={(e) => setUserInfo({...userInfo, name: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none"
                  onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${ACCENT}40`}
                  onBlur={e => e.target.style.boxShadow = ''}
                  placeholder="Enter child's name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Age (7-12 years)</label>
                <input
                  type="number"
                  min="7"
                  max="12"
                  value={userInfo.age}
                  onChange={(e) => setUserInfo({...userInfo, age: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none"
                  onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${ACCENT}40`}
                  onBlur={e => e.target.style.boxShadow = ''}
                  placeholder="Enter age"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="inline w-4 h-4 mr-1" />
                  Pincode (for doctor recommendations)
                </label>
                <input
                  type="text"
                  value={userInfo.pincode}
                  onChange={(e) => setUserInfo({...userInfo, pincode: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none"
                  onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${ACCENT}40`}
                  onBlur={e => e.target.style.boxShadow = ''}
                  placeholder="6-digit Indian pincode"
                  maxLength="6"
                />
              </div>

              <button
                onClick={handleUserInfoSubmit}
                disabled={loading}
                className="w-full text-white py-4 rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center"
                style={{ background: ACCENT }}
                onMouseEnter={e => e.currentTarget.style.background = ACCENT_DARK}
                onMouseLeave={e => e.currentTarget.style.background = ACCENT}
              >
                {loading ? (
                  <>
                    <Activity className="animate-spin w-5 h-5 mr-2" />
                    Generating personalized questions...
                  </>
                ) : 'Continue to Assessment'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Questionnaire */}
        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-sm border-[1.5px] p-8" style={{ borderColor: `${ACCENT}30` }}>
            <div className="flex items-center mb-6">
              <FileText className="w-6 h-6 mr-2" style={{ color: ACCENT }} />
              <h2 className="text-2xl font-bold text-[#1a1a2e]">Assessment Questions</h2>
            </div>
            <p className="text-gray-600 mb-6">These questions are tailored for {userInfo.name}, age {userInfo.age}</p>

            <div className="space-y-6">
              {questions.map((q, idx) => (
                <div key={idx} className="border-b border-gray-200 pb-6">
                  <p className="font-medium text-gray-800 mb-3">
                    {idx + 1}. {q.question}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {['Never', 'Rarely', 'Sometimes', 'Frequently', 'Always'].map((option, score) => (
                      <button
                        key={score}
                        onClick={() => setAnswers({...answers, [idx]: score})}
                        className="px-4 py-2 rounded-lg border-2 transition"
                        style={answers[idx] === score
                          ? { background: ACCENT, color: '#fff', borderColor: ACCENT }
                          : { background: '#fff', color: '#374151', borderColor: '#d1d5db' }}
                        onMouseEnter={e => { if (answers[idx] !== score) e.currentTarget.style.borderColor = ACCENT; }}
                        onMouseLeave={e => { if (answers[idx] !== score) e.currentTarget.style.borderColor = '#d1d5db'; }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex gap-4">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition"
              >
                Back
              </button>
              <button
                onClick={handleQuestionnaireSubmit}
                className="flex-1 text-white py-3 rounded-lg font-semibold transition"
                style={{ background: ACCENT }}
                onMouseEnter={e => e.currentTarget.style.background = ACCENT_DARK}
                onMouseLeave={e => e.currentTarget.style.background = ACCENT}
              >
                Continue to Image Upload
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Image Upload */}
        {step === 3 && (
          <div className="bg-white rounded-2xl shadow-sm border-[1.5px] p-8" style={{ borderColor: `${ACCENT}30` }}>
            <div className="flex items-center mb-6">
              <Upload className="w-6 h-6 mr-2" style={{ color: ACCENT }} />
              <h2 className="text-2xl font-bold text-[#1a1a2e]">Handwriting Sample</h2>
            </div>
            <p className="text-gray-600 mb-6">Upload a clear photo of {userInfo.name}'s handwriting</p>

            <div className="mb-6">
              <div
                className="border-4 border-dashed border-gray-300 rounded-xl p-8 text-center transition cursor-pointer"
                onMouseEnter={e => e.currentTarget.style.borderColor = ACCENT}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#d1d5db'}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="image-upload"
                />
                <label htmlFor="image-upload" className="cursor-pointer">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="max-h-96 mx-auto rounded-lg" />
                  ) : (
                    <div>
                      <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 font-medium">Click to upload handwriting sample</p>
                      <p className="text-sm text-gray-500 mt-2">PNG, JPG up to 10MB</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="rounded-lg p-4 mb-6" style={{ background: ACCENT_LIGHT, border: `1px solid ${ACCENT}40` }}>
              <p className="text-sm text-indigo-800">
                <strong>Tips for best results:</strong> Use lined paper, ensure good lighting, capture the full page, avoid shadows
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setStep(2)}
                className="px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition"
              >
                Back
              </button>
              <button
                onClick={handleFinalAnalysis}
                disabled={loading || !imageFile}
                className="flex-1 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center"
                style={{ background: ACCENT }}
                onMouseEnter={e => { if (!loading && imageFile) e.currentTarget.style.background = ACCENT_DARK; }}
                onMouseLeave={e => e.currentTarget.style.background = ACCENT}
              >
                {loading ? (
                  <>
                    <Activity className="animate-spin w-5 h-5 mr-2" />
                    Analyzing...
                  </>
                ) : 'Complete Analysis'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && analysis && (
          <div className="space-y-6">
            {/* Score Summary */}
            <div className="bg-white rounded-2xl shadow-sm border-[1.5px] p-8" style={{ borderColor: `${ACCENT}30` }}>
              <div className="flex items-center mb-6">
                <TrendingUp className="w-6 h-6 mr-2" style={{ color: ACCENT }} />
                <h2 className="text-2xl font-bold text-[#1a1a2e]">Screening Results</h2>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-lg text-center" style={{ background: ACCENT_LIGHT }}>
                  <p className="text-sm text-gray-600 mb-2">Questionnaire</p>
                  <p className="text-3xl font-bold" style={{ color: ACCENT }}>{analysis.questionnaireScore.toFixed(0)}</p>
                  <p className="text-xs text-gray-500">20% weight</p>
                </div>
                <div className="p-4 rounded-lg text-center" style={{ background: ACCENT_LIGHT }}>
                  <p className="text-sm text-gray-600 mb-2">Image Analysis</p>
                  <p className="text-3xl font-bold" style={{ color: ACCENT }}>
                    {analysis.imageAnomalyDetected ? 'At Risk' : 'Typical'}
                  </p>
                  <p className="text-xs text-gray-500">80% weight</p>
                </div>
                <div className="bg-[#1a1a2e] p-4 rounded-lg text-center">
                  <p className="text-sm text-gray-400 mb-2">Combined Score</p>
                  <p className="text-3xl font-bold" style={{ color: ACCENT }}>{analysis.finalScore.toFixed(0)}</p>
                  <p className="text-xs text-gray-400">out of 100</p>
                </div>
              </div>

              <div className={`p-4 rounded-lg ${
                analysis.finalScore > 70 ? 'bg-red-50 border border-red-200' :
                analysis.finalScore > 40 ? 'bg-yellow-50 border border-yellow-200' :
                'bg-green-50 border border-green-200'
              }`}>
                <div className="flex items-center mb-2">
                  {analysis.finalScore > 70 ? (
                    <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                  ) : analysis.finalScore > 40 ? (
                    <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                  )}
                  <span className="font-bold">
                    {analysis.finalScore > 70 ? 'High Likelihood' :
                     analysis.finalScore > 40 ? 'Medium Likelihood' :
                     'Low Likelihood'}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Analysis */}
            <div className="bg-white rounded-2xl shadow-sm border-[1.5px] p-8" style={{ borderColor: `${ACCENT}30` }}>
              <div className="flex items-center mb-4">
                <Brain className="w-6 h-6 mr-2" style={{ color: ACCENT }} />
                <h3 className="text-xl font-bold text-[#1a1a2e]">AI-Powered Analysis</h3>
              </div>
              <div className="prose max-w-none text-gray-700">
                <div style={{ whiteSpace: 'pre-line', lineHeight: '1.8' }}>
                  {analysis.detailedAnalysis}
                </div>
              </div>
            </div>

            {/* Doctor Recommendations */}
            {analysis.doctors && analysis.doctors.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border-[1.5px] p-8" style={{ borderColor: `${ACCENT}30` }}>
                <div className="flex items-center mb-4">
                  <MapPin className="w-6 h-6 mr-2" style={{ color: ACCENT }} />
                  <h3 className="text-xl font-bold text-[#1a1a2e]">Specialists Near You</h3>
                </div>
                <p className="text-gray-600 mb-6">Based on pincode: {userInfo.pincode}</p>

                <div className="space-y-4">
                  {analysis.doctors.map((doc, idx) => (
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
              </div>
            )}

            {/* Save Report */}
            <button
              onClick={async () => {
                setSaveState('saving');
                try {
                  await saveReport({
                    module:      'dysgraphia',
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
              className="w-full py-3 rounded-lg font-semibold text-sm mb-4 border-2 transition"
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

            <div className="text-center flex justify-center gap-4">
              <button
                onClick={handleDownloadReport}
                className="px-8 py-3 bg-white border-2 rounded-lg font-semibold transition"
                style={{ borderColor: ACCENT, color: ACCENT }}
                onMouseEnter={e => e.currentTarget.style.background = ACCENT_LIGHT}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                Download Report
              </button>
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

      {/* Footer */}
      <div className="text-center mt-12 pb-8 text-gray-500 text-sm">
        <p>⚠️ This is a screening tool, not a diagnostic instrument. Please consult a healthcare professional for proper diagnosis.</p>
      </div>
    </div>
  );
};

export default DysgraphiaScreener;
