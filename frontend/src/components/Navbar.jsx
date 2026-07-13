import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const NAV_LINKS = [
  { label: 'Home',       to: '/home',    type: 'route' },
  { label: 'Modules',   to: '/home#modules', type: 'anchor' },
  { label: 'My Reports', to: '/reports', type: 'route' },
  { label: 'About',     to: '/home#about', type: 'anchor' },
]

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <nav className="w-full bg-white/95 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">

        {/* Logo */}
        <Link to="/home" className="flex items-center gap-2" onClick={() => setMenuOpen(false)}>
          <div className="w-8 h-8 rounded-full  flex items-center justify-center shadow-sm">
            <img
                src="image/neuroicon.png"
                alt="NeuroSage Report Preview"
                className="w-full max-w-md rounded-3xl shadow-2xl object-contain"
              />
          </div>
          <span className="text-[#1a1a2e] font-bold text-xl tracking-tight">
            Neuro<span className="text-[#00c9a7]">Sage</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) =>
            link.type === 'route' ? (
              <Link
                key={link.label}
                to={link.to}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === link.to
                    ? 'text-[#00c9a7]'
                    : 'text-[#6b7280] hover:text-[#1a1a2e]'
                }`}
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.to}
                className="text-sm font-medium text-[#6b7280] hover:text-[#1a1a2e] transition-colors"
              >
                {link.label}
              </a>
            )
          )}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <span className="text-[#6b7280] text-sm font-medium">
                👋 {user.name.split(' ')[0]}
              </span>
              <button
                onClick={handleLogout}
                className="text-[#6b7280] text-sm font-medium px-4 py-2 rounded-full border border-[#d1d5db] hover:border-red-400 hover:text-red-500 transition-colors"
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-[#6b7280] text-sm font-medium hover:text-[#1a1a2e] transition-colors">
                Log In
              </Link>
              <Link to="/signup" className="bg-[#00c9a7] text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-[#00b396] transition-colors shadow-sm">
                Sign Up
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <div className="w-5 flex flex-col gap-1">
            <span className={`block h-0.5 bg-[#1a1a2e] transition-all ${menuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
            <span className={`block h-0.5 bg-[#1a1a2e] transition-all ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 bg-[#1a1a2e] transition-all ${menuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
          </div>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 space-y-3">
          {NAV_LINKS.map((link) =>
            link.type === 'route' ? (
              <Link
                key={link.label}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className="block text-sm font-medium text-[#6b7280] hover:text-[#1a1a2e] py-2"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.to}
                onClick={() => setMenuOpen(false)}
                className="block text-sm font-medium text-[#6b7280] hover:text-[#1a1a2e] py-2"
              >
                {link.label}
              </a>
            )
          )}
          <div className="pt-3 flex flex-col gap-3 border-t border-gray-100">
            {user ? (
              <>
                <div className="flex items-center gap-2 px-1 py-1">
                  <div className="w-7 h-7 rounded-full bg-[#00c9a7]/20 flex items-center justify-center text-sm">👋</div>
                  <span className="text-[#1a1a2e] text-sm font-medium">{user.name}</span>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); handleLogout() }}
                  className="w-full text-center py-3 rounded-full text-sm font-semibold border border-red-300 text-red-500 hover:bg-red-50 transition-colors"
                >
                  Log Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/asd"
                  onClick={() => setMenuOpen(false)}
                  className="block bg-[#00c9a7] text-white text-center py-3 rounded-full text-sm font-semibold"
                >
                  👁️ Start ASD Screening
                </Link>
                <Link
                  to="/speech_disorder"
                  onClick={() => setMenuOpen(false)}
                  className="block bg-[#f59e0b] text-white text-center py-3 rounded-full text-sm font-semibold"
                >
                  🎙️ Speech Disorder Screening
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
