import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { previewUsername as previewUsernameAPI, register } from '../services/api'
import PasswordInput from '../components/PasswordInput'
import toast from 'react-hot-toast'

// step: 'name' | 'password'
export default function Register() {
  const [step, setStep]               = useState('name')
  const [firstName, setFirstName]     = useState('')
  const [lastName, setLastName]       = useState('')
  const [generatedUsername, setGen]   = useState('')
  const [password, setPassword]       = useState('')
  const [confirmPassword, setConfirm] = useState('')
  const [loading, setLoading]         = useState(false)
  const { login: authLogin } = useAuth()
  const navigate = useNavigate()

  const handleNameSubmit = async (e) => {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) return
    setLoading(true)
    try {
      const { data } = await previewUsernameAPI({ first_name: firstName.trim(), last_name: lastName.trim() })
      setGen(data.username)
      setStep('password')
    } catch {
      toast.error('Could not generate username — try again')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const { data } = await register({
        first_name:       firstName.trim(),
        last_name:        lastName.trim(),
        password,
        confirm_password: confirmPassword,
      })
      authLogin(data.token, data.user)
      toast.success(`Welcome, @${data.user.username}!`)
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏆</div>
          <h1 className="text-3xl font-bold text-white">PlayTogether</h1>
          <p className="text-slate-400 mt-1">Create your account</p>
        </div>

        <div className="card p-8">

          {/* ── Step 1: name ─────────────────────────────────────────── */}
          {step === 'name' && (
            <>
              <h2 className="text-xl font-semibold text-white mb-6">Who are you?</h2>
              <form onSubmit={handleNameSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">First Name *</label>
                    <input
                      className="input"
                      placeholder="Sojan"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="label">Last Name *</label>
                    <input
                      className="input"
                      placeholder="Maman"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Your username will be auto-generated from your name.
                </p>
                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={loading || !firstName.trim() || !lastName.trim()}
                >
                  {loading ? 'Generating…' : 'Continue →'}
                </button>
              </form>
              <p className="text-sm text-slate-400 mt-4 text-center">
                Already have an account?{' '}
                <Link to="/login" className="text-blue-400 hover:underline">Sign in</Link>
              </p>
            </>
          )}

          {/* ── Step 2: show username + set password ─────────────────── */}
          {step === 'password' && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <button type="button" onClick={() => setStep('name')} className="text-slate-400 hover:text-white transition-colors text-lg leading-none">←</button>
                <h2 className="text-xl font-semibold text-white">Set your password</h2>
              </div>

              {/* Identity card */}
              <div className="mb-5 p-4 rounded-lg bg-slate-800 border border-slate-600 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {firstName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-white font-medium">{firstName} {lastName}</div>
                    <div className="text-blue-400 font-mono text-sm">@{generatedUsername}</div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 pl-13">
                  This is your username — you'll use it to sign in.
                </p>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="label">Password *</label>
                  <PasswordInput
                    className="input"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">Confirm Password *</label>
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
                <p className="text-xs text-slate-500">
                  New accounts start as <strong>User</strong>. An admin can upgrade your role.
                </p>
                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={loading || !password || password !== confirmPassword}
                >
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
