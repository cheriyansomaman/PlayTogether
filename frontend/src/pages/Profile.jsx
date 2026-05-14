import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { deleteMe, updateProfilePicture, removeProfilePicture, changeMyPassword } from '../services/api'
import ConfirmModal from '../components/modals/ConfirmModal'
import PasswordInput from '../components/PasswordInput'
import { ImageIcon } from 'lucide-react'
import toast from 'react-hot-toast'

function compressImage(file, maxPx = 256, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('decode')) }
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > maxPx || h > maxPx) {
        const ratio = Math.min(maxPx / w, maxPx / h)
        w = Math.round(w * ratio); h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas')); return }
      try {
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        if (!dataUrl || dataUrl === 'data:,') { reject(new Error('export')); return }
        resolve(dataUrl)
      } catch (e) { reject(e) }
    }
    img.src = objectUrl
  })
}

export default function Profile() {
  const { user, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [removing, setRemoving]     = useState(false)
  const [pwForm, setPwForm]         = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving]     = useState(false)
  const fileInputRef = useRef(null)

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (pwForm.next !== pwForm.confirm) { toast.error('New passwords do not match'); return }
    setPwSaving(true)
    try {
      await changeMyPassword({ current_password: pwForm.current, new_password: pwForm.next })
      toast.success('Password updated')
      setPwForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update password')
    } finally {
      setPwSaving(false)
    }
  }

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

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const typeOk = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(file.name)
    if (!typeOk) { toast.error('Please select an image file'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10 MB'); return }
    setUploading(true)
    try {
      const b64 = await compressImage(file)
      const { data } = await updateProfilePicture({ profile_picture: b64 })
      updateUser({ profile_picture: data.profile_picture })
      toast.success('Profile picture updated')
    } catch (err) {
      if (err?.message === 'decode') toast.error('Image format not supported — try JPEG or PNG')
      else toast.error(err.response?.data?.error || 'Failed to update profile picture')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemovePicture = async () => {
    setRemoving(true)
    try {
      await removeProfilePicture()
      updateUser({ profile_picture: null })
      toast.success('Profile picture removed')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove profile picture')
    } finally {
      setRemoving(false)
    }
  }

  if (!user) return null

  const picSrc = user.profile_picture

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">My Profile</h1>

      <div className="card p-6 space-y-4">
        {/* Avatar + upload */}
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            {picSrc ? (
              <img
                src={picSrc}
                alt={user.name}
                className="w-20 h-20 rounded-full object-cover"
                style={{ border: '2px solid rgba(0,149,255,0.3)' }}
              />
            ) : (
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black"
                style={{ background: 'rgba(0,149,255,0.15)', color: '#33aaff' }}
              >
                {user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center transition-all"
              style={{ background: '#0095ff', boxShadow: '0 0 10px rgba(0,149,255,0.5)' }}
              title="Upload photo"
            >
              {uploading
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <ImageIcon size={13} color="white" />
              }
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
          <div>
            <p className="text-lg font-bold text-white">{user.name}</p>
            {user.username && (
              <p className="text-sm font-mono" style={{ color: '#33aaff' }}>@{user.username}</p>
            )}
            {picSrc && (
              <button
                onClick={handleRemovePicture}
                disabled={removing}
                className="text-xs mt-1.5 transition-all"
                style={{ color: 'rgba(255,45,85,0.8)' }}
              >
                {removing ? 'Removing…' : 'Remove photo'}
              </button>
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="pt-2 space-y-0">
          {[
            { label: 'Role',     value: <span className={`badge badge-${user.role}`}>{user.role}</span> },
            { label: 'Email',    value: user.email || <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span> },
            { label: 'Username', value: user.username ? <span className="font-mono text-sm" style={{ color: '#33aaff' }}>@{user.username}</span> : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span> },
            { label: 'Joined',   value: user.created_at ? new Date(user.created_at).toLocaleDateString() : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
              <span className="text-sm text-white">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="label">Current Password</label>
            <PasswordInput className="input" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} required placeholder="Enter current password" />
          </div>
          <div>
            <label className="label">New Password</label>
            <PasswordInput className="input" value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} required minLength={6} placeholder="Min. 6 characters" />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <PasswordInput
              className={`input ${pwForm.confirm && pwForm.next !== pwForm.confirm ? 'border-red-500 focus:ring-red-500/30' : ''}`}
              value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              required minLength={6}
              placeholder="Repeat new password"
            />
            {pwForm.confirm && pwForm.next !== pwForm.confirm && (
              <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
            )}
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={pwSaving || !pwForm.current || !pwForm.next || pwForm.next !== pwForm.confirm}>
              {pwSaving ? 'Saving…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#ff5a76' }}>Danger Zone</h2>
        <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Permanently delete your account. This action cannot be undone and all your data will be removed.
        </p>
        <button
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ border: '1px solid rgba(255,45,85,0.3)', color: '#ff5a76' }}
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
