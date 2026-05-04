import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getPublicEvent } from '../services/api'
import { SportIcon, PositionBadge } from '../utils/sportIcons'
import { MapPin, Clock3, Calendar, Link as LinkIcon, ClipboardList } from 'lucide-react'

const DEFAULT_POINT_SYSTEM = [
  { rank: 1, rank_name: 'Gold',   points: 3 },
  { rank: 2, rank_name: 'Silver', points: 2 },
  { rank: 3, rank_name: 'Bronze', points: 1 },
]

// ── Aggregation helpers ───────────────────────────────────────────────────────
function buildTeamLeaderboard(results, teamMap) {
  const scores = {}
  for (const r of results) {
    for (const entry of r.entries || []) {
      if (entry.participant_type !== 'team') continue
      const key = entry.participant_id || entry.participant_name
      if (!scores[key]) {
        const team = teamMap[entry.participant_id] || {}
        scores[key] = { id: entry.participant_id, name: team.name || entry.participant_name, color: team.color || '#3b82f6', total: 0, game_count: 0, rank_counts: {} }
      }
      scores[key].total += entry.score || 0
      scores[key].game_count++
      if (entry.position) {
        scores[key].rank_counts[entry.position] = (scores[key].rank_counts[entry.position] || 0) + 1
      }
    }
  }
  return Object.values(scores).sort((a, b) => b.total - a.total)
}

function buildIndividualLeaderboard(results, teamMap) {
  const scores = {}
  for (const r of results) {
    const teamByPos = {}
    for (const entry of r.entries || []) {
      if (entry.participant_type === 'team') {
        const team = teamMap[entry.participant_id]
        teamByPos[entry.position] = { color: team?.color || null, name: team?.name || entry.participant_name }
      }
    }
    for (const entry of r.entries || []) {
      if (entry.participant_type === 'team') continue
      const key = entry.participant_name || entry.participant_id
      if (!key) continue
      if (!scores[key]) scores[key] = { name: key, team_color: null, team_name: null, total: 0, game_count: 0, rank_counts: {} }
      scores[key].total += entry.score || 0
      scores[key].game_count++
      if (entry.position) {
        scores[key].rank_counts[entry.position] = (scores[key].rank_counts[entry.position] || 0) + 1
        if (!scores[key].team_color && teamByPos[entry.position]?.color) {
          scores[key].team_color = teamByPos[entry.position].color
          scores[key].team_name = teamByPos[entry.position].name
        }
      }
    }
  }
  return Object.values(scores).sort((a, b) => b.total - a.total)
}

function getRankColumns(event) {
  const ps = event?.point_system
  if (ps?.length > 0 && ps.some(r => r.rank_name)) return ps
  return DEFAULT_POINT_SYSTEM
}

function getRankPositionLabel(i, rankColumns) {
  const rule = rankColumns.find(r => r.rank === i + 1)
  return rule?.rank_name || `#${i + 1}`
}

function getGameResult(results, gameId) {
  return results.find((r) => r.game_id === gameId)
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusDot({ status }) {
  if (status === 'active') return (
    <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /> Live
    </span>
  )
  if (status === 'scheduled') return <span className="text-xs text-slate-400 font-medium">Scheduled</span>
  if (status === 'cancelled') return <span className="text-xs text-red-400 font-medium">Cancelled</span>
  if (status === 'completed') return <span className="text-xs text-slate-500 font-medium">Completed</span>
  return <span className="text-xs text-slate-400 font-medium capitalize">{status}</span>
}

function GameCard({ game, result, teamMap }) {
  const isLive = game.status === 'active'
  const isDone = game.status === 'completed'
  const entries = [...(result?.entries || [])].sort((a, b) => a.position - b.position)

  return (
    <div className={`card p-4 ${isLive ? 'border-emerald-500/40 bg-emerald-500/5' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-semibold text-white truncate">
            {game.name}
            {game.age_restricted && (
              <span className="ml-1.5 text-xs font-normal text-slate-400">({game.age_from}–{game.age_to})</span>
            )}
          </div>
          <div className="text-xs text-slate-500 capitalize">{game.game_type}</div>
        </div>
        <StatusDot status={game.status} />
      </div>
      {game.venue && <div className="text-xs text-slate-500 mb-1"><MapPin size={12} className="inline mr-1 shrink-0" />{game.venue}</div>}
      {game.scheduled_at && (
        <div className="text-xs text-slate-500 mb-2"><Clock3 size={12} className="inline mr-1 shrink-0" />{new Date(game.scheduled_at).toLocaleString()}</div>
      )}
      {entries.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-slate-600 pt-2">
          {entries.slice(0, 3).map((entry, i) => {
            const name = entry.participant_name ||
              (entry.participant_type === 'team' ? teamMap[entry.participant_id]?.name : null) ||
              'Participant'
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-center"><PositionBadge position={entry.position} /></span>
                <span className="flex-1 text-slate-300 truncate">{name}</span>
                <span className="font-semibold text-white">{entry.score}</span>
                {entry.time && <span className="text-slate-500">{entry.time}</span>}
              </div>
            )
          })}
          {entries.length > 3 && (
            <div className="text-xs text-slate-500 text-center">+{entries.length - 3} more</div>
          )}
        </div>
      )}
      {isDone && entries.length === 0 && (
        <div className="text-xs text-slate-500 mt-1">No results recorded</div>
      )}
    </div>
  )
}

function EventLogo({ event, size = 'md' }) {
  const [err, setErr] = useState(false)
  const src = event?.logo_base64 || event?.logo_url
  if (!src || err) return null
  const cls = size === 'lg' ? 'w-14 h-14 rounded-xl' : size === 'sm' ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'
  return <img src={src} alt="event logo" className={`${cls} object-cover shrink-0`} onError={() => setErr(true)} />
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PublicEvent() {
  const { token } = useParams()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await getPublicEvent(token)
      setData(res.data)
      setLastRefresh(new Date())
      setError(null)
    } catch {
      setError('This share link is invalid or has been revoked.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!data?.event) return
    if (data.event.status !== 'active') return
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [data?.event?.status, load])

  if (loading) return (
    <div className="min-h-screen bg-slate-800 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-slate-800 flex flex-col items-center justify-center gap-4 px-4">
      <div className="text-slate-400"><LinkIcon size={48} /></div>
      <h1 className="text-xl font-bold text-white">Link Not Found</h1>
      <p className="text-slate-400 text-sm text-center">{error}</p>
      <Link to="/events" className="btn-primary mt-2">Browse Events</Link>
    </div>
  )

  const { event, games = [], teams = [], results = [] } = data

  const teamMap        = Object.fromEntries(teams.map((t) => [t.id, t]))
  const liveGames      = games.filter((g) => g.status === 'active')
  const upcomingGames  = games.filter((g) => g.status === 'scheduled')
  const completedGames = games.filter((g) => g.status === 'completed')
  const cancelledGames = games.filter((g) => g.status === 'cancelled')

  const teamLeaderboard = buildTeamLeaderboard(results, teamMap)
  const topIndividuals  = buildIndividualLeaderboard(results, teamMap)
  const rankColumns     = getRankColumns(event)

  const rankColor = (rank) =>
    rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-orange-400' : 'text-slate-400'

  return (
    <div className="min-h-screen bg-slate-800">
      {/* Top bar */}
      <div className="border-b border-slate-600 bg-slate-700/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <EventLogo event={event} size="sm" />
            {!(event.logo_base64 || event.logo_url) && <span className="shrink-0"><SportIcon sport={event.event_type} size={24} /></span>}
            <span className="font-semibold text-white truncate">{event.name}</span>
            <span className={`badge badge-${event.status} shrink-0`}>{event.status}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastRefresh && (
              <span className="text-xs text-slate-500 hidden sm:block">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button onClick={load} className="btn-secondary btn-sm">↻ Refresh</button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">

        {/* Event header */}
        <div className="card p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="shrink-0">
              {event.logo_base64 || event.logo_url
                ? <EventLogo event={event} size="lg" />
                : <SportIcon sport={event.event_type} size={56} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`badge badge-${event.status}`}>{event.status}</span>
                {event.status === 'active' && (
                  <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /> Live Updates
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">{event.name}</h1>
              <p className="text-slate-400 text-sm capitalize mb-3">{event.event_type?.replace(/-/g, ' ')}</p>
              <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                {event.location && <span><MapPin size={12} className="inline mr-1 shrink-0" />{event.location}</span>}
                <span><Calendar size={12} className="inline mr-1 shrink-0" />{event.start_date}{event.end_date ? ` – ${event.end_date}` : ''}</span>
              </div>
              {event.description && (
                <p className="text-slate-300 text-sm mt-3 leading-relaxed">{event.description}</p>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-600">
            <div className="text-center">
              <div className="text-xl font-bold text-white">{games.length}</div>
              <div className="text-xs text-slate-500">Games</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-emerald-400">{liveGames.length}</div>
              <div className="text-xs text-slate-500">Live</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-white">{teams.length}</div>
              <div className="text-xs text-slate-500">Teams</div>
            </div>
            <div className="text-center hidden sm:block">
              <div className="text-xl font-bold text-white">{completedGames.length}</div>
              <div className="text-xs text-slate-500">Completed</div>
            </div>
          </div>
        </div>

        {/* Live games */}
        {liveGames.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              Live Now
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveGames.map((g) => (
                <GameCard key={g.id} game={g} result={getGameResult(results, g.id)} teamMap={teamMap} />
              ))}
            </div>
          </section>
        )}

        {/* Leaderboards */}
        {(teamLeaderboard.length > 0 || topIndividuals.length > 0) && (
          <div className="grid lg:grid-cols-2 gap-6">

            {teamLeaderboard.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-white mb-4">Team Points Table</h2>
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-3 text-left">Team</th>
                        {rankColumns.map((r) => (
                          <th key={r.rank} className={`px-3 py-3 text-center ${rankColor(r.rank)}`}>
                            {r.rank_name}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-center hidden sm:table-cell">GP</th>
                        <th className="px-4 py-3 text-right">Pts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-600">
                      {teamLeaderboard.map((t, i) => (
                        <tr key={t.id || i} className={`${i === 0 ? 'bg-amber-500/5' : 'hover:bg-slate-600/30'} transition-colors`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                              <span className="font-medium text-white truncate">{t.name}</span>
                            </div>
                          </td>
                          {rankColumns.map((r) => (
                            <td key={r.rank} className={`px-3 py-3 text-center font-semibold ${rankColor(r.rank)}`}>
                              {t.rank_counts[r.rank] || 0}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-center text-slate-400 hidden sm:table-cell">{t.game_count}</td>
                          <td className="px-4 py-3 text-right font-bold text-white">{t.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {topIndividuals.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-white mb-4">Top 10 performers</h2>
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-3 text-left">Performer</th>
                        {rankColumns.map((r) => (
                          <th key={r.rank} className={`px-3 py-3 text-center ${rankColor(r.rank)}`}>
                            {r.rank_name}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-center hidden sm:table-cell">GP</th>
                        <th className="px-4 py-3 text-right">Pts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-600">
                      {topIndividuals.map((ind, i) => (
                        <tr key={ind.name} className={`${i === 0 ? 'bg-amber-500/5' : 'hover:bg-slate-600/30'} transition-colors`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                              {ind.team_color && <span className="w-2.5 h-2.5 rounded-full shrink-0 cursor-default" title={ind.team_name || ''} style={{ backgroundColor: ind.team_color }} />}
                              <span className="font-medium text-white truncate">{ind.name}</span>
                            </div>
                          </td>
                          {rankColumns.map((r) => (
                            <td key={r.rank} className={`px-3 py-3 text-center font-semibold ${rankColor(r.rank)}`}>
                              {ind.rank_counts[r.rank] || 0}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-center text-slate-400 hidden sm:table-cell">{ind.game_count}</td>
                          <td className="px-4 py-3 text-right font-bold text-white">{ind.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Upcoming games */}
        {upcomingGames.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Upcoming</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingGames.map((g) => (
                <GameCard key={g.id} game={g} result={null} teamMap={teamMap} />
              ))}
            </div>
          </section>
        )}

        {/* Completed games */}
        {completedGames.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Completed</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedGames.map((g) => (
                <GameCard key={g.id} game={g} result={getGameResult(results, g.id)} teamMap={teamMap} />
              ))}
            </div>
          </section>
        )}

        {/* Cancelled games */}
        {cancelledGames.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-slate-400 mb-4">Cancelled</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cancelledGames.map((g) => (
                <GameCard key={g.id} game={g} result={null} teamMap={teamMap} />
              ))}
            </div>
          </section>
        )}

        {games.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <div className="mb-3 flex justify-center"><ClipboardList size={40} /></div>
            <p>No games have been added to this event yet.</p>
          </div>
        )}

        <div className="text-center text-xs text-slate-600 pt-4 border-t border-slate-700">
          Powered by PlayTogether · Share link — read-only view
        </div>
      </div>
    </div>
  )
}
