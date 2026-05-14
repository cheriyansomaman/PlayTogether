import { useEffect, useState } from 'react'
import { getAuditLog } from '../services/api'
import toast from 'react-hot-toast'

const PAGE_SIZE = 10

const OP_LABEL = { I: 'Created', U: 'Updated', D: 'Deleted' }
const OP_COLOR = {
  I: 'bg-green-500/20 text-green-300 border-green-500/30',
  U: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  D: 'bg-red-500/20 text-red-300 border-red-500/30',
}

const TABLE_LABEL = {
  pt_users:                    'User',
  pt_events:                   'Event',
  pt_event_members:            'Member',
  pt_event_games:              'Game',
  pt_event_teams:              'Team',
  pt_event_game_participants:  'Participant',
  pt_event_join_requests:      'Join Request',
  pt_event_results:            'Result',
}

function rowSummary(tableName, row) {
  if (!row) return '—'
  try {
    const d = typeof row === 'string' ? JSON.parse(row) : row
    switch (tableName) {
      case 'pt_users':                   return d.username ? `@${d.username}` : `${d.first_name || ''} ${d.last_name || ''}`.trim()
      case 'pt_events':                  return d.name || d.id
      case 'pt_event_games':             return d.name || d.id
      case 'pt_event_teams':             return d.name || d.id
      case 'pt_event_members':           return `user ${d.user_id?.slice(0, 8)}… in event ${d.event_id?.slice(0, 8)}…`
      case 'pt_event_game_participants': return d.name || (d.user_id ? `user ${d.user_id.slice(0, 8)}…` : d.id)
      case 'pt_event_join_requests':     return `user ${d.user_id?.slice(0, 8)}… → ${d.status}`
      case 'pt_event_results':           return `game ${d.game_id?.slice(0, 8)}… (${d.status})`
      default: return d.id || '—'
    }
  } catch {
    return '—'
  }
}

function parseJSON(val) {
  if (!val) return null
  try { return typeof val === 'string' ? JSON.parse(val) : val } catch { return null }
}

function formatVal(v) {
  if (v === null || v === undefined) return <span className="text-slate-500 italic">null</span>
  if (typeof v === 'boolean') return <span className="text-yellow-300">{String(v)}</span>
  if (typeof v === 'object') return <span className="text-slate-300 font-mono">{JSON.stringify(v)}</span>
  return <span className="text-slate-200">{String(v)}</span>
}

function DiffModal({ entry, onClose }) {
  const newData = parseJSON(entry.row_data)
  const oldData = parseJSON(entry.old_data)
  const op = entry.operation

  const allKeys = newData
    ? [...new Set([...Object.keys(oldData || {}), ...Object.keys(newData)])]
    : oldData ? Object.keys(oldData) : []

  const changes = op === 'U' && oldData && newData
    ? allKeys.filter(k => JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
    : []

  const unchanged = op === 'U' && oldData && newData
    ? allKeys.filter(k => JSON.stringify(oldData[k]) === JSON.stringify(newData[k]))
    : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${OP_COLOR[op] || 'bg-slate-600 text-slate-300'}`}>
              {OP_LABEL[op] || op}
            </span>
            <span className="text-white font-semibold">{TABLE_LABEL[entry.table_name] || entry.table_name}</span>
            <span className="text-slate-400 font-mono text-xs">{rowSummary(entry.table_name, entry.row_data)}</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* INSERT or DELETE — show full object */}
          {(op === 'I' || op === 'D') && newData && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                {op === 'I' ? 'New record' : 'Deleted record'}
              </p>
              <div className="rounded-lg bg-slate-900/60 border border-slate-700 overflow-hidden">
                {allKeys.map(k => (
                  <div key={k} className="flex items-start gap-3 px-4 py-2 border-b border-slate-700/50 last:border-0">
                    <span className="text-slate-400 font-mono text-xs w-40 shrink-0 pt-0.5">{k}</span>
                    <span className="font-mono text-xs break-all">{formatVal(newData[k])}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UPDATE — changed fields */}
          {op === 'U' && (
            <>
              {changes.length > 0 ? (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Changed fields ({changes.length})</p>
                  <div className="rounded-lg bg-slate-900/60 border border-slate-700 overflow-hidden">
                    {changes.map(k => (
                      <div key={k} className="px-4 py-2.5 border-b border-slate-700/50 last:border-0">
                        <div className="font-mono text-xs text-slate-400 mb-1">{k}</div>
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className="bg-red-500/15 text-red-300 border border-red-500/25 rounded px-2 py-0.5 font-mono text-xs break-all line-through opacity-70">
                            {typeof oldData[k] === 'object' ? JSON.stringify(oldData[k]) : String(oldData[k] ?? 'null')}
                          </span>
                          <span className="text-slate-500 text-xs self-center">→</span>
                          <span className="bg-green-500/15 text-green-300 border border-green-500/25 rounded px-2 py-0.5 font-mono text-xs break-all">
                            {typeof newData[k] === 'object' ? JSON.stringify(newData[k]) : String(newData[k] ?? 'null')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No field changes detected.</p>
              )}

              {unchanged.length > 0 && (
                <details className="group">
                  <summary className="text-xs text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-400 select-none">
                    Unchanged fields ({unchanged.length})
                  </summary>
                  <div className="mt-2 rounded-lg bg-slate-900/40 border border-slate-700/50 overflow-hidden">
                    {unchanged.map(k => (
                      <div key={k} className="flex items-start gap-3 px-4 py-2 border-b border-slate-700/30 last:border-0 opacity-50">
                        <span className="text-slate-400 font-mono text-xs w-40 shrink-0 pt-0.5">{k}</span>
                        <span className="font-mono text-xs text-slate-300 break-all">
                          {typeof newData[k] === 'object' ? JSON.stringify(newData[k]) : String(newData[k] ?? 'null')}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}

          {/* Metadata */}
          <div className="text-xs text-slate-500 pt-1 border-t border-slate-700/50">
            {entry.changed_by_name && <span>By <span className="text-slate-400">{entry.changed_by_name}</span> · </span>}
            {new Date(entry.changed_at).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AuditLog() {
  const [entries, setEntries]       = useState([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selected, setSelected]     = useState(null)

  const load = async (offset = 0, append = false) => {
    try {
      const { data } = await getAuditLog(PAGE_SIZE, offset)
      setEntries((p) => append ? [...p, ...data.entries] : data.entries)
      setTotal(data.total)
    } catch {
      toast.error('Failed to load audit log')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleMore = () => {
    setLoadingMore(true)
    load(entries.length, true)
  }

  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <span className="text-sm text-slate-400">{total} total change{total !== 1 ? 's' : ''}</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Table</th>
              <th className="px-4 py-3 text-left">Op</th>
              <th className="px-4 py-3 text-left">Summary</th>
              <th className="px-4 py-3 text-left hidden sm:table-cell">When</th>
              <th className="px-4 py-3 text-left w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-slate-500">No audit entries yet.</td>
              </tr>
            ) : entries.map((e) => (
              <tr key={e.aud_id} className="hover:bg-slate-700/30 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-xs font-medium text-slate-300">{TABLE_LABEL[e.table_name] || e.table_name}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${OP_COLOR[e.operation] || 'bg-slate-600 text-slate-300'}`}>
                    {OP_LABEL[e.operation] || e.operation}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-200 font-mono text-xs max-w-xs truncate">
                  {rowSummary(e.table_name, e.row_data)}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell whitespace-nowrap">
                  {new Date(e.changed_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setSelected(e)}
                    className="w-6 h-6 rounded-full bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white text-xs font-bold transition-colors flex items-center justify-center"
                    title="View details"
                  >
                    i
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {entries.length < total && (
        <div className="flex justify-center">
          <button
            className="btn-secondary"
            onClick={handleMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : `See more (${total - entries.length} remaining)`}
          </button>
        </div>
      )}

      {selected && <DiffModal entry={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
