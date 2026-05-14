import { useState, useRef, useEffect } from 'react'
import { recordResult, updateGameStatus } from '../../services/api'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { Users2, PersonStanding, AlertTriangle, Plus, X, Search } from 'lucide-react'

const DEFAULT_POINT_SYSTEM = [
  { rank: 1, points: 3 },
  { rank: 2, points: 2 },
  { rank: 3, points: 1 },
]

const POSITION_STYLE = {
  1: { label: 'Gold',   ring: 'border-yellow-500/50 bg-yellow-500/5',  badge: 'text-yellow-400' },
  2: { label: 'Silver', ring: 'border-slate-400/40  bg-slate-400/5',   badge: 'text-slate-300'  },
  3: { label: 'Bronze', ring: 'border-orange-500/40 bg-orange-500/5',  badge: 'text-orange-400' },
}
const defaultStyle = { label: null, ring: 'border-slate-600 bg-slate-800', badge: 'text-slate-400' }
function posStyle(pos) { return POSITION_STYLE[pos] || defaultStyle }

// ── Searchable picker ─────────────────────────────────────────────────────────
function SearchPicker({ items, placeholder, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const ref               = useRef(null)
  const inputRef          = useRef(null)

  const filtered = items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (item) => { onSelect(item.id); setQuery(''); setOpen(false); inputRef.current?.blur() }

  if (items.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          ref={inputRef}
          className="input pl-7 text-sm"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.length === 0
            ? <div className="px-3 py-2 text-xs text-slate-500">No matches</div>
            : filtered.map((item) => (
              <button key={item.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); select(item) }}
                className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-600 transition-colors"
              >
                {item.color && <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: item.color }} />}
                {item.name}
              </button>
            ))
          }
        </div>
      )}
    </div>
  )
}

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({ label, color, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded-full">
      {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      {label}
      <button type="button" onClick={onRemove}
        className="text-slate-400 hover:text-red-400 transition-colors leading-none">
        <X size={10} />
      </button>
    </span>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function RecordResultModal({ game, existingResult, participants, teams, pointSystem = [], onClose, onSave }) {
  const entryType    = game.game_mode === 'team' ? 'team' : 'individual'
  const effectivePts = pointSystem.length > 0 ? pointSystem : DEFAULT_POINT_SYSTEM

  const getScore = (pos) => {
    const rule = effectivePts.find((r) => r.rank === pos)
    return rule != null ? rule.points : 0
  }

  const buildInitialPositions = () => {
    if (entryType === 'team') {
      if (existingResult?.entries?.length > 0) {
        const teamEntries = existingResult.entries.filter((e) => e.participant_type === 'team')
        const map = {}
        for (const entry of teamEntries) {
          const pos = entry.position || 1
          if (!map[pos]) map[pos] = { position: pos, score: entry.score, time: entry.time || '', notes: entry.notes || '', teams: [] }
          const team = teams.find((t) => t.id === entry.participant_id)
          map[pos].teams.push({ id: entry.participant_id, name: team?.name || entry.participant_name, color: team?.color })
        }
        return Object.values(map).sort((a, b) => a.position - b.position)
      }
      return [{ position: 1, score: getScore(1), time: '', notes: '', teams: [] }]
    } else {
      if (existingResult?.entries?.length > 0) {
        const relevant = existingResult.entries.filter((e) => e.participant_type === 'individual')
        const map = {}
        for (const entry of relevant) {
          const pos = entry.position || 1
          if (!map[pos]) map[pos] = { position: pos, score: entry.score, time: entry.time || '', notes: entry.notes || '', participants: [] }
          map[pos].participants.push({ id: entry.participant_id, name: entry.participant_name })
        }
        return Object.values(map).sort((a, b) => a.position - b.position)
      }
      return [{ position: 1, score: getScore(1), time: '', notes: '', participants: [] }]
    }
  }

  const [positions, setPositions] = useState(buildInitialPositions)
  const [status, setStatus]       = useState(existingResult?.status || 'partial')
  const [saving, setSaving]       = useState(false)

  const assignedTeamIds = new Set(positions.flatMap((p) => (p.teams || []).map((t) => t.id)))
  const assignedPartIds = new Set(positions.flatMap((p) => (p.participants || []).map((x) => x.id)))

  const unassignedTeams = teams.filter((t) => !assignedTeamIds.has(t.id))
  const unassignedParts = (participants || []).filter((p) => !assignedPartIds.has(p.id))

  // ── Team game mutators ────────────────────────────────────────────────────
  const addTeam = (posIdx, teamId) => {
    const team = teams.find((t) => t.id === teamId)
    if (!team) return
    setPositions((prev) => prev.map((p, i) =>
      i === posIdx ? { ...p, teams: [...p.teams, { id: team.id, name: team.name, color: team.color }] } : p
    ))
  }

  const removeTeam = (posIdx, teamId) =>
    setPositions((prev) => prev.map((p, i) =>
      i === posIdx ? { ...p, teams: p.teams.filter((t) => t.id !== teamId) } : p
    ))

  // ── Individual game mutators ──────────────────────────────────────────────
  const addParticipant = (posIdx, itemId) => {
    const item = (participants || []).find((i) => i.id === itemId)
    if (!item) return
    setPositions((prev) => prev.map((p, i) =>
      i === posIdx ? { ...p, participants: [...p.participants, { id: item.id, name: item.name }] } : p
    ))
  }

  const removeParticipant = (posIdx, itemId) =>
    setPositions((prev) => prev.map((p, i) =>
      i === posIdx ? { ...p, participants: p.participants.filter((x) => x.id !== itemId) } : p
    ))

  // ── Shared ────────────────────────────────────────────────────────────────
  const addPosition = () =>
    setPositions((prev) => {
      const next = prev.length + 1
      const base = { position: next, score: getScore(next), time: '', notes: '' }
      return [...prev, entryType === 'team' ? { ...base, teams: [] } : { ...base, participants: [] }]
    })

  const removePosition = (posIdx) =>
    setPositions((prev) =>
      prev.filter((_, i) => i !== posIdx).map((p, i) => ({ ...p, position: i + 1, score: getScore(i + 1) }))
    )

  const updateField = (posIdx, field, val) =>
    setPositions((prev) => prev.map((p, i) => i === posIdx ? { ...p, [field]: val } : p))

  // ── Flatten to entries ────────────────────────────────────────────────────
  const flattenEntries = () => {
    if (entryType === 'team') {
      return positions.flatMap((p) =>
        p.teams.flatMap((team) => {
          // Team entry
          const teamEntry = {
            participant_id: team.id, participant_type: 'team', participant_name: team.name,
            score: p.score, position: p.position, time: p.time, notes: p.notes,
          }
          // All participants of this team get same score automatically
          const memberEntries = (participants || [])
            .filter((part) => part.team_id === team.id)
            .map((part) => ({
              participant_id: part.id, participant_type: 'individual', participant_name: part.name,
              score: p.score, position: p.position, time: p.time, notes: p.notes,
            }))
          return [teamEntry, ...memberEntries]
        })
      )
    }
    // Individual game — aggregate team scores from individual results
    const entries = positions.flatMap((p) =>
      p.participants.map((x) => ({
        participant_id: x.id, participant_type: 'individual', participant_name: x.name,
        score: p.score, position: p.position, time: p.time, notes: p.notes,
      }))
    )
    const totals = {}
    for (const entry of entries) {
      const part = (participants || []).find((x) => x.id === entry.participant_id)
      if (!part?.team_id) continue
      if (!totals[part.team_id]) {
        const team = teams.find((t) => t.id === part.team_id)
        totals[part.team_id] = { name: team?.name || part.team_id, score: 0 }
      }
      totals[part.team_id].score += entry.score
    }
    const teamAgg = Object.entries(totals)
      .map(([tid, { name, score }]) => ({ participant_id: tid, participant_type: 'team', participant_name: name, score, position: 0, time: '', notes: '' }))
      .sort((a, b) => b.score - a.score)
      .map((e, i) => ({ ...e, position: i + 1 }))
    return [...entries, ...teamAgg]
  }

  const totalAssigned = entryType === 'team'
    ? positions.reduce((s, p) => s + (p.teams || []).length, 0)
    : positions.reduce((s, p) => s + (p.participants || []).length, 0)

  const isCancelPath = status === 'final' && totalAssigned === 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (totalAssigned === 0 && status !== 'final') {
      toast.error('Add at least one ' + (entryType === 'team' ? 'team' : 'participant'))
      return
    }
    setSaving(true)
    try {
      if (isCancelPath) {
        const { data } = await updateGameStatus(game.id, 'cancelled')
        toast.success('Game cancelled — no participants')
        onSave(null, data)
      } else {
        const { data } = await recordResult(game.id, { entries: flattenEntries(), status })
        toast.success('Results saved!')
        onSave(data, null)
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const canAddPosition = entryType === 'team' ? unassignedTeams.length > 0 : unassignedParts.length > 0

  return (
    <Modal title={`Record Results — ${game.name}`} onClose={onClose} size="xl">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="label">Entry Type</label>
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 text-slate-300">
              {entryType === 'team'
                ? <><Users2 size={14} className="inline mr-1" />Team</>
                : <><PersonStanding size={14} className="inline mr-1" />Individual</>}
            </span>
          </div>
          <div>
            <label className="label">Result Status</label>
            <div className="flex gap-2">
              {['partial', 'final'].map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    status === s ? 'bg-blue-600 text-white' : 'bg-slate-600 text-slate-300 hover:text-white'
                  }`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {entryType === 'team' && (
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2">
            <Users2 size={13} className="shrink-0" />
            All participants of each assigned team automatically receive the same points.
          </div>
        )}

        {/* Position cards */}
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {positions.map((pos, posIdx) => {
            const { label, ring, badge } = posStyle(pos.position)

            return (
              <div key={posIdx} className={`border rounded-xl p-4 ${ring}`}>
                {/* Position header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${badge}`}>
                      {label ? `${label} — ` : ''}Position {pos.position}
                    </span>
                    <input
                      type="number"
                      step="0.001"
                      value={pos.score}
                      onChange={(e) => updateField(posIdx, 'score', Math.max(0, Number(e.target.value)))}
                      className="w-16 text-xs text-center bg-slate-700 border border-slate-600 rounded-lg px-1.5 py-0.5 text-slate-300"
                      title="Points for this position"
                    />
                    <span className="text-xs text-slate-500">pts</span>
                  </div>
                  {positions.length > 1 && (
                    <button type="button" onClick={() => removePosition(posIdx)}
                      className="text-slate-500 hover:text-red-400 transition-colors">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* ── TEAM GAME — just pick teams, no participant selection ── */}
                {entryType === 'team' && (
                  <>
                    <div className="flex flex-wrap gap-2 mb-3 min-h-[28px]">
                      {pos.teams.map((team) => (
                        <Chip key={team.id} label={team.name} color={team.color}
                          onRemove={() => removeTeam(posIdx, team.id)} />
                      ))}
                      {pos.teams.length === 0 && (
                        <span className="text-xs text-slate-500 italic self-center">No teams assigned yet</span>
                      )}
                    </div>
                    <div className="mb-3">
                      <SearchPicker
                        items={unassignedTeams}
                        placeholder="Search and add team…"
                        onSelect={(teamId) => addTeam(posIdx, teamId)}
                      />
                    </div>
                  </>
                )}

                {/* ── INDIVIDUAL GAME ── */}
                {entryType === 'individual' && (
                  <>
                    <div className="flex flex-wrap gap-2 mb-3 min-h-[28px]">
                      {pos.participants.map((p) => (
                        <Chip key={p.id} label={p.name} onRemove={() => removeParticipant(posIdx, p.id)} />
                      ))}
                      {pos.participants.length === 0 && (
                        <span className="text-xs text-slate-500 italic self-center">No participants assigned yet</span>
                      )}
                    </div>
                    <div className="mb-3">
                      <SearchPicker
                        items={unassignedParts}
                        placeholder="Search and add participant…"
                        onSelect={(id) => addParticipant(posIdx, id)}
                      />
                    </div>
                  </>
                )}

                {/* Time + Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                  <div>
                    <label className="label text-xs">Time</label>
                    <input className="input text-sm" value={pos.time}
                      onChange={(e) => updateField(posIdx, 'time', e.target.value)}
                      placeholder="e.g. 12:34.56" />
                  </div>
                  <div>
                    <label className="label text-xs">Notes</label>
                    <input className="input text-sm" value={pos.notes}
                      onChange={(e) => updateField(posIdx, 'notes', e.target.value)}
                      placeholder="Optional notes" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {canAddPosition && (
          <button type="button" className="btn-secondary w-full flex items-center justify-center gap-2" onClick={addPosition}>
            <Plus size={14} />
            Add Position {positions.length + 1}
          </button>
        )}

        {isCancelPath && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-300">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
            <span>No {entryType === 'team' ? 'teams' : 'participants'} assigned — saving as final will cancel this game.</span>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className={isCancelPath ? 'btn-danger' : 'btn-primary'} disabled={saving}>
            {saving ? 'Saving…' : isCancelPath ? 'Cancel Game' : `Save ${status === 'final' ? 'Final' : 'Partial'} Results`}
          </button>
        </div>
      </form>
    </Modal>
  )
}
