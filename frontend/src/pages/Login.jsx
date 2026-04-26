import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { login, checkUsername, setPassword } from '../services/api'
import PasswordInput from '../components/PasswordInput'
import toast from 'react-hot-toast'

// step: 'username' | 'password' | 'set_password' | 'not_found'
export default function Login() {
  const [step, setStep]                   = useState('username')
  const [username, setUsername]           = useState('')
  const [password, setPassword_]          = useState('')
  const [confirmPassword, setConfirm]     = useState('')
  const [loading, setLoading]             = useState(false)
  const { login: authLogin } = useAuth()
  const navigate = useNavigate()

  const cleanUsername = username.trim().replace(/^@/, '')

  const handleCheckUsername = async (e) => {
    e.preventDefault()
    if (!cleanUsername) return
    setLoading(true)
    try {
      const { data } = await checkUsername({ username: cleanUsername })
      if (!data.exists) {
        setStep('not_found')
      } else if (data.has_password) {
        setStep('password')
      } else {
        setStep('set_password')
      }
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
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const { data } = await setPassword({
        username: cleanUsername,
        password,
        confirm_password: confirmPassword,
      })
      authLogin(data.token, data.user)
      toast.success(`Welcome, @${data.user.username}!`)
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to set password')
    } finally {
      setLoading(false)
    }
  }

  const back = () => {
    setStep('username')
    setPassword_('')
    setConfirm('')
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏆</div>
          <h1 className="text-3xl font-bold text-white">PlayTogether</h1>
          <p className="text-slate-400 mt-1">Sports Event Manager</p>
        </div>

        <div className="card p-8">

          {/* ── Step 1: username ──────────────────────────────────────── */}
          {(step === 'username' || step === 'not_found') && (
            <>
              <h2 className="text-xl font-semibold text-white mb-6">Sign in</h2>
              <form onSubmit={handleCheckUsername} className="space-y-4">
                <div>
                  <label className="label">Username</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm select-none">@</span>
                    <input
                      className="input pl-7 font-mono"
                      placeholder="yourname"
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); setStep('username') }}
                      autoFocus
                      required
                    />
                  </div>
                </div>

                {step === 'not_found' && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-300">
                    <strong>@{cleanUsername}</strong> is not registered.{' '}
                    <Link to="/register" className="underline hover:text-amber-100">Create an account →</Link>
                  </div>
                )}

                <button type="submit" className="btn-primary w-full" disabled={loading || !username.trim()}>
                  {loading ? 'Checking…' : 'Continue →'}
                </button>
              </form>
              <p className="text-sm text-slate-400 mt-4 text-center">
                Don't have an account?{' '}
                <Link to="/register" className="text-blue-400 hover:underline">Register</Link>
              </p>
            </>
          )}

          {/* ── Step 2a: password ─────────────────────────────────────── */}
          {step === 'password' && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <button type="button" onClick={back} className="text-slate-400 hover:text-white transition-colors text-lg leading-none">←</button>
                <div>
                  <h2 className="text-xl font-semibold text-white">Enter password</h2>
                  <p className="text-slate-400 text-sm font-mono">@{cleanUsername}</p>
                </div>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="label">Password</label>
                  <PasswordInput
                    className="input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword_(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </>
          )}

          {/* ── Step 2b: set password (account has no password yet) ───── */}
          {step === 'set_password' && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <button type="button" onClick={back} className="text-slate-400 hover:text-white transition-colors text-lg leading-none">←</button>
                <h2 className="text-xl font-semibold text-white">Set your password</h2>
              </div>
              <div className="mb-5 px-3 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-sm text-blue-300">
                Welcome, <span className="font-mono font-semibold">@{cleanUsername}</span>! Your account was created by an admin.
                Set a password to activate it.
              </div>
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <label className="label">New Password</label>
                  <PasswordInput
                    className="input"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e) => setPassword_(e.target.value)}
                    autoFocus
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="label">Confirm Password</label>
                  <PasswordInput
                    className={`input ${confirmPassword && password !== confirmPassword ? 'border-red-500' : ''}`}
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                  />
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                  )}
                </div>
                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={loading || !password || password !== confirmPassword}
                >
                  {loading ? 'Saving…' : 'Set Password & Sign in'}
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
