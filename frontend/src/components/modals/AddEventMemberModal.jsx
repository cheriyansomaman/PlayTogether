import { useState, useRef, useEffect } from 'react'
import { addEventMember, updateEventMember } from '../../services/api'
import toast from 'react-hot-toast'
import Modal from './Modal'

function TeamSelect({ teams, value, onChange }) {
  const [query, setQuery]     = useState(value || '')
  const [open, setOpen]       = useState(false)
  const [focused, setFocused] = useState(false)
  const wrapRef = useRef(null)

  // Keep query in sync when form value changes externally
  useEffect(() => { setQuery(value || '') }, [value])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = teams.filter((t) =>
    !query.trim() || t.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  const select = (team) => {
    setQuery(team.name)
    onChange(team.name)
    setOpen(false)
  }

  const handleInput = (e) => {
    setQuery(e.target.value)
    onChange(e.target.value)   // allow free text too
    setOpen(true)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') setOpen(false)
    if (e.key === 'Enter' && filtered.length === 1) { e.preventDefault(); select(filtered[0]) }
  }

  if (!teams.length) {
    return <input className="input" value={query} onChange={handleInput} placeholder="e.g. Eagles FC" />
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        className="input pr-8"
        value={query}
        onChange={handleInput}
        onFocus={() => { setOpen(true); setFocused(true) }}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder="Search or type team name…"
        autoComplete="off"
      />
      {/* chevron icon */}
      <span
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none select-none text-xs"
        aria-hidden>▾</span>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 shadow-xl overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {filtered.length > 0 ? filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); select(t) }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  value === t.name
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-200 hover:bg-slate-700'
                }`}
              >
                <span className="font-medium">{t.name}</span>
                {t.color && (
                  <span className="ml-2 inline-block w-2.5 h-2.5 rounded-full align-middle"
                    style={{ backgroundColor: t.color }} />
                )}
              </button>
            )) : (
              <p className="px-3 py-2.5 text-xs text-slate-500">No teams match "{query}"</p>
            )}
          </div>
          {/* allow clearing selection */}
          {value && (
            <div className="border-t border-slate-700">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setQuery(''); onChange(''); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
              >
                ✕ Clear team
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ROLES = ['admin', 'coordinator', 'viewer']

function TagChips({ value, onChange }) {
  const [input, setInput] = useState('')
  const tags = value ? value.split(',').map((t) => t.trim()).filter(Boolean) : []

  const addTag = (raw) => {
    const tag = raw.replace(/^#+/, '').trim()
    if (!tag) return
    if (!tags.includes(tag)) onChange([...tags, tag].join(','))
    setInput('')
  }

  const removeTag = (tag) => onChange(tags.filter((t) => t !== tag).join(','))

  const handleKey = (e) => {
    if (['Enter', ',', ' '].includes(e.key)) {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length) {
      removeTag(tags[tags.length - 1])
    }
  }

  return (
    <div className="input flex flex-wrap gap-1.5 min-h-[2.5rem] cursor-text" onClick={() => document.getElementById('tag-input-member')?.focus()}>
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2.5 py-0.5 text-xs font-medium">
          #{t}
          <button type="button" onClick={() => removeTag(t)} className="hover:text-white leading-none">×</button>
        </span>
      ))}
      <input
        id="tag-input-member"
        className="bg-transparent outline-none text-sm text-white flex-1 min-w-24 placeholder-slate-500"
        placeholder={tags.length ? '' : '#tag1 #tag2…'}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => addTag(input)}
      />
    </div>
  )
}

export default function AddEventMemberModal({ eventId, member, teams = [], onClose, onSave }) {
  const [form, setForm] = useState({
    username:  '',
    user_name:  member?.user_name  || '',
    role:       member?.role       || 'coordinator',
    age:        member?.age        || '',
    club:       member?.club       || '',
    address:    member?.address    || '',
    phone:      member?.phone      || '',
    tags:       member?.tags       || '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (member) {
        const payload = {
          role:      form.role,
          user_name: form.user_name,
          age:       form.age ? parseInt(form.age, 10) : 0,
          club:      form.club,
          address:   form.address,
          phone:     form.phone,
          tags:      form.tags,
        }
        const { data } = await updateEventMember(eventId, member.user_id, payload)
        toast.success('Member updated')
        onSave(data)
      } else {
        const { data } = await addEventMember(eventId, { username: form.username.replace(/^@/, '').trim(), role: form.role })
        toast.success('Member added')
        onSave(data)
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save member')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={member ? 'Edit Member' : 'Add Member'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Add mode — username input */}
        {!member && (
          <div>
            <label className="label">Username *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm select-none">@</span>
              <input
                className="input pl-7 font-mono"
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value.replace(/^@/, '') }))}
                required
                placeholder="smaman"
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Enter the username of a PlayTogether account.</p>
          </div>
        )}

        {/* Edit mode — member identity banner */}
        {member && (
          <div className="flex items-center gap-3 p-3 bg-slate-700 rounded-lg">
            <div className="w-9 h-9 rounded-full bg-slate-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
              {form.user_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-slate-400 text-xs font-mono truncate">
                {member.username ? `@${member.username}` : member.user_email}
              </div>
            </div>
          </div>
        )}

        {/* Edit mode — personal details */}
        {member && (
          <>
            <div>
              <label className="label">Display Name</label>
              <input className="input" value={form.user_name} onChange={set('user_name')} placeholder="Full name" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Age</label>
                <input className="input" type="number" min="1" max="120" value={form.age} onChange={set('age')} placeholder="25" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={set('phone')} placeholder="+1 555 0100" />
              </div>
            </div>

            <div>
              <label className="label">Team / Club</label>
              <TeamSelect
                teams={teams}
                value={form.club}
                onChange={(v) => setForm((p) => ({ ...p, club: v }))}
              />
            </div>

            <div>
              <label className="label">Address</label>
              <textarea className="input resize-none" rows={2} value={form.address} onChange={set('address')} placeholder="City, Country…" />
            </div>

            <div>
              <label className="label">Tags</label>
              <TagChips value={form.tags} onChange={(v) => setForm((p) => ({ ...p, tags: v }))} />
            </div>
          </>
        )}

        {/* Role */}
        <div>
          <label className="label">Role *</label>
          <select className="input" value={form.role} onChange={set('role')}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
          <div className="mt-2 space-y-1 text-xs text-slate-500">
            <p><span className="text-slate-300">Admin</span> — manage event, members, games, and teams</p>
            <p><span className="text-slate-300">Member</span> — add participants and record results</p>
            <p><span className="text-slate-300">Viewer</span> — view-only access</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : member ? 'Save Changes' : 'Add Member'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
