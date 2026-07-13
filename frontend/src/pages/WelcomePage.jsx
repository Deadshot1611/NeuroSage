import { Link } from 'react-router-dom'

const MODULES = [
  { icon: '👁️', label: 'Autism Spectrum Disorder', color: '#00c9a7', desc: '96.67% accuracy' },
  { icon: '✏️', label: 'Dysgraphia', color: '#6366f1', desc: 'Zero labels needed' },
  { icon: '🎙️', label: 'Speech Disorder', color: '#f59e0b', desc: 'Window analysis' },
]

export default function WelcomePage() {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #eef6ff 0%, #f8f5ff 50%, #f0fdf9 100%)' }}
    >

      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            'linear-gradient(#00c9a7 1px, transparent 1px), linear-gradient(90deg, #00c9a7 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Glow blobs */}
      <div className="absolute top-[-80px] left-[-80px] w-[500px] h-[500px] bg-[#00c9a7] rounded-full opacity-[0.10] blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-100px] right-[-100px] w-[600px] h-[600px] bg-[#6366f1] rounded-full opacity-[0.10] blur-3xl pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-4 md:px-8 py-4 md:py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shadow-lg shadow-[#00c9a7]/30">
                        <img
                src="image/neuroicon.png"
                alt="NeuroSage Report Preview"
                className="w-full max-w-md rounded-3xl shadow-2xl object-contain"
              />
          </div>
          <span className="text-[#1e293b] font-bold text-xl tracking-tight">
            Neuro<span className="text-[#00c9a7]">Sage</span>
          </span>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <Link
            to="/login"
            className="text-[#475569] hover:text-[#1e293b] text-sm font-medium px-4 md:px-5 py-2 md:py-2.5 rounded-full border border-[#cbd5e1] hover:border-[#94a3b8] transition-colors"
          >
            Log In
          </Link>
          <Link
            to="/signup"
            className="bg-[#00c9a7] hover:bg-[#00b396] text-white text-sm font-semibold px-4 md:px-5 py-2 md:py-2.5 rounded-full transition-colors shadow-lg shadow-[#00c9a7]/25"
          >
            Sign Up
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 md:px-6 text-center py-10 md:py-16">

        {/* Headline */}
        <h1 className="text-3xl sm:text-5xl md:text-7xl font-extrabold text-[#1e293b] leading-tight mb-5 md:mb-6 max-w-4xl w-full">
          AI Screening for<br />
          <span
            className="text-transparent bg-clip-text inline-block"
            style={{ backgroundImage: 'linear-gradient(90deg, #00c9a7, #6366f1)' }}
          >
            Neurodevelopmental
          </span>
          <br />Disorders.
        </h1>

        <p className="text-[#64748b] text-base md:text-xl max-w-2xl leading-relaxed mb-8 md:mb-10">
          NeuroSage screens children for <strong className="text-[#1e293b]">Autism Spectrum Disorder</strong>,{' '}
          <strong className="text-[#1e293b]">Dysgraphia</strong>, and{' '}
          <strong className="text-[#1e293b]">Developmental Stuttering</strong> — using only a
          webcam, a photo, or an audio file. No clinic visit. No specialist hardware.
        </p>

        {/* Module cards */}
        <div className="flex flex-wrap justify-center gap-3 md:gap-4 mb-10 md:mb-12 w-full">
          {MODULES.map((m) => (
            <div
              key={m.label}
              className="flex flex-col items-center gap-2 md:gap-3 px-4 md:px-6 py-4 md:py-5 rounded-2xl border transition-transform hover:-translate-y-1 bg-white/70"
              style={{
                borderColor: `${m.color}45`,
                boxShadow: `0 0 24px ${m.color}20`,
              }}
            >
              <div
                className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-xl md:text-2xl"
                style={{ background: `${m.color}18` }}
              >
                {m.icon}
              </div>
              <div className="text-center">
                <p className="text-[#1e293b] font-bold text-xs md:text-sm">{m.label}</p>
                <p className="text-xs mt-0.5" style={{ color: m.color }}>{m.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 md:gap-4 mb-5 md:mb-6 w-full max-w-md sm:max-w-none sm:w-auto">
          <Link
            to="/signup"
            className="bg-[#00c9a7] hover:bg-[#00b396] text-white text-base md:text-lg font-bold px-8 md:px-10 py-3.5 md:py-4 rounded-full transition-colors shadow-2xl shadow-[#00c9a7]/30 text-center"
          >
            Get Started — It's Free
          </Link>
          <Link
            to="/login"
            className="border border-[#cbd5e1] hover:border-[#94a3b8] text-[#475569] hover:text-[#1e293b] text-base md:text-lg font-semibold px-8 md:px-10 py-3.5 md:py-4 rounded-full transition-colors text-center bg-white/60"
          >
            Log In to Your Account
          </Link>
        </div>

        <p className="text-[#94a3b8] text-xs md:text-sm">
          No credit card required · Research prototype · Not for clinical use
        </p>

      </main>

      {/* Footer strip */}
      <div className="relative z-10 text-center py-6 text-[#94a3b8] text-xs px-6">
        ⚠️ NeuroSage is a research prototype. Not a clinical diagnostic tool.
        Always consult a healthcare professional. &nbsp;·&nbsp; © 2025 NSEC Kolkata
      </div>
    </div>
  )
}
