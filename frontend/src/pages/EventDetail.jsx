import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getEvent, listGames, listTeams, listEventResults,
  deleteGame, updateGameStatus, deleteTeam,
  getEventMembers, getMyEventRole, removeEventMember,
  getMyJoinRequest, getJoinRequests, reviewJoinRequest,
  updateEventSettings, generateShareLink, revokeShareLink,
} from '../services/api'
import { useWS } from '../context/WSContext'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import CreateGameModal from '../components/modals/CreateGameModal'
import CreateTeamModal from '../components/modals/CreateTeamModal'
import AddEventMemberModal from '../components/modals/AddEventMemberModal'
import BulkAddMembersModal from '../components/modals/BulkAddMembersModal'
import JoinRequestModal, { DEFAULT_QUESTIONS } from '../components/modals/JoinRequestModal'

const QUESTION_TYPES = ['text', 'number', 'textarea', 'tags', 'team-select']

const QUESTION_TYPE_LABELS = {
  text: 'Text', number: 'Number', textarea: 'Textarea',
  tags: 'Tags', 'team-select': 'Team Select',
}

const DEFAULT_POINT_SYSTEM = [
  { rank: 1, points: 3 },
  { rank: 2, points: 2 },
  { rank: 3, points: 1 },
]

// ── Settings tab ──────────────────────────────────────────────────────────────
function SettingsTab({ event, onSave }) {
  const [questions, setQuestions] = useState(
    event.join_questions?.length > 0 ? event.join_questions : DEFAULT_QUESTIONS
  )
  const [pointRules, setPointRules] = useState(
    event.point_system?.length > 0 ? event.point_system : DEFAULT_POINT_SYSTEM
  )
  const [saving, setSaving] = useState(false)

  const update = (idx, field, val) =>
    setQuestions((p) => p.map((q, i) => i === idx ? { ...q, [field]: val } : q))

  const move = (idx, dir) => {
    const next = [...questions]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setQuestions(next)
  }

  const addQuestion = () =>
    setQuestions((p) => [...p, { id: crypto.randomUUID(), label: '', type: 'text', required: true }])

  const removeQuestion = (idx) => setQuestions((p) => p.filter((_, i) => i !== idx))

  const updatePoints = (idx, val) =>
    setPointRules((p) => p.map((r, i) => i === idx ? { ...r, points: Math.max(0, Number(val)) } : r))

  const addRank = () =>
    setPointRules((p) => [...p, { rank: p.length + 1, points: 0 }])

  const removeRank = (idx) =>
    setPointRules((p) => p.filter((_, i) => i !== idx).map((r, i) => ({ ...r, rank: i + 1 })))

  const handleSave = async () => {
    if (questions.some((q) => !q.label.trim())) {
      toast.error('All questions must have a label')
      return
    }
    setSaving(true)
    try {
      const { data } = await updateEventSettings(event.id, {
        join_questions: questions,
        point_system: pointRules,
      })
      toast.success('Settings saved')
      onSave(data)
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-10 max-w-2xl">

      {/* ── Point System ── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white mb-1">Point System</h2>
          <p className="text-sm text-slate-400">
            Points awarded per finishing rank across all games in this event.
          </p>
        </div>

        <div className="card overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto] gap-0 divide-y divide-slate-700">
            {/* header */}
            <div className="contents text-xs font-medium text-slate-500 uppercase tracking-wide">
              <div className="px-4 py-2 bg-slate-800">Rank</div>
              <div className="px-4 py-2 bg-slate-800">Points awarded</div>
              <div className="px-4 py-2 bg-slate-800" />
            </div>

            {pointRules.map((rule, idx) => (
              <div key={idx} className="contents">
                <div className="px-4 py-3 flex items-center text-sm font-medium text-slate-300">
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${rule.rank}`}
                  <span className="ml-2 text-slate-500 text-xs">Rank {rule.rank}</span>
                </div>
                <div className="px-4 py-2 flex items-center">
                  <input
                    className="input w-24 text-center"
                    type="number"
                    min="0"
                    value={rule.points}
                    onChange={(e) => updatePoints(idx, e.target.value)}
                  />
                  <span className="ml-2 text-xs text-slate-500">pts</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => removeRank(idx)}
                    className="text-red-400 hover:text-red-300 text-lg leading-none px-1"
                    title="Remove rank"
                  >×</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" className="btn-secondary" onClick={addRank}>
            + Add Rank
          </button>
          <button
            type="button"
            className="btn-secondary text-slate-500 hover:text-white"
            onClick={() => setPointRules(DEFAULT_POINT_SYSTEM)}
          >
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* ── Join Request Questions ── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white mb-1">Join Request Questions</h2>
          <p className="text-sm text-slate-400">
            These questions are shown to users when they request to join this event.
          </p>
        </div>

        <div className="space-y-3">
          {questions.map((q, idx) => (
            <div key={q.id} className="card p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex-1 grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label mb-1">Label</label>
                  <input
                    className="input"
                    value={q.label}
                    onChange={(e) => update(idx, 'label', e.target.value)}
                    placeholder="Question label"
                  />
                </div>
                <div>
                  <label className="label mb-1">Type</label>
                  <select
                    className="input"
                    value={q.type}
                    onChange={(e) => update(idx, 'type', e.target.value)}
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => update(idx, 'required', e.target.checked)}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <span className="text-xs text-slate-400">Required</span>
                </label>
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="text-slate-400 hover:text-white disabled:opacity-30 px-1"
                  title="Move up"
                >↑</button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === questions.length - 1}
                  className="text-slate-400 hover:text-white disabled:opacity-30 px-1"
                  title="Move down"
                >↓</button>
                <button
                  type="button"
                  onClick={() => removeQuestion(idx)}
                  className="text-red-400 hover:text-red-300 px-1"
                  title="Remove"
                >🗑️</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" className="btn-secondary" onClick={addQuestion}>+ Add Question</button>
          <button
            type="button"
            className="btn-secondary text-slate-500 hover:text-white"
            onClick={() => setQuestions(DEFAULT_QUESTIONS)}
          >
            Reset to Defaults
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

const GAME_STATUS_FLOW  = { scheduled: 'active', active: 'completed' }
const GAME_STATUS_LABEL = { scheduled: 'Start', active: 'Finish' }

const ROLE_BADGE = {
  admin:  'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  member: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  viewer: 'bg-slate-500/40 text-slate-400 border border-slate-500/40',
}

const STATUS_BADGE = {
  pending:  'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-300 border border-red-500/30',
}

function TeamAvatar({ team, size = 'md' }) {
  const [imgError, setImgError] = useState(false)
  const sz = size === 'lg' ? 'w-14 h-14 text-2xl rounded-xl' : 'w-10 h-10 text-lg rounded-lg'
  return (
    <div
      className={`${sz} flex items-center justify-center font-bold text-white shrink-0 overflow-hidden`}
      style={{ backgroundColor: team.color || '#3b82f6' }}
    >
      {team.logo_url && !imgError ? (
        <img src={team.logo_url} alt={team.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
      ) : (
        <span>{team.name?.charAt(0)?.toUpperCase() || '?'}</span>
      )}
    </div>
  )
}

const EVENT_EMOJI = {
  athletics: '🏃', tournament: '🏆', swimming: '🏊', cycling: '🚴',
  football: '⚽', basketball: '🏀', tennis: '🎾', volleyball: '🏐',
  cricket: '🏏', baseball: '⚾', rugby: '🏉', golf: '⛳',
  boxing: '🥊', wrestling: '🤼', gymnastics: '🤸', 'multi-sport': '🏆', other: '🎯',
}

// ── Public event info shown to anyone ────────────────────────────────────────
function PublicEventView({ event, myRequest, onRequestJoin }) {
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="card p-8 text-center">
        <div className="text-6xl mb-4">{EVENT_EMOJI[event.event_type] || '🎯'}</div>
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className={`badge badge-${event.status}`}>{event.status}</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-4">{event.name}</h1>

        <div className="space-y-2 text-sm text-slate-400 mb-6">
          <div className="flex items-center justify-center gap-2">
            <span>🏷️</span><span className="capitalize">{event.event_type}</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span>📅</span>
            <span>{event.start_date}{event.end_date ? ` – ${event.end_date}` : ''}</span>
          </div>
          {event.location && (
            <div className="flex items-center justify-center gap-2">
              <span>📍</span><span>{event.location}</span>
            </div>
          )}
        </div>

        {event.description && (
          <p className="text-slate-300 text-sm leading-relaxed border-t border-slate-600 pt-5 mb-6">
            {event.description}
          </p>
        )}

        {(!myRequest || myRequest.status === 'approved') && (
          <button className="btn-primary w-full" onClick={onRequestJoin}>
            Request to Join
          </button>
        )}

        {myRequest?.status === 'pending' && (
          <div className="flex items-center justify-center gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <span className="text-xl">⏳</span>
            <div className="text-left">
              <p className="text-amber-300 font-medium text-sm">Request pending</p>
              <p className="text-slate-400 text-xs mt-0.5">Waiting for the event admin to review your request.</p>
            </div>
          </div>
        )}

        {myRequest?.status === 'rejected' && (
          <div className="flex items-center justify-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <span className="text-xl">❌</span>
            <div className="text-left">
              <p className="text-red-300 font-medium text-sm">Request declined</p>
              <p className="text-slate-400 text-xs mt-0.5">Contact the event admin if you think this is a mistake.</p>
            </div>
          </div>
        )}
      </div>

      <div className="text-center">
        <Link to="/events" className="text-slate-400 hover:text-white text-sm transition-colors">
          ← Back to Events
        </Link>
      </div>
    </div>
  )
}

// ── GameControls: sort + filter icon buttons with click-to-open dropdowns ─────
const GAME_SORT_OPTIONS = [
  { value: 'name_age', label: 'Name + Age' },
  { value: 'name',     label: 'Name' },
  { value: 'age',      label: 'Age Range' },
  { value: 'team',     label: 'Team' },
]

function IconSort() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M2 4h12M4 8h8M6 12h4" />
    </svg>
  )
}
function IconFilter() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 3h13l-5 5.5V13l-3-1.5V8.5L1.5 3z" />
    </svg>
  )
}

function GameControls({ sort, onSort, filter, onFilter, gameTypes, activeFilterCount }) {
  const [open, setOpen] = useState(null)  // null | 'sort' | 'filter'
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const toggle = (panel) => setOpen((p) => (p === panel ? null : panel))

  const activeBtn = (active) =>
    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      active ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
    }`

  const pill = (active) =>
    `px-2.5 py-0.5 rounded-full text-xs transition-colors ${
      active ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600'
    }`

  return (
    <div ref={ref} className="relative flex items-center gap-1">

      {/* Sort button */}
      <button type="button" title="Sort" onClick={() => toggle('sort')}
        className={activeBtn(open === 'sort' || sort !== 'name_age')}>
        <IconSort />
        <span className="hidden sm:inline">
          {GAME_SORT_OPTIONS.find((o) => o.value === sort)?.label}
        </span>
      </button>

      {/* Filter button */}
      <button type="button" title="Filter" onClick={() => toggle('filter')}
        className={`relative ${activeBtn(open === 'filter' || activeFilterCount > 0)}`}>
        <IconFilter />
        <span className="hidden sm:inline">Filter</span>
        {activeFilterCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold px-0.5">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Sort dropdown */}
      {open === 'sort' && (
        <div className="absolute top-full left-0 mt-1.5 z-30 w-44 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
          <p className="text-[10px] text-slate-500 px-3 pt-2.5 pb-1 font-semibold uppercase tracking-wider">Sort by</p>
          {GAME_SORT_OPTIONS.map(({ value, label }) => (
            <button key={value} type="button"
              onClick={() => { onSort(value); setOpen(null) }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                sort === value ? 'text-blue-400 bg-blue-500/10' : 'text-slate-300 hover:bg-slate-700'
              }`}>
              {label}
              {sort === value && <span className="text-blue-400 text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* Filter dropdown */}
      {open === 'filter' && (
        <div className="absolute top-full left-0 mt-1.5 z-30 w-60 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Filter games</p>
            {activeFilterCount > 0 && (
              <button type="button"
                onClick={() => onFilter({ status: '', mode: '', type: '' })}
                className="text-xs text-red-400 hover:text-red-300 transition-colors">
                ✕ Clear all
              </button>
            )}
          </div>

          {/* Status */}
          <div>
            <p className="text-xs text-slate-500 mb-1.5">Status</p>
            <div className="flex flex-wrap gap-1">
              {['', 'scheduled', 'active', 'completed', 'cancelled'].map((s) => (
                <button key={s} type="button"
                  onClick={() => onFilter((f) => ({ ...f, status: s === f.status ? '' : s }))}
                  className={pill(s !== '' ? filter.status === s : filter.status === '')}>
                  {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div>
            <p className="text-xs text-slate-500 mb-1.5">Mode</p>
            <div className="flex gap-1">
              {['', 'individual', 'team'].map((m) => (
                <button key={m} type="button"
                  onClick={() => onFilter((f) => ({ ...f, mode: m === f.mode ? '' : m }))}
                  className={pill(m !== '' ? filter.mode === m : filter.mode === '')}>
                  {m === '' ? 'All' : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          {gameTypes.length > 1 && (
            <div>
              <p className="text-xs text-slate-500 mb-1.5">Type</p>
              <select
                className="w-full bg-slate-700 border border-slate-600 text-xs text-slate-300 rounded-lg px-2 py-1.5"
                value={filter.type}
                onChange={(e) => onFilter((f) => ({ ...f, type: e.target.value }))}>
                <option value="">All types</option>
                {gameTypes.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' ')}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Full event detail for members ─────────────────────────────────────────────
export default function EventDetail() {
  const { id } = useParams()
  const { subscribe } = useWS()
  const { user } = useAuth()

  const [event, setEvent]               = useState(null)
  const [games, setGames]               = useState([])
  const [teams, setTeams]               = useState([])
  const [members, setMembers]           = useState([])
  const [joinRequests, setJoinRequests] = useState([])
  const [myRole, setMyRole]             = useState(null)   // null = still loading
  const [myRequest, setMyRequest]       = useState(null)
  const [tab, setTab]                   = useState('games')
  const [loading, setLoading]           = useState(true)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [modal, setModal]               = useState(null)
  const [editItem, setEditItem]         = useState(null)
  const [duplicateFrom, setDuplicateFrom] = useState(null)
  const [gameSort, setGameSort]           = useState('name_age')
  const [gameFilter, setGameFilter]       = useState({ status: '', mode: '', type: '' })
  const [showShare, setShowShare]       = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [eventResults, setEventResults] = useState([])

  const isEventAdmin  = myRole === 'admin'
  const isEventMember = myRole === 'admin' || myRole === 'member'
  const isMember      = myRole !== 'none' && myRole !== null

  // Phase 1 — load event + role (always)
  // Phase 2 — load everything else only if user is a member
  const load = async () => {
    try {
      const [ev, roleRes] = await Promise.all([getEvent(id), getMyEventRole(id)])
      setEvent(ev.data)
      const role = roleRes.data.role
      setMyRole(role)

      if (role === 'none') {
        // Non-member: only fetch their own join request
        const jr = await getMyJoinRequest(id).catch(() => ({ data: null }))
        setMyRequest(jr.data)
      } else {
        // Member: fetch everything
        const [gms, tms, mem, adminReqs, evRes] = await Promise.all([
          listGames(id),
          listTeams(id),
          getEventMembers(id),
          role === 'admin' ? getJoinRequests(id).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
          listEventResults(id).catch(() => ({ data: [] })),
        ])
        setGames(gms.data)
        setTeams(tms.data)
        setMembers(mem.data)
        setJoinRequests(adminReqs.data || [])
        setEventResults(evRes.data || [])
      }
    } catch {
      toast.error('Failed to load event')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    // Guard helpers — prevent duplicates when onSave already added the item
    const addOnce = (setter, key = 'id') => (m) => {
      if (m.event_id !== id) return
      setter((p) => p.some((x) => x[key] === m.data[key]) ? p : [...p, m.data])
    }
    const addOnceByUserId = (setter) => (m) => {
      if (m.event_id !== id) return
      setter((p) => p.some((x) => x.user_id === m.data.user_id) ? p : [...p, m.data])
    }

    const subs = [
      subscribe('game_created',        addOnce(setGames)),
      subscribe('game_updated',        (m) => { if (m.event_id === id) setGames((p) => p.map((g) => g.id === m.data.id ? m.data : g)) }),
      subscribe('game_status_changed', (m) => { if (m.event_id === id) setGames((p) => p.map((g) => g.id === m.data.id ? m.data : g)) }),
      subscribe('team_created',        addOnce(setTeams)),
      subscribe('member_added',        addOnceByUserId(setMembers)),
      subscribe('join_request',        addOnceByUserId(setJoinRequests)),
      subscribe('join_request_reviewed', (m) => {
        if (m.event_id !== id) return
        setJoinRequests((p) => p.filter((r) => r.user_id !== m.data.user_id))
        setMyRequest((prev) => prev?.user_id === m.data.user_id ? m.data : prev)
        if (m.data.status === 'approved') load()
      }),
    ]
    return () => subs.forEach((u) => u())
  }, [subscribe, id])

  const handleJoinSave = (jr) => {
    setMyRequest(jr)
    setShowJoinModal(false)
  }

  const handleReview = async (userId, status) => {
    try {
      await reviewJoinRequest(id, userId, status)
      setJoinRequests((p) => p.filter((r) => r.user_id !== userId))
      if (status === 'approved') {
        toast.success('Request approved — user added as viewer')
        const mem = await getEventMembers(id)
        setMembers(mem.data)
      } else {
        toast.success('Request rejected')
      }
    } catch { toast.error('Failed to review request') }
  }

  const handleGameStatusChange = async (game) => {
    const next = GAME_STATUS_FLOW[game.status]
    if (!next) return
    try {
      const { data } = await updateGameStatus(game.id, next)
      setGames((p) => p.map((g) => g.id === data.id ? data : g))
    } catch { toast.error('Failed to update game') }
  }

  const handleDeleteGame = async (gameId) => {
    if (!confirm('Delete this game?')) return
    try {
      await deleteGame(gameId)
      setGames((p) => p.filter((g) => g.id !== gameId))
      toast.success('Game deleted')
    } catch { toast.error('Failed to delete game') }
  }

  const handleDeleteTeam = async (teamId) => {
    if (!confirm('Delete this team?')) return
    try {
      await deleteTeam(teamId)
      setTeams((p) => p.filter((t) => t.id !== teamId))
      toast.success('Team deleted')
    } catch { toast.error('Failed to delete team') }
  }

  const handleRemoveMember = async (m) => {
    if (!confirm(`Remove ${m.user_name} from this event?`)) return
    try {
      await removeEventMember(id, m.user_id)
      setMembers((p) => p.filter((x) => x.user_id !== m.user_id))
      toast.success('Member removed')
    } catch { toast.error('Failed to remove member') }
  }



  const handleGenerateShare = async () => {
    setShareLoading(true)
    try {
      const { data } = await generateShareLink(id)
      setEvent((prev) => ({ ...prev, share_token: data.token }))
      toast.success('Share link generated')
    } catch { toast.error('Failed to generate share link') }
    finally { setShareLoading(false) }
  }

  const handleRevokeShare = async () => {
    if (!confirm('Revoke this share link? Anyone with the URL will lose access.')) return
    setShareLoading(true)
    try {
      await revokeShareLink(id)
      setEvent((prev) => ({ ...prev, share_token: '' }))
      toast.success('Share link revoked')
    } catch { toast.error('Failed to revoke share link') }
    finally { setShareLoading(false) }
  }

  const copyShareUrl = () => {
    const url = `${window.location.origin}/share/${event.share_token}`
    navigator.clipboard.writeText(url).then(() => toast.success('Link copied!'))
  }

  // ── Games: sort + filter (must be before any early returns — Rules of Hooks) ──
  const gameTypes = useMemo(() => [...new Set(games.map((g) => g.game_type))].sort(), [games])

  const sortedFilteredGames = useMemo(() => {
    let list = [...games]

    // Filters
    if (gameFilter.status) list = list.filter((g) => g.status === gameFilter.status)
    if (gameFilter.mode)   list = list.filter((g) => g.game_mode === gameFilter.mode)
    if (gameFilter.type)   list = list.filter((g) => g.game_type === gameFilter.type)

    // Sort
    const STATUS_RANK = { active: 0, scheduled: 1, completed: 2, cancelled: 3 }
    const statusRank = (g) => STATUS_RANK[g.status] ?? 4

    list.sort((a, b) => {
      const sr = statusRank(a) - statusRank(b)
      if (sr !== 0) return sr

      switch (gameSort) {
        case 'name':
          return a.name.localeCompare(b.name)

        case 'age': {
          if (a.age_restricted && b.age_restricted)
            return a.age_from - b.age_from || a.age_to - b.age_to || a.name.localeCompare(b.name)
          if (a.age_restricted) return -1
          if (b.age_restricted) return  1
          return a.name.localeCompare(b.name)
        }

        case 'team': {
          const nameOf = (g) => teams.find((t) => g.team_ids?.includes(t.id))?.name || ''
          return nameOf(a).localeCompare(nameOf(b)) || a.name.localeCompare(b.name)
        }

        case 'name_age':
        default: {
          const nc = a.name.localeCompare(b.name)
          if (nc !== 0) return nc
          if (a.age_restricted && b.age_restricted) return a.age_from - b.age_from || a.age_to - b.age_to
          if (a.age_restricted) return -1
          if (b.age_restricted) return  1
          return 0
        }
      }
    })
    return list
  }, [games, gameSort, gameFilter, teams])

  const activeFilterCount = [gameFilter.status, gameFilter.mode, gameFilter.type].filter(Boolean).length

  // ── Leaderboard computations (must be before early returns — Rules of Hooks) ─
  const teamLeaderboard = useMemo(() => {
    const map = {}
    for (const result of eventResults) {
      for (const entry of result.entries) {
        if (entry.participant_type !== 'team') continue
        const key = entry.participant_id || entry.participant_name
        if (!map[key]) {
          const team = teams.find((t) => t.id === entry.participant_id)
          map[key] = {
            team_id: entry.participant_id,
            team_name: team?.name || entry.participant_name,
            team_color: team?.color || '#3b82f6',
            total_score: 0, wins: 0, game_count: 0,
          }
        }
        map[key].total_score += entry.score
        map[key].game_count++
        if (entry.position === 1) map[key].wins++
      }
    }
    return Object.values(map).sort((a, b) => b.total_score - a.total_score)
  }, [eventResults, teams])

  const topPerformers = useMemo(() => {
    const map = {}
    for (const result of eventResults) {
      for (const entry of result.entries) {
        if (entry.participant_type === 'team') continue
        const key = entry.participant_name || entry.participant_id
        if (!map[key]) map[key] = { name: key, total_score: 0, wins: 0, game_count: 0 }
        map[key].total_score += entry.score
        map[key].game_count++
        if (entry.position === 1) map[key].wins++
      }
    }
    return Object.values(map).sort((a, b) => b.total_score - a.total_score)
  }, [eventResults])

  const myGameResults = useMemo(() => {
    if (!user) return []
    return eventResults.flatMap((result) => {
      const game = games.find((g) => g.id === result.game_id)
      if (!game) return []
      return result.entries
        .filter((e) => e.participant_type !== 'team' && e.participant_name === user.name)
        .map((e) => ({ ...e, game }))
    }).sort((a, b) => (a.position || 9999) - (b.position || 9999))
  }, [eventResults, games, user])

  // ── Early returns (after all hooks) ──────────────────────────────────────────
  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!event) return <div className="text-center py-24 text-slate-400">Event not found</div>

  if (myRole === 'none') {
    return (
      <>
        <PublicEventView
          event={event}
          myRequest={myRequest}
          onRequestJoin={() => setShowJoinModal(true)}
        />
        {showJoinModal && (
          <JoinRequestModal
            event={event}
            onClose={() => setShowJoinModal(false)}
            onSave={handleJoinSave}
          />
        )}
      </>
    )
  }

  // ── Member / Admin / Viewer: full view ───────────────────────────────────────
  const tabs = ['games', 'teams', 'members', 'leaderboard', ...(isEventAdmin ? ['requests', 'settings'] : [])]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link to="/events" className="text-slate-400 hover:text-white text-sm">← Events</Link>
              <span className={`badge badge-${event.status}`}>{event.status}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_BADGE[myRole]}`}>{myRole}</span>
            </div>
            <h1 className="text-2xl font-bold text-white">{event.name}</h1>
            <p className="text-slate-400 text-sm mt-1 capitalize">{event.event_type}</p>
            {event.location && <p className="text-slate-500 text-sm">📍 {event.location}</p>}
            <p className="text-slate-500 text-sm">
              📅 {event.start_date}{event.end_date ? ` – ${event.end_date}` : ''}
            </p>
            {event.description && <p className="text-slate-300 text-sm mt-2">{event.description}</p>}
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex gap-3 text-center flex-wrap justify-end">
              <div className="card px-4 py-2"><div className="text-lg font-bold text-white">{games.length}</div><div className="text-xs text-slate-400">Games</div></div>
              <div className="card px-4 py-2"><div className="text-lg font-bold text-white">{teams.length}</div><div className="text-xs text-slate-400">Teams</div></div>
              <div className="card px-4 py-2"><div className="text-lg font-bold text-white">{members.length}</div><div className="text-xs text-slate-400">Members</div></div>
              {isEventAdmin && joinRequests.length > 0 && (
                <div className="card px-4 py-2 border-amber-500/40">
                  <div className="text-lg font-bold text-amber-400">{joinRequests.length}</div>
                  <div className="text-xs text-slate-400">Requests</div>
                </div>
              )}
            </div>
            {isEventAdmin && (
              <button
                className={`btn-secondary btn-sm flex items-center gap-1.5 ${showShare ? 'text-blue-400' : ''}`}
                onClick={() => setShowShare((v) => !v)}
              >
                🔗 Share
              </button>
            )}
          </div>
        </div>

        {/* Share panel */}
        {isEventAdmin && showShare && (
          <div className="mt-5 pt-5 border-t border-slate-600">
            <p className="text-sm font-medium text-white mb-3">Public Share Link</p>
            {event.share_token ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={`${window.location.origin}/share/${event.share_token}`}
                    className="input flex-1 text-xs font-mono text-slate-300 bg-slate-700 cursor-text"
                    onFocus={(e) => e.target.select()}
                  />
                  <button className="btn-primary btn-sm shrink-0" onClick={copyShareUrl}>Copy</button>
                </div>
                <p className="text-xs text-slate-500">Anyone with this link can view live event status — no login required.</p>
                <button
                  className="btn-danger btn-sm"
                  onClick={handleRevokeShare}
                  disabled={shareLoading}
                >
                  {shareLoading ? 'Revoking…' : 'Revoke Link'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">Generate a public URL to share live event updates with anyone — no login required.</p>
                <button
                  className="btn-primary btn-sm"
                  onClick={handleGenerateShare}
                  disabled={shareLoading}
                >
                  {shareLoading ? 'Generating…' : 'Generate Share Link'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              tab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'requests' && joinRequests.length > 0 && (
              <span className="bg-amber-500 text-black text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                {joinRequests.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Games Tab */}
      {tab === 'games' && (
        <div className="space-y-4">

          {/* Compact toolbar: sort/filter icons left, add button right */}
          <div className="flex items-center justify-between gap-2 min-h-[2rem]">
            {games.length > 0 && (
              <GameControls
                sort={gameSort} onSort={setGameSort}
                filter={gameFilter} onFilter={setGameFilter}
                gameTypes={gameTypes} activeFilterCount={activeFilterCount}
              />
            )}
            {isEventAdmin && (
              <button className="btn-primary ml-auto" onClick={() => { setModal('game'); setEditItem(null); setDuplicateFrom(null) }}>+ Add Game</button>
            )}
          </div>
          {games.length === 0 ? (
            <div className="text-center py-16 text-slate-400">No games scheduled yet.</div>
          ) : sortedFilteredGames.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              No games match the current filters.{' '}
              <button type="button" className="text-blue-400 hover:underline"
                onClick={() => setGameFilter({ status: '', mode: '', type: '' })}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {sortedFilteredGames.map((game) => (
                <div key={game.id} className="card p-5">
                  <div className="flex items-start justify-between mb-2">
                    <span className={`badge badge-${game.status}`}>{game.status}</span>
                    {isEventAdmin && (
                      <div className="flex gap-1">
                        {GAME_STATUS_FLOW[game.status] && (
                          <button className="btn-success btn-sm" onClick={() => handleGameStatusChange(game)}>
                            {GAME_STATUS_LABEL[game.status]}
                          </button>
                        )}
                        <button className="btn-secondary btn-sm" onClick={() => { setDuplicateFrom(game); setEditItem(null); setModal('game') }} title="Duplicate game">⧉</button>
                        <button className="btn-secondary btn-sm" onClick={() => { setEditItem(game); setDuplicateFrom(null); setModal('game') }}>✏️</button>
                        <button className="btn-danger btn-sm" onClick={() => handleDeleteGame(game.id)}>🗑️</button>
                      </div>
                    )}
                  </div>
                  <h3 className="font-semibold text-white">
                    {game.name}
                    {game.age_restricted && (
                      <span className="ml-1.5 text-xs font-normal text-slate-400">({game.age_from}–{game.age_to})</span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">{game.game_type}</p>
                  {game.venue && <p className="text-xs text-slate-500">📍 {game.venue}</p>}
                  {game.scheduled_at && <p className="text-xs text-slate-500">🕐 {game.scheduled_at}</p>}
                  {game.description && <p className="text-xs text-slate-400 mt-2">{game.description}</p>}
                  <div className="mt-3">
                    <Link to={`/games/${game.id}`} className="btn-secondary btn-sm w-full text-center block">View Game</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Teams Tab */}
      {tab === 'teams' && (
        <div className="space-y-4">
          {isEventAdmin && (
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => { setModal('team'); setEditItem(null) }}>+ Add Team</button>
            </div>
          )}
          {teams.length === 0 ? (
            <div className="text-center py-16 text-slate-400">No teams yet.</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {teams.map((team) => (
                <div key={team.id} className="card p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <TeamAvatar team={team} />
                    <div>
                      <h3 className="font-semibold text-white">{team.name}</h3>
                    </div>
                  </div>
                  {team.description && <p className="text-xs text-slate-400 mb-3">{team.description}</p>}
                  {isEventAdmin && (
                    <div className="flex gap-2">
                      <button className="btn-secondary btn-sm" onClick={() => { setEditItem(team); setModal('team') }}>✏️ Edit</button>
                      <button className="btn-danger btn-sm" onClick={() => handleDeleteTeam(team.id)}>🗑️</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Members Tab */}
      {tab === 'members' && (
        <div className="space-y-4">
          {isEventAdmin && (
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setModal('bulk-member')}>⬆ Bulk Add</button>
              <button className="btn-primary" onClick={() => { setModal('member'); setEditItem(null) }}>+ Add Member</button>
            </div>
          )}
          {members.length === 0 ? (
            <div className="text-center py-16 text-slate-400">No members yet.</div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Details</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Added</th>
                    {isEventAdmin && <th className="px-4 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-600">
                  {members.map((m) => (
                    <tr key={m.user_id} className="hover:bg-slate-600/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{m.user_name}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {m.username ? `@${m.username}` : m.user_email}
                        </div>
                        {m.tags && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {m.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                              <span key={t} className="text-xs text-blue-400">#{t}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-400 space-y-0.5">
                        {m.age > 0 && <div>Age: {m.age}</div>}
                        {m.club && <div>Club: {m.club}</div>}
                        {m.phone && <div>{m.phone}</div>}
                        {m.address && <div className="truncate max-w-32">{m.address}</div>}
                        {!m.age && !m.club && !m.phone && !m.address && <span className="text-slate-500">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_BADGE[m.role]}`}>{m.role}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-slate-400 text-xs">
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>
                      {isEventAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <button className="btn-secondary btn-sm" onClick={() => { setEditItem(m); setModal('member') }}>✏️</button>
                            <button className="btn-danger btn-sm" onClick={() => handleRemoveMember(m)}>🗑️</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Requests Tab — admin only */}
      {tab === 'requests' && isEventAdmin && (
        <div className="space-y-4">
          {joinRequests.length === 0 ? (
            <div className="text-center py-16 text-slate-400">No pending join requests.</div>
          ) : (
            <div className="space-y-3">
              {joinRequests.map((req) => (
                <div key={req.user_id} className="card p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-white font-semibold shrink-0">
                        {req.user_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">{req.user_name}</div>
                        <div className="text-xs text-slate-400 font-mono truncate">
                          {req.username ? `@${req.username}` : req.user_email}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Requested {new Date(req.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button className="btn-primary btn-sm" onClick={() => handleReview(req.user_id, 'approved')}>Approve</button>
                      <button className="btn-danger btn-sm" onClick={() => handleReview(req.user_id, 'rejected')}>Reject</button>
                    </div>
                  </div>
                  {req.answers && Object.keys(req.answers).length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t border-slate-600">
                      {(req.questions?.length > 0 ? req.questions : (event.join_questions?.length > 0 ? event.join_questions : DEFAULT_QUESTIONS)).map((q) =>
                        req.answers[q.id] ? (
                          <div key={q.id}>
                            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">{q.label}</div>
                            {q.type === 'tags' ? (
                              <div className="flex flex-wrap gap-1">
                                {req.answers[q.id].split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                                  <span key={t} className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2 py-0.5 font-medium">
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            ) : q.type === 'team-select' ? (
                              <div className="text-sm text-slate-200">
                                {teams.find((t) => t.id === req.answers[q.id])?.name || req.answers[q.id]}
                              </div>
                            ) : (
                              <div className="text-sm text-slate-200 break-words">{req.answers[q.id]}</div>
                            )}
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings Tab — admin only */}
      {tab === 'settings' && isEventAdmin && (
        <SettingsTab event={event} onSave={(updated) => setEvent(updated)} />
      )}

      {/* Leaderboard Tab */}
      {tab === 'leaderboard' && (
        <div className="space-y-8">

          {/* My Game Results */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">My Game Results</h2>
            {myGameResults.length === 0 ? (
              <div className="card p-6 text-center text-slate-500 text-sm">
                You haven't been recorded as a participant in any game yet.
              </div>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Game</th>
                      <th className="px-4 py-3 text-center">Position</th>
                      <th className="px-4 py-3 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-600">
                    {myGameResults.map((e, i) => (
                      <tr key={i} className="hover:bg-slate-600/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link to={`/games/${e.game.id}`} className="font-medium text-white hover:text-blue-400 transition-colors">
                            {e.game.name}
                            {e.game.age_restricted && (
                              <span className="ml-1 text-xs font-normal text-slate-400">({e.game.age_from}–{e.game.age_to})</span>
                            )}
                          </Link>
                          <div className="text-xs text-slate-500 capitalize">{e.game.game_type}</div>
                        </td>
                        <td className="px-4 py-3 text-center text-lg">
                          {e.position === 1 ? '🥇' : e.position === 2 ? '🥈' : e.position === 3 ? '🥉' : e.position ? `#${e.position}` : <span className="text-slate-500 text-sm">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-white">
                          {e.score > 0 ? e.score : <span className="text-slate-500">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid lg:grid-cols-2 gap-6">

            {/* Team Leaderboard */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-4">Team Leaderboard</h2>
              {teamLeaderboard.length === 0 ? (
                <div className="card p-6 text-center text-slate-500 text-sm">No team results yet.</div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-3 text-left">Team</th>
                        <th className="px-4 py-3 text-center">Wins</th>
                        <th className="px-4 py-3 text-center hidden sm:table-cell">Games</th>
                        <th className="px-4 py-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-600">
                      {teamLeaderboard.map((t, i) => (
                        <tr key={t.team_id || i} className={`hover:bg-slate-600/30 transition-colors ${i === 0 ? 'bg-amber-500/5' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.team_color }} />
                              <span className="font-medium text-white truncate">{t.team_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-emerald-400 font-semibold">{t.wins}</td>
                          <td className="px-4 py-3 text-center text-slate-400 hidden sm:table-cell">{t.game_count}</td>
                          <td className="px-4 py-3 text-right font-bold text-white">{t.total_score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Top Performers */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-4">Top Performers</h2>
              {topPerformers.length === 0 ? (
                <div className="card p-6 text-center text-slate-500 text-sm">No individual results yet.</div>
              ) : (
                <div className="card divide-y divide-slate-600">
                  {topPerformers.slice(0, 10).map((ind, i) => (
                    <div key={ind.name} className={`flex items-center gap-4 px-5 py-4 ${i === 0 ? 'bg-amber-500/5' : ''}`}>
                      <div className="text-2xl w-10 text-center shrink-0">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white truncate">{ind.name}</div>
                        <div className="text-xs text-slate-500">
                          {ind.wins} win{ind.wins !== 1 ? 's' : ''} · {ind.game_count} game{ind.game_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl font-bold text-white">{ind.total_score}</div>
                        <div className="text-xs text-slate-500">pts</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
        </div>
      )}

      {/* Modals */}
      {modal === 'game' && (
        <CreateGameModal eventId={id} game={editItem} duplicateFrom={duplicateFrom} games={games} teams={teams}
          onClose={() => { setModal(null); setEditItem(null); setDuplicateFrom(null) }}
          onSave={(g) => {
            if (editItem) setGames((p) => p.map((x) => x.id === g.id ? g : x))
            else setGames((p) => p.some((x) => x.id === g.id) ? p : [...p, g])
            setModal(null); setEditItem(null); setDuplicateFrom(null)
          }}
        />
      )}
      {modal === 'team' && (
        <CreateTeamModal eventId={id} team={editItem}
          onClose={() => { setModal(null); setEditItem(null) }}
          onSave={(t) => {
            if (editItem) setTeams((p) => p.map((x) => x.id === t.id ? t : x))
            else setTeams((p) => p.some((x) => x.id === t.id) ? p : [...p, t])
            setModal(null); setEditItem(null)
          }}
        />
      )}
      {modal === 'member' && (
        <AddEventMemberModal eventId={id} member={editItem} teams={teams}
          onClose={() => { setModal(null); setEditItem(null) }}
          onSave={(m) => {
            if (editItem) setMembers((p) => p.map((x) => x.user_id === m.user_id ? m : x))
            else setMembers((p) => p.some((x) => x.user_id === m.user_id) ? p : [...p, m])
            setModal(null); setEditItem(null)
          }}
        />
      )}
      {modal === 'bulk-member' && (
        <BulkAddMembersModal eventId={id}
          onClose={() => setModal(null)}
          onSave={(newMembers) => {
            setMembers((p) => {
              let updated = [...p]
              for (const m of newMembers) {
                const idx = updated.findIndex((x) => x.user_id === m.user_id)
                if (idx >= 0) updated[idx] = m
                else updated.push(m)
              }
              return updated
            })
          }}
        />
      )}
    </div>
  )
}
