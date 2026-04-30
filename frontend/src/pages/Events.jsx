import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { listEvents, deleteEvent, updateEventStatus } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useWS } from '../context/WSContext'
import toast from 'react-hot-toast'
import CreateEventModal from '../components/modals/CreateEventModal'
import ConfirmModal from '../components/modals/ConfirmModal'

const eventEmoji = {
  athletics: '🏃', tournament: '🏆', swimming: '🏊', cycling: '🚴',
  football: '⚽', basketball: '🏀', tennis: '🎾', volleyball: '🏐',
  cricket: '🏏', baseball: '⚾', rugby: '🏉', golf: '⛳',
  boxing: '🥊', wrestling: '🤼', gymnastics: '🤸', 'multi-sport': '🏆', other: '🎯',
}

const STATUS_FLOW  = { upcoming: 'active', active: 'completed' }
const STATUS_LABEL = { upcoming: 'Start Event', active: 'Mark Complete' }
const FILTERS      = ['all', 'mine', 'upcoming', 'active', 'completed']

function highlight(text, query) {
  if (!query || !text) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-400/30 text-yellow-200 rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function matchesSearch(ev, q) {
  if (!q) return true
  const lower = q.toLowerCase()
  return (
    ev.name?.toLowerCase().includes(lower) ||
    ev.event_type?.toLowerCase().includes(lower) ||
    ev.location?.toLowerCase().includes(lower) ||
    ev.description?.toLowerCase().includes(lower)
  )
}

// ── Grid card ─────────────────────────────────────────────────────────────────
function GridCard({ ev, isOwner, isAdmin, query, onEdit, onDelete, onStatusChange }) {
  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{eventEmoji[ev.event_type] || '🎯'}</span>
          {isOwner && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 leading-none">Mine</span>
          )}
        </div>
        <span className={`badge badge-${ev.status}`}>{ev.status}</span>
      </div>
      <Link to={`/events/${ev.id}`} className="group">
        <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors line-clamp-1">
          {highlight(ev.name, query)}
        </h3>
      </Link>
      <p className="text-xs text-slate-400 mt-1 capitalize">{highlight(ev.event_type, query)}</p>
      {ev.location && <p className="text-xs text-slate-500 mt-1">📍 {highlight(ev.location, query)}</p>}
      <p className="text-xs text-slate-500 mt-1">📅 {ev.start_date}{ev.end_date ? ` – ${ev.end_date}` : ''}</p>
      {ev.description && <p className="text-xs text-slate-400 mt-2 line-clamp-2">{highlight(ev.description, query)}</p>}
      <div className="mt-auto pt-4 flex gap-2 flex-wrap">
        <Link to={`/events/${ev.id}`} className="btn-secondary btn-sm flex-1 text-center">View</Link>
        {isAdmin && STATUS_FLOW[ev.status] && (
          <button className="btn-success btn-sm flex-1" onClick={() => onStatusChange(ev)}>
            {STATUS_LABEL[ev.status]}
          </button>
        )}
        {isAdmin && (
          <>
            <button className="btn-secondary btn-sm" onClick={() => onEdit(ev)}>✏️</button>
            <button className="btn-danger btn-sm" onClick={() => onDelete(ev.id)}>🗑️</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── List row ──────────────────────────────────────────────────────────────────
function ListRow({ ev, isOwner, isAdmin, query, onEdit, onDelete, onStatusChange }) {
  return (
    <div className="card px-5 py-4 flex items-center gap-4 hover:border-slate-500 transition-colors">
      <span className="text-2xl shrink-0">{eventEmoji[ev.event_type] || '🎯'}</span>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/events/${ev.id}`} className="font-semibold text-white hover:text-blue-400 transition-colors truncate">
            {highlight(ev.name, query)}
          </Link>
          <span className={`badge badge-${ev.status} shrink-0`}>{ev.status}</span>
          {isOwner && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 leading-none shrink-0">Mine</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs text-slate-400 capitalize">{highlight(ev.event_type, query)}</span>
          {ev.location && <span className="text-xs text-slate-500">📍 {highlight(ev.location, query)}</span>}
          <span className="text-xs text-slate-500">📅 {ev.start_date}{ev.end_date ? ` – ${ev.end_date}` : ''}</span>
        </div>
        {ev.description && (
          <p className="text-xs text-slate-400 mt-1 line-clamp-1">{highlight(ev.description, query)}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 shrink-0">
        <Link to={`/events/${ev.id}`} className="btn-secondary btn-sm">View</Link>
        {isAdmin && STATUS_FLOW[ev.status] && (
          <button className="btn-success btn-sm" onClick={() => onStatusChange(ev)}>
            {STATUS_LABEL[ev.status]}
          </button>
        )}
        {isAdmin && (
          <>
            <button className="btn-secondary btn-sm" onClick={() => onEdit(ev)}>✏️</button>
            <button className="btn-danger btn-sm" onClick={() => onDelete(ev.id)}>🗑️</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, events, view, ...cardProps }) {
  if (events.length === 0) return null
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</h2>
      <EventList events={events} view={view} {...cardProps} />
    </section>
  )
}

function EventList({ events, view, ...cardProps }) {
  if (view === 'list') {
    return (
      <div className="space-y-2">
        {events.map((ev) => <ListRow key={ev.id} ev={ev} isOwner={ev.created_by === cardProps.user?.id} {...cardProps} />)}
      </div>
    )
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {events.map((ev) => <GridCard key={ev.id} ev={ev} isOwner={ev.created_by === cardProps.user?.id} {...cardProps} />)}
    </div>
  )
}

// ── View toggle button ────────────────────────────────────────────────────────
function ViewToggle({ view, onChange }) {
  return (
    <div className="flex rounded-lg border border-slate-600 overflow-hidden">
      <button
        onClick={() => onChange('grid')}
        title="Grid view"
        className={`px-3 py-1.5 text-sm transition-colors ${
          view === 'grid' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
        }`}
      >
        ⊞
      </button>
      <button
        onClick={() => onChange('list')}
        title="List view"
        className={`px-3 py-1.5 text-sm transition-colors border-l border-slate-600 ${
          view === 'list' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
        }`}
      >
        ☰
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Events() {
  const { user, isAdmin } = useAuth()
  const { subscribe } = useWS()
  const [events, setEvents]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('all')
  const [query, setQuery]           = useState('')
  const [view, setView]             = useState(() => localStorage.getItem('pt_events_view') || 'grid')
  const [showCreate, setShowCreate] = useState(false)
  const [editEvent, setEditEvent]   = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const changeView = (v) => { setView(v); localStorage.setItem('pt_events_view', v) }

  const load = () =>
    listEvents().then((r) => setEvents(r.data)).finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  useEffect(() => {
    const subs = [
      subscribe('event_created',        (msg) => setEvents((p) => p.some((e) => e.id === msg.data.id) ? p : [msg.data, ...p])),
      subscribe('event_updated',        (msg) => setEvents((p) => p.map((e) => e.id === msg.data.id ? msg.data : e))),
      subscribe('event_status_changed', (msg) => setEvents((p) => p.map((e) => e.id === msg.data.id ? msg.data : e))),
    ]
    return () => subs.forEach((u) => u())
  }, [subscribe])

  const handleConfirm = async () => {
    setConfirmLoading(true)
    try {
      await confirmAction.fn()
      setConfirmAction(null)
    } catch (err) {
      toast.error(err.response?.data?.error || confirmAction.errorMsg || 'Action failed')
    } finally {
      setConfirmLoading(false)
    }
  }

  const handleDelete = (id) => {
    setConfirmAction({
      title: 'Delete Event',
      message: 'Delete this event and all its data? This action cannot be undone.',
      confirmLabel: 'Delete',
      errorMsg: 'Failed to delete',
      fn: async () => {
        await deleteEvent(id)
        setEvents((p) => p.filter((e) => e.id !== id))
        toast.success('Event deleted')
      },
    })
  }

  const handleStatusChange = async (ev) => {
    const next = STATUS_FLOW[ev.status]
    if (!next) return
    try {
      const { data } = await updateEventStatus(ev.id, next)
      setEvents((p) => p.map((e) => e.id === data.id ? data : e))
      toast.success(`Event marked as ${next}`)
    } catch { toast.error('Failed to update status') }
  }

  const handleEdit = (ev) => { setEditEvent(ev); setShowCreate(true) }

  const searched    = useMemo(() => events.filter((e) => matchesSearch(e, query)), [events, query])
  const myEvents    = useMemo(() => searched.filter((e) => e.created_by === user?.id), [searched, user])
  const otherEvents = useMemo(() => searched.filter((e) => e.created_by !== user?.id), [searched, user])

  const filtered = useMemo(() => {
    if (filter === 'all')  return null
    if (filter === 'mine') return myEvents
    return searched.filter((e) => e.status === filter)
  }, [filter, myEvents, searched])

  const filterCount = (f) => {
    if (f === 'all')  return searched.length
    if (f === 'mine') return myEvents.length
    return searched.filter((e) => e.status === f).length
  }

  const cardProps = { user, isAdmin, view, query, onEdit: handleEdit, onDelete: handleDelete, onStatusChange: handleStatusChange }
  const noResults = searched.length === 0

  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Events</h1>
        <div className="flex items-center gap-3">
          <ViewToggle view={view} onChange={changeView} />
          <button className="btn-primary" onClick={() => { setEditEvent(null); setShowCreate(true) }}>
            + New Event
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">🔍</span>
        <input
          className="input pl-9 w-full"
          placeholder="Search by name, type, location, or description…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {f === 'mine' ? 'My Events' : f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1.5 text-xs opacity-70">{filterCount(f)}</span>
          </button>
        ))}
      </div>

      {/* Search summary */}
      {query && (
        <p className="text-sm text-slate-400">
          {noResults
            ? `No events match "${query}"`
            : `${searched.length} event${searched.length !== 1 ? 's' : ''} matching "${query}"`}
        </p>
      )}

      {/* Content */}
      {events.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-3">🏟️</div>
          <p className="text-white font-semibold text-lg">No events yet</p>
          <p className="text-slate-400 text-sm mt-1 mb-6">Be the first to create one.</p>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>Create Event</button>
        </div>
      ) : noResults ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-3">🔍</div>
          <p className="text-white font-semibold">No events found</p>
          <p className="text-slate-400 text-sm mt-1">Try a different search term or clear the search.</p>
          <button className="btn-secondary mt-4" onClick={() => setQuery('')}>Clear Search</button>
        </div>
      ) : filtered !== null ? (
        filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-3">🗂️</div>
            <p className="text-slate-400">No events match this filter{query ? ' and search' : ''}</p>
          </div>
        ) : (
          <EventList events={filtered} {...cardProps} />
        )
      ) : (
        <div className="space-y-8">
          <Section title="My Events"    events={myEvents}    {...cardProps} />
          <Section title="Other Events" events={otherEvents} {...cardProps} />
        </div>
      )}

      {showCreate && (
        <CreateEventModal
          event={editEvent}
          onClose={() => { setShowCreate(false); setEditEvent(null) }}
          onSave={(ev) => {
            if (editEvent) setEvents((p) => p.map((e) => e.id === ev.id ? ev : e))
            else setEvents((p) => [ev, ...p])
            setShowCreate(false)
            setEditEvent(null)
          }}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          loading={confirmLoading}
          onConfirm={handleConfirm}
          onClose={() => !confirmLoading && setConfirmAction(null)}
        />
      )}
    </div>
  )
}
