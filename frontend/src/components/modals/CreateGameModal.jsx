import { useState, useMemo } from 'react'
import { createGame, updateGame } from '../../services/api'
import toast from 'react-hot-toast'
import Modal from './Modal'

const GAME_TYPES = [
  'race', 'match', 'tournament', 'relay', 'heat', 'final', 'semifinal', 'quarterfinal',
  'round-robin', 'knockout', 'time-trial', 'exhibition', 'other',
]

function SelectionList({ items, selectedIds, onToggle, searchPlaceholder, emptyText, renderLabel }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? items.filter((x) => x.name.toLowerCase().includes(q)) : items
  }, [items, search])

  const selected = items.filter((x) => selectedIds.has(x.id))

  return (
    <div>
      {/* Chips for selected items */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((x) => (
            <span
              key={x.id}
              className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2.5 py-0.5 text-xs font-medium"
            >
              {x.name}
              <button type="button" onClick={() => onToggle(x.id)} className="hover:text-white leading-none">×</button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-2">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
        <input
          className="input pl-8 text-sm"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {items.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-4">{emptyText}</p>
      ) : (
        <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-slate-600 p-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-3">No results for "{search}"</p>
          ) : (
            filtered.map((x) => {
              const sel = selectedIds.has(x.id)
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => onToggle(x.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                    sel ? 'bg-blue-600/20 text-blue-300' : 'text-slate-300 hover:bg-slate-600/60'
                  }`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 text-xs ${
                    sel ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-500'
                  }`}>
                    {sel && '✓'}
                  </span>
                  {renderLabel(x)}
                </button>
              )
            })
          )}
        </div>
      )}
      {selectedIds.size > 0 && (
        <p className="text-xs text-slate-500 mt-1">
          {selectedIds.size} {selectedIds.size === 1 ? 'selected' : 'selected'}
        </p>
      )}
    </div>
  )
}

export default function CreateGameModal({ eventId, game, duplicateFrom = null, games = [], teams = [], onClose, onSave }) {
  // source drives initial form values: edit → game, duplicate → duplicateFrom, create → empty
  const source = game || duplicateFrom
  const [form, setForm] = useState({
    name:           duplicateFrom ? duplicateFrom.name : (game?.name        || ''),
    description:    source?.description    || '',
    game_type:      source?.game_type      || 'match',
    game_mode:      source?.game_mode      || 'individual',
    scheduled_at:   source?.scheduled_at   || '',
    venue:          source?.venue          || '',
    age_restricted: source?.age_restricted || false,
    age_from:       source?.age_from       || '',
    age_to:         source?.age_to         || '',
  })
  const [selectedTeamIds, setSelectedTeamIds] = useState(new Set(source?.team_ids || []))
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const toggleTeam = (id) =>
    setSelectedTeamIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const isTeam = form.game_mode === 'team'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.age_restricted) {
      const from = parseInt(form.age_from, 10)
      const to   = parseInt(form.age_to, 10)
      if (!form.age_from || !form.age_to) {
        toast.error('Age From and Age To are required when age range is enabled')
        return
      }
      if (from >= to) {
        toast.error('Age From must be less than Age To')
        return
      }
    }

    // Duplicate check — compare name + game_type + game_mode + age restriction
    {
      const nameNorm   = form.name.trim().toLowerCase()
      const ageFromInt = form.age_restricted ? parseInt(form.age_from, 10) : 0
      const ageToInt   = form.age_restricted ? parseInt(form.age_to,   10) : 0
      const conflict   = games.find((g) => {
        if (game && g.id === game.id) return false          // skip self when editing
        if (g.name.trim().toLowerCase() !== nameNorm) return false
        if (g.game_type !== form.game_type)           return false
        if (g.game_mode !== form.game_mode)           return false
        if (g.age_restricted !== form.age_restricted) return false
        if (form.age_restricted && (g.age_from !== ageFromInt || g.age_to !== ageToInt)) return false
        return true
      })
      if (conflict) {
        const ageNote = form.age_restricted ? ` (age ${ageFromInt}–${ageToInt})` : ''
        toast.error(
          `A "${conflict.game_type}" ${conflict.game_mode} game named "${conflict.name}"${ageNote} already exists.`,
          { duration: 4000 }
        )
        return
      }
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        age_from: form.age_restricted ? parseInt(form.age_from, 10) : 0,
        age_to:   form.age_restricted ? parseInt(form.age_to, 10)   : 0,
        team_ids: isTeam ? [...selectedTeamIds] : [],
      }
      const { data } = game
        ? await updateGame(game.id, payload)
        : await createGame(eventId, payload)
      toast.success(game ? 'Game updated' : 'Game created')
      onSave(data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save game')
    } finally {
      setSaving(false)
    }
  }

  const modalTitle = game ? 'Edit Game' : duplicateFrom ? 'Duplicate Game' : 'Add Game'

  return (
    <Modal title={modalTitle} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Name */}
        <div>
          <label className="label">Game Name *</label>
          <input className="input" value={form.name} onChange={set('name')} required placeholder="100m Sprint Final" />
        </div>

        {/* Type */}
        <div>
          <label className="label">Game Type *</label>
          <select className="input" value={form.game_type} onChange={set('game_type')}>
            {GAME_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' ')}</option>
            ))}
          </select>
        </div>

        {/* Mode toggle */}
        <div>
          <label className="label">Game Mode</label>
          <div className="flex rounded-lg border border-slate-600 overflow-hidden w-fit">
            {['individual', 'team'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setForm((p) => ({ ...p, game_mode: mode }))}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  form.game_mode === mode
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                } ${mode === 'team' ? 'border-l border-slate-600' : ''}`}
              >
                {mode === 'individual' ? '🏃 Individual' : '🤝 Team'}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule & Venue */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Scheduled Date & Time</label>
            <input className="input" type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} />
          </div>
          <div>
            <label className="label">Venue</label>
            <input className="input" value={form.venue} onChange={set('venue')} placeholder="Track A, Field 2…" />
          </div>
        </div>

        {/* Age range */}
        <div className="space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.age_restricted}
              onChange={(e) => setForm((p) => ({ ...p, age_restricted: e.target.checked, age_from: '', age_to: '' }))}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-sm font-medium text-slate-300">Apply age range restriction</span>
          </label>
          {form.age_restricted && (
            <div className="grid grid-cols-2 gap-3 pl-6">
              <div>
                <label className="label">Age From *</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={120}
                  value={form.age_from}
                  onChange={set('age_from')}
                  required
                  placeholder="e.g. 18"
                />
              </div>
              <div>
                <label className="label">Age To *</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={120}
                  value={form.age_to}
                  onChange={set('age_to')}
                  required
                  placeholder="e.g. 35"
                />
              </div>
            </div>
          )}
        </div>

        {/* Team selection — only for team games */}
        {isTeam && (
          <div>
            <label className="label">
              Teams
              <span className="text-slate-500 text-xs font-normal ml-1">(optional)</span>
            </label>
            <SelectionList
              items={teams}
              selectedIds={selectedTeamIds}
              onToggle={toggleTeam}
              searchPlaceholder="Search teams by name…"
              emptyText="No teams added to this event yet."
              renderLabel={(t) => (
                <>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color || '#3b82f6' }} />
                  <span className="flex-1 truncate">{t.name}</span>
                </>
              )}
            />
          </div>
        )}

        {/* Description */}
        <div>
          <label className="label">Description</label>
          <textarea className="input resize-none" rows={2} value={form.description} onChange={set('description')} placeholder="Additional details…" />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : game ? 'Update Game' : duplicateFrom ? 'Create Duplicate' : 'Add Game'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
