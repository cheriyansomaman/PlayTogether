import { useState, useRef } from 'react'
import { recordResult, updateGameStatus } from '../../services/api'
import toast from 'react-hot-toast'
import Modal from './Modal'

function GripIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="4" cy="3"  r="1.2" /><circle cx="10" cy="3"  r="1.2" />
      <circle cx="4" cy="7"  r="1.2" /><circle cx="10" cy="7"  r="1.2" />
      <circle cx="4" cy="11" r="1.2" /><circle cx="10" cy="11" r="1.2" />
    </svg>
  )
}

const DEFAULT_POINT_SYSTEM = [
  { rank: 1, points: 3 },
  { rank: 2, points: 2 },
  { rank: 3, points: 1 },
]

export default function RecordResultModal({ game, existingResult, participants, teams, pointSystem = [], onClose, onSave }) {
  const entryType = game.game_mode === 'team' ? 'team' : 'individual'
  const items = entryType === 'team' ? teams : participants

  // Fall back to default 3-2-1 if no point system has been saved for this event
  const effectivePoints = pointSystem.length > 0 ? pointSystem : DEFAULT_POINT_SYSTEM

  const [status, setStatus] = useState(existingResult?.status || 'partial')
  const [saving, setSaving] = useState(false)
  const dragIndexRef = useRef(null)
  const [dragOver, setDragOver] = useState(null)

  // Assign position = row index+1 and look up score from effectivePoints
  const applyPositionsAndPoints = (arr) =>
    arr.map((e, i) => {
      const pos = i + 1
      const rule = effectivePoints.find((r) => r.rank === pos)
      return { ...e, position: pos, score: rule != null ? rule.points : 0 }
    })

  const buildInitialEntries = () => {
    if (existingResult?.entries?.length > 0) {
      const relevant = entryType === 'individual'
        ? existingResult.entries.filter((e) => e.participant_type === 'individual')
        : existingResult.entries.map((e) => ({ ...e }))
      return relevant
    }
    return applyPositionsAndPoints(
      items.map((item) => ({
        participant_id: item.id,
        participant_type: entryType,
        participant_name: item.name,
        score: 0,
        position: 0,
        time: '',
        notes: '',
      }))
    )
  }

  const [entries, setEntries] = useState(buildInitialEntries)

  const updateEntry = (idx, field, value) => {
    setEntries((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: field === 'score' || field === 'position' ? Number(value) : value }
      return next
    })
  }

  const addEntry = () => {
    const used = new Set(entries.map((e) => e.participant_id))
    const available = items.filter((i) => !used.has(i.id))
    if (available.length === 0) { toast.error('All participants already added'); return }
    const item = available[0]
    setEntries((prev) => {
      const pos = prev.length + 1
      const rule = pointSystem.find((r) => r.rank === pos)
      return [...prev, {
        participant_id: item.id,
        participant_type: entryType,
        participant_name: item.name,
        score: rule != null ? rule.points : 0,
        position: pos,
        time: '',
        notes: '',
      }]
    })
  }

  // After removing, recalculate positions + points for remaining rows
  const removeEntry = (idx) =>
    setEntries((prev) => applyPositionsAndPoints(prev.filter((_, i) => i !== idx)))

  const changeParticipant = (idx, participantId) => {
    const item = items.find((i) => i.id === participantId)
    if (!item) return
    setEntries((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], participant_id: item.id, participant_name: item.name }
      return next
    })
  }

  // Sort by score desc, assign positions (scores stay as-is — user set them manually)
  const autoRankByScore = () => {
    setEntries((prev) =>
      [...prev].sort((a, b) => b.score - a.score).map((e, i) => ({ ...e, position: i + 1 }))
    )
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────────
  const handleDragStart = (e, idx) => {
    dragIndexRef.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, idx) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOver !== idx) setDragOver(idx)
  }

  const handleDrop = (e, toIdx) => {
    e.preventDefault()
    const fromIdx = dragIndexRef.current
    if (fromIdx === null || fromIdx === toIdx) { setDragOver(null); return }
    setEntries((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return applyPositionsAndPoints(next)
    })
    dragIndexRef.current = null
    setDragOver(null)
  }

  const handleDragEnd = () => {
    dragIndexRef.current = null
    setDragOver(null)
  }

  // ── Team aggregates (individual games) ────────────────────────────────────────
  const buildTeamAggregates = (individualEntries) => {
    const totals = {}
    for (const entry of individualEntries) {
      const p = participants.find((x) => x.id === entry.participant_id)
      if (!p?.team_id) continue
      if (!totals[p.team_id]) {
        const team = teams.find((t) => t.id === p.team_id)
        totals[p.team_id] = { name: team?.name || p.team_id, score: 0 }
      }
      totals[p.team_id].score += entry.score
    }
    return Object.entries(totals)
      .map(([teamId, { name, score }]) => ({
        participant_id: teamId,
        participant_type: 'team',
        participant_name: name,
        score,
        position: 0,
        time: '',
        notes: '',
      }))
      .sort((a, b) => b.score - a.score)
      .map((e, i) => ({ ...e, position: i + 1 }))
  }

  const isCancelPath = status === 'final' && entries.length === 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (entries.length === 0 && status !== 'final') { toast.error('Add at least one entry'); return }
    setSaving(true)
    try {
      if (isCancelPath) {
        const { data } = await updateGameStatus(game.id, 'cancelled')
        toast.success('Game cancelled — no participants')
        onSave(null, data)
      } else {
        const allEntries = entryType === 'individual'
          ? [...entries, ...buildTeamAggregates(entries)]
          : entries
        const { data } = await recordResult(game.id, { entries: allEntries, status })
        toast.success('Results saved!')
        onSave(data, null)
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const hasPointSystem = pointSystem.length > 0

  return (
    <Modal title={`Record Results — ${game.name}`} onClose={onClose} size="xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="label">Entry Type</label>
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 text-slate-300">
              {entryType === 'team' ? '🤝 Team' : '🏃 Individual'}
            </span>
          </div>
          <div>
            <label className="label">Result Status</label>
            <div className="flex gap-2">
              {['partial', 'final'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    status === s ? 'bg-blue-600 text-white' : 'bg-slate-600 text-slate-300 hover:text-white'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-auto">
            <button type="button" className="btn-secondary btn-sm" onClick={autoRankByScore}>
              Auto-rank by Score
            </button>
          </div>
        </div>

        {hasPointSystem && (
          <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
            <GripIcon />
            <span>Drag rows to set position — points auto-applied from the event's point system.</span>
          </div>
        )}

        {/* Column headers */}
        <div className="grid grid-cols-12 gap-2 px-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-4">Participant</div>
          <div className="col-span-2">{hasPointSystem ? 'Pts' : 'Score'}</div>
          <div className="col-span-2">Time</div>
          <div className="col-span-2">Notes</div>
          <div className="col-span-1" />
        </div>

        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
          {entries.map((entry, idx) => (
            <div
              key={idx}
              draggable
              onDragStart={(e) => {
                if (!e.target.closest('[data-drag-handle]')) { e.preventDefault(); return }
                handleDragStart(e, idx)
              }}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              className={`grid grid-cols-12 gap-2 items-center rounded-lg p-3 transition-colors ${
                dragOver === idx
                  ? 'bg-blue-900/40 border-2 border-blue-500/60'
                  : 'bg-slate-800 border-2 border-transparent'
              }`}
            >
              {/* Drag handle + rank badge */}
              <div
                data-drag-handle
                className="col-span-1 flex flex-col items-center gap-0.5 cursor-grab active:cursor-grabbing select-none text-slate-500 hover:text-slate-300 transition-colors"
                title="Drag to reorder"
              >
                <GripIcon />
                <span className="text-xs font-semibold leading-none">
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                </span>
              </div>

              <div className="col-span-4">
                <select
                  className="input"
                  value={entry.participant_id}
                  onChange={(e) => changeParticipant(idx, e.target.value)}
                >
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <input
                  className="input"
                  type="number"
                  step="0.001"
                  value={entry.score}
                  onChange={(e) => updateEntry(idx, 'score', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="col-span-2">
                <input
                  className="input"
                  value={entry.time}
                  onChange={(e) => updateEntry(idx, 'time', e.target.value)}
                  placeholder="Time"
                />
              </div>
              <div className="col-span-2">
                <input
                  className="input"
                  value={entry.notes}
                  onChange={(e) => updateEntry(idx, 'notes', e.target.value)}
                  placeholder="Notes"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeEntry(idx)}
                  className="text-red-400 hover:text-red-300 text-lg leading-none"
                >×</button>
              </div>
            </div>
          ))}

          {entries.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">
              No entries yet. Click "+ Add Entry" to start.
            </div>
          )}
        </div>

        {items.length > entries.length && (
          <button type="button" className="btn-secondary w-full" onClick={addEntry}>
            + Add Entry
          </button>
        )}

        {isCancelPath && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-300">
            <span className="shrink-0 mt-0.5">⚠️</span>
            <span>No participants have been added — saving as final will cancel this game. No points will be awarded.</span>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className={isCancelPath ? 'btn-danger' : 'btn-primary'} disabled={saving}>
            {saving
              ? 'Saving…'
              : isCancelPath
                ? 'Cancel Game (No Participants)'
                : `Save ${status === 'final' ? 'Final' : 'Partial'} Results`}
          </button>
        </div>
      </form>
    </Modal>
  )
}
