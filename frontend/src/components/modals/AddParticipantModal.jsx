import { useState, useMemo } from 'react'
import { createGameParticipant } from '../../services/api'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { PersonStanding, Users2, Search, AlertTriangle } from 'lucide-react'

function TeamAvatar({ team, size = 'sm' }) {
  const [imgError, setImgError] = useState(false)
  const sz = size === 'sm' ? 'w-8 h-8 text-sm rounded-lg' : 'w-10 h-10 text-base rounded-xl'
  return (
    <div
      className={`${sz} flex items-center justify-center font-bold text-white shrink-0 overflow-hidden`}
      style={{ backgroundColor: team.color || '#3b82f6', outline: `2px solid ${team.color || '#3b82f6'}`, outlineOffset: '2px' }}
    >
      {(team.logo_base64 || team.logo_url) && !imgError ? (
        <img src={team.logo_base64 || team.logo_url} alt={team.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
      ) : (
        <span>{team.name?.charAt(0)?.toUpperCase() || '?'}</span>
      )}
    </div>
  )
}

export default function AddParticipantModal({ gameId, game, teams, members = [], participants = [], defaultTeamId, onClose, onSave }) {
  const [mode, setMode]                   = useState(game?.game_mode === 'team' ? 'team' : 'member')
  const [search, setSearch]               = useState('')
  const [selectedMember, setSelectedMember] = useState(null)
  const [selectedTeam, setSelectedTeam]   = useState(() => defaultTeamId ? (teams.find((t) => t.id === defaultTeamId) ?? null) : null)
  const [addingNew, setAddingNew]         = useState(false)
  const [form, setForm] = useState({ name: '', email: '', team_id: defaultTeamId || '', age: '', sport: '', bib_number: '', nationality: '' })
  const [saving, setSaving]               = useState(false)
  const [bulkSaving, setBulkSaving]       = useState(false)
  const [autoAdding, setAutoAdding]       = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState(new Set())

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

  // ── Member mode ───────────────────────────────────────────────────────────────

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.filter((m) =>
      !q ||
      m.user_name?.toLowerCase().includes(q) ||
      (m.username || '').toLowerCase().includes(q) ||
      (m.user_email || '').toLowerCase().includes(q)
    )
  }, [members, search])

  const hasExactMatch = useMemo(() => {
    const q = search.trim().toLowerCase()
    return !q || members.some((m) =>
      m.user_name?.toLowerCase().includes(q) ||
      (m.username || '').toLowerCase().includes(q)
    )
  }, [members, search])

  const autoAdd = async (m, teamId) => {
    setAutoAdding(true)
    try {
      const { data } = await createGameParticipant(gameId, {
        name: m.user_name, email: m.user_email || '',
        team_id: teamId, age: m.age || 0, user_id: m.user_id || '',
      })
      toast.success(`${m.user_name} added`)
      onSave(data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add participant')
      setSelectedMember(m)
      setForm((p) => ({ ...p, name: m.user_name, email: m.user_email || '', team_id: teamId, age: m.age > 0 ? String(m.age) : '' }))
    } finally {
      setAutoAdding(false)
    }
  }

  const pickMember = (m) => {
    const matchedTeam = teams.find((t) => t.id === m.team_id)
    const needsTeam   = !matchedTeam
    const needsAge    = ageRestricted && !(m.age > 0)
    setSearch('')
    if (!needsTeam && !needsAge) {
      autoAdd(m, matchedTeam.id)
    } else {
      setSelectedMember(m)
      setAddingNew(false)
      setForm((p) => ({ ...p, name: m.user_name, email: m.user_email || '', team_id: matchedTeam?.id || '', age: m.age > 0 ? String(m.age) : '' }))
    }
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
      const payload = {
        ...form,
        age: form.age ? parseInt(form.age, 10) : 0,
        user_id: selectedMember?.user_id || '',
      }
      const { data } = await createGameParticipant(gameId, payload)
      toast.success('Participant added')
      onSave(data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add participant')
    } finally {
      setSaving(false)
    }
  }

  // ── Team mode ─────────────────────────────────────────────────────────────────

  const teamMembers = useMemo(() => {
    if (!selectedTeam) return []
    return members.filter((m) => m.team_id === selectedTeam.id)
  }, [selectedTeam, members])

  const handleAddTeam = async () => {
    if (!selectedTeam || selectedMemberIds.size === 0) return
    const toAdd = teamMembers.filter((m) => selectedMemberIds.has(m.user_id))
    setBulkSaving(true)
    let added = 0, skipped = 0
    const results = []
    for (const m of toAdd) {
      try {
        const { data } = await createGameParticipant(gameId, {
          name: m.user_name, email: m.user_email || '',
          team_id: selectedTeam.id, age: m.age || 0,
        })
        results.push(data)
        added++
      } catch { skipped++ }
    }
    setBulkSaving(false)
    if (added === 0) { toast.error('Failed to add selected members'); return }
    toast.success(`${added} participant${added !== 1 ? 's' : ''} added${skipped > 0 ? `, ${skipped} skipped` : ''}`)
    results.forEach((p) => onSave(p))
  }

  const switchMode = (m) => {
    setMode(m)
    reset()
    setSelectedTeam(null)
    setSelectedMemberIds(new Set())
  }

  const selectTeam = (team) => {
    setSelectedTeam(team)
    setSelectedMemberIds(new Set())
  }

  const toggleMember = (userId) =>
    setSelectedMemberIds((prev) => {
      const next = new Set(prev)
      next.has(userId) ? next.delete(userId) : next.add(userId)
      return next
    })

  const selectAll = (eligible) => setSelectedMemberIds(new Set(eligible.map((m) => m.user_id)))
  const deselectAll = () => setSelectedMemberIds(new Set())

  const showSearch = !selectedMember && !addingNew

  return (
    <Modal title="Add Participant" onClose={onClose}>
      <div className="space-y-4">

        {/* Age restriction banner */}
        {ageRestricted && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
            <span className="text-amber-400 shrink-0"><AlertTriangle size={14} /></span>
            <span className="text-amber-300">
              Age restricted: <span className="font-semibold">{ageFrom}–{ageTo} years</span>
            </span>
          </div>
        )}

        {/* Mode label */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-sm font-medium text-slate-300">
          {mode === 'member' ? <><PersonStanding size={14} className="inline mr-1" /> Add Member</> : <><Users2 size={14} className="inline mr-1" /> Add Team Members</>}
        </div>

        {/* ── Member mode ── */}
        {mode === 'member' && (
          <>
            {autoAdding && (
              <div className="flex items-center justify-center gap-3 py-6 text-slate-400 text-sm">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Adding participant…
              </div>
            )}

            {showSearch && !autoAdding && (
              <div>
                <label className="label">Search Members</label>
                <div className="relative mb-3">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center"><Search size={14} /></span>
                  <input
                    className="input pl-8"
                    placeholder="Search by name, username, or email…"
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
                      const isAdded      = alreadyAdded.has(m.user_email) || alreadyAdded.has(m.user_name)
                      const eligible     = isAgeEligible(m.age)
                      const disabled     = isAdded || !eligible
                      const matchedTeam  = teams.find((t) => t.id === m.team_id)
                      const needsTeam    = !matchedTeam
                      const needsAge     = ageRestricted && !(m.age > 0)
                      const readyToAdd   = !needsTeam && !needsAge

                      const ineligibleReason = !eligible
                        ? (m.age > 0 ? `Age ${m.age} outside ${ageFrom}–${ageTo}` : `Age not set — range ${ageFrom}–${ageTo} required`)
                        : null

                      const missing = []
                      if (needsTeam) missing.push('team')
                      if (needsAge)  missing.push('age')

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
                            ) : readyToAdd ? (
                              <span className="text-xs text-emerald-400 font-medium">✓ Add</span>
                            ) : (
                              <span className="text-xs text-amber-400">Needs {missing.join(' & ')}</span>
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

            {(selectedMember || addingNew) && !autoAdding && (() => {
              const missingTeam = selectedMember && !teams.find((t) => t.id === selectedMember.team_id)
              const missingAge  = selectedMember && ageRestricted && !(selectedMember.age > 0)
              return (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Member / new-participant chip */}
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
                            value={form.name} onChange={set('name')}
                            placeholder="Full name *" required
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

                  {/* Team — always for new participants; only if missing for existing members */}
                  {(addingNew || missingTeam) && (
                    <div>
                      <label className="label">
                        Team *
                        {missingTeam && <span className="text-amber-400 text-xs font-normal ml-1">not set on this member</span>}
                      </label>
                      {teams.length === 0 ? (
                        <div className="input text-slate-500 text-sm">No teams created yet — add a team first</div>
                      ) : (
                        <select className="input" value={form.team_id} onChange={set('team_id')} required>
                          <option value="">— Select a team —</option>
                          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Email — new participants only */}
                  {addingNew && (
                    <div>
                      <label className="label">Email</label>
                      <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="athlete@example.com" />
                    </div>
                  )}

                  {/* Age — always for new participants; only if missing for existing members with age restriction */}
                  {(addingNew || missingAge) && (
                    <div>
                      <label className="label">
                        Age
                        {ageRestricted && <span className="text-amber-400 ml-1">* ({ageFrom}–{ageTo})</span>}
                        {missingAge && !addingNew && <span className="text-amber-400 text-xs font-normal ml-1">not set on this member</span>}
                      </label>
                      <input
                        className={`input ${ageRestricted && form.age && (parseInt(form.age) < ageFrom || parseInt(form.age) > ageTo) ? 'border-red-500' : ''}`}
                        type="number" min="1" max="120"
                        value={form.age} onChange={set('age')}
                        placeholder="25" required={ageRestricted}
                      />
                      {ageRestricted && form.age && (parseInt(form.age) < ageFrom || parseInt(form.age) > ageTo) && (
                        <p className="text-xs text-red-400 mt-1">Age must be between {ageFrom} and {ageTo}</p>
                      )}
                    </div>
                  )}

                  {/* Sport / bib / nationality — new participants only */}
                  {addingNew && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label">Sport / Event</label>
                          <input className="input" value={form.sport} onChange={set('sport')} placeholder="100m Sprint" />
                        </div>
                        <div>
                          <label className="label">Bib Number</label>
                          <input className="input" value={form.bib_number} onChange={set('bib_number')} placeholder="42" />
                        </div>
                      </div>
                      <div>
                        <label className="label">Nationality</label>
                        <input className="input" value={form.nationality} onChange={set('nationality')} placeholder="USA" />
                      </div>
                    </>
                  )}

                  <div className="flex justify-end gap-3 pt-1">
                    <button type="button" className="btn-secondary" onClick={reset}>← Back</button>
                    <button type="submit" className="btn-primary" disabled={saving || !form.team_id || teams.length === 0}>
                      {saving ? 'Adding…' : 'Add Participant'}
                    </button>
                  </div>
                </form>
              )
            })()}
          </>
        )}

        {/* ── Team mode ── */}
        {mode === 'team' && (
          <div className="space-y-4">
            {teams.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">No teams created yet.</div>
            ) : !selectedTeam ? (
              <>
                <p className="text-sm text-slate-400">Select a team to add its members as participants.</p>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {teams.map((team) => {
                    const count = members.filter((m) => m.team_id === team.id).length
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => selectTeam(team)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-600 hover:border-blue-500 hover:bg-blue-500/5 transition-colors text-left"
                      >
                        <TeamAvatar team={team} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white">{team.name}</div>
                          {team.description && <div className="text-xs text-slate-400 truncate">{team.description}</div>}
                        </div>
                        <div className="text-xs text-slate-400 shrink-0">{count} member{count !== 1 ? 's' : ''}</div>
                        <span className="text-blue-400 text-xs shrink-0">Select →</span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                {/* Selected team header */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
                  <TeamAvatar team={selectedTeam} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white">{selectedTeam.name}</div>
                    <div className="text-xs text-slate-400">{selectedMemberIds.size} of {teamMembers.length} selected</div>
                  </div>
                  <button type="button" onClick={() => { setSelectedTeam(null); setSelectedMemberIds(new Set()) }} className="text-slate-400 hover:text-white">✕</button>
                </div>

                {teamMembers.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-sm">
                    No event members are assigned to this team.<br />
                    <span className="text-xs">Assign members to this team from the Members tab.</span>
                  </div>
                ) : (() => {
                  const eligible = teamMembers.filter((m) => !alreadyAdded.has(m.user_email) && !alreadyAdded.has(m.user_name) && isAgeEligible(m.age))
                  const allSelected = eligible.length > 0 && eligible.every((m) => selectedMemberIds.has(m.user_id))
                  return (
                    <>
                      {/* Select all / deselect all */}
                      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                        <span>{eligible.length} eligible</span>
                        <button type="button" className="text-blue-400 hover:text-blue-300 transition-colors"
                          onClick={() => allSelected ? deselectAll() : selectAll(eligible)}>
                          {allSelected ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>
                      <div className="space-y-1 max-h-52 overflow-y-auto rounded-lg border border-slate-600 p-1">
                        {teamMembers.map((m) => {
                          const isAdded  = alreadyAdded.has(m.user_email) || alreadyAdded.has(m.user_name)
                          const eligible = isAgeEligible(m.age)
                          const disabled = isAdded || !eligible
                          const checked  = selectedMemberIds.has(m.user_id)
                          return (
                            <label
                              key={m.user_id}
                              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                                disabled ? 'opacity-40 cursor-not-allowed' : checked ? 'bg-blue-500/10' : 'hover:bg-slate-600/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => !disabled && toggleMember(m.user_id)}
                                className="accent-blue-500 w-4 h-4 shrink-0"
                              />
                              <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                                {m.user_name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-white text-sm truncate">{m.user_name}</div>
                                {m.age > 0 && <div className="text-xs text-slate-500">Age {m.age}</div>}
                              </div>
                              <div className="text-xs shrink-0">
                                {isAdded ? <span className="text-slate-500">Already added</span>
                                  : !eligible ? <span className="text-amber-500">Age restricted</span>
                                  : null}
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </>
                  )
                })()}

                <div className="flex justify-end gap-3 pt-1">
                  <button type="button" className="btn-secondary" onClick={() => { setSelectedTeam(null); setSelectedMemberIds(new Set()) }}>← Back</button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={bulkSaving || selectedMemberIds.size === 0}
                    onClick={handleAddTeam}
                  >
                    {bulkSaving ? 'Adding…' : `Add ${selectedMemberIds.size} Member${selectedMemberIds.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
