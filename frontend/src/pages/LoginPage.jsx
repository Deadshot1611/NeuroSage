import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login, googleLogin } = useAuth()
  const navigate = useNavigate()

  const [form, setForm]       = useState({ email: '', password: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/home')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #eef6ff 0%, #f8f5ff 50%, #f0fdf9 100%)' }}
    >

      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.10]"
        style={{
          backgroundImage: 'linear-gradient(#00c9a7 1px, transparent 1px), linear-gradient(90deg, #00c9a7 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#00c9a7] rounded-full opacity-[0.10] blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#6366f1] rounded-full opacity-[0.10] blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-full  flex items-center justify-center shadow-lg shadow-[#00c9a7]/30">
              <img
                src="image/neuroicon.png"
                alt="NeuroSage Report Preview"
                className="w-full max-w-md rounded-3xl shadow-2xl object-contain"
              />
            </div>
            <span className="text-[#1e293b] font-bold text-2xl">
              Neuro<span className="text-[#00c9a7]">Sage</span>
            </span>
          </Link>
          <h1 className="text-3xl font-extrabold text-[#1e293b] mb-2">Welcome back</h1>
          <p className="text-[#64748b] text-sm">Sign in to continue to NeuroSage</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-8 shadow-xl">

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-500 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[#475569] text-sm font-medium mb-2">Email address</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="you@example.com"
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] text-[#1e293b] placeholder-[#94a3b8] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00c9a7] focus:ring-1 focus:ring-[#00c9a7] transition-colors"
              />
            </div>

            <div>
              <label className="block text-[#475569] text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                required
                placeholder="Enter your password"
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] text-[#1e293b] placeholder-[#94a3b8] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00c9a7] focus:ring-1 focus:ring-[#00c9a7] transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00c9a7] hover:bg-[#00b396] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors shadow-lg shadow-[#00c9a7]/25 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#e2e8f0]" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-[#94a3b8] text-xs bg-white">or continue with</span>
            </div>
          </div>

          {/* Google Sign-In */}
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                setError('')
                setLoading(true)
                try {
                  await googleLogin(credentialResponse.credential)
                  navigate('/home')
                } catch (err) {
                  setError(err.message)
                } finally {
                  setLoading(false)
                }
              }}
              onError={() => setError('Google sign-in failed. Please try again.')}
              theme="outline"
              shape="rectangular"
              text="signin_with"
              width="368"
            />
          </div>

          <p className="text-center text-[#64748b] text-sm mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="text-[#00c9a7] hover:underline font-medium">
              Sign up free
            </Link>
          </p>
        </div>

        <p className="text-center text-[#94a3b8] text-xs mt-6">
          <Link to="/" className="hover:text-[#64748b] transition-colors">← Back to home</Link>
        </p>
      </div>
    </div>
  )
}
