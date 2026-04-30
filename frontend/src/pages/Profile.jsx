import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { deleteMe } from '../services/api'
import ConfirmModal from '../components/modals/ConfirmModal'
import toast from 'react-hot-toast'

export default function Profile() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteMe()
      logout()
      toast.success('Account deleted')
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete account')
    } finally {
      setDeleting(false)
    }
  }

  if (!user) return null

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">My Profile</h1>

      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center text-2xl font-bold text-blue-400 shrink-0">
            {user.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-lg font-semibold text-white">{user.name}</p>
            {user.username && (
              <p className="text-sm font-mono text-blue-400">@{user.username}</p>
            )}
          </div>
        </div>

        <div className="divide-y divide-slate-700">
          {[
            { label: 'Role',     value: <span className={`badge badge-${user.role}`}>{user.role}</span> },
            { label: 'Email',    value: user.email || <span className="text-slate-500">—</span> },
            { label: 'Username', value: user.username ? <span className="font-mono text-blue-400 text-sm">@{user.username}</span> : <span className="text-slate-500">—</span> },
            { label: 'Joined',   value: user.created_at ? new Date(user.created_at).toLocaleDateString() : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-3">
              <span className="text-sm text-slate-400">{label}</span>
              <span className="text-sm text-white">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h2>
        <p className="text-xs text-slate-400 mb-4">
          Permanently delete your account. This action cannot be undone and all your data will be removed.
        </p>
        <button
          className="px-4 py-2 rounded-lg text-sm font-medium border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
          onClick={() => setShowDelete(true)}
        >
          Delete Account
        </button>
      </div>

      {showDelete && (
        <ConfirmModal
          title="Delete Account"
          message={`Are you sure you want to delete your account "${user.name}"? This action cannot be undone and all your data will be permanently removed.`}
          confirmLabel="Delete Account"
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setShowDelete(false)}
        />
      )}
    </div>
  )
}
