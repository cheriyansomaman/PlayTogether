import { useEffect, useState } from 'react'
import { listUsers, createUser, deleteUser } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import PasswordInput from '../components/PasswordInput'
import ConfirmModal from '../components/modals/ConfirmModal'

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ name: '', email: '', password: '', role: 'member' })
  const [saving, setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // user to delete
  const [deleting, setDeleting]   = useState(false)

  useEffect(() => {
    listUsers()
      .then((r) => setUsers(r.data))
      .finally(() => setLoading(false))
  }, [])

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
                <td className="px-4 py-3 font-medium text-white">{u.name}</td>
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
                  {u.id !== currentUser?.id && (
                    <button
                      className="text-slate-500 hover:text-red-400 transition-colors text-xs px-2 py-1 rounded hover:bg-red-500/10"
                      onClick={() => setDeleteTarget(u)}
                      title="Delete user"
                    >
                      🗑️
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    </div>
  )
}
