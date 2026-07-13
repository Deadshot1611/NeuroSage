import { Link } from 'react-router-dom'
import { useState } from 'react'

// ── Data ───────────────────────────────────────────────────────────────────────

const MODULES = [
  {
    id: 'asd',
    title: 'Autism Spectrum Disorder',
    subtitle: 'Eye-Tracking & Questionnaire Fusion',
    description:
      'Your child simply looks at a series of images on screen while the webcam quietly tracks their gaze — no special equipment needed. The recorded eye movements are combined with a short behavioural questionnaire to identify gaze patterns associated with ASD, giving you a clear, confidence-scored result in minutes.',
    icon: '👁️',
    accent: '#00c9a7',
    accentLight: '#e6faf6',
    stats: '96.67% Accuracy',
    aucRoc: '1.0 AUC-ROC',
    available: true,
    path: '/asd',
    ageRange: '5 – 12 years',
    tech: ['WebGazer.js', 'AQ-10 Child', 'Random Forest', 'Gemini AI'],
    highlight: '0 missed ASD cases in research validation',
  },
  {
    id: 'dysgraphia',
    title: 'Dysgraphia',
    subtitle: 'Handwriting Anomaly Detection',
    description:
      'Take a photo of your child\'s handwriting and answer a few age-appropriate questions — that\'s all it takes. Our AI compares the writing sample against typical developmental patterns to flag signs of dysgraphia, then blends the image analysis with your questionnaire responses into a single, easy-to-understand screening report.',
    icon: '✏️',
    accent: '#6366f1',
    accentLight: '#eef2ff',
    stats: 'One-Class Detection',
    aucRoc: '80% image · 20% questionnaire',
    available: true,
    path: '/dysgraphia',
    ageRange: '7 – 12 years',
    tech: ['One-Class SVM', 'PyTorch', 'Gemini AI', 'Image Upload'],
    highlight: 'No dysgraphia-labelled training data required',
  },
  {
    id: 'speech',
    title: 'Developmental Stuttering',
    subtitle: 'Developmental Stuttering Detection',
    description:
      'Record your child speaking naturally for 30 seconds and upload the audio file. Our AI listens for stutter-like patterns across the recording, produces a visual fluency timeline, and grades severity from Minimal to Severe — helping you decide whether a visit to a Speech-Language Pathologist is the right next step.',
    icon: '🎙️',
    accent: '#f59e0b',
    accentLight: '#fef3c7',
    stats: 'SLD Detection',
    aucRoc: 'Window-level analysis',
    available: true,
    path: '/speech_disorder',
    ageRange: '4 – 7 years',
    tech: ['Audio ML', 'SLD Classifier', 'FastAPI', 'Timeline Viz'],
    highlight: 'Adjustable threshold · severity grading · real-time progress',
  },
]

const HOW_STEPS = [
  {
    num: '01',
    icon: '📝',
    title: 'Enter Child Information',
    desc: "Provide the child's name, age, and pincode. This personalises the assessment and enables location-based specialist referrals at the end.",
  },
  {
    num: '02',
    icon: '📋',
    title: 'Complete the Questionnaire',
    desc: 'A parent or guardian answers a short, validated questionnaire about the child\'s behaviour and observed symptoms relevant to the disorder being screened.',
  },
  {
    num: '03',
    icon: '🖥️',
    title: 'Perform the Screening Task',
    desc: 'The child completes a module-specific task: viewing images (ASD), submitting handwriting (Dysgraphia), or speaking into a microphone (Developmental Stuttering).',
  },
  {
    num: '04',
    icon: '📄',
    title: 'Receive Your Screening Report',
    desc: 'AI analyses all inputs and generates a detailed report with a prediction, confidence scores, severity grading, and a list of nearby specialists.',
  },
]

const FAQS = [
  {
    q: 'Is NeuroSage a clinical diagnostic tool?',
    a: 'No. NeuroSage is a research-grade screening tool designed to identify children who may benefit from a professional evaluation. It does not replace a clinical diagnosis by a licensed specialist. All results should be followed up with a qualified healthcare professional.',
  },
  {
    q: 'What age groups are supported?',
    a: 'ASD screening uses the AQ-10 (Child) questionnaire and covers ages 5–12. Dysgraphia assessment covers ages 7–12. Developmental Stuttering screening covers ages 4–7. Each module is calibrated to the appropriate developmental stage.',
  },
  {
    q: 'Do I need special hardware or software?',
    a: 'No specialist hardware is required. ASD screening uses your standard laptop or desktop webcam via WebGazer.js — no eye-tracker needed. Dysgraphia needs a clear phone photo of handwriting. Speech screening accepts any audio file (WAV, MP3, FLAC, M4A).',
  },
  {
    q: 'How accurate is the ASD screening module?',
    a: 'In our research study, the fused gaze + questionnaire model achieved 96.67% accuracy with a perfect AUC-ROC of 1.0 and zero false negatives on the validation dataset. Real-world performance may differ based on environmental conditions and individual variation.',
  },
  {
    q: 'How is my child\'s data handled?',
    a: 'NeuroSage is a research prototype. Audio and image data is processed locally or on the connected research server and is not stored permanently. No data is shared with third parties. Do not use this tool for production medical purposes.',
  },
  
]

// ── FAQ Item ──────────────────────────────────────────────────────────────────
function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-[#1a1a2e] text-sm md:text-base">{q}</span>
        <span className="text-[#00c9a7] text-xl font-bold ml-4 flex-shrink-0">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="px-6 pb-5 text-[#6b7280] text-sm leading-relaxed border-t border-[#e5e7eb] pt-4">
          {a}
        </div>
      )}
    </div>
  )
}

// ── Landing ───────────────────────────────────────────────────────────────────
export default function Landing() {
  return (
    <div className="w-full">

      {/* ══════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #eef6ff 0%, #f8f5ff 50%, #f0fdf9 100%)' }}
      >
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(#00c9a7 1px, transparent 1px), linear-gradient(90deg, #00c9a7 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        {/* Glow blobs */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-[#00c9a7] rounded-full opacity-[0.12] blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-20 w-96 h-96 bg-[#6366f1] rounded-full opacity-[0.12] blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6 py-14 md:py-32 flex flex-col md:flex-row items-center gap-10 md:gap-16">

          {/* Left: text */}
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold leading-tight mb-5 md:mb-6 text-[#1e293b]">
              Early Detection Of<br />
              <span className="text-[#00c9a7]">Neurodevelopmental</span><br />
              Disorders.
            </h1>

            <p className="text-[#64748b] text-base md:text-lg leading-relaxed mb-7 md:mb-8 max-w-xl mx-auto md:mx-0">
              NeuroSage is an AI-powered screening platform that helps to detect ASD, Dysgraphia,
              and Developmental Stuttering in children — using only a webcam, a photo, or an audio recording.
              No specialist hardware, No clinic visit required.
            </p>

            <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4 justify-center md:justify-start">
              {/* <Link
                to="/asd"
                className="bg-[#00c9a7] hover:bg-[#00b396] text-white px-7 md:px-8 py-3 md:py-3.5 rounded-full font-semibold transition-colors shadow-lg shadow-[#00c9a7]/25 text-center"
              >
                Start ASD Screening →
              </Link> */}
              <a
                href="#modules"
                className="bg-[#00c9a7] hover:bg-[#00b396] text-white px-7 md:px-8 py-3 md:py-3.5 rounded-full font-semibold transition-colors shadow-lg shadow-[#00c9a7]/25 text-center"
              >
                View All Modules
              </a>
            </div>

          </div>

          {/* Right: screening report preview — hidden on mobile */}
          <div className="hidden md:flex flex-1 justify-center items-center">
  <img
    src="image/neuroimage.png"
    alt="NeuroSage Report Preview"
    className="w-full max-w-md rounded-3xl shadow-2xl object-contain"
  />
</div>
        </div>

        {/* Scroll cue */}
        <div className="relative flex justify-center pb-8">
          <div className="flex flex-col items-center gap-1 text-[#94a3b8] text-xs animate-bounce">
            <span>scroll</span>
            <span>↓</span>
          </div>
        </div>
      </section>


      {/* ══════════════════════════════════════════════
          MODULES
      ══════════════════════════════════════════════ */}
      <section id="modules" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          
          <h2 className="text-3xl md:text-4xl font-bold text-[#1a1a2e] mb-4">
            Our Screening Modules
          </h2>
          <p className="text-[#6b7280] max-w-2xl mx-auto text-lg leading-relaxed">
            Each module fuses AI analysis with validated clinical instruments to deliver
            preliminary screening results — entirely browser-based.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {MODULES.map((mod) => (
            <div
              key={mod.id}
              className={`bg-white rounded-2xl border-2 flex flex-col overflow-hidden transition-all duration-300
                          ${mod.available ? 'hover:shadow-xl hover:-translate-y-1' : 'opacity-80'}`}
              style={{ borderColor: mod.accent }}
            >
              {/* Card header */}
              <div className="p-6 pb-0">
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                    style={{ background: mod.accentLight }}
                  >
                    {mod.icon}
                  </div>
                  <div className="text-right">
                    <span
                      className="text-xs font-bold px-2 py-1 rounded-full"
                      style={{ color: mod.accent, background: mod.accentLight }}
                    >
                      {mod.ageRange}
                    </span>
                  </div>
                </div>

                <h3 className="text-xl font-bold text-[#1a1a2e] mb-1">{mod.title}</h3>
                <p className="text-xs font-semibold mb-3" style={{ color: mod.accent }}>
                  {mod.subtitle}
                </p>
                <p className="text-[#6b7280] text-sm leading-relaxed mb-4">{mod.description}</p>
              </div>


              {/* Highlight stat */}
              <div
                className="mx-6 mb-4 rounded-xl px-4 py-3 text-sm font-medium"
                style={{ background: mod.accentLight, color: mod.accent }}
              >
                <span className="font-bold">{mod.stats}</span>
                <span className="text-xs ml-2 opacity-70">· {mod.aucRoc}</span>
              </div>

              {/* Highlight note */}
              <div className="px-6 pb-4">
                <p className="text-xs text-[#6b7280] italic">{mod.highlight}</p>
              </div>

              {/* CTA */}
              <div className="px-6 pb-6 mt-auto">
                {mod.available ? (
                  <Link
                    to={mod.path}
                    className="block w-full text-center text-white py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                    style={{ background: mod.accent }}
                  >
                    Start Screening →
                  </Link>
                ) : (
                  <button
                    disabled
                    className="w-full text-center bg-[#f3f4f6] text-[#9ca3af] py-3 rounded-xl font-semibold text-sm cursor-not-allowed"
                  >
                    Coming Soon
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════════ */}
      <section id="how" className="bg-[#f0f2f7] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            
            <h2 className="text-3xl md:text-4xl font-bold text-[#1a1a2e] mb-4">How It Works</h2>
            <p className="text-[#6b7280] max-w-xl mx-auto text-lg">
              From start to report in under 15 minutes. No clinic visit. No specialist equipment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_STEPS.map((step, i) => (
              <div key={step.num} className="relative">
                <div className="bg-white rounded-2xl p-6 border border-[#e5e7eb] h-full flex flex-col gap-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{step.icon}</span>
                    <span className="text-4xl font-extrabold text-[#00c9a7]/20">{step.num}</span>
                  </div>
                  <h3 className="font-bold text-[#1a1a2e] text-base">{step.title}</h3>
                  <p className="text-[#6b7280] text-sm leading-relaxed flex-1">{step.desc}</p>
                </div>
                {i < HOW_STEPS.length - 1 && (
                  <div className="hidden lg:block absolute -right-4 top-1/2 -translate-y-1/2 text-[#00c9a7] text-2xl z-10 font-bold">
                    →
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          FAQ
      ══════════════════════════════════════════════ */}
      <section id="faq" className="max-w-4xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          
          <h2 className="text-3xl md:text-4xl font-bold text-[#1a1a2e] mb-4">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          ABOUT
      ══════════════════════════════════════════════ */}
      <section id="about" className="bg-[#f0f2f7] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-[#1a1a2e] mb-6">
                Why NeuroSage?
              </h2>
              <p className="text-[#6b7280] leading-relaxed mb-4">
                Early identification of neurodevelopmental conditions can make a profound difference
                in a child's development — yet access to specialists remains out of reach for many
                families. NeuroSage was built to close that gap, bringing research-grade screening
                tools directly to any browser, free of charge.
              </p>
              <p className="text-[#6b7280] leading-relaxed mb-6">
                By combining computer vision, speech AI, and machine learning with clinician-validated
                questionnaires, NeuroSage screens for Autism Spectrum Disorder, Dysgraphia, and
                Developmental Stuttering — producing detailed, parent-friendly reports that support
                informed conversations with healthcare professionals.
              </p>
              <div className="flex flex-wrap gap-3">
                <span className="bg-white border border-[#e5e7eb] text-[#1a1a2e] text-xs font-semibold px-3 py-1.5 rounded-full">
                  🔬 3 AI Models
                </span>
                <span className="bg-white border border-[#e5e7eb] text-[#1a1a2e] text-xs font-semibold px-3 py-1.5 rounded-full">
                  ⚡ Results in under 15 min
                </span>
                <span className="bg-white border border-[#e5e7eb] text-[#1a1a2e] text-xs font-semibold px-3 py-1.5 rounded-full">
                  🌐 No hardware required
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: '🎯', title: 'Precision First', desc: 'Models are optimised to minimise missed cases, prioritising sensitivity over specificity.' },
                { icon: '🌐', title: 'Browser-Native', desc: 'No app to install. Works on any modern desktop browser with a webcam or microphone.' },
                { icon: '🔒', title: 'Privacy-Aware', desc: 'Audio and image data are processed solely for screening and are never stored or shared.' },
                { icon: '🤝', title: 'Clinician-Ready', desc: 'Every report is structured to support follow-up conversations with qualified healthcare professionals.' },
              ].map((card) => (
                <div key={card.title} className="bg-white rounded-2xl border border-[#e5e7eb] p-5 shadow-sm">
                  <div className="text-3xl mb-3">{card.icon}</div>
                  <h4 className="font-bold text-[#1a1a2e] text-sm mb-1">{card.title}</h4>
                  <p className="text-[#6b7280] text-xs leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          CTA BANNER
      ══════════════════════════════════════════════ */}
      <section
        className="py-20 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #eef6ff 0%, #f8f5ff 50%, #f0fdf9 100%)' }}
      >
        <div className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: 'radial-gradient(#00c9a7 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#00c9a7] rounded-full opacity-[0.10] blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-[#6366f1] rounded-full opacity-[0.08] blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1e293b] mb-4">
            Start Screening Today.
          </h2>
          <p className="text-[#64748b] text-lg mb-10 max-w-xl mx-auto">
            Free. Private. No hardware needed. Get a detailed AI screening report for your child in under 15 minutes.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/asd"
              className="bg-[#00c9a7] hover:bg-[#00b396] text-white px-10 py-4 rounded-full font-bold text-lg transition-colors shadow-lg shadow-[#00c9a7]/25"
            >
              👁️ ASD Screening
            </Link>
            <Link
              to="/speech_disorder"
              className="bg-[#f59e0b] hover:bg-[#d97706] text-white px-10 py-4 rounded-full font-bold text-lg transition-colors shadow-lg shadow-[#f59e0b]/25"
            >
              🎙️ Speech Screening
            </Link>
            <Link
              to="/dysgraphia"
              className="border border-[#cbd5e1] hover:border-[#6366f1] hover:text-[#6366f1] text-[#475569] bg-white/60 px-10 py-4 rounded-full font-bold text-lg transition-colors"
            >
              ✏️ Dysgraphia
            </Link>
          </div>
          <p className="text-[#94a3b8] text-xs mt-8">
            ⚠️ Screening tool only. Not a clinical diagnosis. Always consult a healthcare professional.
          </p>
        </div>
      </section>

    </div>
  )
}
