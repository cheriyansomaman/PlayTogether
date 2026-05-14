import { useState } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWS } from '../context/WSContext'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { Download, Menu, X } from 'lucide-react'

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth()
  const { connected } = useWS()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { canInstall, install } = useInstallPrompt()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }
  const closeMobile = () => setMobileOpen(false)

  const isActive = (to) => pathname === to || pathname.startsWith(to + '/')

  const navLink = (to, label) => (
    <Link
      to={to}
      className={`text-sm font-medium px-3 py-2 rounded-full transition-all ${
        isActive(to)
          ? 'bg-blue-500 text-white shadow-lg'
          : 'text-gray-300 hover:text-white hover:bg-white/10'
      }`}
    >
      {label}
    </Link>
  )

  const mobileNavLink = (to, label) => (
    <Link
      key={to}
      to={to}
      onClick={closeMobile}
      className={`block px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        isActive(to)
          ? 'bg-blue-500 text-white'
          : 'text-gray-300 hover:text-white hover:bg-white/10'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <nav className="bg-gray-900/80 backdrop-blur-md border-b border-gray-700/50 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo + desktop nav */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="PlayTogether" className="w-8 h-8" />
              <span className="font-bold text-gray-100 text-lg">PlayTogether</span>
            </Link>
            {user && (
              <div className="hidden md:flex items-center gap-1">
                {navLink('/', 'Dashboard')}
                {navLink('/events', 'Events')}
                {isAdmin && navLink('/admin/users', 'Users')}
                {isAdmin && navLink('/admin/audit', 'Audit')}
              </div>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            {user && (
              <>
                {/* Connection dot */}
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                  <span className="text-xs text-gray-500 hidden sm:block">
                    {connected ? 'Live' : 'Offline'}
                  </span>
                </div>

                {/* Profile — hidden on mobile, shown via mobile menu */}
                <NavLink
                  to="/profile"
                  className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-full hover:bg-white/10 transition-colors"
                >
                  <span className={`badge badge-${user.role === 'member' ? 'coordinator' : user.role}`}>
                    {user.role === 'member' ? 'coordinator' : user.role}
                  </span>
                  <div className="hidden sm:flex flex-col leading-tight">
                    <span className="text-sm text-gray-100">{user.name}</span>
                    {user.username && (
                      <span className="text-xs text-gray-500 font-mono">@{user.username}</span>
                    )}
                  </div>
                </NavLink>

                {canInstall && (
                  <button
                    onClick={install}
                    className="btn-secondary btn-sm hidden sm:flex items-center gap-1.5"
                    title="Add to Home Screen"
                  >
                    <Download size={14} />
                    <span className="hidden sm:inline">Install</span>
                  </button>
                )}

                <button onClick={handleLogout} className="btn-secondary btn-sm hidden sm:block">
                  Sign out
                </button>

                {/* Hamburger — mobile only */}
                <button
                  onClick={() => setMobileOpen((p) => !p)}
                  className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Toggle menu"
                >
                  {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {user && mobileOpen && (
        <div className="md:hidden border-t border-gray-700/50 bg-gray-900/95 px-4 py-3 space-y-1">
          {mobileNavLink('/', 'Dashboard')}
          {mobileNavLink('/events', 'Events')}
          {isAdmin && mobileNavLink('/admin/users', 'Users')}
          {isAdmin && mobileNavLink('/admin/audit', 'Audit')}

          <div className="pt-2 border-t border-gray-700/50 mt-2">
            <Link
              to="/profile"
              onClick={closeMobile}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition-colors"
            >
              <span className={`badge badge-${user.role === 'member' ? 'coordinator' : user.role}`}>
                {user.role === 'member' ? 'coordinator' : user.role}
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm text-gray-100">{user.name}</span>
                {user.username && <span className="text-xs text-gray-500 font-mono">@{user.username}</span>}
              </div>
            </Link>

            {canInstall && (
              <button
                onClick={() => { install(); closeMobile() }}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Download size={16} />
                Install App
              </button>
            )}

            <button
              onClick={() => { handleLogout(); closeMobile() }}
              className="w-full text-left px-4 py-3 rounded-xl text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
