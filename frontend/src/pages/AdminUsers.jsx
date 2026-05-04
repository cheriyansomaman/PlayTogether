import { useEffect, useState, useRef } from 'react'
import { Trash2, ImageIcon, Pencil } from 'lucide-react'
import { listUsers, createUser, deleteUser, updateUser, updateUserProfilePicture, removeUserProfilePicture } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import PasswordInput from '../components/PasswordInput'
import ConfirmModal from '../components/modals/ConfirmModal'

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

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ name: '', email: '', password: '', role: 'member' })
  const [saving, setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // user to delete
  const [deleting, setDeleting]   = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm]     = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [picUploading, setPicUploading] = useState(null) // userId being uploaded
  const [picRemoving, setPicRemoving]   = useState(null) // userId being removed
  const picInputRef = useRef(null)
  const [picTargetId, setPicTargetId] = useState(null)

  useEffect(() => {
    listUsers()
      .then((r) => setUsers(r.data))
      .finally(() => setLoading(false))
  }, [])

  const handleEditOpen = (u) => {
    setEditTarget(u)
    setEditForm({
      first_name: u.first_name || '',
      last_name:  u.last_name  || '',
      email:      u.email      || '',
      role:       u.role       || 'user',
      age:        u.age        || '',
      phone:      u.phone      || '',
      address:    u.address    || '',
      tags:       u.tags       || '',
    })
  }

  const handleEditSave = async (e) => {
    e.preventDefault()
    if (!editTarget) return
    setEditSaving(true)
    try {
      const { data } = await updateUser(editTarget.id, {
        ...editForm,
        age: editForm.age ? Number(editForm.age) : 0,
      })
      setUsers((p) => p.map((u) => u.id === editTarget.id ? { ...u, ...data } : u))
      toast.success('User updated')
      setEditTarget(null)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user')
    } finally {
      setEditSaving(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await createUser(form)
      setUsers((p) => [data, ...p])
      setForm({ name: '', email: '', password: '', role: 'member' })
      setShowForm(false)
      toast.success('User created')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  const handlePicChange = async (e) => {
    const file = e.target.files[0]
    if (!file || !picTargetId) return
    const typeOk = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(file.name)
    if (!typeOk) { toast.error('Please select an image file'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10 MB'); return }
    setPicUploading(picTargetId)
    try {
      const b64 = await compressImage(file)
      const { data } = await updateUserProfilePicture(picTargetId, { profile_picture: b64 })
      setUsers((p) => p.map((u) => u.id === picTargetId ? { ...u, profile_picture: data.profile_picture } : u))
      toast.success('Profile picture updated')
    } catch (err) {
      if (err?.message === 'decode') toast.error('Image format not supported — try JPEG or PNG')
      else toast.error(err.response?.data?.error || 'Failed to update profile picture')
    } finally {
      setPicUploading(null)
      setPicTargetId(null)
      if (picInputRef.current) picInputRef.current.value = ''
    }
  }

  const handleRemovePic = async (userId) => {
    setPicRemoving(userId)
    try {
      await removeUserProfilePicture(userId)
      setUsers((p) => p.map((u) => u.id === userId ? { ...u, profile_picture: null } : u))
      toast.success('Profile picture removed')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove profile picture')
    } finally {
      setPicRemoving(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteUser(deleteTarget.id)
      setUsers((p) => p.filter((u) => u.id !== deleteTarget.id))
      toast.success(`${deleteTarget.name} deleted`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete user')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Create User'}
        </button>
      </div>

      {showForm && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Create Admin/Coordinator Account</h2>
          <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="John Doe" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="user@example.com" />
            </div>
            <div>
              <label className="label">Password</label>
              <PasswordInput className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} placeholder="Min. 6 characters" />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="admin">Admin</option>
                <option value="member">Coordinator</option>
                <option value="user">User</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 bg-slate-800 border-b border-slate-600">
          <h2 className="font-medium text-white">{users.length} Users</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Username</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left hidden sm:table-cell">Joined</th>
              <th className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-600">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-600/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0 group">
                      {u.profile_picture ? (
                        <img src={u.profile_picture} alt={u.name} className="w-8 h-8 rounded-full object-cover" style={{ border: '1.5px solid rgba(0,149,255,0.3)' }} />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(0,149,255,0.15)', color: '#33aaff' }}>
                          {u.name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                      <button
                        onClick={() => { setPicTargetId(u.id); picInputRef.current?.click() }}
                        disabled={!!picUploading}
                        className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                        style={{ background: 'rgba(0,0,0,0.55)' }}
                        title="Upload photo"
                      >
                        {picUploading === u.id
                          ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <ImageIcon size={11} color="white" />
                        }
                      </button>
                    </div>
                    <div>
                      <div className="font-medium text-white">{u.name}</div>
                      {u.profile_picture && (
                        <button
                          onClick={() => handleRemovePic(u.id)}
                          disabled={picRemoving === u.id}
                          className="text-xs transition-all"
                          style={{ color: 'rgba(255,45,85,0.7)' }}
                        >
                          {picRemoving === u.id ? 'Removing…' : 'Remove photo'}
                        </button>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.username
                    ? <span className="font-mono text-blue-400 text-xs">@{u.username}</span>
                    : <span className="text-slate-600 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`badge badge-${u.role === 'member' ? 'coordinator' : u.role}`}>
                    {u.role === 'member' ? 'coordinator' : u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-1 justify-end">
                    <button
                      className="text-slate-400 hover:text-blue-400 transition-all text-xs px-2 py-1 rounded hover:bg-blue-500/10"
                      onClick={() => handleEditOpen(u)}
                      title="Edit user"
                    >
                      <Pencil size={14} />
                    </button>
                    {u.id !== currentUser?.id && (
                      <button
                        className="text-slate-500 hover:text-red-400 transition-all text-xs px-2 py-1 rounded hover:bg-red-500/10"
                        onClick={() => setDeleteTarget(u)}
                        title="Delete user"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="card w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Edit User</h2>
              <button onClick={() => setEditTarget(null)} className="text-white/40 hover:text-white transition-all text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleEditSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">First Name</label>
                  <input className="input" value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} required placeholder="First name" />
                </div>
                <div>
                  <label className="label">Last Name</label>
                  <input className="input" value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} placeholder="Last name" />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="email@example.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Role</label>
                  <select className="input" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                    <option value="admin">Admin</option>
                    <option value="member">Coordinator</option>
                    <option value="user">User</option>
                  </select>
                </div>
                <div>
                  <label className="label">Age</label>
                  <input className="input" type="number" min="0" max="120" value={editForm.age} onChange={(e) => setEditForm({ ...editForm, age: e.target.value })} placeholder="—" />
                </div>
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Phone number" />
              </div>
              <div>
                <label className="label">Address</label>
                <input className="input" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} placeholder="Address" />
              </div>
              <div>
                <label className="label">Tags</label>
                <input className="input" value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} placeholder="tag1, tag2" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete User"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      <input ref={picInputRef} type="file" accept="image/*" className="hidden" onChange={handlePicChange} />
    </div>
  )
}
