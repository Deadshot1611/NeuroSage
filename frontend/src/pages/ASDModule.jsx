import { useState, useEffect, useRef } from 'react'
import { processGaze, fusePrediction, generateReport } from '../api/client'
import { saveReport } from '../api/reportApi'
import { useAuth } from '../context/AuthContext'

// ── AQ-10 Child Questions (Allison et al. 2012) ────────────────
const AQ10_QUESTIONS = [
  {
    id: 1,
    question: "Does your child often notice small sounds that others do not?",
    autisticResponse: "agree",   // score 1 for agree
  },
  {
    id: 2,
    question: "Does your child usually focus on the whole picture rather than small details?",
    autisticResponse: "disagree", // score 1 for disagree
  },
  {
    id: 3,
    question: "In a social group, can your child easily keep track of several people's conversations?",
    autisticResponse: "disagree",
  },
  {
    id: 4,
    question: "Does your child find it easy to switch back and forth between different activities?",
    autisticResponse: "disagree",
  },
  {
    id: 5,
    question: "Does your child struggle to keep a conversation going with peers?",
    autisticResponse: "agree",
  },
  {
    id: 6,
    question: "Is your child good at social small talk and casual chatting?",
    autisticResponse: "disagree",
  },
  {
    id: 7,
    question: "When your child is read a story, does s/he find it hard to understand what the characters are feeling?",
    autisticResponse: "agree",
  },
  {
    id: 8,
    question: "When your child was in preschool, did s/he enjoy pretend play with other children?",
    autisticResponse: "disagree",
  },
  {
    id: 9,
    question: "Can your child easily tell what someone is thinking or feeling just by looking at their face?",
    autisticResponse: "disagree",
  },
  {
    id: 10,
    question: "Does your child find it hard to make new friends?",
    autisticResponse: "agree",
  },
]

const ANSWER_OPTIONS = [
  { label: "Definitely Agree",   value: "definitely_agree" },
  { label: "Slightly Agree",     value: "slightly_agree" },
  { label: "Slightly Disagree",  value: "slightly_disagree" },
  { label: "Definitely Disagree",value: "definitely_disagree" },
]

// Score one question: returns 1 if autistic response, 0 otherwise
function scoreQuestion(questionIndex, answerValue) {
  const q = AQ10_QUESTIONS[questionIndex]
  const isAgree    = answerValue === 'definitely_agree' || answerValue === 'slightly_agree'
  const isDisagree = answerValue === 'slightly_disagree' || answerValue === 'definitely_disagree'
  if (q.autisticResponse === 'agree'    && isAgree)    return 1
  if (q.autisticResponse === 'disagree' && isDisagree) return 1
  return 0
}

// Number of stimulus images to show
const N_STIMULI = 30
// Time per image in milliseconds
const IMAGE_DURATION = 4000

// ── PHASE INDICATOR ────────────────────────────────────────────
function PhaseBar({ phase }) {
  const phases = ['Child Info', 'Questionnaire', 'Eye Tracking', 'Results']
  return (
    <div className="w-full max-w-2xl mx-auto mb-8">
      <div className="flex items-center justify-between relative">
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-[#e5e7eb] z-0" />
        <div
          className="absolute top-4 left-0 h-0.5 bg-[#00c9a7] z-0 transition-all duration-500"
          style={{ width: `${(phase / 3) * 100}%` }}
        />
        {phases.map((p, i) => (
          <div key={p} className="flex flex-col items-center gap-2 z-10">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                            transition-all duration-300
                            ${i < phase  ? 'bg-[#00c9a7] text-white' :
                              i === phase ? 'bg-[#00c9a7] text-white ring-4 ring-[#e6faf6]' :
                                           'bg-white text-[#9ca3af] border-2 border-[#e5e7eb]'}`}>
              {i < phase ? '✓' : i + 1}
            </div>
            <span className={`text-xs font-medium hidden md:block
                             ${i === phase ? 'text-[#00c9a7]' : 'text-[#9ca3af]'}`}>
              {p}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PHASE 1: CHILD INFO ────────────────────────────────────────
function PhaseChildInfo({ onNext }) {
  const [form, setForm] = useState({ name: '', age: '', gender: '', city: '' })
  const valid = form.name && form.age && form.gender && form.city

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-[#1a1a2e] mb-2">Child Information</h2>
      <p className="text-[#6b7280] mb-8">
        Please provide some basic information about the child before we begin.
      </p>

      <div className="flex flex-col gap-5">
        <div>
          <label className="block text-sm font-semibold text-[#1a1a2e] mb-2">
            Child's Name
          </label>
          <input
            type="text"
            placeholder="Enter child's name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full border border-[#d1d5db] rounded-xl px-4 py-3 text-sm
                       focus:outline-none focus:border-[#00c9a7] focus:ring-2
                       focus:ring-[#e6faf6] transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#1a1a2e] mb-2">
            Age (years)
          </label>
          <input
            type="number"
            min="5" max="12"
            placeholder="Age between 5 and 12"
            value={form.age}
            onChange={e => setForm({ ...form, age: e.target.value })}
            className="w-full border border-[#d1d5db] rounded-xl px-4 py-3 text-sm
                       focus:outline-none focus:border-[#00c9a7] focus:ring-2
                       focus:ring-[#e6faf6] transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#1a1a2e] mb-2">
            Gender
          </label>
          <div className="flex gap-3">
            {['Male', 'Female', 'Other'].map(g => (
              <button
                key={g}
                onClick={() => setForm({ ...form, gender: g })}
                className={`flex-1 py-3 rounded-xl text-sm font-medium border-2 transition-all
                            ${form.gender === g
                              ? 'border-[#00c9a7] bg-[#e6faf6] text-[#00c9a7]'
                              : 'border-[#e5e7eb] text-[#6b7280] hover:border-[#00c9a7]'
                            }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#1a1a2e] mb-2">
            City / Location
          </label>
          <input
            type="text"
            placeholder="e.g. Kolkata, Mumbai, Delhi"
            value={form.city}
            onChange={e => setForm({ ...form, city: e.target.value })}
            className="w-full border border-[#d1d5db] rounded-xl px-4 py-3 text-sm
                       focus:outline-none focus:border-[#00c9a7] focus:ring-2
                       focus:ring-[#e6faf6] transition-all"
          />
          <p className="text-xs text-[#9ca3af] mt-1">
            Used to recommend nearby specialists if needed.
          </p>
        </div>

        <button
          onClick={() => valid && onNext(form)}
          disabled={!valid}
          className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all
                      ${valid
                        ? 'bg-[#00c9a7] text-white hover:bg-[#00b396] shadow-md'
                        : 'bg-[#f3f4f6] text-[#9ca3af] cursor-not-allowed'
                      }`}
        >
          Continue to Questionnaire →
        </button>
      </div>
    </div>
  )
}

// ── PHASE 2: AQ-10 QUESTIONNAIRE ──────────────────────────────
function PhaseQuestionnaire({ onNext }) {
  const [current, setCurrent]   = useState(0)
  const [answers, setAnswers]   = useState({})
  const [selected, setSelected] = useState(null)

  const handleAnswer = (val) => {
    setSelected(val)
  }

  const handleNext = () => {
    if (selected === null) return
    const newAnswers = { ...answers, [current]: selected }
    setAnswers(newAnswers)
    setSelected(null)

    if (current === AQ10_QUESTIONS.length - 1) {
      // Score all answers
      const scored = AQ10_QUESTIONS.map((_, i) =>
        scoreQuestion(i, newAnswers[i])
      )
      onNext(scored)
    } else {
      setCurrent(current + 1)
    }
  }

  const q = AQ10_QUESTIONS[current]
  const progress = ((current) / AQ10_QUESTIONS.length) * 100

  return (
    <div className="max-w-lg mx-auto">
      {/* Progress */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[#6b7280]">
          Question {current + 1} of {AQ10_QUESTIONS.length}
        </span>
        <span className="text-sm font-semibold text-[#00c9a7]">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="w-full h-2 bg-[#e5e7eb] rounded-full mb-8">
        <div
          className="h-2 bg-[#00c9a7] rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Question */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb] p-8 mb-6 shadow-sm">
        <p className="text-sm font-medium text-[#00c9a7] mb-3 uppercase tracking-wide">
          AQ-10 Child Questionnaire
        </p>
        <h3 className="text-xl font-bold text-[#1a1a2e] leading-snug">
          {q.question}
        </h3>
      </div>

      {/* Options */}
      <div className="flex flex-col gap-3 mb-6">
        {ANSWER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => handleAnswer(opt.value)}
            className={`w-full text-left px-5 py-4 rounded-xl border-2 text-sm font-medium
                        transition-all duration-150
                        ${selected === opt.value
                          ? 'border-[#00c9a7] bg-[#e6faf6] text-[#00c9a7]'
                          : 'border-[#e5e7eb] text-[#374151] hover:border-[#00c9a7]'
                        }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <button
        onClick={handleNext}
        disabled={selected === null}
        className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all
                    ${selected !== null
                      ? 'bg-[#00c9a7] text-white hover:bg-[#00b396] shadow-md'
                      : 'bg-[#f3f4f6] text-[#9ca3af] cursor-not-allowed'
                    }`}
      >
        {current === AQ10_QUESTIONS.length - 1 ? 'Finish Questionnaire →' : 'Next Question →'}
      </button>
    </div>
  )
}

// ── LOADING SCREEN COMPONENT ─────────────────────────────────
function LoadingScreen() {
  const FUN_FACTS = [
    "Did you know? Your eyes move about 3 times per second! 👁️",
    "Fun fact: Butterflies can see colours humans cannot! 🦋",
    "Did you know? Cats can see in near-total darkness! 🐱",
    "Fun fact: An ostrich eye is bigger than its brain! 🦅",
    "Did you know? Dragonflies have nearly 360° vision! 🐉",
    "Fun fact: Owls cannot move their eyeballs — they turn their heads! 🦉",
  ]
  const [factIdx, setFactIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() =>
      setFactIdx(i => (i + 1) % FUN_FACTS.length), 2500)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="text-6xl mb-6">🔭</div>
      <h2 className="text-2xl font-bold text-[#1a1a2e] mb-3">
        Getting the Camera Ready...
      </h2>
      <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6 mb-6
                      min-h-[80px] flex items-center justify-center">
        <p className="text-[#374151] text-lg font-medium">
          {FUN_FACTS[factIdx]}
        </p>
      </div>
      <div className="flex justify-center gap-2 mb-4">
        {[0,1,2].map(i => (
          <div key={i}
            className="w-3 h-3 rounded-full bg-[#00c9a7] animate-bounce"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
      <p className="text-[#9ca3af] text-sm">
        Setting up eye tracking magic ✨
      </p>
    </div>
  )
}

// ── FACE CHECK SCREEN ─────────────────────────────────────────
function FaceCheckScreen({ onReady, gazeRef }) {
  const [detected, setDetected] = useState(false)
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    // Poll for first gaze data every 200ms
    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      if (gazeRef.current && gazeRef.current.length > 0) {
        clearInterval(interval)
        setDetected(true)
        // Give 3 second countdown so child is ready
        let count = 3
        setCountdown(count)
        const timer = setInterval(() => {
          count--
          setCountdown(count)
          if (count <= 0) {
            clearInterval(timer)
            onReady()
          }
        }, 1000)
      }
      // After 15 seconds give up and proceed anyway
      if (attempts > 75) {
        clearInterval(interval)
        onReady()
      }
    }, 200)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 bg-[#f0f4ff] flex flex-col
                    items-center justify-center z-50 text-center px-8">
      {!detected ? (
        <>
          <div className="text-6xl mb-6 animate-pulse">👀</div>
          <h2 className="text-2xl font-bold text-[#1a1a2e] mb-3">
            Setting Up Eye Tracking
          </h2>
          <p className="text-[#6b7280] mb-4">
            Please make sure your child is looking at the screen.
            Aligning eye tracking...
          </p>
          <div className="flex gap-1 mt-2">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-[#00c9a7] animate-bounce"
                   style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="text-6xl mb-6">✅</div>
          <h2 className="text-2xl font-bold text-[#1a1a2e] mb-3">
            Eye Tracking Ready!
          </h2>
          <p className="text-[#6b7280] mb-4">
            Great! Images will start in...
          </p>
          <div className="text-6xl font-bold text-[#00c9a7]">
            {countdown}
          </div>
        </>
      )}
    </div>
  )
}

// ── PHASE 3: EYE TRACKING ─────────────────────────────────────
function PhaseEyeTracking({ onNext }) {
  const [step, setStep]           = useState('intro')
  const [currentImg, setCurrentImg] = useState(0)
  // const [allFixations, setAllFixations] = useState([])
  const [calibrationDot, setCalibrationDot] = useState(0)
  const gazeRef   = useRef([])
  const allFixRef = useRef([])
  const timerRef  = useRef(null)
  const webgazerRef = useRef(null)
  const streamRef = useRef(null)  // track the raw MediaStream

  const CALIB_DOTS = [
    { x: 10, y: 10 }, { x: 50, y: 10 }, { x: 90, y: 10 },
    { x: 10, y: 50 }, { x: 50, y: 50 }, { x: 90, y: 50 },
    { x: 10, y: 90 }, { x: 50, y: 90 }, { x: 90, y: 90 },
  ]
  const CALIB_EMOJIS = ['🌟','🎯','🌈','🐱','🦋','🎪','🍭','🚀','⭐']
  const STIMULI = Array.from({ length: N_STIMULI }, (_, i) => `/stimuli/${i + 1}.jpg`)

  // ── Stop everything cleanly ──────────────────────────────────
  const stopEverything = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    // 1. Kill our manually captured stream first
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    } catch(e) {}

    // 2. Kill WebGazer's secret internal video stream BEFORE ending it
    try {
      const wgVideo = document.getElementById('webgazerVideoFeed')
      if (wgVideo && wgVideo.srcObject) {
        wgVideo.srcObject.getTracks().forEach(t => t.stop())
        wgVideo.srcObject = null
      }
    } catch(e) {}

    // 3. Sweep up any remaining rogue video tracks on the DOM
    try {
      document.querySelectorAll('video').forEach(v => {
        try {
          if (v.srcObject) {
            v.srcObject.getTracks().forEach(t => { t.stop(); t.enabled = false })
            v.srcObject = null
          }
        } catch(e) {}
      })
    } catch(e) {}

    // 4. NOW it is safe to tear down the WebGazer engine
    try {
      if (window.webgazer) {
        window.webgazer.pause()
        window.webgazer.end()
      }
    } catch(e) {}

    webgazerRef.current = null

    // 5. Clean up WebGazer's leftover UI canvas if it's stuck on screen
    try {
      const wgCanvas = document.getElementById('webgazerVideoCanvas')
      if (wgCanvas) wgCanvas.remove()
    } catch(e) {}
  }

  useEffect(() => {
    return () => stopEverything()
  }, [])

  // ── Start camera + WebGazer ──────────────────────────────────
  const handleAllowCamera = async () => {
    // Show loading screen while WebGazer initialises
    setStep('loading')
    try {
      // Get camera stream reference so we can stop it later
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream

      // Wait for WebGazer CDN script to be ready (max 30 seconds)
      let attempts = 0
      while (!window.webgazer && attempts < 60) {
        await new Promise(r => setTimeout(r, 500))
        attempts++
      }

      if (!window.webgazer) {
        console.warn('WebGazer not available — proceeding without gaze tracking')
        setStep('calibration')
        return
      }

      const webgazer = window.webgazer
      webgazerRef.current = webgazer

      await webgazer
        .setRegression('ridge')
        .setTracker('TFFacemesh')
        .setGazeListener((data) => {
          if (data) {
            const now = Date.now()
            const duration = gazeRef.current.length > 0 
              ? now - gazeRef.current[gazeRef.current.length - 1].timestamp 
              : 100
            
            gazeRef.current.push({
              x: data.x, y: data.y,
              duration: Math.max(16, Math.min(duration, 500)),
              timestamp: now,
            })
          }
        })
        .begin()

      webgazer.showVideoPreview(false)
      webgazer.showPredictionPoints(false)

      // WebGazer started — move to calibration
      setStep('calibration')
    } catch(e) {
      console.error('Camera/WebGazer error:', e)
      setStep('calibration')
    }
  }

  // ── Calibration dot click ────────────────────────────────────
  const handleCalibDot = () => {
    if (calibrationDot < CALIB_DOTS.length - 1) {
      setCalibrationDot(calibrationDot + 1)
    } else {
      // Wait for WebGazer to detect face before showing images
      setStep('facecheck')
    }
  }

  // ── Show stimulus images ─────────────────────────────────────
  const showNextImage = (idx) => {
    setCurrentImg(idx)
    gazeRef.current = []

    timerRef.current = setTimeout(() => {
      const fixations = gazeRef.current.slice()
      allFixRef.current = [...allFixRef.current, ...fixations]
      gazeRef.current = []

      if (idx < N_STIMULI - 1) {
        showNextImage(idx + 1)
      } else {
        // All images done
        const finalFixations = allFixRef.current

        // Log gaze data summary to console for testing
        console.group('🔍 GAZE DATA SUMMARY (Testing Mode)')
        console.log('Total fixations recorded:', finalFixations.length)
        console.log('Per image average:', Math.round(finalFixations.length / N_STIMULI))
        if (finalFixations.length > 0) {
          const xs = finalFixations.map(f => f.x)
          const ys = finalFixations.map(f => f.y)
          console.log('X range:', Math.round(Math.min(...xs)), '→', Math.round(Math.max(...xs)))
          console.log('Y range:', Math.round(Math.min(...ys)), '→', Math.round(Math.max(...ys)))
          console.log('First 5 fixations:', finalFixations.slice(0, 5))
        } else {
          console.warn('⚠️ No gaze data recorded — WebGazer may not have tracked properly')
        }
        console.groupEnd()

        setStep('processing')
        stopEverything()  // stop camera HERE after images done
        handleGazeComplete(finalFixations)
      }
    }, IMAGE_DURATION)
  }

  const handleGazeComplete = async (fixations) => {
    try {
      const result = await processGaze(
        fixations,
        window.innerWidth,
        window.innerHeight
      )
      // Log backend response
      console.log('📊 Backend gaze result:', result)
      onNext(result)
    } catch (err) {
      console.error('Gaze processing error:', err)
      onNext({ p_gaze: 0.5, confidence: 0.5, valid: false })
    }
  }

  // ── INTRO ────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div className="max-w-lg mx-auto text-center">
        <div className="text-6xl mb-6">👁️</div>
        <h2 className="text-2xl font-bold text-[#1a1a2e] mb-3">
          Eye Tracking Session
        </h2>
        <p className="text-[#6b7280] mb-6 leading-relaxed">
          In this step, your child will view {N_STIMULI} images on screen for a few
          seconds each. The webcam will track their natural eye movements.{' '}
          <strong>No special equipment needed.</strong>
        </p>
        <div className="bg-[#f0f2f7] rounded-xl p-5 text-left mb-8 flex flex-col gap-3">
          <p className="text-sm font-semibold text-[#1a1a2e]">Before starting:</p>
          {[
            'Seat the child comfortably in front of the screen',
            'Ensure the room is reasonably well lit',
            'Ask the child to look at the images as they appear',
            `Session takes approximately ${Math.round((N_STIMULI * IMAGE_DURATION) / 60000)} minutes`,
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-3 text-sm text-[#6b7280]">
              <span className="text-[#00c9a7] font-bold mt-0.5">✓</span>
              {tip}
            </div>
          ))}
        </div>

        <button
          onClick={() => setStep('permission')}
          className="w-full bg-[#00c9a7] text-white py-3.5 rounded-xl font-semibold
                     hover:bg-[#00b396] transition-colors shadow-md mb-3"
        >
          Begin Eye Tracking →
        </button>

        {/* SKIP BUTTON */}
        <button
          onClick={() => onNext({ p_gaze: null, confidence: null, valid: false, skipped: true })}
          className="w-full border border-[#d1d5db] text-[#6b7280] py-3 rounded-xl
                     font-medium text-sm hover:border-[#00c9a7] hover:text-[#00c9a7]
                     transition-colors"
        >
          Skip Eye Tracking — Use Questionnaire Only
        </button>

        {/* ── TEST BUTTONS — REMOVE BEFORE DEPLOYMENT ──────────
            Remove lines from here... */}
        <button
          onClick={() => onNext({
            p_gaze: 0.938, confidence: 0.938,
            p_map: 0.91, p_pt: 0.96,
            n_fixations: 847, valid: true, test_mode: true
          })}
          className="w-full border border-dashed border-[#f59e0b] text-[#f59e0b]
                     py-3 rounded-xl font-medium text-sm hover:bg-[#fef3c7]
                     transition-colors mt-2"
        >
          🧪 [TEST] Simulate ASD Gaze Data
        </button>
        <button
          onClick={() => onNext({
            p_gaze: 0.054, confidence: 0.946,
            p_map: 0.06, p_pt: 0.05,
            n_fixations: 912, valid: true, test_mode: true
          })}
          className="w-full border border-dashed border-[#6366f1] text-[#6366f1]
                     py-3 rounded-xl font-medium text-sm hover:bg-[#eef2ff]
                     transition-colors mt-1"
        >
          🧪 [TEST] Simulate TD Gaze Data
        </button>
        {/* ...to here ── END TEST BLOCK ── */}
      </div>
    )
  }

  // ── PERMISSION ───────────────────────────────────────────────
  if (step === 'permission') {
    return (
      <div className="max-w-lg mx-auto text-center">
        <div className="text-6xl mb-6">📷</div>
        <h2 className="text-2xl font-bold text-[#1a1a2e] mb-3">
          Camera Access Required
        </h2>
        <p className="text-[#6b7280] mb-8 leading-relaxed">
          Please click the button below. Your browser will ask for camera permission.
          Allow it — the camera feed is processed locally and never stored or uploaded.
        </p>
        <button
          onClick={handleAllowCamera}
          className="w-full bg-[#00c9a7] text-white py-3.5 rounded-xl font-semibold
                     hover:bg-[#00b396] transition-colors shadow-md"
        >
          Allow Camera & Start →
        </button>
      </div>
    )
  }

  // ── PERMISSION DENIED ────────────────────────────────────────
  if (step === 'denied') {
    return (
      <div className="max-w-lg mx-auto text-center">
        <div className="text-6xl mb-6">🔒</div>
        <h2 className="text-2xl font-bold text-[#1a1a2e] mb-3">
          Camera Access Denied
        </h2>
        <p className="text-[#6b7280] mb-6 leading-relaxed">
          We need camera access to track eye movements. If you blocked it by mistake, 
          you may need to click the camera icon in your browser's address bar to allow it, then try again.
        </p>

        <button
          onClick={() => setStep('permission')}
          className="w-full bg-[#1a1a2e] text-white py-3.5 rounded-xl font-semibold
                     hover:bg-[#2d2d4a] transition-colors shadow-md mb-3"
        >
          🔄 Try Again
        </button>

        <button
          onClick={() => {
            stopEverything() // Ensure any half-started tracks are killed
            onNext({ p_gaze: null, confidence: null, valid: false, skipped: true })
          }}
          className="w-full border border-[#d1d5db] text-[#6b7280] py-3 rounded-xl
                     font-medium text-sm hover:border-[#00c9a7] hover:text-[#00c9a7]
                     transition-colors"
        >
          Skip Eye Tracking — Use Questionnaire Only
        </button>
      </div>
    )
  }

  // ── LOADING SCREEN ───────────────────────────────────────────
  // ── LOADING SCREEN ───────────────────────────────────────────
  if (step === 'loading') {
    return <LoadingScreen />
  }

  // ── CALIBRATION ──────────────────────────────────────────────
  if (step === 'calibration') {
    return (
      <div className="fixed inset-0 bg-[#f0f4ff] flex flex-col
                      items-center justify-center z-50">
        <div className="absolute top-8 text-center px-4">
          <p className="text-[#1a1a2e] font-bold text-xl">
            Help us calibrate! 👀
          </p>
          <p className="text-[#6b7280] text-sm mt-1">
            Ask your child to look at the {CALIB_EMOJIS[calibrationDot]} and click it!
          </p>
          <p className="text-[#00c9a7] text-sm font-semibold mt-1">
            {calibrationDot + 1} of {CALIB_DOTS.length} done
          </p>
        </div>

        {CALIB_DOTS.map((d, i) => (
          i < calibrationDot ? (
            <div key={i} className="absolute flex items-center justify-center"
              style={{ left:`${d.x}%`, top:`${d.y}%`,
                       transform:'translate(-50%,-50%)', fontSize:20, opacity:0.4 }}>
              ✓
            </div>
          ) : i === calibrationDot ? (
            <div key={i} onClick={handleCalibDot}
              className="absolute flex items-center justify-center
                         cursor-pointer animate-bounce"
              style={{
                left:`${d.x}%`, top:`${d.y}%`,
                transform:'translate(-50%,-50%)',
                width:56, height:56, background:'white',
                borderRadius:'50%',
                boxShadow:'0 0 0 6px rgba(0,201,167,0.3), 0 4px 20px rgba(0,0,0,0.15)',
                fontSize:30, userSelect:'none',
              }}>
              {CALIB_EMOJIS[i]}
            </div>
          ) : (
            <div key={i} className="absolute"
              style={{
                left:`${d.x}%`, top:`${d.y}%`,
                transform:'translate(-50%,-50%)',
                width:12, height:12,
                background:'#d1d5db', borderRadius:'50%',
              }} />
          )
        ))}
      </div>
    )
  }

  // ── FACE CHECK ───────────────────────────────────────────────
  if (step === 'facecheck') {
    // Auto-proceed once WebGazer fires first gaze data
    // This useEffect runs when step changes to facecheck
    return (
      <FaceCheckScreen onReady={() => {
        setStep('viewing')
        showNextImage(0)
      }} gazeRef={gazeRef} />
    )
  }

  // ── VIEWING IMAGES ───────────────────────────────────────────
  if (step === 'viewing') {
    return (
      <div className="fixed inset-0 bg-black flex flex-col
                      items-center justify-center z-50">
        <div className="absolute top-4 left-0 right-0 flex
                        items-center justify-center">
          <div className="bg-white bg-opacity-20 rounded-full px-4 py-1">
            <span className="text-white text-sm font-medium">
              Image {currentImg + 1} / {N_STIMULI}
            </span>
          </div>
        </div>
        <div className="absolute top-12 left-8 right-8 h-1
                        bg-white bg-opacity-20 rounded-full">
          <div className="h-1 bg-[#00c9a7] rounded-full transition-all"
            style={{ width:`${(currentImg / N_STIMULI) * 100}%` }} />
        </div>

        {/* Camera active indicator */}
        <div className="absolute top-4 right-6 flex items-center gap-2
                        bg-black bg-opacity-40 rounded-full px-3 py-1">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white text-xs">Camera Active</span>
        </div>

        <div style={{
          width:'80vw', maxWidth:'1280px',
          aspectRatio:'1280 / 1024',
        }}>
          <img src={STIMULI[currentImg]} alt=""
            className="w-full h-full object-fill" draggable={false} />
        </div>

        <p className="absolute bottom-6 text-white text-opacity-50 text-xs">
          Please look naturally at the image
        </p>
      </div>
    )
  }

  // ── PROCESSING ───────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <div className="max-w-lg mx-auto text-center">
        <div className="text-6xl mb-6 animate-spin">⚙️</div>
        <h2 className="text-2xl font-bold text-[#1a1a2e] mb-3">
          Analysing Gaze Data
        </h2>
        <p className="text-[#6b7280]">
          Processing eye movement patterns through the QuadFusion AI model...
        </p>
      </div>
    )
  }

  return null
}

// ── PHASE 4: RESULTS ──────────────────────────────────────────
function PhaseResults({ childInfo, gazeResult, aq10Scores, prediction, report }) {
  const { token } = useAuth()
  const isASD      = prediction?.prediction === 'ASD'
  const isReview   = prediction?.branch === 'REVIEW'
  const confidence = prediction ? Math.round(prediction.confidence * 100) : 0
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error

  const handleSave = async () => {
    const lsToken = localStorage.getItem('neurosage_token')
    console.log('[PhaseResults] ctx token:', token ? token.substring(0,50) : 'NULL')
    console.log('[PhaseResults] localStorage token:', lsToken ? lsToken.substring(0,50) : 'NULL')
    setSaveState('saving')
    try {
      await saveReport({
        module:      'asd',
        child_name:  childInfo?.name || 'Unknown',
        child_age:   String(childInfo?.age || ''),
        result_json: { prediction, report, childInfo },
        token,
      })
      setSaveState('saved')
    } catch (e) {
      console.error('[PhaseResults] save error:', e.message)
      setSaveState('error')
    }
  }

  const openDoctorSearch = () => {
    if (report?.doctor_search_query) {
      window.open(
        `https://www.google.com/search?q=${encodeURIComponent(report.doctor_search_query)}`,
        '_blank'
      )
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#1a1a2e] mb-2">
          Screening Complete
        </h2>
        <p className="text-[#6b7280]">
          Results for {childInfo?.name}, aged {childInfo?.age}
        </p>
      </div>

      {/* Main result card */}
      <div className={`rounded-2xl border-2 p-8 mb-6 text-center
                       ${isASD
                         ? 'border-[#fca5a5] bg-[#fff5f5]'
                         : 'border-[#86efac] bg-[#f0fdf4]'
                       }`}>
        <div className="text-5xl mb-4">{isASD ? '⚠️' : '✅'}</div>
        <h3 className={`text-2xl font-bold mb-2
                        ${isASD ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
          {isASD ? 'ASD Indicators Detected' : 'No Strong ASD Indicators'}
        </h3>
        <p className="text-[#6b7280] text-sm mb-4">{report?.summary}</p>

        {/* Confidence meter */}
        <div className="max-w-xs mx-auto">
          <div className="flex justify-between text-xs text-[#9ca3af] mb-1">
            <span>Confidence</span>
            <span>{confidence}%</span>
          </div>
          <div className="w-full h-3 bg-[#e5e7eb] rounded-full">
            <div
              className={`h-3 rounded-full transition-all duration-1000
                          ${isASD ? 'bg-[#ef4444]' : 'bg-[#22c55e]'}`}
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>

        {isReview && (
          <div className="mt-4 bg-[#fef3c7] border border-[#fcd34d] rounded-xl p-3 text-sm
                          text-[#92400e]">
            ⚡ <strong>Clinical Review Flagged</strong> — The eye-tracking and questionnaire
            results showed some inconsistency. Specialist evaluation is strongly recommended.
          </div>
        )}
      </div>

      {/* Score breakdown */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6 mb-6">
        <h4 className="font-bold text-[#1a1a2e] mb-4">Score Breakdown</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-[#f0f2f7] rounded-xl">
            <p className="text-xl font-bold text-[#1a1a2e]">
              {Math.round((prediction?.p_gaze || 0) * 100)}%
            </p>
            <p className="text-xs text-[#6b7280] mt-1">Gaze Score</p>
          </div>
          <div className="text-center p-3 bg-[#f0f2f7] rounded-xl">
            <p className="text-xl font-bold text-[#1a1a2e]">
              {prediction?.aq10_score || 0}/10
            </p>
            <p className="text-xs text-[#6b7280] mt-1">AQ-10 Score</p>
          </div>
          <div className="text-center p-3 bg-[#e6faf6] rounded-xl">
            <p className="text-xl font-bold text-[#00c9a7]">
              {confidence}%
            </p>
            <p className="text-xs text-[#6b7280] mt-1">Confidence</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold
                           ${prediction?.branch === 'AGREE'
                             ? 'bg-[#e6faf6] text-[#00c9a7]'
                             : 'bg-[#fef3c7] text-[#d97706]'}`}>
            {prediction?.branch === 'AGREE' ? '✓ Modalities Agree' : '⚡ Modalities Differ'}
          </span>
        </div>
      </div>

      {/* NeuroSage Report */}
      {report?.report && (
        <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6 mb-6">
          <h4 className="font-bold text-[#1a1a2e] mb-4">📄 NeuroSage Screening Report</h4>
          <div className="text-sm text-[#374151] leading-relaxed whitespace-pre-wrap">
            {report.report}
          </div>
        </div>
      )}

      {/* Local Doctors */}
      {report?.has_local_doctors && (
        <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6 mb-6">
          <h4 className="font-bold text-[#1a1a2e] mb-4">
            🏥 ASD Specialists Near {childInfo?.city}
          </h4>
          <div className="flex flex-col gap-3">
            {report.local_doctors.map((doc, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-[#f7f8fc]
                                       rounded-xl border border-[#e5e7eb]">
                <span className="text-2xl mt-0.5">🩺</span>
                <div>
                  <p className="font-semibold text-sm text-[#1a1a2e]">{doc.name}</p>
                  <p className="text-xs text-[#6b7280] mt-0.5">{doc.address}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#9ca3af] mt-3">
            Please call ahead to confirm appointments and availability.
          </p>
        </div>
      )}

      {/* Next steps */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6 mb-6">
        <h4 className="font-bold text-[#1a1a2e] mb-3">Recommended Next Steps</h4>
        <p className="text-sm text-[#6b7280] leading-relaxed">
          {report?.recommendation}
        </p>

        {(isASD || isReview) && (
          <button
            onClick={openDoctorSearch}
            className="mt-4 w-full bg-[#1a1a2e] text-white py-3 rounded-xl font-semibold
                       text-sm hover:bg-[#2d2d4a] transition-colors"
          >
            🔍 Find Specialists Near {childInfo?.city}
          </button>
        )}
      </div>

      {report?.report && (
        <button
          onClick={() => {
            const lines = [
              'NEUROSAGE SCREENING REPORT',
              'Generated: ' + new Date().toLocaleDateString(),
              '─'.repeat(50),
              '',
              'Child: ' + (childInfo?.name || 'Unknown') + (childInfo?.age ? ', Age: ' + childInfo.age : ''),
              'City: ' + (childInfo?.city || 'Unknown'),
              '',
              'SCREENING RESULT: ' + (prediction?.prediction || 'Unknown'),
              'Confidence: ' + Math.round((prediction?.confidence || 0) * 100) + '%',
              'AQ-10 Score: ' + (prediction?.aq10_score || 0) + '/10',
              'Gaze Score: ' + Math.round((prediction?.p_gaze || 0) * 100) + '%',
              '',
              '─'.repeat(50),
              '',
              report.report.replace(/\*\*/g, ''),
              '',
              '─'.repeat(50),
              'DISCLAIMER: This is a research screening tool only and does not',
              'constitute a clinical diagnosis. All results require specialist follow-up.',
              '',
              'NeuroSage — Netaji Subhash Engineering College, Kolkata',
            ]
            const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
            const url  = URL.createObjectURL(blob)
            const a    = document.createElement('a')
            a.href     = url
            a.download = 'NeuroSage_Report_' + (childInfo?.name || 'Child') + '.txt'
            a.click()
            URL.revokeObjectURL(url)
          }}
          className="w-full border-2 border-[#00c9a7] text-[#00c9a7] py-3 rounded-xl
                     font-semibold text-sm hover:bg-[#e6faf6] transition-colors mb-4"
        >
          ⬇️ Download Report
        </button>
      )}

      {/* Save Report Button */}
      <button
        onClick={handleSave}
        disabled={saveState === 'saving' || saveState === 'saved'}
        className="w-full py-3 rounded-xl font-semibold text-sm mb-4 transition-colors border-2"
        style={saveState === 'saved'
          ? { background: '#dcfce7', borderColor: '#16a34a', color: '#16a34a' }
          : saveState === 'error'
          ? { background: '#fee2e2', borderColor: '#dc2626', color: '#dc2626' }
          : { background: '#fff', borderColor: '#00c9a7', color: '#00c9a7' }}
      >
        {saveState === 'saving' ? '⏳ Saving...' :
         saveState === 'saved'  ? '✅ Report Saved to My Reports' :
         saveState === 'error'  ? '❌ Save Failed — Try Again' :
         '💾 Save Report to My Reports'}
      </button>

      {/* Disclaimer */}
      <div className="bg-[#fef9e7] border border-[#fcd34d] rounded-xl p-4 text-xs
                      text-[#92400e] leading-relaxed">
        ⚠️ <strong>Important:</strong> This is a research screening tool only and does not
        constitute a clinical diagnosis. Results must be interpreted by a qualified healthcare
        professional. Please consult a paediatric neurologist or developmental paediatrician
        for a comprehensive evaluation.
      </div>
    </div>
  )
}

// ── MAIN ASD MODULE ───────────────────────────────────────────
export default function ASDModule() {
  const { token } = useAuth()
  const [phase, setPhase]           = useState(0)
  const [childInfo, setChildInfo]   = useState(null)
  const [aq10Scores, setAq10Scores] = useState(null)
  const [gazeResult, setGazeResult] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [report, setReport]         = useState(null)
  const [loading, setLoading]       = useState(false)

  // Phase 1 → 2
  const handleChildInfo = (info) => {
    setChildInfo(info)
    setPhase(1)
  }

  // Phase 2 → 3
  const handleQuestionnaire = (scored) => {
    setAq10Scores(scored)
    setPhase(2)
  }

  // Phase 3 → 4: gaze done, now fuse + generate report
  const handleGazeDone = async (gazeRes) => {
    setGazeResult(gazeRes)
    setLoading(true)
    setPhase(3)

    let pred = null
    let rep  = null

    try {
      const p_gaze_value = (gazeRes.skipped || gazeRes.p_gaze === null)
        ? 0.5
        : gazeRes.p_gaze

      pred = await fusePrediction(p_gaze_value, aq10Scores, gazeRes.skipped || false)
      if (gazeRes.skipped) pred.gaze_skipped = true
      setPrediction(pred)
    } catch (err) {
      console.error('Fusion error:', err)
    }

    try {
      if (pred) {
        rep = await generateReport(pred, childInfo)
        setReport(rep)
      }
    } catch (err) {
      console.error('Report generation error:', err)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc]">
      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-[#1a1a2e] mb-2">
            ASD Screening Module
          </h1>
          <p className="text-[#6b7280]">
            Combining eye-tracking gaze analysis with AQ-10(Child) questionnaire
          </p>
        </div>

        {/* Phase bar */}
        <PhaseBar phase={phase} />

        {/* Phase content */}
        {phase === 0 && (
          <PhaseChildInfo onNext={handleChildInfo} />
        )}

        {phase === 1 && (
          <PhaseQuestionnaire onNext={handleQuestionnaire} />
        )}

        {phase === 2 && (
          <PhaseEyeTracking onNext={handleGazeDone} />
        )}

        {phase === 3 && (
          loading ? (
            <div className="text-center py-20">
              <div className="text-5xl mb-4 animate-pulse">🧠</div>
              <h3 className="text-xl font-bold text-[#1a1a2e] mb-2">
                Generating Your Report
              </h3>
              <p className="text-[#6b7280]">
                Fusing gaze and questionnaire data, generating AI report...
              </p>
            </div>
          ) : (
            <PhaseResults
              childInfo={childInfo}
              gazeResult={gazeResult}
              aq10Scores={aq10Scores}
              prediction={prediction}
              report={report}
            />
          )
        )}
      </div>
    </div>
  )
}