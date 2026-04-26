import { useEffect, useState } from 'react'
import { listUsers, createUser } from '../services/api'
import toast from 'react-hot-toast'
import PasswordInput from '../components/PasswordInput'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member' })
  const [saving, setSaving] = useState(false)

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
          <h2 className="text-lg font-semibold text-white mb-4">Create Admin/Member Account</h2>
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
                <option value="member">Member</option>
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
                  <span className={`badge badge-${u.role}`}>{u.role}</span>
                </td>
                <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
