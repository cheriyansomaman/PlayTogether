import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listEvents, getDashboard } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useWS } from '../context/WSContext'
import CreateEventModal from '../components/modals/CreateEventModal'
import { SportIcon } from '../utils/sportIcons'
import { Trophy, Target, Building2, Ticket, Medal, Award, ClipboardList, Clock3, CheckCircle } from 'lucide-react'

const ROLE_COLOR = {
  admin:  'text-purple-600 bg-purple-100 border-purple-300',
  member: 'text-blue-600 bg-blue-100 border-blue-300',
  viewer: 'text-gray-600 bg-gray-100 border-gray-300',
}

function welcomeKey(userId) { return `pt_welcomed_${userId}` }

// ── Welcome screen ────────────────────────────────────────────────────────────
function WelcomeScreen({ user, hasEvents, onCreateEvent, onJoinEvent, onViewEvents }) {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-900 to-indigo-900 z-50 flex flex-col items-center justify-center px-4">
      <div className="text-center mb-10">
        <div className="mb-4 text-blue-600"><Trophy size={56} /></div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-100">Welcome to PlayTogether</h1>
        <p className="text-gray-600 mt-2 text-base">
          Hello, <span className="text-gray-100 font-semibold">{user?.name}</span>! What would you like to do?
        </p>
      </div>
      <div className={`grid gap-5 w-full ${hasEvents ? 'sm:grid-cols-3 max-w-4xl' : 'sm:grid-cols-2 max-w-2xl'}`}>
        <button onClick={onCreateEvent} className="group card p-8 text-left hover:shadow-lg transition-all duration-200">
          <div className="mb-4 text-blue-500 group-hover:scale-110 transition-transform duration-200"><Building2 size={48} /></div>
          <h2 className="text-xl font-bold text-gray-100 mb-2">Create an Event</h2>
          <p className="text-gray-600 text-sm leading-relaxed">Set up a new sports event. Add games, teams, and participants — then track results live.</p>
          <div className="mt-5 inline-flex items-center gap-2 text-blue-600 text-sm font-medium group-hover:gap-3 transition-all">Get started <span>→</span></div>
        </button>
        <button onClick={onJoinEvent} className="group card p-8 text-left hover:shadow-lg transition-all duration-200">
          <div className="mb-4 text-emerald-500 group-hover:scale-110 transition-transform duration-200"><Target size={48} /></div>
          <h2 className="text-xl font-bold text-gray-100 mb-2">Join an Event</h2>
          <p className="text-gray-600 text-sm leading-relaxed">Browse events, follow live scores, and watch results update in real time.</p>
          <div className="mt-5 inline-flex items-center gap-2 text-emerald-600 text-sm font-medium group-hover:gap-3 transition-all">Browse events <span>→</span></div>
        </button>
        {hasEvents && (
          <button onClick={onViewEvents} className="group card p-8 text-left hover:shadow-lg transition-all duration-200">
            <div className="mb-4 text-purple-500 group-hover:scale-110 transition-transform duration-200"><Ticket size={48} /></div>
            <h2 className="text-xl font-bold text-gray-100 mb-2">View My Events</h2>
            <p className="text-gray-600 text-sm leading-relaxed">You've already been added to events. Jump back in and manage them.</p>
            <div className="mt-5 inline-flex items-center gap-2 text-purple-600 text-sm font-medium group-hover:gap-3 transition-all">Go to events <span>→</span></div>
          </button>
        )}
      </div>
      <p className="text-gray-500 text-xs mt-10">
        Signed in as <span className={`badge badge-${user?.role} ml-1`}>{user?.role}</span>
      </p>
    </div>
  )
}

// ── Shared stat card ──────────────────────────────────────────────────────────
function StatCard({ label, value, icon }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className="text-blue-500 shrink-0">{icon}</div>
      <div>
        <div className="text-2xl font-bold text-gray-100">{value}</div>
        <div className="text-xs text-gray-600">{label}</div>
      </div>
    </div>
  )
}

// ── Event card (admin/member view) ────────────────────────────────────────────
function EventCard({ event }) {
  return (
    <Link to={`/events/${event.id}`} className="card p-5 hover:shadow-xl transition-all block">
      <div className="flex items-start justify-between mb-3">
        <span className="text-blue-500"><SportIcon sport={event.event_type} size={24} /></span>
        <span className={`badge badge-${event.status}`}>{event.status}</span>
      </div>
      <h3 className="font-semibold text-gray-100 truncate">{event.name}</h3>
      <p className="text-xs text-gray-600 mt-1 truncate">{event.location || 'Location TBD'}</p>
      <p className="text-xs text-gray-500 mt-2">{event.start_date}{event.end_date ? ` – ${event.end_date}` : ''}</p>
    </Link>
  )
}

// ── Viewer: my joined event card ──────────────────────────────────────────────
function MyEventCard({ event, role }) {
  return (
    <Link to={`/events/${event.id}`} className="card p-4 hover:shadow-xl transition-all block">
      <div className="flex items-start justify-between mb-2">
        <span className="text-blue-500"><SportIcon sport={event.event_type} size={20} /></span>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${ROLE_COLOR[role] || ROLE_COLOR.viewer}`}>{role}</span>
          <span className={`badge badge-${event.status} text-xs`}>{event.status}</span>
        </div>
      </div>
      <h3 className="font-semibold text-gray-100 text-sm truncate">{event.name}</h3>
      <p className="text-xs text-gray-600 mt-1 truncate">{event.location || 'Location TBD'}</p>
      <p className="text-xs text-gray-500 mt-1">{event.start_date}{event.end_date ? ` – ${event.end_date}` : ''}</p>
    </Link>
  )
}

// ── Viewer dashboard ──────────────────────────────────────────────────────────
function ViewerDashboard({ user }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDashboard()
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!data) return (
    <div className="text-center py-24 text-gray-600">Failed to load your dashboard.</div>
  )

  const { my_events = [], my_participations = [] } = data
  const wins = my_participations.filter((p) => p.position === 1).length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Welcome back, {user?.name}</h1>
        <p className="text-gray-600 text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Personal stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Events Joined"   value={my_events.length}        icon={<Ticket size={28} />} />
        <StatCard label="Games Played"    value={my_participations.length} icon={<Medal size={28} />} />
        <StatCard label="Wins"            value={wins}                     icon={<Trophy size={28} />} />
        <StatCard label="Top-3 Finishes"  value={my_participations.filter((p) => p.position > 0 && p.position <= 3).length} icon={<Award size={28} />} />
      </div>

      {/* My events */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-100">My Events</h2>
          <Link to="/events" className="text-sm text-blue-600 hover:underline">Browse more →</Link>
        </div>
        {my_events.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="mb-3 text-gray-500 flex justify-center"><Ticket size={40} /></div>
            <p className="text-gray-600 text-sm">You haven't joined any events yet.</p>
            <Link to="/events" className="btn-primary mt-4 inline-block">Browse Events</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {my_events.map(({ event, role }) => (
              <MyEventCard key={event.id} event={event} role={role} />
            ))}
          </div>
        )}
      </section>

    </div>
  )
}

// ── Admin / Member dashboard (existing) ───────────────────────────────────────
function AdminDashboard({ user }) {
  const { subscribe } = useWS()
  const navigate = useNavigate()
  const [events, setEvents]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [showWelcome, setShowWelcome] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    if (!user) return
    const key = welcomeKey(user.id)
    if (!localStorage.getItem(key)) setShowWelcome(true)
  }, [user])

  useEffect(() => {
    listEvents().then((r) => setEvents(r.data)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const subs = [
      subscribe('event_created',        (m) => setEvents((p) => [m.data, ...p])),
      subscribe('event_updated',        (m) => setEvents((p) => p.map((e) => e.id === m.data.id ? m.data : e))),
      subscribe('event_status_changed', (m) => setEvents((p) => p.map((e) => e.id === m.data.id ? m.data : e))),
    ]
    return () => subs.forEach((u) => u())
  }, [subscribe])

  const dismissWelcome = () => { localStorage.setItem(welcomeKey(user.id), '1'); setShowWelcome(false) }

  const active    = events.filter((e) => e.status === 'active')
  const upcoming  = events.filter((e) => e.status === 'upcoming')
  const completed = events.filter((e) => e.status === 'completed')

  return (
    <>
      {showWelcome && (
        <WelcomeScreen
          user={user}
          hasEvents={events.length > 0}
          onCreateEvent={() => { dismissWelcome(); setShowCreateModal(true) }}
          onJoinEvent={() => { dismissWelcome(); navigate('/events') }}
          onViewEvents={() => { dismissWelcome(); navigate('/events') }}
        />
      )}
      {showCreateModal && (
        <CreateEventModal
          onClose={() => setShowCreateModal(false)}
          onSave={(ev) => { setEvents((p) => [ev, ...p]); setShowCreateModal(false); navigate(`/events/${ev.id}`) }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-100">Welcome back, {user?.name}</h1>
              <p className="text-gray-600 text-sm mt-1">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total Events" value={events.length} icon={<ClipboardList size={28} />} />
            <StatCard label="Active"       value={active.length}    icon={<span className="w-4 h-4 bg-emerald-400 rounded-full inline-block" />} />
            <StatCard label="Upcoming"     value={upcoming.length}  icon={<Clock3 size={28} />} />
            <StatCard label="Completed"    value={completed.length} icon={<CheckCircle size={28} />} />
          </div>

          {active.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Live Events
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {active.map((ev) => <EventCard key={ev.id} event={ev} />)}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-100">Upcoming Events</h2>
                <Link to="/events" className="text-sm text-blue-600 hover:underline">View all →</Link>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcoming.slice(0, 3).map((ev) => <EventCard key={ev.id} event={ev} />)}
              </div>
            </section>
          )}

          {completed.length > 0 && upcoming.length === 0 && active.length === 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-100 mb-4">Recent Events</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {completed.slice(0, 3).map((ev) => <EventCard key={ev.id} event={ev} />)}
              </div>
            </section>
          )}

          {events.length === 0 && (
            <div className="text-center py-24">
              <div className="mb-4 text-gray-500 flex justify-center"><Building2 size={56} /></div>
              <h3 className="text-xl font-semibold text-gray-100">No events yet</h3>
              <p className="text-gray-600 mt-2 mb-6">Create your first sports event to get started.</p>
              <div className="flex gap-3 justify-center">
                <button className="btn-primary" onClick={() => setShowCreateModal(true)}>Create Event</button>
                <Link to="/events" className="btn-secondary">Browse Events</Link>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── Entry point ───────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth()

  // System-level user role 'user' means a regular viewer/participant
  const isViewer = user?.role === 'user'

  if (isViewer) return <ViewerDashboard user={user} />
  return <AdminDashboard user={user} />
}
