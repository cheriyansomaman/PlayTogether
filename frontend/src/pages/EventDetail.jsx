import {useEffect, useMemo, useRef, useState} from 'react'
import {Link, useParams} from 'react-router-dom'
import {
    cancelGame,
    deleteGame,
    deleteTeam,
    generateShareLink,
    getEvent,
    getEventAuditLog,
    getEventMembers,
    getJoinRequests,
    getMyEventRole,
    getMyJoinRequest,
    getRoleAccess,
    listEventResults,
    listGames,
    listParticipants,
    listTeams,
    removeEventMember,
    resetRoleAccess,
    reviewJoinRequest,
    revokeShareLink,
    updateEventSettings,
    updateGameStatus,
    updateRoleAccess,
} from '../services/api'
import {useWS} from '../context/WSContext'
import {useAuth} from '../context/AuthContext'
import toast from 'react-hot-toast'
import {ageLabel, SportIcon} from '../utils/sportIcons'
import {Ban, Calendar, Clock3, Copy, Link2, MapPin, MoreVertical, Pencil, Search, Tag, Trash2, XCircle} from 'lucide-react'
import CreateGameModal from '../components/modals/CreateGameModal'
import CreateTeamModal from '../components/modals/CreateTeamModal'
import AddEventMemberModal from '../components/modals/AddEventMemberModal'
import BulkAddMembersModal from '../components/modals/BulkAddMembersModal'
import JoinRequestModal, {DEFAULT_QUESTIONS} from '../components/modals/JoinRequestModal'
import ConfirmModal from '../components/modals/ConfirmModal'
import CreateEventModal from '../components/modals/CreateEventModal'

const QUESTION_TYPES = ['text', 'number', 'textarea', 'tags', 'team-select']

const QUESTION_TYPE_LABELS = {
    text: 'Text', number: 'Number', textarea: 'Textarea',
    tags: 'Tags', 'team-select': 'Team Select',
}

const DEFAULT_POINT_SYSTEM = [
    {rank: 1, rank_name: 'Gold', points: 3},
    {rank: 2, rank_name: 'Silver', points: 2},
    {rank: 3, rank_name: 'Bronze', points: 1},
]

const DEFAULT_TEMPLATE_FIELDS = [
    {id: 'full_name', label: 'Full Name', required: true},
    {id: 'team_name', label: 'Team Name', required: true},
    {id: 'age', label: 'Age', required: true},
    {id: 'phone', label: 'Phone Number', required: false},
    {id: 'email', label: 'Email Address', required: false},
    {id: 'address', label: 'Address', required: false},
    {id: 'note', label: 'Note', required: false},
]
const DEFAULT_TEMPLATE_UNIQUE = ['full_name', 'age']

const randomId = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')

const ACTION_LABELS = {
    add_result: 'Add Results',
    modify_result: 'Modify Results',
    add_member: 'Add Members',
    remove_member: 'Remove Members',
    modify_member: 'Modify Members',
    add_participant: 'Add Participants',
    remove_participant: 'Remove Participants',
    modify_participant: 'Modify Participants',
    add_game: 'Add Game',
    modify_game: 'Modify Game',
    add_coordinator: 'Add Coordinator',
    add_admin: 'Add Admin',
    change_role: 'Change Role',
    add_team: 'Add Team',
    modify_team: 'Modify Team',
    member_join_request_approval: 'Join Request Approval',
    settings_visibility: 'Settings Visibility',
    start_game: 'Start Game',
    cancel_game: 'Cancel Game',
    duplicate_game: 'Duplicate Game',
    edit_game: 'Edit Game',
    delete_game: 'Delete Game',
    view_action_history: 'View Action History',
}

// ── Settings tab ──────────────────────────────────────────────────────────────
function SettingsTab({event, onSave, initialRoleRules = []}) {
    const [questions, setQuestions] = useState(
        event.join_questions?.length > 0 ? event.join_questions : DEFAULT_QUESTIONS
    )
    const [pointRules, setPointRules] = useState(
        event.point_system?.length > 0 ? event.point_system : DEFAULT_POINT_SYSTEM
    )
    const [templateFields, setTemplateFields] = useState(
        event.user_template_fields?.length > 0 ? event.user_template_fields : DEFAULT_TEMPLATE_FIELDS
    )
    const [templateUnique, setTemplateUnique] = useState(
        event.user_template_unique?.length > 0 ? event.user_template_unique : DEFAULT_TEMPLATE_UNIQUE
    )
    const [saving, setSaving] = useState(false)

    // ── Role access state ──
    const [roleRules, setRoleRules] = useState(initialRoleRules)
    const [roleLoading, setRoleLoading] = useState(false)
    const [roleSaving, setRoleSaving] = useState(false)

    const toggleRoleRule = (action, role) => {
        setRoleRules((prev) => prev.map((r) =>
            r.action === action ? {...r, [role]: !r[role]} : r
        ))
    }

    const handleRoleSave = async () => {
        setRoleSaving(true)
        try {
            await updateRoleAccess(event.id, roleRules)
            toast.success('Role access saved')
        } catch {
            toast.error('Failed to save role access')
        } finally {
            setRoleSaving(false)
        }
    }

    const handleRoleReset = async () => {
        try {
            await resetRoleAccess(event.id)
            const {data} = await getRoleAccess(event.id)
            setRoleRules(data)
            toast.success('Reset to defaults')
        } catch {
            toast.error('Failed to reset')
        }
    }

    const update = (idx, field, val) =>
        setQuestions((p) => p.map((q, i) => i === idx ? {...q, [field]: val} : q))

    const move = (idx, dir) => {
        const next = [...questions]
        const swap = idx + dir
        if (swap < 0 || swap >= next.length) return
            ;
        [next[idx], next[swap]] = [next[swap], next[idx]]
        setQuestions(next)
    }

    const addQuestion = () =>
        setQuestions((p) => [...p, {id: randomId(), label: '', type: 'text', required: true}])

    const removeQuestion = (idx) => setQuestions((p) => p.filter((_, i) => i !== idx))

    const updatePoints = (idx, val) =>
        setPointRules((p) => p.map((r, i) => i === idx ? {...r, points: Math.max(0, Number(val))} : r))

    const updateRankName = (idx, val) =>
        setPointRules((p) => p.map((r, i) => i === idx ? {...r, rank_name: val} : r))

    const addRank = () =>
        setPointRules((p) => [...p, {rank: p.length + 1, rank_name: `Rank ${p.length + 1}`, points: 0}])

    const removeRank = (idx) =>
        setPointRules((p) => p.filter((_, i) => i !== idx).map((r, i) => ({...r, rank: i + 1})))

    // ── Template field helpers ──
    const updateTemplateField = (idx, field, val) =>
        setTemplateFields((p) => p.map((f, i) => i === idx ? {...f, [field]: val} : f))

    const moveTemplateField = (idx, dir) => {
        const next = [...templateFields]
        const swap = idx + dir
        if (swap < 0 || swap >= next.length) return
            ;
        [next[idx], next[swap]] = [next[swap], next[idx]]
        setTemplateFields(next)
    }

    const addTemplateField = () =>
        setTemplateFields((p) => [...p, {id: randomId(), label: '', required: false}])

    const removeTemplateField = (idx) => {
        const removed = templateFields[idx]
        setTemplateFields((p) => p.filter((_, i) => i !== idx))
        setTemplateUnique((p) => p.filter((id) => id !== removed.id))
    }

    const toggleTemplateUnique = (fieldId) =>
        setTemplateUnique((p) => p.includes(fieldId) ? p.filter((id) => id !== fieldId) : [...p, fieldId])

    const downloadCSVTemplate = () => {
        if (templateFields.length === 0) return
        const headers = templateFields.map((f) => {
            const label = f.label || 'Unnamed'
            return f.required ? label : `${label} (Optional)`
        })
        const csv = headers.join(',') + '\n'
        const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'})
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `user_template_${(event.name || 'event').replace(/\s+/g, '_')}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const handleSave = async () => {
        if (questions.some((q) => !q.label.trim())) {
            toast.error('All questions must have a label')
            return
        }
        setSaving(true)
        try {
            const {data} = await updateEventSettings(event.id, {
                join_questions: questions,
                point_system: pointRules,
                user_template_fields: templateFields,
                user_template_unique: templateUnique,
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

                <div className="card overflow-x-auto">
                    <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-0 divide-y divide-slate-700">
                        {/* header */}
                        <div className="contents text-xs font-medium text-slate-500 uppercase tracking-wide">
                            <div className="px-4 py-2 bg-slate-800">Pos</div>
                            <div className="px-4 py-2 bg-slate-800">Rank name</div>
                            <div className="px-4 py-2 bg-slate-800">Points</div>
                            <div className="px-4 py-2 bg-slate-800"/>
                        </div>

                        {pointRules.map((rule, idx) => (
                            <div key={idx} className="contents">
                                <div className="px-4 py-3 flex items-center text-sm font-medium text-slate-500">
                                    #{rule.rank}
                                </div>
                                <div className="px-4 py-2 flex items-center">
                                    <input
                                        className="input"
                                        type="text"
                                        value={rule.rank_name || ''}
                                        placeholder={`Rank ${rule.rank}`}
                                        onChange={(e) => updateRankName(idx, e.target.value)}
                                    />
                                </div>
                                <div className="px-4 py-2 flex items-center">
                                    <input
                                        className="input w-20 text-center"
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
                                    >×
                                    </button>
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
                        <div key={q.id}
                             className="card p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
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
                                >↑
                                </button>
                                <button
                                    type="button"
                                    onClick={() => move(idx, 1)}
                                    disabled={idx === questions.length - 1}
                                    className="text-slate-400 hover:text-white disabled:opacity-30 px-1"
                                    title="Move down"
                                >↓
                                </button>
                                <button
                                    type="button"
                                    onClick={() => removeQuestion(idx)}
                                    className="text-red-400 hover:text-red-300 px-1"
                                    title="Remove"
                                ><Trash2 size={14}/></button>
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

            {/* ── User Template ── */}
            <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-base font-semibold text-white mb-1">User Template</h2>
                        <p className="text-sm text-slate-400">
                            Configure the fields for the CSV template used when importing users into this event.
                            Required fields are marked with * in the downloaded file.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn-secondary shrink-0 flex items-center gap-1.5"
                        onClick={downloadCSVTemplate}
                        disabled={templateFields.length === 0}
                        title="Download CSV template"
                    >
                        ↓ Download Template
                    </button>
                </div>

                {/* Fields list */}
                <div className="space-y-2">
                    {templateFields.map((f, idx) => (
                        <div key={f.id}
                             className="card p-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                            <div className="flex-1">
                                <input
                                    className="input"
                                    value={f.label}
                                    onChange={(e) => updateTemplateField(idx, 'label', e.target.value)}
                                    placeholder="Field name"
                                />
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={f.required}
                                        onChange={(e) => updateTemplateField(idx, 'required', e.target.checked)}
                                        className="w-4 h-4 accent-blue-500"
                                    />
                                    <span className="text-xs text-slate-400">Required</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => moveTemplateField(idx, -1)}
                                    disabled={idx === 0}
                                    className="text-slate-400 hover:text-white disabled:opacity-30 px-1"
                                    title="Move up"
                                >↑
                                </button>
                                <button
                                    type="button"
                                    onClick={() => moveTemplateField(idx, 1)}
                                    disabled={idx === templateFields.length - 1}
                                    className="text-slate-400 hover:text-white disabled:opacity-30 px-1"
                                    title="Move down"
                                >↓
                                </button>
                                <button
                                    type="button"
                                    onClick={() => removeTemplateField(idx)}
                                    className="text-red-400 hover:text-red-300 px-1"
                                    title="Remove field"
                                ><Trash2 size={14}/></button>
                            </div>
                        </div>
                    ))}
                    {templateFields.length === 0 && (
                        <p className="text-sm text-slate-500 text-center py-4">No fields — add one below.</p>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <button type="button" className="btn-secondary" onClick={addTemplateField}>+ Add Field</button>
                    <button
                        type="button"
                        className="btn-secondary text-slate-500 hover:text-white"
                        onClick={() => {
                            setTemplateFields(DEFAULT_TEMPLATE_FIELDS);
                            setTemplateUnique(DEFAULT_TEMPLATE_UNIQUE)
                        }}
                    >
                        Reset to Defaults
                    </button>
                </div>

                {/* Uniqueness constraint */}
                {templateFields.length > 0 && (
                    <div className="card p-4 space-y-3">
                        <div>
                            <p className="text-sm font-medium text-white">Uniqueness Constraint</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                                A row is considered a duplicate when <em>all</em> checked fields match an existing
                                record.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {templateFields.filter((f) => f.label.trim()).map((f) => (
                                <label key={f.id} className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={templateUnique.includes(f.id)}
                                        onChange={() => toggleTemplateUnique(f.id)}
                                        className="w-4 h-4 accent-blue-500"
                                    />
                                    <span className="text-sm text-slate-300">{f.label}</span>
                                </label>
                            ))}
                        </div>
                        {templateUnique.length > 0 && (
                            <p className="text-xs text-slate-500">
                                Unique key:{' '}
                                <span className="text-slate-300">
                  {templateFields
                      .filter((f) => templateUnique.includes(f.id) && f.label.trim())
                      .map((f) => f.label)
                      .join(' + ')}
                </span>
                            </p>
                        )}
                        {templateUnique.length === 0 && (
                            <p className="text-xs text-amber-400">No uniqueness constraint — all rows will be
                                imported.</p>
                        )}
                    </div>
                )}
            </div>

            {/* ── Role Access ── */}
            <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-base font-semibold text-white mb-1">Role Access</h2>
                        <p className="text-sm text-slate-400">
                            Control what coordinators and viewers can do in this event. Admin always has full access.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn-secondary shrink-0 text-slate-500 hover:text-white text-sm"
                        onClick={handleRoleReset}
                    >
                        Reset to Defaults
                    </button>
                </div>

                {roleLoading ? (
                    <div className="text-sm text-slate-500 py-4 text-center">Loading…</div>
                ) : roleRules.length === 0 ? (
                    <div className="text-sm text-slate-500 py-4 text-center">No rules found.</div>
                ) : (
                    <div className="card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                            <tr>
                                <th className="px-4 py-2.5 text-left">Action</th>
                                <th className="px-4 py-2.5 text-center w-20">Admin</th>
                                <th className="px-4 py-2.5 text-center w-24">Coordinator</th>
                                <th className="px-4 py-2.5 text-center w-20">Viewer</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                            {roleRules.map((rule) => (
                                <tr key={rule.action} className="hover:bg-slate-700/30 transition-colors">
                                    <td className="px-4 py-2.5 text-slate-300 text-xs">
                                        {ACTION_LABELS[rule.action] || rule.action}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <span className="text-emerald-400 text-base" title="Always enabled">✓</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <input
                                            type="checkbox"
                                            checked={rule.role_coordinator}
                                            onChange={() => toggleRoleRule(rule.action, 'role_coordinator')}
                                            className="w-4 h-4 accent-blue-500 cursor-pointer"
                                        />
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <input
                                            type="checkbox"
                                            checked={rule.role_viewer}
                                            onChange={() => toggleRoleRule(rule.action, 'role_viewer')}
                                            className="w-4 h-4 accent-blue-500 cursor-pointer"
                                        />
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="flex justify-end">
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={handleRoleSave}
                        disabled={roleSaving || roleLoading}
                    >
                        {roleSaving ? 'Saving…' : 'Save Role Access'}
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

// ── Action History tab ────────────────────────────────────────────────────────
const AUD_OP  = { I: 'Created', U: 'Updated', D: 'Deleted' }
const AUD_CLR = {
    I: 'bg-green-500/20 text-green-300 border-green-500/30',
    U: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    D: 'bg-red-500/20 text-red-300 border-red-500/30',
}
const AUD_TABLE = {
    pt_events: 'Event', pt_event_members: 'Member', pt_event_games: 'Game',
    pt_event_teams: 'Team', pt_event_game_participants: 'Participant',
    pt_event_join_requests: 'Join Request', pt_event_results: 'Result',
}
function audSummary(table, row, oldRow, members, games) {
    try {
        const d = typeof row === 'string' ? JSON.parse(row) : row
        const o = oldRow && typeof oldRow === 'string' ? JSON.parse(oldRow) : oldRow
        if (!d) return '—'
        const resolveName = (uid) => {
            if (!uid) return null
            const m = members?.find(x => x.user_id === uid)
            return m ? (m.user_name || m.first_name) : uid.slice(0, 8) + '…'
        }
        const resolveGame = (gid) => {
            if (!gid) return null
            const g = games?.find(x => x.id === gid)
            return g ? g.name : gid.slice(0, 8) + '…'
        }
        switch (table) {
            case 'pt_events': {
                const hadToken = o?.share_token != null
                const hasToken = d.share_token != null
                if (!hadToken && hasToken) return `${d.name}: share link generated`
                if (hadToken && !hasToken) return `${d.name}: share link revoked`
                return d.name || d.id
            }
            case 'pt_event_games':             return d.name || d.id
            case 'pt_event_teams':             return d.name || d.id
            case 'pt_event_members': {
                const who = resolveName(d.user_id)
                if (o && o.role && d.role && o.role !== d.role)
                    return `${who}: ${o.role} → ${d.role}`
                return `${who}: ${d.role}`
            }
            case 'pt_event_game_participants': {
                const gameName = resolveGame(d.game_id)
                const participantName = d.name || resolveName(d.user_id) || d.id
                return gameName ? `${participantName} added to "${gameName}"` : participantName
            }
            case 'pt_event_join_requests': {
                const who = resolveName(d.user_id)
                return `${who}: ${d.status}`
            }
            case 'pt_event_results': {
                const gameName = resolveGame(d.game_id)
                const verb = o ? 'updated' : 'recorded'
                const label = gameName ? `"${gameName}"` : 'game'
                return `Results ${verb} for ${label} (${d.status})`
            }
            default: return d.id || '—'
        }
    } catch { return '—' }
}

const AUDIT_PAGE_SIZE = 10
const GAME_PAGE_SIZE  = 12

function resolveChangedBy(e, members) {
    const ROW_DATA_FIELD = {
        pt_event_results: 'recorded_by',
        pt_event_games:   'updated_by',
    }
    // For INSERT only: use created_by from row_data (original creator = actor for creates)
    const INSERT_ROW_FIELD = {
        pt_event_teams: 'created_by',
    }
    const field = ROW_DATA_FIELD[e.table_name] ||
                  (e.operation === 'I' ? INSERT_ROW_FIELD[e.table_name] : null)
    if (field) {
        try {
            const d = typeof e.row_data === 'string' ? JSON.parse(e.row_data) : e.row_data
            const uid = d?.[field]
            if (uid) {
                const m = members?.find(x => x.user_id === uid)
                if (m) return m.user_name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.first_name
                return uid.slice(0, 8) + '…'
            }
        } catch { /* fall through */ }
    }
    return e.changed_by_name || (e.changed_by ? e.changed_by.slice(0, 8) + '…' : null)
}

function parseAuditJSON(val) {
    if (!val) return null
    try { return typeof val === 'string' ? JSON.parse(val) : val } catch { return null }
}

function ResultDataTable({ entries, variant }) {
    if (!Array.isArray(entries) || entries.length === 0)
        return <span className="text-slate-500 italic text-xs">empty</span>

    const hasTime  = entries.some(e => e.time)
    const hasNotes = entries.some(e => e.notes)

    const rowBg = variant === 'old'
        ? 'bg-red-500/10 border-red-500/20'
        : variant === 'new'
            ? 'bg-green-500/10 border-green-500/20'
            : 'bg-slate-900/60 border-slate-700'

    const headCls = variant === 'old'
        ? 'bg-red-500/20 text-red-300'
        : variant === 'new'
            ? 'bg-green-500/20 text-green-300'
            : 'bg-slate-800 text-slate-400'

    return (
        <div className={`rounded-lg border overflow-hidden ${rowBg}`}>
            <table className="w-full text-xs">
                <thead className={headCls}>
                    <tr>
                        <th className="px-3 py-1.5 text-left font-semibold">#</th>
                        <th className="px-3 py-1.5 text-left font-semibold">Participant</th>
                        <th className="px-3 py-1.5 text-right font-semibold">Score</th>
                        {hasTime  && <th className="px-3 py-1.5 text-right font-semibold">Time</th>}
                        {hasNotes && <th className="px-3 py-1.5 text-left font-semibold">Notes</th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                    {entries.map((e, i) => (
                        <tr key={i}>
                            <td className="px-3 py-1.5 text-slate-400 font-mono">{e.position ?? i + 1}</td>
                            <td className="px-3 py-1.5 text-slate-200">{e.participant_name || e.participant_id?.slice(0, 8) + '…'}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-slate-200">{e.score ?? '—'}</td>
                            {hasTime  && <td className="px-3 py-1.5 text-right font-mono text-slate-300">{e.time || '—'}</td>}
                            {hasNotes && <td className="px-3 py-1.5 text-slate-400">{e.notes || '—'}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function AuditDiffModal({ entry, onClose, members }) {
    const newData = parseAuditJSON(entry.row_data)
    const oldData = parseAuditJSON(entry.old_data)
    const op = entry.operation

    const allKeys = newData
        ? [...new Set([...Object.keys(oldData || {}), ...Object.keys(newData)])]
        : oldData ? Object.keys(oldData) : []

    const changes   = op === 'U' && oldData && newData
        ? allKeys.filter(k => JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
        : []
    const unchanged = op === 'U' && oldData && newData
        ? allKeys.filter(k => JSON.stringify(oldData[k]) === JSON.stringify(newData[k]))
        : []

    const isResults = entry.table_name === 'pt_event_results'

    const fmtVal = (v, key) => {
        if (v === null || v === undefined) return <span className="text-slate-500 italic">null</span>
        if (isResults && key === 'result_data' && Array.isArray(v))
            return <ResultDataTable entries={v} />
        if (typeof v === 'object') return <span className="font-mono">{JSON.stringify(v)}</span>
        return <span>{String(v)}</span>
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${AUD_CLR[op] || 'bg-slate-600 text-slate-300'}`}>
                            {AUD_OP[op] || op}
                        </span>
                        <span className="text-white font-semibold">{AUD_TABLE[entry.table_name] || entry.table_name}</span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-lg leading-none">✕</button>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                    {(op === 'I' || op === 'D') && newData && (
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                                {op === 'I' ? 'New record' : 'Deleted record'}
                            </p>
                            <div className="rounded-lg bg-slate-900/60 border border-slate-700 overflow-hidden">
                                {allKeys.map(k => (
                                    <div key={k} className={`px-4 py-2 border-b border-slate-700/50 last:border-0 ${isResults && k === 'result_data' ? 'flex-col' : 'flex items-start gap-3'}`}>
                                        <span className="text-slate-400 font-mono text-xs w-40 shrink-0 pt-0.5 block">{k}</span>
                                        <span className="font-mono text-xs text-slate-200 break-all block mt-1">{fmtVal(newData[k], k)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {op === 'U' && (
                        <>
                            {changes.length > 0 ? (
                                <div>
                                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Changed fields ({changes.length})</p>
                                    <div className="rounded-lg bg-slate-900/60 border border-slate-700 overflow-hidden">
                                        {changes.map(k => (
                                            <div key={k} className="px-4 py-2.5 border-b border-slate-700/50 last:border-0">
                                                <div className="font-mono text-xs text-slate-400 mb-2">{k}</div>
                                                {isResults && k === 'result_data' ? (
                                                    <div className="space-y-2">
                                                        <div>
                                                            <p className="text-xs text-red-400/70 mb-1">Before</p>
                                                            <ResultDataTable entries={oldData[k]} variant="old" />
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-green-400/70 mb-1">After</p>
                                                            <ResultDataTable entries={newData[k]} variant="new" />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-start gap-2 flex-wrap">
                                                        <span className="bg-red-500/15 text-red-300 border border-red-500/25 rounded px-2 py-0.5 font-mono text-xs break-all line-through opacity-70">
                                                            {typeof oldData[k] === 'object' ? JSON.stringify(oldData[k]) : String(oldData[k] ?? 'null')}
                                                        </span>
                                                        <span className="text-slate-500 text-xs self-center">→</span>
                                                        <span className="bg-green-500/15 text-green-300 border border-green-500/25 rounded px-2 py-0.5 font-mono text-xs break-all">
                                                            {typeof newData[k] === 'object' ? JSON.stringify(newData[k]) : String(newData[k] ?? 'null')}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-slate-500 text-sm">No field changes detected.</p>
                            )}

                            {unchanged.length > 0 && (
                                <details>
                                    <summary className="text-xs text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-400 select-none">
                                        Unchanged fields ({unchanged.length})
                                    </summary>
                                    <div className="mt-2 rounded-lg bg-slate-900/40 border border-slate-700/50 overflow-hidden">
                                        {unchanged.map(k => (
                                            <div key={k} className="px-4 py-2 border-b border-slate-700/30 last:border-0 opacity-50">
                                                <span className="text-slate-400 font-mono text-xs block mb-0.5">{k}</span>
                                                <span className="font-mono text-xs text-slate-300 break-all block">
                                                    {fmtVal(newData[k], k)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </>
                    )}

                    <div className="text-xs text-slate-500 pt-1 border-t border-slate-700/50">
                        {resolveChangedBy(entry, members) && <span>By <span className="text-slate-400">{resolveChangedBy(entry, members)}</span> · </span>}
                        {new Date(entry.changed_at).toLocaleString()}
                    </div>
                </div>
            </div>
        </div>
    )
}

function ActionHistoryTab({ entries, total, loading, page, onMount, onPage, members, games }) {
    const [search, setSearch]               = useState('')
    const [entityFilters, setEntityFilters] = useState([])
    const [actionFilters, setActionFilters] = useState([])
    const [filterOpen, setFilterOpen]       = useState(false)
    const [selected, setSelected]           = useState(null)
    const filterRef = useRef(null)

    const _mounted = useRef(false)
    useEffect(() => {
        if (_mounted.current) return
        _mounted.current = true
        onMount()
    }, [])
    useEffect(() => {
        const close = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false) }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [])

    const activeCount = entityFilters.length + actionFilters.length
    const pill = (active) =>
        `px-2.5 py-0.5 rounded-full text-xs transition-colors ${
            active ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600'
        }`

    // Filter out member team-sync side-effects (team_id-only updates triggered by participant add)
    const baseEntries = entries.filter(e => {
        if (e.table_name === 'pt_event_members' && e.operation === 'U' && e.old_data) {
            try {
                const d = typeof e.row_data === 'string' ? JSON.parse(e.row_data) : e.row_data
                const o = typeof e.old_data === 'string'  ? JSON.parse(e.old_data)  : e.old_data
                if (d && o && d.role === o.role && d.team_id !== o.team_id) return false
            } catch { /* show if parse fails */ }
        }
        return true
    })

    const filtered = baseEntries.filter(e => {
        if (entityFilters.length && !entityFilters.includes(e.table_name)) return false
        if (actionFilters.length && !actionFilters.includes(e.operation)) return false
        if (search) {
            const q = search.toLowerCase()
            const summary = audSummary(e.table_name, e.row_data, e.old_data, members, games).toLowerCase()
            const by = (resolveChangedBy(e, members) || '').toLowerCase()
            const entity = (AUD_TABLE[e.table_name] || e.table_name).toLowerCase()
            if (!summary.includes(q) && !by.includes(q) && !entity.includes(q)) return false
        }
        return true
    })

    const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE))
    const pageStart  = page * AUDIT_PAGE_SIZE + 1
    const pageEnd    = Math.min((page + 1) * AUDIT_PAGE_SIZE, total)

    const pageNumbers = () => {
        const pages = []
        const delta = 2
        for (let i = 0; i < totalPages; i++) {
            if (i === 0 || i === totalPages - 1 || (i >= page - delta && i <= page + delta)) {
                pages.push(i)
            } else if (pages[pages.length - 1] !== '…') {
                pages.push('…')
            }
        }
        return pages
    }

    if (loading) return (
        <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
    )

    return (
        <div className="space-y-4">
            {/* Header + controls */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">Action History</h2>
                    <span className="text-sm text-slate-400">{total} total change{total !== 1 ? 's' : ''}</span>
                </div>
                <div ref={filterRef} className="relative flex items-center gap-1.5">
                    {/* Search */}
                    <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-7 pr-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-200 placeholder-slate-500 w-36 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>
                    {/* Filter button */}
                    <button
                        type="button"
                        onClick={() => setFilterOpen(p => !p)}
                        className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            filterOpen || activeCount > 0 ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                    >
                        <IconFilter />
                        <span className="hidden sm:inline">Filter</span>
                        {activeCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold px-0.5">
                                {activeCount}
                            </span>
                        )}
                    </button>
                    {/* Filter dropdown */}
                    {filterOpen && (
                        <div className="absolute top-full right-0 mt-1.5 z-30 w-64 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Filter history</p>
                                {activeCount > 0 && (
                                    <button type="button" onClick={() => { setEntityFilters([]); setActionFilters([]) }}
                                        className="text-xs text-red-400 hover:text-red-300 transition-colors">✕ Clear all</button>
                                )}
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1.5">Entity</p>
                                <div className="flex flex-wrap gap-1">
                                    {[['', 'All'], ...Object.entries(AUD_TABLE)].map(([k, v]) => (
                                        <button key={k} type="button"
                                            onClick={() => {
                                                if (k === '') { setEntityFilters([]); return }
                                                setEntityFilters(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])
                                            }}
                                            className={pill(k === '' ? entityFilters.length === 0 : entityFilters.includes(k))}>
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1.5">Action</p>
                                <div className="flex flex-wrap gap-1">
                                    {[['', 'All'], ...Object.entries(AUD_OP)].map(([k, v]) => (
                                        <button key={k} type="button"
                                            onClick={() => {
                                                if (k === '') { setActionFilters([]); return }
                                                setActionFilters(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])
                                            }}
                                            className={pill(k === '' ? actionFilters.length === 0 : actionFilters.includes(k))}>
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                        <tr>
                            <th className="px-4 py-3 text-left">Entity</th>
                            <th className="px-4 py-3 text-left">Action</th>
                            <th className="px-4 py-3 text-left">What Changed</th>
                            <th className="px-4 py-3 text-left">Changed By</th>
                            <th className="px-4 py-3 text-left whitespace-nowrap">When</th>
                            <th className="px-4 py-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {filtered.length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-16 text-center text-slate-500">
                                {search || entityFilters.length || actionFilters.length ? 'No results match filters.' : 'No changes recorded yet.'}
                            </td></tr>
                        ) : filtered.map((e) => (
                            <tr key={e.aud_id} className="hover:bg-slate-700/30 transition-colors">
                                <td className="px-4 py-3 text-slate-300 text-xs font-medium">{AUD_TABLE[e.table_name] || e.table_name}</td>
                                <td className="px-4 py-3">
                                    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${AUD_CLR[e.operation] || 'bg-slate-600 text-slate-300'}`}>
                                        {AUD_OP[e.operation] || e.operation}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-slate-200 text-xs max-w-xs truncate">{audSummary(e.table_name, e.row_data, e.old_data, members, games)}</td>
                                <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap">
                                    {resolveChangedBy(e, members) || <span className="text-slate-600">—</span>}
                                </td>
                                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{new Date(e.changed_at).toLocaleString()}</td>
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

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">{pageStart}–{pageEnd} of {total}</span>
                    <div className="flex items-center gap-1">
                        <button className="btn-secondary btn-sm" onClick={() => onPage(page - 1)} disabled={page === 0}>←</button>
                        {pageNumbers().map((p, i) =>
                            p === '…'
                                ? <span key={`e${i}`} className="px-2 text-slate-500 text-xs">…</span>
                                : <button
                                    key={p}
                                    className={`btn-sm px-3 rounded-lg text-xs font-medium ${p === page ? 'bg-blue-600 text-white' : 'btn-secondary'}`}
                                    onClick={() => onPage(p)}
                                >{p + 1}</button>
                        )}
                        <button className="btn-secondary btn-sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1}>→</button>
                    </div>
                </div>
            )}

            {selected && <AuditDiffModal entry={selected} onClose={() => setSelected(null)} members={members} />}
        </div>
    )
}

const GAME_STATUS_FLOW = {scheduled: 'active', active: 'completed'}
const GAME_STATUS_LABEL = {scheduled: 'Start', active: 'Finish'}

const ROLE_BADGE = {
    admin: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
    coordinator: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    viewer: 'bg-slate-500/40 text-slate-400 border border-slate-500/40',
}

const STATUS_BADGE = {
    pending: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    approved: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    rejected: 'bg-red-500/20 text-red-300 border border-red-500/30',
}

function TeamAvatar({team, size = 'md'}) {
    const [imgError, setImgError] = useState(false)
    const sz = size === 'lg' ? 'w-14 h-14 text-2xl rounded-xl' : 'w-10 h-10 text-lg rounded-lg'
    return (
        <div
            className={`${sz} flex items-center justify-center font-bold text-white shrink-0 overflow-hidden`}
            style={{
                backgroundColor: team.color || '#3b82f6',
                outline: `2px solid ${team.color || '#3b82f6'}`,
                outlineOffset: '2px'
            }}
        >
            {(team.logo_base64 || team.logo_url) && !imgError ? (
                <img src={team.logo_base64 || team.logo_url} alt={team.name} className="w-full h-full object-cover"
                     onError={() => setImgError(true)}/>
            ) : (
                <span>{team.name?.charAt(0)?.toUpperCase() || '?'}</span>
            )}
        </div>
    )
}

function EventLogo({event, size = 'md'}) {
    const [imgError, setImgError] = useState(false)
    const src = event?.logo_base64 || event?.logo_url
    const sz = size === 'lg' ? 'w-16 h-16 text-2xl rounded-xl' : size === 'sm' ? 'w-8 h-8 text-sm rounded-lg' : 'w-12 h-12 text-xl rounded-xl'
    if (!src || imgError) return null
    return (
        <img
            src={src}
            alt={event.name}
            className={`${sz} object-cover shrink-0 border border-slate-600`}
            onError={() => setImgError(true)}
        />
    )
}

// ── Public event info shown to anyone ────────────────────────────────────────
function PublicEventView({event, myRequest, onRequestJoin}) {
    return (
        <div className="max-w-xl mx-auto space-y-6">
            <div className="card p-8 text-center">
                <div className="mb-4 text-slate-300"><SportIcon sport={event.event_type} size={56}/></div>
                <div className="flex items-center justify-center gap-2 mb-3">
                    <span className={`badge badge-${event.status}`}>{event.status}</span>
                </div>
                <h1 className="text-2xl font-bold text-white mb-4">{event.name}</h1>

                <div className="space-y-2 text-sm text-slate-400 mb-6">
                    <div className="flex items-center justify-center gap-2">
                        <Tag size={14} className="shrink-0"/><span className="capitalize">{event.event_type}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                        <Calendar size={14} className="shrink-0"/>
                        <span>{event.start_date}{event.end_date ? ` – ${event.end_date}` : ''}</span>
                    </div>
                    {event.location && (
                        <div className="flex items-center justify-center gap-2">
                            <MapPin size={14} className="shrink-0"/><span>{event.location}</span>
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
                    <div
                        className="flex items-center justify-center gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <span className="text-xl">⏳</span>
                        <div className="text-left">
                            <p className="text-amber-300 font-medium text-sm">Request pending</p>
                            <p className="text-slate-400 text-xs mt-0.5">Waiting for the event admin to review your
                                request.</p>
                        </div>
                    </div>
                )}

                {myRequest?.status === 'rejected' && (
                    <div
                        className="flex items-center justify-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                        <span className="text-red-400"><XCircle size={20}/></span>
                        <div className="text-left">
                            <p className="text-red-300 font-medium text-sm">Request declined</p>
                            <p className="text-slate-400 text-xs mt-0.5">Contact the event admin if you think this is a
                                mistake.</p>
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
    {value: 'name_age', label: 'Name + Age'},
    {value: 'name', label: 'Name'},
    {value: 'age', label: 'Age Range'},
    {value: 'team', label: 'Team'},
]

function IconSort() {
    return (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
             strokeLinecap="round">
            <path d="M2 4h12M4 8h8M6 12h4"/>
        </svg>
    )
}

function IconFilter() {
    return (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
             strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.5 3h13l-5 5.5V13l-3-1.5V8.5L1.5 3z"/>
        </svg>
    )
}

function GameControls({sort, onSort, filter, onFilter, gameTypes, activeFilterCount}) {
    const [open, setOpen] = useState(null)  // null | 'sort' | 'filter'
    const ref = useRef(null)

    useEffect(() => {
        const close = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(null)
        }
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
                <IconSort/>
                <span className="hidden sm:inline">
          {GAME_SORT_OPTIONS.find((o) => o.value === sort)?.label}
        </span>
            </button>

            {/* Filter button */}
            <button type="button" title="Filter" onClick={() => toggle('filter')}
                    className={`relative ${activeBtn(open === 'filter' || activeFilterCount > 0)}`}>
                <IconFilter/>
                <span className="hidden sm:inline">Filter</span>
                {activeFilterCount > 0 && (
                    <span
                        className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold px-0.5">
            {activeFilterCount}
          </span>
                )}
            </button>

            {/* Sort dropdown */}
            {open === 'sort' && (
                <div
                    className="absolute top-full left-0 mt-1.5 z-30 w-44 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
                    <p className="text-[10px] text-slate-500 px-3 pt-2.5 pb-1 font-semibold uppercase tracking-wider">Sort
                        by</p>
                    {GAME_SORT_OPTIONS.map(({value, label}) => (
                        <button key={value} type="button"
                                onClick={() => {
                                    onSort(value);
                                    setOpen(null)
                                }}
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
                <div
                    className="absolute top-full left-0 mt-1.5 z-30 w-60 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Filter
                            games</p>
                        {activeFilterCount > 0 && (
                            <button type="button"
                                    onClick={() => onFilter({status: '', mode: '', type: ''})}
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
                                        onClick={() => onFilter((f) => ({...f, status: s === f.status ? '' : s}))}
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
                                        onClick={() => onFilter((f) => ({...f, mode: m === f.mode ? '' : m}))}
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
                                onChange={(e) => onFilter((f) => ({...f, type: e.target.value}))}>
                                <option value="">All types</option>
                                {gameTypes.map((t) => (
                                    <option key={t}
                                            value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' ')}</option>
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
    const {id} = useParams()
    const {subscribe} = useWS()
    const {user} = useAuth()

    const [event, setEvent] = useState(null)
    const [games, setGames] = useState([])
    const [teams, setTeams] = useState([])
    const [members, setMembers] = useState([])
    const [joinRequests, setJoinRequests] = useState([])
    const [myRole, setMyRole] = useState(null)   // null = still loading
    const [myRequest, setMyRequest] = useState(null)
    const [tab, setTab] = useState('games')
    const [loading, setLoading] = useState(true)
    const [showJoinModal, setShowJoinModal] = useState(false)
    const [modal, setModal] = useState(null)
    const [editItem, setEditItem] = useState(null)
    const [duplicateFrom, setDuplicateFrom] = useState(null)
    const [gameSort, setGameSort] = useState('name_age')
    const [gameFilter, setGameFilter] = useState({status: '', mode: '', type: ''})
    const [gameSearch, setGameSearch] = useState('')
    const [gamePage, setGamePage] = useState(0)
    const [showShare, setShowShare] = useState(false)
    const [shareLoading, setShareLoading] = useState(false)
    const [eventResults, setEventResults] = useState([])
    const [eventParticipants, setEventParticipants] = useState([])
    const [confirmAction, setConfirmAction] = useState(null)
    const [confirmLoading, setConfirmLoading] = useState(false)
    const [memberSearch, setMemberSearch] = useState('')
    const [memberFilterTeam, setMemberFilterTeam] = useState('')
    const [memberFilterAgeMin, setMemberFilterAgeMin] = useState('')
    const [memberFilterAgeMax, setMemberFilterAgeMax] = useState('')
    const [openMenu, setOpenMenu] = useState(null)
    const menuRef = useRef(null)
    const loadedRef = useRef(new Set())
    const [roleAccess, setRoleAccess]           = useState([])
    const [auditEntries, setAuditEntries] = useState([])
    const [auditTotal, setAuditTotal]   = useState(0)
    const [auditLoading, setAuditLoading] = useState(false)
    const [auditPage, setAuditPage]     = useState(0)

    const isEventAdmin = myRole === 'admin'
    const isEventMember = myRole === 'admin' || myRole === 'coordinator'
    const isMember = myRole !== 'none' && myRole !== null

    // Phase 1 — load event + role + roleAccess (always)
    // Phase 2 — lazy per-tab on first visit
    const load = async () => {
        try {
            const [ev, roleRes] = await Promise.all([getEvent(id), getMyEventRole(id)])
            setEvent(ev.data)
            const role = roleRes.data.role
            setMyRole(role)
            if (role === 'none') {
                const jr = await getMyJoinRequest(id).catch(() => ({data: null}))
                setMyRequest(jr.data)
            } else {
                const ra = await getRoleAccess(id).catch(() => ({data: []}))
                setRoleAccess(ra.data || [])
            }
        } catch {
            toast.error('Failed to load event')
        } finally {
            setLoading(false)
        }
    }

    const fetchGamesTeams = async () => {
        if (loadedRef.current.has('gamesTeams')) return
        loadedRef.current.add('gamesTeams')
        try {
            const [gms, tms] = await Promise.all([listGames(id), listTeams(id)])
            setGames(gms.data)
            setTeams(tms.data)
        } catch { loadedRef.current.delete('gamesTeams') }
    }

    const fetchMembers = async () => {
        if (loadedRef.current.has('members')) return
        loadedRef.current.add('members')
        try {
            const mem = await getEventMembers(id)
            setMembers(mem.data)
        } catch { loadedRef.current.delete('members') }
    }

    const fetchResults = async () => {
        if (loadedRef.current.has('results')) return
        loadedRef.current.add('results')
        try {
            const evRes = await listEventResults(id)
            setEventResults(evRes.data || [])
        } catch { loadedRef.current.delete('results') }
    }

    const fetchParticipants = async () => {
        if (loadedRef.current.has('participants')) return
        loadedRef.current.add('participants')
        try {
            const res = await listParticipants(id)
            setEventParticipants(res.data || [])
        } catch { loadedRef.current.delete('participants') }
    }

    const fetchRequests = async () => {
        if (loadedRef.current.has('requests')) return
        loadedRef.current.add('requests')
        try {
            const reqs = await getJoinRequests(id).catch(() => ({data: []}))
            setJoinRequests(reqs.data || [])
        } catch { loadedRef.current.delete('requests') }
    }

    useEffect(() => {
        loadedRef.current = new Set()
        load()
    }, [id])

    useEffect(() => { setGamePage(0) }, [gameSearch, gameFilter, gameSort])

    useEffect(() => {
        if (!myRole || myRole === 'none') return
        switch (tab) {
            case 'games':       Promise.all([fetchGamesTeams(), fetchMembers()]); break
            case 'teams':       Promise.all([fetchGamesTeams(), fetchMembers()]); break
            case 'members':     Promise.all([fetchGamesTeams(), fetchMembers()]); break
            case 'leaderboard': Promise.all([fetchGamesTeams(), fetchMembers(), fetchResults(), fetchParticipants()]); break
            case 'requests':    if (isEventAdmin) fetchRequests(); break
        }
    }, [tab, myRole])

    const loadAudit = async (page = 0) => {
        setAuditLoading(true)
        try {
            const { data } = await getEventAuditLog(id, AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE)
            setAuditEntries(data.entries)
            setAuditTotal(data.total)
            setAuditPage(page)
        } catch { /* silent */ } finally {
            setAuditLoading(false)
        }
    }

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
            subscribe('game_created', addOnce(setGames)),
            subscribe('game_updated', (m) => {
                if (m.event_id === id) setGames((p) => p.map((g) => g.id === m.data.id ? m.data : g))
            }),
            subscribe('game_status_changed', (m) => {
                if (m.event_id === id) setGames((p) => p.map((g) => g.id === m.data.id ? m.data : g))
            }),
            subscribe('game_cancelled', (m) => {
                if (m.event_id !== id) return
                setGames((p) => p.map((g) => g.id === m.data.id ? m.data : g))
                setEventResults((p) => p.filter((r) => r.game_id !== m.game_id))
            }),
            subscribe('team_created', addOnce(setTeams)),
            subscribe('member_added', addOnceByUserId(setMembers)),
            subscribe('join_request', addOnceByUserId(setJoinRequests)),
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
        } catch {
            toast.error('Failed to review request')
        }
    }

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

    const handleGameStatusChange = async (game) => {
        const next = GAME_STATUS_FLOW[game.status]
        if (!next) return
        try {
            const {data} = await updateGameStatus(game.id, next)
            setGames((p) => p.map((g) => g.id === data.id ? data : g))
        } catch {
            toast.error('Failed to update game')
        }
    }

    const handleDeleteGame = (gameId) => {
        setConfirmAction({
            title: 'Delete Game',
            message: 'Delete this game? This action cannot be undone.',
            confirmLabel: 'Delete',
            errorMsg: 'Failed to delete game',
            fn: async () => {
                await deleteGame(gameId)
                setGames((p) => p.filter((g) => g.id !== gameId))
                toast.success('Game deleted')
            },
        })
    }

    const handleCancelGame = (game) => {
        setConfirmAction({
            title: 'Cancel Game',
            message: `Cancel "${game.name}"? All recorded points for this game will be removed from the leaderboard.`,
            confirmLabel: 'Cancel Game',
            errorMsg: 'Failed to cancel game',
            fn: async () => {
                const {data} = await cancelGame(game.id)
                setGames((p) => p.map((g) => g.id === data.id ? data : g))
                setEventResults((p) => p.filter((r) => r.game_id !== game.id))
                toast.success('Game cancelled and points removed')
            },
        })
    }

    const handleDeleteTeam = (teamId) => {
        setConfirmAction({
            title: 'Delete Team',
            message: 'Delete this team? This action cannot be undone.',
            confirmLabel: 'Delete',
            errorMsg: 'Failed to delete team',
            fn: async () => {
                await deleteTeam(teamId)
                setTeams((p) => p.filter((t) => t.id !== teamId))
                toast.success('Team deleted')
            },
        })
    }

    const handleRemoveMember = (m) => {
        setConfirmAction({
            title: 'Remove Member',
            message: `Remove "${m.user_name}" from this event?`,
            confirmLabel: 'Remove',
            errorMsg: 'Failed to remove member',
            fn: async () => {
                await removeEventMember(id, m.user_id)
                setMembers((p) => p.filter((x) => x.user_id !== m.user_id))
                toast.success('Member removed')
            },
        })
    }


    const handleGenerateShare = async () => {
        setShareLoading(true)
        try {
            const {data} = await generateShareLink(id)
            setEvent((prev) => ({...prev, share_token: data.token}))
            toast.success('Share link generated')
        } catch {
            toast.error('Failed to generate share link')
        } finally {
            setShareLoading(false)
        }
    }

    const handleRevokeShare = () => {
        setConfirmAction({
            title: 'Revoke Share Link',
            message: 'Revoke this share link? Anyone with the URL will lose access.',
            confirmLabel: 'Revoke',
            errorMsg: 'Failed to revoke share link',
            fn: async () => {
                await revokeShareLink(id)
                setEvent((prev) => ({...prev, share_token: ''}))
                toast.success('Share link revoked')
            },
        })
    }

    const copyShareUrl = () => {
        const url = `${window.location.origin}/share/${event.share_token}`
        const fallback = () => {
            const el = document.createElement('textarea')
            el.value = url
            el.style.cssText = 'position:fixed;opacity:0'
            document.body.appendChild(el)
            el.focus()
            el.select()
            try {
                document.execCommand('copy')
                toast.success('Link copied!')
            } catch {
                toast.error('Copy failed — please copy the link manually')
            }
            document.body.removeChild(el)
        }
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => toast.success('Link copied!')).catch(fallback)
        } else {
            fallback()
        }
    }

    // ── Games: sort + filter (must be before any early returns — Rules of Hooks) ──
    const gameTypes = useMemo(() => [...new Set(games.map((g) => g.game_type))].sort(), [games])

    const sortedFilteredGames = useMemo(() => {
        let list = [...games]

        // Search
        const q = gameSearch.trim().toLowerCase()
        if (q) list = list.filter((g) =>
            g.name.toLowerCase().includes(q) ||
            g.game_type.toLowerCase().includes(q) ||
            (g.venue || '').toLowerCase().includes(q)
        )

        // Filters
        if (gameFilter.status) list = list.filter((g) => g.status === gameFilter.status)
        if (gameFilter.mode) list = list.filter((g) => g.game_mode === gameFilter.mode)
        if (gameFilter.type) list = list.filter((g) => g.game_type === gameFilter.type)

        // Sort
        const STATUS_RANK = {active: 0, scheduled: 1, completed: 2, cancelled: 3}
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
                    if (b.age_restricted) return 1
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
                    if (b.age_restricted) return 1
                    return 0
                }
            }
        })
        return list
    }, [games, gameSort, gameFilter, gameSearch, teams])

    const activeFilterCount = [gameFilter.status, gameFilter.mode, gameFilter.type].filter(Boolean).length
    const totalGamePages = Math.ceil(sortedFilteredGames.length / GAME_PAGE_SIZE)
    const pagedGames = sortedFilteredGames.slice(gamePage * GAME_PAGE_SIZE, (gamePage + 1) * GAME_PAGE_SIZE)

    // ── Leaderboard computations (must be before early returns — Rules of Hooks) ─
    // participantId → { team_id, team_color, team_name }
    const participantTeamMap = useMemo(() => {
        const map = {}
        for (const p of eventParticipants) {
            if (!p.team_id) continue
            const team = teams.find((t) => t.id === p.team_id)
            if (team) map[p.id] = { team_id: team.id, team_color: team.color, team_name: team.name }
        }
        return map
    }, [eventParticipants, teams])

    const teamLeaderboard = useMemo(() => {
        const map = {}
        const ensureTeam = (teamId, fallbackName) => {
            if (!teamId) return null
            if (!map[teamId]) {
                const team = teams.find((t) => t.id === teamId)
                map[teamId] = {
                    team_id: teamId,
                    team_name: team?.name || fallbackName || teamId,
                    team_color: team?.color || '#3b82f6',
                    total_score: 0, game_count: 0, rank_counts: {},
                }
            }
            return map[teamId]
        }
        for (const result of eventResults) {
            // Teams that have a direct entry in this result — don't double-count individuals
            const teamsWithDirectEntry = new Set(
                result.entries.filter((e) => e.participant_type === 'team').map((e) => e.participant_id)
            )
            for (const entry of result.entries) {
                if (entry.participant_type === 'team') {
                    const row = ensureTeam(entry.participant_id, entry.participant_name)
                    if (!row) continue
                    row.total_score += entry.score
                    row.game_count++
                    if (entry.position) row.rank_counts[entry.position] = (row.rank_counts[entry.position] || 0) + 1
                } else {
                    // Individual — add to their team only if no direct team entry for that team
                    const teamInfo = participantTeamMap[entry.participant_id]
                    if (!teamInfo || teamsWithDirectEntry.has(teamInfo.team_id)) continue
                    const row = ensureTeam(teamInfo.team_id, teamInfo.team_name)
                    if (!row) continue
                    row.total_score += entry.score
                    row.game_count++
                    if (entry.position) row.rank_counts[entry.position] = (row.rank_counts[entry.position] || 0) + 1
                }
            }
        }
        return Object.values(map).sort((a, b) => b.total_score - a.total_score)
    }, [eventResults, teams, participantTeamMap])

    const topPerformers = useMemo(() => {
        const map = {}
        for (const result of eventResults) {
            for (const entry of result.entries) {
                if (entry.participant_type === 'team') continue
                const key = entry.participant_name || entry.participant_id
                if (!map[key]) {
                    const teamInfo = participantTeamMap[entry.participant_id]
                    map[key] = {
                        name: key,
                        team_color: teamInfo?.team_color || null,
                        team_name: teamInfo?.team_name || null,
                        total_score: 0,
                        game_count: 0,
                        rank_counts: {}
                    }
                }
                map[key].total_score += entry.score
                map[key].game_count++
                if (entry.position) {
                    map[key].rank_counts[entry.position] = (map[key].rank_counts[entry.position] || 0) + 1
                }
                // Update team info if not yet resolved (participant may appear before participantTeamMap populated)
                if (!map[key].team_color && participantTeamMap[entry.participant_id]) {
                    const teamInfo = participantTeamMap[entry.participant_id]
                    map[key].team_color = teamInfo.team_color
                    map[key].team_name = teamInfo.team_name
                }
            }
        }
        return Object.values(map).sort((a, b) => {
            const gold   = (b.rank_counts[1] || 0) - (a.rank_counts[1] || 0); if (gold   !== 0) return gold
            const silver = (b.rank_counts[2] || 0) - (a.rank_counts[2] || 0); if (silver !== 0) return silver
            const bronze = (b.rank_counts[3] || 0) - (a.rank_counts[3] || 0); if (bronze !== 0) return bronze
            const score  = b.total_score - a.total_score;                      if (score  !== 0) return score
            return a.name.localeCompare(b.name)
        })
    }, [eventResults, participantTeamMap])

    const myGameResults = useMemo(() => {
        if (!user) return []
        return eventResults.flatMap((result) => {
            const game = games.find((g) => g.id === result.game_id)
            if (!game) return []
            return result.entries
                .filter((e) => e.participant_type !== 'team' && e.participant_name === user.name)
                .map((e) => ({...e, game}))
        }).sort((a, b) => (a.position || 9999) - (b.position || 9999))
    }, [eventResults, games, user])

    // ── Early returns (after all hooks) ──────────────────────────────────────────
    if (loading) return (
        <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
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
    const filteredMembers = members.filter((m) => {
        if (memberSearch) {
            const q = memberSearch.toLowerCase()
            if (
                !(m.user_name || '').toLowerCase().includes(q) &&
                !(m.username || '').toLowerCase().includes(q) &&
                !(m.user_email || '').toLowerCase().includes(q)
            ) return false
        }
        if (memberFilterTeam === '__none__' && m.team_id) return false
        if (memberFilterTeam && memberFilterTeam !== '__none__' && m.team_id !== memberFilterTeam) return false
        if (memberFilterAgeMin && m.age < parseInt(memberFilterAgeMin)) return false
        if (memberFilterAgeMax && m.age > parseInt(memberFilterAgeMax)) return false
        return true
    })

    const auditRule = roleAccess.find((r) => r.action === 'view_action_history')
    const canViewHistory = isEventAdmin ||
        (myRole === 'coordinator' && auditRule?.role_coordinator) ||
        (myRole === 'viewer'      && auditRule?.role_viewer)

    const can = (action) => {
        if (isEventAdmin) return true
        const rule = roleAccess.find((r) => r.action === action)
        if (!rule) return false
        if (myRole === 'coordinator') return !!rule.role_coordinator
        if (myRole === 'viewer')      return !!rule.role_viewer
        return false
    }
    const canDupGame    = can('duplicate_game')
    const canEditGame   = can('edit_game')
    const canCancelGame = can('cancel_game')
    const canDeleteGame = can('delete_game')
    const canDoGameMenu = canDupGame || canEditGame || canCancelGame || canDeleteGame

    const tabs = ['games', 'teams', 'members', 'leaderboard', ...(isEventAdmin ? ['requests', 'settings'] : []), ...(canViewHistory ? ['history'] : [])]

    const rankColumns = (event?.point_system?.length > 0 && event.point_system.some(r => r.rank_name))
        ? event.point_system
        : DEFAULT_POINT_SYSTEM

    const getRankName = (position) => {
        const rule = rankColumns.find(r => r.rank === position)
        return rule?.rank_name || `#${position}`
    }

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
                        <div className="flex items-center gap-3 mt-1">
                            <EventLogo event={event} size="lg"/>
                            <div>
                                <h1 className="text-2xl font-bold text-white">{event.name}</h1>
                                <p className="text-slate-400 text-sm capitalize">{event.event_type}</p>
                            </div>
                        </div>
                        {event.location && <p className="text-slate-500 text-sm"><MapPin size={12}
                                                                                         className="inline mr-1 shrink-0"/>{event.location}
                        </p>}
                        <p className="text-slate-500 text-sm">
                            <Calendar size={12}
                                      className="inline mr-1 shrink-0"/>{event.start_date}{event.end_date ? ` – ${event.end_date}` : ''}
                        </p>
                        {event.description && <p className="text-slate-300 text-sm mt-2">{event.description}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-3">
                        <div className="flex gap-3 text-center flex-wrap justify-end">
                            <div className="card px-4 py-2">
                                <div className="text-lg font-bold text-white">{games.length}</div>
                                <div className="text-xs text-slate-400">Games</div>
                            </div>
                            <div className="card px-4 py-2">
                                <div className="text-lg font-bold text-white">{teams.length}</div>
                                <div className="text-xs text-slate-400">Teams</div>
                            </div>
                            <div className="card px-4 py-2">
                                <div className="text-lg font-bold text-white">{members.length}</div>
                                <div className="text-xs text-slate-400">Members</div>
                            </div>
                            {isEventAdmin && joinRequests.length > 0 && (
                                <div className="card px-4 py-2 border-amber-500/40">
                                    <div className="text-lg font-bold text-amber-400">{joinRequests.length}</div>
                                    <div className="text-xs text-slate-400">Requests</div>
                                </div>
                            )}
                        </div>
                        {isEventAdmin && (
                            <div className="flex gap-2">
                                <button
                                    className="btn-secondary btn-sm flex items-center gap-1.5"
                                    onClick={() => setModal('edit-event')}
                                >
                                    <Pencil size={14} className="inline mr-1"/>Edit
                                </button>
                                <button
                                    className={`btn-secondary btn-sm flex items-center gap-1.5 ${showShare ? 'text-blue-400' : ''}`}
                                    onClick={() => setShowShare((v) => !v)}
                                >
                                    <><Link2 size={14} className="inline mr-1"/>Share</>
                                </button>
                            </div>
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
                                <p className="text-xs text-slate-500">Anyone with this link can view live event status —
                                    no login required.</p>
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
                                <p className="text-xs text-slate-400">Generate a public URL to share live event updates
                                    with anyone — no login required.</p>
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
                        {t === 'history' ? 'Action History' : t.charAt(0).toUpperCase() + t.slice(1)}
                        {t === 'requests' && joinRequests.length > 0 && (
                            <span
                                className="bg-amber-500 text-black text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                {joinRequests.length}
              </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Games Tab */}
            {tab === 'games' && (
                <div className="space-y-4">

                    {/* Compact toolbar: sort/filter + search left, add button right */}
                    <div className="flex items-center justify-between gap-2 min-h-[2rem]">
                        {games.length > 0 && (
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <GameControls
                                    sort={gameSort} onSort={setGameSort}
                                    filter={gameFilter} onFilter={setGameFilter}
                                    gameTypes={gameTypes} activeFilterCount={activeFilterCount}
                                />
                                <div className="relative flex-1 max-w-[180px]">
                                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    <input
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                                        placeholder="Search games…"
                                        value={gameSearch}
                                        onChange={(e) => setGameSearch(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}
                        {isEventAdmin && (
                            <button className="btn-primary ml-auto shrink-0" onClick={() => {
                                setModal('game');
                                setEditItem(null);
                                setDuplicateFrom(null)
                            }}>+ Add Game</button>
                        )}
                    </div>
                    {games.length === 0 ? (
                        <div className="text-center py-16 text-slate-400">No games scheduled yet.</div>
                    ) : sortedFilteredGames.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            No games match.{' '}
                            <button type="button" className="text-blue-400 hover:underline"
                                    onClick={() => { setGameFilter({status: '', mode: '', type: ''}); setGameSearch('') }}>
                                Clear
                            </button>
                        </div>
                    ) : (
                        <>
                        <div className="grid sm:grid-cols-2 gap-4">
                            {pagedGames.map((game) => (
                                <Link key={game.id} to={`/games/${game.id}`}
                                      className={`card p-5 cursor-pointer hover:bg-slate-700/50 transition-colors relative ${openMenu === game.id ? 'z-10' : ''}`}>
                                    <div className="flex items-start justify-between mb-2">
                                        <span className={`badge badge-${game.status}`}>{game.status}</span>
                                        {canDoGameMenu && (
                                            <>
                                                <button className="absolute top-3 right-3 btn-secondary btn-sm"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            setOpenMenu(openMenu === game.id ? null : game.id)
                                                        }} title="More actions"><MoreVertical size={14}/></button>
                                                {openMenu === game.id && (
                                                    <div ref={menuRef}
                                                         className="absolute top-10 right-3 z-30 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-1 min-w-[140px]">
                                                        {canDupGame && (
                                                            <button
                                                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded-lg"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    setDuplicateFrom(game);
                                                                    setEditItem(null);
                                                                    setModal('game');
                                                                    setOpenMenu(null)
                                                                }}><Copy size={14}/>Copy
                                                            </button>
                                                        )}
                                                        {canEditGame && (
                                                            <button
                                                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded-lg"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    setEditItem(game);
                                                                    setDuplicateFrom(null);
                                                                    setModal('game');
                                                                    setOpenMenu(null)
                                                                }}><Pencil size={14}/>Edit
                                                            </button>
                                                        )}
                                                        {canCancelGame && game.status !== 'cancelled' && (
                                                            <button
                                                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-amber-400 hover:bg-slate-700 rounded-lg"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    handleCancelGame(game);
                                                                    setOpenMenu(null)
                                                                }}><Ban size={14}/>Cancel</button>
                                                        )}
                                                        {canDeleteGame && (
                                                            <button
                                                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-slate-700 rounded-lg"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    handleDeleteGame(game.id);
                                                                    setOpenMenu(null)
                                                                }}><Trash2 size={14}/>Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <h3 className="font-semibold text-white">
                                        {game.name}
                                        {game.age_restricted && ageLabel(game.age_from, game.age_to) && (
                                            <span className="ml-1.5 text-xs font-normal text-slate-400">({ageLabel(game.age_from, game.age_to)})</span>
                                        )}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-1">{game.game_type}</p>
                                    {game.venue && <p className="text-xs text-slate-500"><MapPin size={12}
                                                                                                 className="inline mr-1"/>{game.venue}
                                    </p>}
                                    {game.scheduled_at && <p className="text-xs text-slate-500"><Clock3 size={12}
                                                                                                        className="inline mr-1"/>{game.scheduled_at}
                                    </p>}
                                    {game.description &&
                                        <p className="text-xs text-slate-400 mt-2">{game.description}</p>}
                                </Link>
                            ))}
                        </div>
                        {totalGamePages > 1 && (
                            <div className="flex items-center justify-between pt-1">
                                <span className="text-xs text-slate-500">
                                    {gamePage * GAME_PAGE_SIZE + 1}–{Math.min((gamePage + 1) * GAME_PAGE_SIZE, sortedFilteredGames.length)} of {sortedFilteredGames.length}
                                </span>
                                <div className="flex gap-1">
                                    <button className="btn-secondary btn-sm" disabled={gamePage === 0}
                                            onClick={() => setGamePage((p) => p - 1)}>‹ Prev</button>
                                    <button className="btn-secondary btn-sm" disabled={gamePage >= totalGamePages - 1}
                                            onClick={() => setGamePage((p) => p + 1)}>Next ›</button>
                                </div>
                            </div>
                        )}
                        </>
                    )}
                </div>
            )}

            {/* Teams Tab */}
            {tab === 'teams' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <EventLogo event={event} size="sm"/>
                            <span className="text-sm font-medium text-slate-300">{event.name}</span>
                        </div>
                        {isEventAdmin && (
                            <button className="btn-primary" onClick={() => {
                                setModal('team');
                                setEditItem(null)
                            }}>+ Add Team</button>
                        )}
                    </div>
                    {teams.length === 0 ? (
                        <div className="text-center py-16 text-slate-400">No teams yet.</div>
                    ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {teams.map((team) => (
                                <div key={team.id} className="card p-5 relative">
                                    <div className="flex items-center gap-3 mb-3">
                                        <TeamAvatar team={team}/>
                                        <div>
                                            <h3 className="font-semibold text-white">
                                                {team.name}
                                                <span className="ml-1.5 text-xs font-normal text-slate-400">
                           ({members.filter((m) => m.team_id === team.id).length} members)
                         </span>
                                            </h3>
                                        </div>
                                    </div>
                                    {team.description &&
                                        <p className="text-xs text-slate-400 mb-3">{team.description}</p>}
                                    {isEventAdmin && (
                                        <div className="flex flex-col gap-1.5 absolute top-3 right-3">
                                            <button className="btn-secondary btn-sm" onClick={() => {
                                                setEditItem(team);
                                                setModal('team')
                                            }} title="Edit team"><Pencil size={14} className="inline mr-1"/></button>
                                            <button className="btn-danger btn-sm"
                                                    onClick={() => handleDeleteTeam(team.id)} title="Delete team">
                                                <Trash2 size={14}/></button>
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
                    {/* Toolbar */}
                    <div className="flex flex-wrap items-end gap-2">
                        <input
                            className="input text-sm py-1.5 flex-1 min-w-[160px]"
                            placeholder="Search name, username, email…"
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                        />
                        <select
                            className="input text-sm py-1.5 w-36"
                            value={memberFilterTeam}
                            onChange={(e) => setMemberFilterTeam(e.target.value)}
                        >
                            <option value="">All teams</option>
                            <option value="__none__">No team</option>
                            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <div className="flex items-center gap-1">
                            <input
                                className="input text-sm py-1.5 w-20"
                                type="number" min={0} placeholder="Age min"
                                value={memberFilterAgeMin}
                                onChange={(e) => setMemberFilterAgeMin(e.target.value)}
                            />
                            <span className="text-slate-500 text-xs">–</span>
                            <input
                                className="input text-sm py-1.5 w-20"
                                type="number" min={0} placeholder="Age max"
                                value={memberFilterAgeMax}
                                onChange={(e) => setMemberFilterAgeMax(e.target.value)}
                            />
                        </div>
                        {(memberSearch || memberFilterTeam || memberFilterAgeMin || memberFilterAgeMax) && (
                            <button
                                type="button"
                                className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1.5"
                                onClick={() => {
                                    setMemberSearch('');
                                    setMemberFilterTeam('');
                                    setMemberFilterAgeMin('');
                                    setMemberFilterAgeMax('')
                                }}
                            >✕ Clear</button>
                        )}
                        {isEventAdmin && (
                            <div className="flex gap-2 ml-auto">
                                <button className="btn-secondary" onClick={() => setModal('bulk-member')}>⬆ Bulk Add
                                </button>
                                <button className="btn-primary" onClick={() => {
                                    setModal('member');
                                    setEditItem(null)
                                }}>+ Add Member
                                </button>
                            </div>
                        )}
                    </div>

                    {members.length === 0 ? (
                        <div className="text-center py-16 text-slate-400">No members yet.</div>
                    ) : filteredMembers.length === 0 ? (
                        <div className="text-center py-16 text-slate-400">No members match filters.</div>
                    ) : (
                        <div className="card overflow-hidden">
                            <div className="px-4 py-2 border-b border-slate-700 text-xs text-slate-500">
                                {filteredMembers.length} of {members.length} members
                            </div>
                            <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                                <tr>
                                    <th className="px-4 py-3 text-left">User</th>
                                    <th className="px-4 py-3 text-left hidden md:table-cell">Details</th>
                                    <th className="px-4 py-3 text-left">Team</th>
                                    <th className="px-4 py-3 text-left">Role</th>
                                    <th className="px-4 py-3 text-left hidden sm:table-cell">Added</th>
                                    {isEventAdmin && <th className="px-4 py-3 text-right">Actions</th>}
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-600">
                                {filteredMembers.map((m) => {
                                    const teamName = m.team_name || teams.find((t) => t.id === m.team_id)?.name || ''
                                    const teamColor = m.team_id ? teams.find((t) => t.id === m.team_id)?.color : null
                                    const memberBorder = teamColor
                                        ? { border: `2px solid ${teamColor}` }
                                        : { border: '2px solid rgba(0,149,255,0.25)' }
                                    return (
                                        <tr key={m.user_id} className="hover:bg-slate-600/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    {m.profile_picture ? (
                                                        <img src={m.profile_picture} alt={m.user_name}
                                                             className="w-8 h-8 rounded-full object-cover shrink-0"
                                                             style={memberBorder}
                                                             title={teamName || undefined}/>
                                                    ) : (
                                                        <div
                                                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                                            style={{
                                                                background: teamColor ? `${teamColor}22` : 'rgba(0,149,255,0.12)',
                                                                color: teamColor || '#33aaff',
                                                                ...memberBorder
                                                            }}
                                                            title={teamName || undefined}>
                                                            {m.user_name?.[0]?.toUpperCase() ?? '?'}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="font-medium text-white">{m.user_name}</div>
                                                        <div className="text-xs text-slate-500 font-mono">
                                                            {m.username ? `@${m.username}` : m.user_email}
                                                        </div>
                                                        {m.tags && (
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {m.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                                                                    <span key={t}
                                                                          className="text-xs text-blue-400">#{t}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-400 space-y-0.5">
                                                {m.age > 0 && <div>Age: {m.age}</div>}
                                                {m.club && <div>Club: {m.club}</div>}
                                                {m.phone && <div>{m.phone}</div>}
                                                {m.address && <div className="truncate max-w-32">{m.address}</div>}
                                                {!m.age && !m.club && !m.phone && !m.address &&
                                                    <span className="text-slate-500">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-300">
                                                {teamName || <span className="text-slate-600">—</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`text-xs px-2 py-0.5 rounded-full ${ROLE_BADGE[m.role]}`}>{m.role}</span>
                                            </td>
                                            <td className="px-4 py-3 hidden sm:table-cell text-slate-400 text-xs">
                                                {new Date(m.created_at).toLocaleDateString()}
                                            </td>
                                            {isEventAdmin && (
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex flex-col gap-1 items-end">
                                                        <button className="btn-secondary btn-sm" onClick={() => {
                                                            setEditItem(m);
                                                            setModal('member')
                                                        }} title="Edit member"><Pencil size={14}/></button>
                                                        <button className="btn-danger btn-sm"
                                                                onClick={() => handleRemoveMember(m)}
                                                                title="Remove member"><Trash2 size={14}/></button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    )
                                })}
                                </tbody>
                            </table>
                            </div>
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
                                            <div
                                                className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-white font-semibold shrink-0">
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
                                            <button className="btn-primary btn-sm"
                                                    onClick={() => handleReview(req.user_id, 'approved')}>Approve
                                            </button>
                                            <button className="btn-danger btn-sm"
                                                    onClick={() => handleReview(req.user_id, 'rejected')}>Reject
                                            </button>
                                        </div>
                                    </div>
                                    {req.answers && Object.keys(req.answers).length > 0 && (
                                        <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t border-slate-600">
                                            {(req.questions?.length > 0 ? req.questions : (event.join_questions?.length > 0 ? event.join_questions : DEFAULT_QUESTIONS)).map((q) =>
                                                    req.answers[q.id] ? (
                                                        <div key={q.id}>
                                                            <div
                                                                className="text-xs text-slate-500 uppercase tracking-wide mb-1">{q.label}</div>
                                                            {q.type === 'tags' ? (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {req.answers[q.id].split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                                                                        <span key={t}
                                                                              className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2 py-0.5 font-medium">
                                    #{t}
                                  </span>
                                                                    ))}
                                                                </div>
                                                            ) : q.type === 'team-select' ? (
                                                                <div className="text-sm text-slate-200">
                                                                    {teams.find((t) => t.id === req.answers[q.id])?.name || req.answers[q.id]}
                                                                </div>
                                                            ) : (
                                                                <div
                                                                    className="text-sm text-slate-200 break-words">{req.answers[q.id]}</div>
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
                <SettingsTab event={event} onSave={(updated) => setEvent(updated)} initialRoleRules={roleAccess}/>
            )}

            {/* Action History Tab */}
            {tab === 'history' && canViewHistory && (
              <ActionHistoryTab
                entries={auditEntries}
                total={auditTotal}
                loading={auditLoading}
                page={auditPage}
                members={members}
                games={games}
                onMount={() => loadAudit(0)}
                onPage={(p) => loadAudit(p)}
              />
            )}

            {/* Leaderboard Tab */}
            {tab === 'leaderboard' && (
                <div className="space-y-8">

                    {/* Leaderboard header with event logo */}
                    <div className="flex items-center gap-3">
                        <EventLogo event={event} size="md"/>
                        <div>
                            <h2 className="text-lg font-bold text-white">{event.name}</h2>
                            <p className="text-xs text-slate-400 capitalize">{event.event_type} · Leaderboard</p>
                        </div>
                    </div>

                    {/* My Game Results */}
                    <section>
                        <h2 className="text-lg font-semibold text-white mb-4">My Game Results</h2>
                        {myGameResults.length === 0 ? (
                            <div className="card p-6 text-center text-slate-500 text-sm">
                                You haven't been recorded as a participant in any game yet.
                            </div>
                        ) : (
                            <div className="card overflow-x-auto">
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
                                                <Link to={`/games/${e.game.id}`}
                                                      className="font-medium text-white hover:text-blue-400 transition-colors">
                                                    {e.game.name}
                                                    {e.game.age_restricted && ageLabel(e.game.age_from, e.game.age_to) && (
                                                        <span className="ml-1 text-xs font-normal text-slate-400">({ageLabel(e.game.age_from, e.game.age_to)})</span>
                                                    )}
                                                </Link>
                                                <div
                                                    className="text-xs text-slate-500 capitalize">{e.game.game_type}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {e.position
                                                    ? <span
                                                        className={`text-xs font-bold ${e.position === 1 ? 'text-yellow-400' : e.position === 2 ? 'text-slate-300' : e.position === 3 ? 'text-orange-400' : 'text-slate-400'}`}>{getRankName(e.position)}</span>
                                                    : <span className="text-slate-500 text-sm">—</span>}
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
                                <div className="card overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Team</th>
                                            {rankColumns.map((r) => (
                                                <th key={r.rank}
                                                    className={`px-3 py-3 text-center ${r.rank === 1 ? 'text-yellow-400' : r.rank === 2 ? 'text-slate-300' : r.rank === 3 ? 'text-orange-400' : 'text-slate-400'}`}>
                                                    {r.rank_name}
                                                </th>
                                            ))}
                                            <th className="px-4 py-3 text-center hidden sm:table-cell">Games</th>
                                            <th className="px-4 py-3 text-right">Pts</th>
                                        </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-600">
                                        {teamLeaderboard.map((t, i) => (
                                            <tr key={t.team_id || i}
                                                className={`hover:bg-slate-600/30 transition-colors ${i === 0 ? 'bg-amber-500/5' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                                                        <span className="w-3 h-3 rounded-full shrink-0"
                                                              style={{backgroundColor: t.team_color}}/>
                                                        <span
                                                            className="font-medium text-white truncate">{t.team_name}</span>
                                                    </div>
                                                </td>
                                                {rankColumns.map((r) => (
                                                    <td key={r.rank}
                                                        className={`px-3 py-3 text-center font-semibold ${r.rank === 1 ? 'text-yellow-400' : r.rank === 2 ? 'text-slate-300' : r.rank === 3 ? 'text-orange-400' : 'text-slate-400'}`}>
                                                        {t.rank_counts[r.rank] || 0}
                                                    </td>
                                                ))}
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
                                <div className="card p-6 text-center text-slate-500 text-sm">No individual results
                                    yet.</div>
                            ) : (
                                <div className="card overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Performer</th>
                                            {rankColumns.map((r) => (
                                                <th key={r.rank}
                                                    className={`px-3 py-3 text-center ${r.rank === 1 ? 'text-yellow-400' : r.rank === 2 ? 'text-slate-300' : r.rank === 3 ? 'text-orange-400' : 'text-slate-400'}`}>
                                                    {r.rank_name}
                                                </th>
                                            ))}
                                            <th className="px-4 py-3 text-center hidden sm:table-cell">Games</th>
                                            <th className="px-4 py-3 text-right">Pts</th>
                                        </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-600">
                                        {topPerformers.map((ind, i) => {
                                            const picMember = members.find((m) => m.user_name === ind.name)
                                            const picSrc = picMember?.profile_picture
                                            const borderStyle = ind.team_color
                                                ? { border: `2px solid ${ind.team_color}` }
                                                : { border: '2px solid rgba(0,149,255,0.25)' }
                                            return (
                                                <tr key={ind.name}
                                                    className={`hover:bg-slate-600/30 transition-colors ${i === 0 ? 'bg-amber-500/5' : ''}`}>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                                                            {picSrc ? (
                                                                <img src={picSrc} alt={ind.name}
                                                                     className="w-6 h-6 rounded-full object-cover shrink-0"
                                                                     style={borderStyle}
                                                                     title={ind.team_name || ''}/>
                                                            ) : (
                                                                <div
                                                                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                                                    style={{
                                                                        background: ind.team_color ? `${ind.team_color}22` : 'rgba(0,149,255,0.12)',
                                                                        color: ind.team_color || '#33aaff',
                                                                        ...borderStyle
                                                                    }}
                                                                    title={ind.team_name || ''}>
                                                                    {ind.name?.[0]?.toUpperCase() ?? '?'}
                                                                </div>
                                                            )}
                                                            <span
                                                                className="font-medium text-white truncate">{ind.name}</span>
                                                        </div>
                                                    </td>
                                                    {rankColumns.map((r) => (
                                                        <td key={r.rank}
                                                            className={`px-3 py-3 text-center font-semibold ${r.rank === 1 ? 'text-yellow-400' : r.rank === 2 ? 'text-slate-300' : r.rank === 3 ? 'text-orange-400' : 'text-slate-400'}`}>
                                                            {ind.rank_counts[r.rank] || 0}
                                                        </td>
                                                    ))}
                                                    <td className="px-4 py-3 text-center text-slate-400 hidden sm:table-cell">{ind.game_count}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-white">{ind.total_score}</td>
                                                </tr>
                                            )
                                        })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>

                    </div>
                </div>
            )}

            {/* Modals */}
            {modal === 'game' && (
                <CreateGameModal eventId={id} game={editItem} duplicateFrom={duplicateFrom} games={games} teams={teams}
                                 onClose={() => {
                                     setModal(null);
                                     setEditItem(null);
                                     setDuplicateFrom(null)
                                 }}
                                 onSave={(g) => {
                                     if (editItem) setGames((p) => p.map((x) => x.id === g.id ? g : x))
                                     else setGames((p) => p.some((x) => x.id === g.id) ? p : [...p, g])
                                     setModal(null);
                                     setEditItem(null);
                                     setDuplicateFrom(null)
                                 }}
                />
            )}
            {modal === 'team' && (
                <CreateTeamModal eventId={id} team={editItem}
                                 onClose={() => {
                                     setModal(null);
                                     setEditItem(null)
                                 }}
                                 onSave={(t) => {
                                     if (editItem) setTeams((p) => p.map((x) => x.id === t.id ? t : x))
                                     else setTeams((p) => p.some((x) => x.id === t.id) ? p : [...p, t])
                                     setModal(null);
                                     setEditItem(null)
                                 }}
                />
            )}
            {modal === 'member' && (
                <AddEventMemberModal eventId={id} member={editItem} teams={teams}
                                     onClose={() => {
                                         setModal(null);
                                         setEditItem(null)
                                     }}
                                     onSave={(m) => {
                                         if (editItem) setMembers((p) => p.map((x) => x.user_id === m.user_id ? m : x))
                                         else setMembers((p) => p.some((x) => x.user_id === m.user_id) ? p : [...p, m])
                                         setModal(null);
                                         setEditItem(null)
                                     }}
                />
            )}
            {modal === 'edit-event' && (
                <CreateEventModal event={event}
                                  onClose={() => setModal(null)}
                                  onSave={(updated) => {
                                      setEvent(updated);
                                      setModal(null)
                                  }}
                />
            )}
            {modal === 'bulk-member' && (
                <BulkAddMembersModal eventId={id}
                                     templateFields={event?.user_template_fields?.length > 0 ? event.user_template_fields : DEFAULT_TEMPLATE_FIELDS}
                                     teams={teams}
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
