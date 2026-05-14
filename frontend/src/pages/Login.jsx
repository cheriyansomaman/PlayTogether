import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { login, checkUsername, setPassword } from '../services/api'
import PasswordInput from '../components/PasswordInput'
import toast from 'react-hot-toast'
import { Trophy, Users2, PersonStanding, BarChart2 } from 'lucide-react'

const STATS = [
  { icon: <PersonStanding size={24} />, label: 'Events', sub: 'Track' },
  { icon: <Users2 size={24} />, label: 'Teams', sub: 'Manage' },
  { icon: <BarChart2 size={24} />, label: 'Results', sub: 'Analyse' },
]

// step: 'username' | 'password' | 'set_password' | 'not_found'
export default function Login() {
  const [step, setStep]               = useState('username')
  const [username, setUsername]       = useState('')
  const [password, setPassword_]      = useState('')
  const [confirmPassword, setConfirm] = useState('')
  const [loading, setLoading]         = useState(false)
  const { login: authLogin } = useAuth()
  const navigate = useNavigate()

  const cleanUsername = username.trim().replace(/^@/, '')

  const handleCheckUsername = async (e) => {
    e.preventDefault()
    if (!cleanUsername) return
    setLoading(true)
    try {
      const { data } = await checkUsername({ username: cleanUsername })
      if (!data.exists)       setStep('not_found')
      else if (data.has_password) setStep('password')
      else                    setStep('set_password')
    } catch {
      toast.error('Could not check username — try again')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await login({ username: cleanUsername, password })
      authLogin(data.token, data.user)
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid password')
    } finally {
      setLoading(false)
    }
  }

  const handleSetPassword = async (e) => {
    e.preventDefault()
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return }
    setLoading(true)
    try {
      const { data } = await setPassword({ username: cleanUsername, password, confirm_password: confirmPassword })
      authLogin(data.token, data.user)
      toast.success(`Welcome, @${data.user.username}!`)
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to set password')
    } finally {
      setLoading(false)
    }
  }

  const back = () => { setStep('username'); setPassword_(''); setConfirm('') }

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-100">

      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-between overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 40%, #93c5fd 100%)' }}>

        {/* Diagonal cut-off overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute right-0 top-0 h-full w-32 translate-x-1/2">
            <polygon points="0,0 100,0 100,100 0,100" fill="#ffffff" />
          </svg>
        </div>

        {/* Decorative circles */}
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)' }} />
        <div className="absolute top-1/4 -right-12 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #1d4ed8 0%, transparent 70%)' }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full px-14 py-12 justify-between">

          {/* Brand */}
          <div className="flex items-center gap-3">
            <Trophy size={32} className="text-blue-600" />
            <span className="text-blue-900 font-black text-xl tracking-widest uppercase">PlayTogether</span>
          </div>

          {/* Hero text */}
          <div>
            <p className="text-blue-600 text-sm font-semibold tracking-[0.3em] uppercase mb-4">Sports Event Manager</p>
            <h1 className="text-gray-800 font-black leading-none mb-6" style={{ fontSize: 'clamp(2.8rem, 5vw, 4.5rem)' }}>
              THE<br />
              GAME<br />
              <span className="text-blue-300">BEGINS</span>
            </h1>
            <p className="text-gray-700 text-base max-w-xs leading-relaxed">
              Organise events, manage teams, track results — all in one place.
            </p>
          </div>

          {/* Stats */}
          <div className="flex gap-10 pb-2">
            {STATS.map(({ icon, label, sub }) => (
              <div key={label}>
                <div className="text-2xl mb-1 text-blue-500">{icon}</div>
                <div className="text-gray-800 font-bold text-sm">{label}</div>
                <div className="text-blue-600 text-xs">{sub}</div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Right panel (form) ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 overflow-y-auto bg-gradient-to-br from-blue-900 to-indigo-900">
        <div className="w-full max-w-sm">

          {/* Mobile brand */}
          <div className="flex lg:hidden items-center justify-center gap-2 mb-8">
            <Trophy size={32} className="text-blue-600" />
            <span className="text-gray-100 font-black text-xl tracking-widest uppercase">PlayTogether</span>
          </div>

          {/* ── Step 1: username ── */}
          {(step === 'username' || step === 'not_found') && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-black text-gray-100 uppercase tracking-wide">Sign In</h2>
                <p className="text-gray-600 text-sm mt-1">Enter your username to continue</p>
              </div>

              <form onSubmit={handleCheckUsername} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Username</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 font-mono font-bold select-none">@</span>
                    <input
                      className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-4 py-3.5 text-gray-900 font-mono text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all shadow-sm"
                      placeholder="yourname"
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); setStep('username') }}
                      autoFocus
                      required
                    />
                  </div>
                </div>

                {step === 'not_found' && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    <strong>@{cleanUsername}</strong> is not registered.{' '}
                    <Link to="/register" className="underline hover:text-amber-600">Create account →</Link>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !username.trim()}
                  className="w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-widest transition-all disabled:opacity-40 shadow-lg"
                  style={{ background: loading || !username.trim() ? '#e5e7eb' : 'linear-gradient(90deg, #3b82f6, #60a5fa)', color: 'white' }}
                >
                  {loading ? 'Checking…' : 'Continue →'}
                </button>
              </form>

              <p className="text-sm text-gray-600 text-center">
                No account?{' '}
                <Link to="/register" className="text-blue-600 hover:text-blue-500 font-semibold transition-colors">Register</Link>
              </p>
            </div>
          )}

          {/* ── Step 2a: password ── */}
          {step === 'password' && (
            <div className="space-y-6">
              <div>
                <button type="button" onClick={back} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors text-sm mb-4">
                  ← Back
                </button>
                <h2 className="text-2xl font-black text-gray-100 uppercase tracking-wide">Welcome Back</h2>
                <p className="text-blue-600 font-mono text-sm mt-1">@{cleanUsername}</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Password</label>
                  <PasswordInput
                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all shadow-sm"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword_(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-widest text-white transition-all disabled:opacity-40 shadow-lg"
                  style={{ background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }}
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            </div>
          )}

          {/* ── Step 2b: set password ── */}
          {step === 'set_password' && (
            <div className="space-y-6">
              <div>
                <button type="button" onClick={back} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors text-sm mb-4">
                  ← Back
                </button>
                <h2 className="text-2xl font-black text-gray-100 uppercase tracking-wide">Set Password</h2>
                <div className="mt-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
                  Welcome, <span className="font-mono font-semibold">@{cleanUsername}</span>! Account created by admin — set a password to activate.
                </div>
              </div>

              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">New Password</label>
                  <PasswordInput
                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all shadow-sm"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e) => setPassword_(e.target.value)}
                    autoFocus required minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Confirm Password</label>
                  <PasswordInput
                    className={`w-full bg-white border rounded-xl px-4 py-3.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-1 transition-all ${confirmPassword && password !== confirmPassword ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/30'}`}
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirm(e.target.value)}
                    required minLength={6}
                  />
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading || !password || password !== confirmPassword}
                  className="w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-widest text-white transition-all disabled:opacity-40 shadow-lg"
                  style={{ background: loading || !password || password !== confirmPassword ? '#e5e7eb' : 'linear-gradient(90deg, #3b82f6, #60a5fa)' }}
                >
                  {loading ? 'Saving…' : 'Activate Account →'}
                </button>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
