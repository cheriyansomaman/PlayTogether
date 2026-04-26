import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getPublicEvent } from '../services/api'

const sportEmoji = {
  athletics: '🏃', swimming: '🏊', cycling: '🚴', football: '⚽', basketball: '🏀',
  tennis: '🎾', volleyball: '🏐', cricket: '🏏', baseball: '⚾', rugby: '🏉',
  golf: '⛳', boxing: '🥊', wrestling: '🤼', gymnastics: '🤸', 'multi-sport': '🏆',
  other: '🎯',
}

const positionBadge = (pos) => {
  if (pos === 1) return '🥇'
  if (pos === 2) return '🥈'
  if (pos === 3) return '🥉'
  return `#${pos}`
}

// ── Aggregation helpers ───────────────────────────────────────────────────────
function buildTeamLeaderboard(results, teamMap) {
  const scores = {}
  for (const r of results) {
    for (const entry of r.entries || []) {
      if (entry.participant_type !== 'team') continue
      const key = entry.participant_id || entry.participant_name
      if (!scores[key]) {
        const team = teamMap[entry.participant_id] || {}
        scores[key] = { id: entry.participant_id, name: team.name || entry.participant_name, color: team.color || '#3b82f6', total: 0, wins: 0, games: 0 }
      }
      scores[key].total += entry.score || 0
      scores[key].games++
      if (entry.position === 1) scores[key].wins++
    }
  }
  return Object.values(scores).sort((a, b) => b.total - a.total)
}

function buildIndividualLeaderboard(results) {
  const scores = {}
  for (const r of results) {
    for (const entry of r.entries || []) {
      if (entry.participant_type === 'team') continue
      const key = entry.participant_name || entry.participant_id
      if (!key) continue
      if (!scores[key]) scores[key] = { name: key, total: 0, wins: 0, games: 0 }
      scores[key].total += entry.score || 0
      scores[key].games++
      if (entry.position === 1) scores[key].wins++
    }
  }
  return Object.values(scores).sort((a, b) => b.total - a.total).slice(0, 3)
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
  if (status === 'upcoming') return <span className="text-xs text-slate-400 font-medium">Upcoming</span>
  return <span className="text-xs text-slate-500 font-medium">Completed</span>
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
      {game.venue && <div className="text-xs text-slate-500 mb-1">📍 {game.venue}</div>}
      {game.scheduled_at && (
        <div className="text-xs text-slate-500 mb-2">🕐 {new Date(game.scheduled_at).toLocaleString()}</div>
      )}
      {entries.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-slate-600 pt-2">
          {entries.slice(0, 3).map((entry, i) => {
            const name = entry.participant_name ||
              (entry.participant_type === 'team' ? teamMap[entry.participant_id]?.name : null) ||
              'Participant'
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-center">{positionBadge(entry.position)}</span>
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

  // Auto-refresh every 30 s when event is active
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
      <div className="text-5xl">🔗</div>
      <h1 className="text-xl font-bold text-white">Link Not Found</h1>
      <p className="text-slate-400 text-sm text-center">{error}</p>
      <Link to="/events" className="btn-primary mt-2">Browse Events</Link>
    </div>
  )

  const { event, games = [], teams = [], results = [] } = data

  const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]))
  const liveGames      = games.filter((g) => g.status === 'active')
  const upcomingGames  = games.filter((g) => g.status === 'scheduled' || g.status === 'upcoming')
  const completedGames = games.filter((g) => g.status === 'completed')

  const teamLeaderboard = buildTeamLeaderboard(results, teamMap)
  const topIndividuals  = buildIndividualLeaderboard(results)
  const emoji = sportEmoji[event.event_type] || '🎯'

  return (
    <div className="min-h-screen bg-slate-800">
      {/* Top bar */}
      <div className="border-b border-slate-600 bg-slate-700/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl shrink-0">{emoji}</span>
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
            <div className="text-6xl sm:text-7xl">{emoji}</div>
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
                {event.location && <span>📍 {event.location}</span>}
                <span>📅 {event.start_date}{event.end_date ? ` – ${event.end_date}` : ''}</span>
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

        {/* Team leaderboard + Top 3 individuals */}
        {(teamLeaderboard.length > 0 || topIndividuals.length > 0) && (
          <div className="grid lg:grid-cols-2 gap-6">

            {teamLeaderboard.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-white mb-4">Team Points Table</h2>
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-3 text-left">Team</th>
                        <th className="px-4 py-3 text-center">W</th>
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
                          <td className="px-4 py-3 text-center text-emerald-400 font-semibold">{t.wins}</td>
                          <td className="px-4 py-3 text-center text-slate-400 hidden sm:table-cell">{t.games}</td>
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
                <h2 className="text-lg font-semibold text-white mb-4">Top Performers</h2>
                <div className="card divide-y divide-slate-600">
                  {topIndividuals.map((ind, i) => (
                    <div key={ind.name} className={`flex items-center gap-4 px-5 py-4 ${i === 0 ? 'bg-amber-500/5' : ''}`}>
                      <div className="text-2xl w-10 text-center shrink-0">{positionBadge(i + 1)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white truncate">{ind.name}</div>
                        <div className="text-xs text-slate-500">
                          {ind.wins} win{ind.wins !== 1 ? 's' : ''} · {ind.games} game{ind.games !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl font-bold text-white">{ind.total}</div>
                        <div className="text-xs text-slate-500">pts</div>
                      </div>
                    </div>
                  ))}
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

        {games.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <div className="text-4xl mb-3">📋</div>
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
