import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getGame, getEvent, getGameResult, listGameParticipants, listTeams,
  deleteParticipant, recordResult,
} from '../services/api'
import { getEventMembers } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useWS } from '../context/WSContext'
import toast from 'react-hot-toast'
import RecordResultModal from '../components/modals/RecordResultModal'
import AddParticipantModal from '../components/modals/AddParticipantModal'
import ConfirmModal from '../components/modals/ConfirmModal'

const positionBadge = (pos) => {
  if (pos === 1) return '🥇'
  if (pos === 2) return '🥈'
  if (pos === 3) return '🥉'
  return `#${pos}`
}

function TeamAvatar({ team }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm shrink-0 overflow-hidden"
      style={{ backgroundColor: team.color || '#3b82f6' }}
    >
      {team.logo_url && !imgError ? (
        <img src={team.logo_url} alt={team.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
      ) : (
        <span>{team.name?.charAt(0)?.toUpperCase()}</span>
      )}
    </div>
  )
}

export default function GameDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { subscribe } = useWS()

  const [game, setGame]               = useState(null)
  const [event, setEvent]             = useState(null)
  const [result, setResult]           = useState(null)
  const [participants, setParticipants] = useState([])
  const [teams, setTeams]             = useState([])
  const [members, setMembers]         = useState([])
  const [tab, setTab]                 = useState('participants')
  const [loading, setLoading]         = useState(true)
  const [showRecord, setShowRecord]   = useState(false)
  const [showAddParticipant, setShowAddParticipant] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const load = async () => {
    try {
      const gameData = await getGame(id)
      const g = gameData.data
      setGame(g)
      const [res, parts, tms, mem, ev] = await Promise.all([
        getGameResult(id).catch(() => ({ data: null })),
        listGameParticipants(id),
        listTeams(g.event_id),
        getEventMembers(g.event_id).catch(() => ({ data: [] })),
        getEvent(g.event_id).catch(() => ({ data: null })),
      ])
      setResult(res.data)
      setParticipants(parts.data)
      setTeams(tms.data)
      setMembers(mem.data)
      setEvent(ev.data)
    } catch {
      toast.error('Failed to load game')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    const subs = [
      subscribe('participant_added', (m) => {
        if (m.data?.game_id !== id) return
        setParticipants((p) => p.some((x) => x.id === m.data.id) ? p : [...p, m.data])
      }),
      subscribe('result_update', (m) => {
        if (m.game_id === id) { setResult(m.data); toast.success('Results updated!', { icon: '📊' }) }
      }),
      subscribe('game_updated', (m) => {
        if (m.game_id === id) setGame(m.data)
      }),
      subscribe('game_status_changed', (m) => {
        if (m.game_id === id) setGame(m.data)
      }),
    ]
    return () => subs.forEach((u) => u())
  }, [subscribe, id])

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

  const handleDeleteParticipant = (pId) => {
    setConfirmAction({
      title: 'Remove Participant',
      message: 'Remove this participant from the game?',
      confirmLabel: 'Remove',
      errorMsg: 'Failed to remove participant',
      fn: async () => {
        await deleteParticipant(pId)
        setParticipants((p) => p.filter((x) => x.id !== pId))
        toast.success('Participant removed')
      },
    })
  }

  const teamOf = (teamId) => teams.find((t) => t.id === teamId)
  const teamName = (teamId) => teamOf(teamId)?.name || '—'

  const getName = (entry) => {
    if (entry.participant_name) return entry.participant_name
    if (entry.participant_type === 'team') return teamName(entry.participant_id)
    return participants.find((p) => p.id === entry.participant_id)?.name || 'Participant'
  }

  const allEntries = result?.entries ?? []
  const sortedEntries = [...allEntries].sort((a, b) => a.position - b.position)
  const individualEntries = sortedEntries.filter((e) => e.participant_type !== 'team')
  const teamEntries = sortedEntries.filter((e) => e.participant_type === 'team')

  // Assigned teams for team games (from game.team_ids)
  const assignedTeams = game?.team_ids?.length
    ? teams.filter((t) => game.team_ids.includes(t.id))
    : []

  const isTeamGame = game?.game_mode === 'team'

  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!game) return <div className="text-center py-24 text-slate-400">Game not found</div>

  const tabs = isTeamGame ? ['teams', 'results'] : ['participants', 'results']

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <Link to={`/events/${game.event_id}`} className="text-slate-400 hover:text-white text-sm">← Back to Event</Link>
          <span className={`badge badge-${game.status}`}>{game.status}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${
            isTeamGame
              ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
              : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
          }`}>
            {isTeamGame ? '🤝 Team' : '🏃 Individual'}
          </span>
          {result && (
            <span className={`badge ${result.status === 'final' ? 'badge-completed' : 'badge-active'}`}>
              {result.status === 'final' ? '✓ Final' : '⏳ Partial'}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-white">
          {game.name}
          {game.age_restricted && (
            <span className="ml-2 text-base font-normal text-slate-400">({game.age_from}–{game.age_to})</span>
          )}
        </h1>
        <p className="text-slate-400 text-sm mt-1 capitalize">{game.game_type}</p>
        {game.venue && <p className="text-slate-500 text-sm">📍 {game.venue}</p>}
        {game.scheduled_at && <p className="text-slate-500 text-sm">🕐 {new Date(game.scheduled_at).toLocaleString()}</p>}
        {game.description && <p className="text-slate-300 text-sm mt-2">{game.description}</p>}

        {/* Stats */}
        <div className="flex gap-3 mt-4 flex-wrap">
          {isTeamGame
            ? <div className="card px-4 py-2"><div className="text-lg font-bold text-white">{assignedTeams.length}</div><div className="text-xs text-slate-400">Teams</div></div>
            : <div className="card px-4 py-2"><div className="text-lg font-bold text-white">{participants.length}</div><div className="text-xs text-slate-400">Participants</div></div>
          }
          <div className="card px-4 py-2">
            <div className="text-lg font-bold text-white">{individualEntries.length || (isTeamGame ? sortedEntries.length : 0)}</div>
            <div className="text-xs text-slate-400">Results</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap capitalize ${
              tab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Participants Tab — individual game */}
      {tab === 'participants' && !isTeamGame && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-400">{participants.length} participant{participants.length !== 1 ? 's' : ''}</p>
            <button className="btn-primary" onClick={() => setShowAddParticipant(true)}>+ Add Participant</button>
          </div>

          {participants.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🏃</div>
              <p className="text-slate-400">No participants added yet.</p>
              <button className="btn-primary mt-4" onClick={() => setShowAddParticipant(true)}>Add First Participant</button>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Team</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Sport</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Bib #</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Age</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-600">
                  {participants.map((p) => {
                    const t = teamOf(p.team_id)
                    return (
                      <tr key={p.id} className="hover:bg-slate-600/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{p.name}</div>
                          {p.email && <div className="text-xs text-slate-500">{p.email}</div>}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {t ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color || '#3b82f6' }} />
                              <span className="text-slate-300 text-xs">{t.name}</span>
                            </span>
                          ) : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-slate-400">{p.sport || '—'}</td>
                        <td className="px-4 py-3 hidden md:table-cell text-slate-400">{p.bib_number || '—'}</td>
                        <td className="px-4 py-3 hidden lg:table-cell text-slate-400">{p.age || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button className="btn-danger btn-sm" onClick={() => handleDeleteParticipant(p.id)}>🗑️</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Teams Tab — team game */}
      {tab === 'teams' && isTeamGame && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">{assignedTeams.length} team{assignedTeams.length !== 1 ? 's' : ''} assigned to this game</p>
          {assignedTeams.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🤝</div>
              <p className="text-slate-400">No teams assigned.</p>
              <Link to={`/events/${game.event_id}`} className="btn-secondary mt-4 inline-block">
                Edit Game in Event
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {assignedTeams.map((team) => {
                const count = participants.filter((p) => p.team_id === team.id).length
                return (
                  <div key={team.id} className="card p-5 flex items-center gap-3">
                    <TeamAvatar team={team} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white truncate">{team.name}</div>
                      {team.description && <div className="text-xs text-slate-400 truncate">{team.description}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Results Tab */}
      {tab === 'results' && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">Results</h2>
              {game.status === 'active' && (
                <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />Live
                </span>
              )}
            </div>
            <button className="btn-primary" onClick={() => setShowRecord(true)}>
              {result ? '✏️ Update Results' : '📊 Record Results'}
            </button>
          </div>

          {!result || sortedEntries.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-3">📊</div>
              <p className="text-slate-400">No results recorded yet.</p>
              <button className="btn-primary mt-4" onClick={() => setShowRecord(true)}>Record Results</button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Individual / team-game rankings */}
              <div className="space-y-3">
                {(isTeamGame ? sortedEntries : individualEntries).map((entry, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-4 p-4 rounded-lg border ${
                      entry.position === 1 ? 'bg-amber-500/10 border-amber-500/30'
                      : entry.position === 2 ? 'bg-slate-400/10 border-slate-400/30'
                      : entry.position === 3 ? 'bg-orange-500/10 border-orange-500/30'
                      : 'bg-slate-700 border-slate-600'
                    }`}
                  >
                    <div className="text-2xl w-10 text-center shrink-0">{positionBadge(entry.position)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white truncate">{getName(entry)}</div>
                      {entry.notes && <div className="text-xs text-slate-500 truncate">{entry.notes}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xl font-bold text-white">{entry.score}</div>
                      {entry.time && <div className="text-xs text-slate-400">{entry.time}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Team standings — only for individual games where participants have teams */}
              {!isTeamGame && teamEntries.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Team Standings</h3>
                  <div className="space-y-2">
                    {teamEntries.map((entry, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-4 p-3 rounded-lg border ${
                          entry.position === 1 ? 'bg-amber-500/10 border-amber-500/30'
                          : entry.position === 2 ? 'bg-slate-400/10 border-slate-400/30'
                          : entry.position === 3 ? 'bg-orange-500/10 border-orange-500/30'
                          : 'bg-slate-700 border-slate-600'
                        }`}
                      >
                        <div className="text-xl w-8 text-center shrink-0">{positionBadge(entry.position)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white truncate">{entry.participant_name}</div>
                          <div className="text-xs text-slate-500">Combined score</div>
                        </div>
                        <div className="text-xl font-bold text-white shrink-0">{entry.score}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {result && (
            <p className="text-xs text-slate-500 mt-4">
              Last updated: {new Date(result.updated_at).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Modals */}
      {showAddParticipant && (
        <AddParticipantModal
          gameId={id}
          game={game}
          teams={teams}
          members={members}
          participants={participants}
          onClose={() => setShowAddParticipant(false)}
          onSave={(p) => {
            setParticipants((prev) => prev.some((x) => x.id === p.id) ? prev : [...prev, p])
            setShowAddParticipant(false)
          }}
        />
      )}
      {showRecord && (
        <RecordResultModal
          game={game}
          existingResult={result}
          participants={participants}
          teams={isTeamGame ? assignedTeams : teams}
          pointSystem={event?.point_system ?? []}
          onClose={() => setShowRecord(false)}
          onSave={(r, cancelledGame) => {
            if (cancelledGame) { setGame(cancelledGame) }
            else { setResult(r) }
            setShowRecord(false)
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
