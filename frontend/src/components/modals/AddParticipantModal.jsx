import { useState, useMemo } from 'react'
import { createGameParticipant } from '../../services/api'
import toast from 'react-hot-toast'
import Modal from './Modal'

export default function AddParticipantModal({ gameId, game, teams, members = [], participants = [], onClose, onSave }) {
  const [search, setSearch]               = useState('')
  const [selectedMember, setSelectedMember] = useState(null)
  const [addingNew, setAddingNew]         = useState(false)
  const [form, setForm] = useState({ name: '', email: '', team_id: '', age: '', sport: '', bib_number: '', nationality: '' })
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const ageRestricted = game?.age_restricted
  const ageFrom       = game?.age_from ?? 0
  const ageTo         = game?.age_to   ?? 0

  const isAgeEligible = (memberAge) => {
    if (!ageRestricted) return true
    if (!memberAge || memberAge <= 0) return false
    return memberAge >= ageFrom && memberAge <= ageTo
  }

  const alreadyAdded = useMemo(() => new Set(participants.map((p) => p.email || p.name)), [participants])

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.filter((m) => !q || m.user_name.toLowerCase().includes(q) || (m.username || '').toLowerCase().includes(q))
  }, [members, search])

  const hasExactMatch = useMemo(() => {
    const q = search.trim().toLowerCase()
    return !q || members.some((m) => m.user_name.toLowerCase().includes(q) || (m.username || '').toLowerCase().includes(q))
  }, [members, search])

  const pickMember = (m) => {
    // member.club may be a team ID (new) or team name (legacy) — try both
    const matchedTeam = teams.find((t) => t.id === m.club || t.name === m.club)
    setSelectedMember(m)
    setAddingNew(false)
    setForm((p) => ({ ...p, name: m.user_name, email: m.user_email, team_id: matchedTeam?.id || '', age: m.age > 0 ? String(m.age) : '' }))
    setSearch('')
  }

  const startNew = () => {
    setSelectedMember(null)
    setAddingNew(true)
    setForm((p) => ({ ...p, name: search.trim(), email: '', team_id: '', age: '' }))
  }

  const reset = () => {
    setSelectedMember(null)
    setAddingNew(false)
    setSearch('')
    setForm({ name: '', email: '', team_id: '', age: '', sport: '', bib_number: '', nationality: '' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.team_id) {
      toast.error('Team is required — assign the participant to a team first')
      return
    }
    setSaving(true)
    try {
      const payload = { ...form, age: form.age ? parseInt(form.age, 10) : 0 }
      const { data } = await createGameParticipant(gameId, payload)
      toast.success('Participant added')
      onSave(data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add participant')
    } finally {
      setSaving(false)
    }
  }

  const showSearch = !selectedMember && !addingNew

  return (
    <Modal title="Add Participant" onClose={onClose}>
      <div className="space-y-4">

        {/* Age restriction banner */}
        {ageRestricted && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
            <span className="text-amber-400 shrink-0">👤</span>
            <span className="text-amber-300">
              Age restricted: <span className="font-semibold">{ageFrom}–{ageTo} years</span>. Members outside this range cannot be added.
            </span>
          </div>
        )}

        {/* Step 1: pick from members */}
        {showSearch && (
          <div>
            <label className="label">Search Members</label>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
              <input
                className="input pl-8"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            {members.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">No members in this event yet.</div>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-1 rounded-lg border border-slate-600 p-1">
                {filteredMembers.map((m) => {
                  const isAdded     = alreadyAdded.has(m.user_email) || alreadyAdded.has(m.user_name)
                  const eligible    = isAgeEligible(m.age)
                  const disabled    = isAdded || !eligible
                  const ageLabel    = m.age > 0 ? `Age ${m.age}` : 'No age'
                  const ineligibleReason = !eligible
                    ? (m.age > 0 ? `Age ${m.age} outside ${ageFrom}–${ageTo}` : `Age not set — range ${ageFrom}–${ageTo} required`)
                    : null

                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      disabled={disabled}
                      onClick={() => pickMember(m)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors text-left ${
                        disabled ? 'opacity-40 cursor-not-allowed text-slate-400' : 'text-slate-300 hover:bg-slate-600/60'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                        {m.user_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{m.user_name}</div>
                        <div className="text-xs text-slate-500 font-mono truncate">
                          {m.username ? `@${m.username}` : m.user_email}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {isAdded ? (
                          <span className="text-xs text-slate-500">Already added</span>
                        ) : ineligibleReason ? (
                          <span className="text-xs text-amber-500">{ineligibleReason}</span>
                        ) : (
                          <div className="text-right">
                            {ageRestricted && m.age > 0 && <div className="text-xs text-emerald-400">{ageLabel}</div>}
                            <span className="text-xs text-blue-400">Select →</span>
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
                {filteredMembers.length === 0 && search && (
                  <p className="text-xs text-slate-500 text-center py-3">No members match "{search}"</p>
                )}
              </div>
            )}

            {search.trim() && !hasExactMatch && (
              <button
                type="button"
                onClick={startNew}
                className="mt-3 w-full text-sm text-left px-4 py-3 rounded-lg border border-dashed border-slate-500 text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors"
              >
                <span className="font-medium text-white">"{search.trim()}"</span> is not a member —{' '}
                <span className="underline">add as new participant</span>
              </button>
            )}
          </div>
        )}

        {/* Step 2: form after selection */}
        {(selectedMember || addingNew) && (
          <form onSubmit={handleSubmit} className="space-y-4">

            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              addingNew ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-blue-500/10 border border-blue-500/30'
            }`}>
              <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                {form.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                {addingNew ? (
                  <div>
                    <input
                      className="bg-transparent text-white font-medium text-sm outline-none w-full"
                      value={form.name}
                      onChange={set('name')}
                      placeholder="Full name *"
                      required
                    />
                    <div className="text-xs text-amber-400 mt-0.5">New participant — not a current member</div>
                  </div>
                ) : (
                  <div>
                    <div className="font-medium text-white text-sm">{form.name}</div>
                    <div className="text-xs text-slate-400">{form.email}</div>
                  </div>
                )}
              </div>
              <button type="button" onClick={reset} className="text-slate-400 hover:text-white shrink-0">✕</button>
            </div>

            {/* Team */}
            <div>
              <label className="label">
                Team *
                <span className="text-slate-500 text-xs font-normal ml-1">required to participate</span>
              </label>
              {teams.length === 0 ? (
                <div className="input text-slate-500 text-sm">No teams created yet — add a team first</div>
              ) : (
                <select className="input" value={form.team_id} onChange={set('team_id')} required>
                  <option value="">— Select a team —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>

            {addingNew && (
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="athlete@example.com" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">
                  Age{ageRestricted && <span className="text-amber-400 ml-1">* ({ageFrom}–{ageTo})</span>}
                </label>
                <input
                  className={`input ${ageRestricted && form.age && (parseInt(form.age) < ageFrom || parseInt(form.age) > ageTo) ? 'border-red-500' : ''}`}
                  type="number"
                  min="1"
                  max="120"
                  value={form.age}
                  onChange={set('age')}
                  placeholder="25"
                  required={ageRestricted}
                />
                {ageRestricted && form.age && (parseInt(form.age) < ageFrom || parseInt(form.age) > ageTo) && (
                  <p className="text-xs text-red-400 mt-1">Age must be between {ageFrom} and {ageTo}</p>
                )}
              </div>
              <div>
                <label className="label">Sport / Event</label>
                <input className="input" value={form.sport} onChange={set('sport')} placeholder="100m Sprint" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Bib Number</label>
                <input className="input" value={form.bib_number} onChange={set('bib_number')} placeholder="42" />
              </div>
              <div>
                <label className="label">Nationality</label>
                <input className="input" value={form.nationality} onChange={set('nationality')} placeholder="USA" />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" className="btn-secondary" onClick={reset}>← Back</button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving || !form.team_id || teams.length === 0}
              >
                {saving ? 'Adding…' : 'Add Participant'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
