import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer style={{ background: 'linear-gradient(135deg, #eef6ff 0%, #f8f5ff 50%, #f0fdf9 100%)' }}>
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">

          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full  flex items-center justify-center">
                <img
                src="image/neuroicon.png"
                alt="NeuroSage Report Preview"
                className="w-full max-w-md rounded-3xl shadow-2xl object-contain"
              />
              </div>
              <span className="font-bold text-xl text-[#1e293b]">
                Neuro<span className="text-[#00c9a7]">Sage</span>
              </span>
            </div>
            <p className="text-[#64748b] text-sm leading-relaxed max-w-xs mb-4">
              AI-powered neurodevelopmental screening for ASD, Dysgraphia, and Developmental Stuttering.
              No specialist hardware. No clinic visit required.
            </p>
          </div>

          {/* Modules */}
          <div>
            <p className="text-[#1e293b] font-semibold text-sm mb-4 uppercase tracking-wide">Modules</p>
            <div className="flex flex-col gap-3">
              <Link to="/asd" className="text-[#64748b] text-sm hover:text-[#00c9a7] transition-colors flex items-center gap-2">
                <span>👁️</span> ASD Screening
              </Link>
              <Link to="/dysgraphia" className="text-[#64748b] text-sm hover:text-[#6366f1] transition-colors flex items-center gap-2">
                <span>✏️</span> Dysgraphia
              </Link>
              <Link to="/speech_disorder" className="text-[#64748b] text-sm hover:text-[#f59e0b] transition-colors flex items-center gap-2">
                <span>🎙️</span> Developmental Stuttering
              </Link>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <p className="text-[#1e293b] font-semibold text-sm mb-4 uppercase tracking-wide">Navigate</p>
            <div className="flex flex-col gap-3">
              <a href="/#modules" className="text-[#64748b] text-sm hover:text-[#1e293b] transition-colors">Screening Modules</a>
              <a href="/#how" className="text-[#64748b] text-sm hover:text-[#1e293b] transition-colors">How It Works</a>
              <a href="/#faq" className="text-[#64748b] text-sm hover:text-[#1e293b] transition-colors">FAQ</a>
              <a href="/#about" className="text-[#64748b] text-sm hover:text-[#1e293b] transition-colors">About</a>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[#e2e8f0] pt-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[#94a3b8] text-xs text-center md:text-left leading-relaxed max-w-2xl">
              ⚠️ NeuroSage is a research prototype and screening aid only. It is <strong className="text-[#64748b]">not</strong> a
              clinical diagnostic tool and does not replace professional medical evaluation.
              All results require specialist follow-up. Not approved for clinical use.
            </p>
            <p className="text-[#94a3b8] text-xs whitespace-nowrap">
              © 2025 NeuroSage · NSEC Kolkata
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
