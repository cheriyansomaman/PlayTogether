import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWS } from '../context/WSContext'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { Download } from 'lucide-react'

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth()
  const { connected } = useWS()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { canInstall, install } = useInstallPrompt()

  const handleLogout = () => { logout(); navigate('/login') }

  const navLink = (to, label) => (
    <Link
      to={to}
      className={`text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
        pathname === to || pathname.startsWith(to + '/')
          ? 'bg-slate-600 text-white'
          : 'text-slate-300 hover:text-white hover:bg-slate-600/60'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <nav className="bg-slate-700 border-b border-slate-600 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="PlayTogether" className="w-8 h-8" />
              <span className="font-bold text-white text-lg">PlayTogether</span>
            </Link>
            {user && (
              <div className="hidden md:flex items-center gap-1">
                {navLink('/', 'Dashboard')}
                {navLink('/events', 'Events')}
                {isAdmin && navLink('/admin/users', 'Users')}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  <span className="text-xs text-slate-500 hidden sm:block">
                    {connected ? 'Live' : 'Offline'}
                  </span>
                </div>
                <NavLink
                  to="/profile"
                  className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-600/60 transition-colors"
                >
                  <span className={`badge badge-${user.role === 'member' ? 'coordinator' : user.role}`}>
                    {user.role === 'member' ? 'coordinator' : user.role}
                  </span>
                  <div className="hidden sm:flex flex-col leading-tight">
                    <span className="text-sm text-slate-200">{user.name}</span>
                    {user.username && (
                      <span className="text-xs text-slate-500 font-mono">@{user.username}</span>
                    )}
                  </div>
                </NavLink>
                {canInstall && (
                  <button
                    onClick={install}
                    className="btn-secondary btn-sm flex items-center gap-1.5"
                    title="Add to Home Screen"
                  >
                    <Download size={14} />
                    <span className="hidden sm:inline">Install</span>
                  </button>
                )}
                <button onClick={handleLogout} className="btn-secondary btn-sm">
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
