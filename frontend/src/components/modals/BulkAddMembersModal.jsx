import { useState, useRef, useCallback } from 'react'
import { bulkAddMembers } from '../../services/api'
import toast from 'react-hot-toast'
import Modal from './Modal'

const ROLES = ['coordinator', 'viewer', 'admin']

const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')

const DEFAULT_TEMPLATE_FIELDS = [
  { id: 'full_name',  label: 'Full Name',     required: true  },
  { id: 'team_name',  label: 'Team Name',     required: true  },
  { id: 'age',        label: 'Age',           required: true  },
  { id: 'phone',      label: 'Phone Number',  required: false },
  { id: 'email',      label: 'Email Address', required: false },
  { id: 'address',    label: 'Address',       required: false },
  { id: 'note',       label: 'Note',          required: false },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInputType(field) {
  const id    = (field.id    || '').toLowerCase()
  const label = (field.label || '').toLowerCase()
  if (id === 'age'              || label === 'age')              return 'number'
  if (id.includes('email')     || label.includes('email'))      return 'email'
  if (id.includes('phone')     || label.includes('phone'))      return 'tel'
  return 'text'
}

function isTeamSelect(field) {
  return field.id === 'team_name'
}

function isMultiline(field) {
  const id    = (field.id    || '').toLowerCase()
  const label = (field.label || '').toLowerCase()
  return id.includes('address') || label.includes('address') ||
         id.includes('note')    || label.includes('note')    ||
         id.includes('remark')  || label.includes('remark')
}

function parseName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] }
  const lastName = parts.pop()
  return { firstName: parts.join(' '), lastName }
}

function buildBulkEntry(values, templateFields, role) {
  const getVal = (...ids) => {
    for (const id of ids) {
      const f = templateFields.find((f) => f.id === id)
      if (f && values[f.id]?.trim()) return values[f.id].trim()
    }
    return ''
  }
  const { firstName, lastName } = parseName(getVal('full_name'))
  const knownIds = new Set(['full_name', 'team_name', 'age', 'phone', 'email', 'address', 'note'])
  const customParts = templateFields
    .filter((f) => !knownIds.has(f.id) && values[f.id]?.trim())
    .map((f) => `${f.label}: ${values[f.id].trim()}`)
  const notePart = getVal('note')
  const tags = [notePart, ...customParts].filter(Boolean).join('; ')
  return {
    first_name: firstName,
    last_name:  lastName,
    age:        parseInt(getVal('age')) || 0,
    phone:      getVal('phone'),
    email:      getVal('email'),
    address:    getVal('address'),
    club:       getVal('team_name'),
    tags,
    role,
  }
}

function buildEmptyForm(fields) {
  return Object.fromEntries(fields.map((f) => [f.id, '']))
}

function entryDisplayName(values, templateFields) {
  const nameField = templateFields.find((f) => f.id === 'full_name')
  if (nameField && values[nameField.id]?.trim()) return values[nameField.id].trim()
  const first = templateFields.find((f) => f.required && values[f.id]?.trim())
  return first ? values[first.id] : '(unnamed)'
}

function entrySummary(values, templateFields) {
  const skip = new Set(['full_name'])
  return templateFields
    .filter((f) => !skip.has(f.id) && values[f.id]?.trim())
    .slice(0, 3)
    .map((f) => `${f.label}: ${values[f.id].trim()}`)
    .join(' · ')
}

// ── CSV helpers (Upload CSV tab) ───────────────────────────────────────────────

function previewUsername(firstName, lastName) {
  const initials = firstName.trim().split(/\s+/).filter(Boolean)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, '')[0]?.toLowerCase() || '').join('')
  const lastWord = lastName.trim().split(/\s+/).filter(Boolean).at(-1)
    ?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''
  return (initials + lastWord) || '—'
}

function parseCSV(text, templateFields, defaultRole) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []

  const rawHeaders = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase())
  const colMap = {}
  rawHeaders.forEach((h, i) => {
    const field = templateFields.find((f) => f.label.toLowerCase() === h || f.id.toLowerCase() === h)
    if (field) colMap[i] = field.id
    else if (h === 'role') colMap[i] = '__role__'
  })

  const primaryField = templateFields.find((f) => f.required) || templateFields[0]

  return lines.slice(1).map((line) => {
    const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''))
    if (parts.every((p) => !p)) return null

    const values = Object.fromEntries(templateFields.map((f) => [f.id, '']))
    let role = defaultRole

    parts.forEach((val, i) => {
      if (colMap[i] === '__role__') {
        if (ROLES.includes(val.toLowerCase())) role = val.toLowerCase()
      } else if (colMap[i]) {
        values[colMap[i]] = val
      }
    })

    const valid = primaryField ? !!values[primaryField.id]?.trim() : true
    return { values, role, valid }
  }).filter(Boolean)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BulkAddMembersModal({ eventId, templateFields: propFields, teams = [], onClose, onSave }) {
  const templateFields = propFields?.length > 0 ? propFields : DEFAULT_TEMPLATE_FIELDS

  // shared
  const [mode, setMode] = useState('form')

  // ── Add User tab state ──
  const [formValues, setFormValues]   = useState(() => buildEmptyForm(templateFields))
  const [formRole,   setFormRole]     = useState('coordinator')
  const [formErrors, setFormErrors]   = useState({})
  const [entries,    setEntries]      = useState([])

  // ── Upload CSV tab state ──
  const [text,        setText]        = useState('')
  const [defaultRole, setDefaultRole] = useState('coordinator')
  const [csvStep,     setCsvStep]     = useState('input')
  const [rows,        setRows]        = useState([])
  const [results,     setResults]     = useState([])
  const [csvSaving,   setCsvSaving]   = useState(false)
  const [dragOver,    setDragOver]    = useState(false)
  const fileRef = useRef(null)

  // ── Save a single entry in background ───────────────────────────────────────
  const saveEntry = useCallback(async (entry) => {
    setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: 'saving' } : e))
    try {
      const { data } = await bulkAddMembers(eventId, {
        members: [buildBulkEntry(entry.values, templateFields, entry.role)],
      })
      const result = data.results[0]
      if (result?.success) {
        setEntries((prev) => prev.map((e) =>
          e.id === entry.id
            ? { ...e, status: 'success', username: result.username, member: result.member }
            : e
        ))
        if (result.member) onSave([result.member])
      } else {
        setEntries((prev) => prev.map((e) =>
          e.id === entry.id
            ? { ...e, status: 'error', errorMsg: result?.error || 'Failed to save' }
            : e
        ))
      }
    } catch (err) {
      setEntries((prev) => prev.map((e) =>
        e.id === entry.id
          ? { ...e, status: 'error', errorMsg: err.response?.data?.error || 'Network error' }
          : e
      ))
    }
  }, [eventId, templateFields, onSave])

  // ── Form submit ──────────────────────────────────────────────────────────────
  const handleFormSubmit = (e) => {
    e.preventDefault()
    const errors = {}
    templateFields.forEach((f) => {
      if (f.required && !formValues[f.id]?.trim()) errors[f.id] = `${f.label} is required`
    })
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }

    const entry = {
      id: randomId(),
      values: { ...formValues },
      role: formRole,
      status: 'saving',
    }
    setEntries((prev) => [...prev, entry])
    setFormValues(buildEmptyForm(templateFields))
    setFormErrors({})
    saveEntry(entry)
  }

  const retryEntry = (entry) => {
    setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: 'saving', errorMsg: '' } : e))
    saveEntry(entry)
  }

  const removeEntry = (id) => setEntries((prev) => prev.filter((e) => e.id !== id))

  const setField = (id, val) => {
    setFormValues((p) => ({ ...p, [id]: val }))
    if (formErrors[id]) setFormErrors((p) => { const n = { ...p }; delete n[id]; return n })
  }

  // ── CSV helpers ──────────────────────────────────────────────────────────────
  const switchMode = (m) => {
    setMode(m)
    setText(''); setCsvStep('input'); setRows([]); setResults([])
  }

  const handleCSVParse = () => {
    const raw = parseCSV(text, templateFields, defaultRole)
    const primaryField = templateFields.find((f) => f.required) || templateFields[0]
    const deduped = raw.filter((r, i, arr) =>
      arr.findIndex((x) =>
        (x.values[primaryField?.id] || '').toLowerCase() === (r.values[primaryField?.id] || '').toLowerCase()
      ) === i
    )
    setRows(deduped)
    setCsvStep('preview')
  }

  const removeRow   = (i) => setRows((p) => p.filter((_, idx) => idx !== i))
  const setRowField = (i, key, val) => {
    if (key === 'role') {
      setRows((p) => p.map((r, idx) => idx === i ? { ...r, role: val } : r))
    } else {
      setRows((p) => p.map((r, idx) => idx === i ? { ...r, values: { ...r.values, [key]: val } } : r))
    }
  }
  const validRows   = rows.filter((r) => r.valid)

  const handleCSVSubmit = async () => {
    if (!validRows.length) return
    setCsvSaving(true)
    try {
      const { data } = await bulkAddMembers(eventId, {
        members: validRows.map((r) => buildBulkEntry(r.values, templateFields, r.role)),
      })
      setResults(data.results)
      setCsvStep('results')
      const added = data.results.filter((r) => r.success && r.member).map((r) => r.member)
      if (added.length) onSave(added)
      const count = data.results.filter((r) => r.success).length
      toast.success(`${count} member${count !== 1 ? 's' : ''} added`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Bulk add failed')
    } finally {
      setCsvSaving(false)
    }
  }

  const handleFileLoad = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { setText(ev.target.result); setCsvStep('input'); setRows([]) }
    reader.readAsText(file)
  }

  const lineCount = text.trim() ? text.trim().split('\n').length : 0

  const downloadCSVTemplate = () => {
    const escape = (v) => (v.includes(',') ? `"${v}"` : v)
    const headers = [...templateFields.map((f) => f.label), 'Role']
    const sample  = templateFields.map((f) => {
      if (f.id === 'full_name')  return 'John Smith'
      if (f.id === 'team_name')  return teams[0]?.name || 'Team Alpha'
      if (f.id === 'age')        return '25'
      if (f.id === 'phone')      return '+1234567890'
      if (f.id === 'email')      return 'john@example.com'
      if (f.id === 'address')    return '123 Main St'
      return ''
    })
    const blob = new Blob(
      [headers.map(escape).join(',') + '\n' + [...sample, 'coordinator'].map(escape).join(',')],
      { type: 'text/csv' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'members_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Counts ───────────────────────────────────────────────────────────────────
  const successCount = entries.filter((e) => e.status === 'success').length
  const errorCount   = entries.filter((e) => e.status === 'error').length
  const savingCount  = entries.filter((e) => e.status === 'saving').length

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Modal title="Bulk Add Members" onClose={onClose} size="xl">
      <div className="space-y-5">

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-slate-600 overflow-hidden w-fit">
          {[{ key: 'form', label: 'Add User' }, { key: 'csv', label: 'Upload CSV' }].map(({ key, label }, i) => (
            <button key={key} type="button" onClick={() => switchMode(key)}
              className={`px-4 py-1.5 text-sm transition-colors ${i > 0 ? 'border-l border-slate-600' : ''} ${
                mode === key ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >{label}</button>
          ))}
        </div>

        {/* ══ Add User tab ══════════════════════════════════════════════════════ */}
        {mode === 'form' && (
          <div className="space-y-5">

            {/* Dynamic form */}
            <form onSubmit={handleFormSubmit} className="space-y-2" noValidate>
              <div className="grid grid-cols-2 gap-2">
                {templateFields.map((field) => (
                  <div key={field.id} className={isMultiline(field) ? 'col-span-2' : ''}>
                    <label className="text-xs text-slate-400 mb-0.5 block">
                      {field.label}
                      {field.required
                        ? <span className="text-red-400 ml-0.5">*</span>
                        : <span className="text-slate-600 ml-1">(opt)</span>}
                    </label>
                    {isTeamSelect(field) ? (
                      <select
                        className={`input text-sm py-1.5 ${formErrors[field.id] ? 'border-red-500' : ''}`}
                        value={formValues[field.id] || ''}
                        onChange={(e) => setField(field.id, e.target.value)}
                      >
                        <option value="">— Select team —</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                    ) : isMultiline(field) ? (
                      <textarea
                        className={`input resize-none text-sm py-1.5 ${formErrors[field.id] ? 'border-red-500' : ''}`}
                        rows={2}
                        value={formValues[field.id] || ''}
                        onChange={(e) => setField(field.id, e.target.value)}
                        placeholder={field.label}
                      />
                    ) : (
                      <input
                        className={`input text-sm py-1.5 ${formErrors[field.id] ? 'border-red-500' : ''}`}
                        type={getInputType(field)}
                        value={formValues[field.id] || ''}
                        onChange={(e) => setField(field.id, e.target.value)}
                        placeholder={field.label}
                        min={getInputType(field) === 'number' ? 0 : undefined}
                      />
                    )}
                    {formErrors[field.id] && (
                      <p className="text-xs text-red-400 mt-0.5">{formErrors[field.id]}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <select
                  className="input text-xs py-1.5 w-28"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  title="Role"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
                <button type="submit" className="btn-primary text-sm py-1.5 flex-1">
                  + Add User
                </button>
              </div>
            </form>

            {/* Entries list */}
            {entries.length > 0 && (
              <div className="space-y-2">
                {/* Summary bar */}
                <div className="flex items-center gap-4 text-xs text-slate-400 pb-1 border-b border-slate-700">
                  <span>{entries.length} submitted</span>
                  {successCount > 0 && <span className="text-emerald-400">✓ {successCount} saved</span>}
                  {savingCount  > 0 && <span className="text-blue-400">⟳ {savingCount} saving</span>}
                  {errorCount   > 0 && <span className="text-red-400">✗ {errorCount} failed</span>}
                </div>

                <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm border ${
                        entry.status === 'success' ? 'bg-emerald-500/5 border-emerald-500/20' :
                        entry.status === 'error'   ? 'bg-red-500/5 border-red-500/20' :
                                                     'bg-slate-800 border-slate-700'
                      }`}
                    >
                      {/* Status icon */}
                      <span className="shrink-0 mt-0.5 text-base leading-none">
                        {entry.status === 'saving'  && <span className="inline-block animate-spin text-blue-400">⟳</span>}
                        {entry.status === 'success' && <span className="text-emerald-400">✓</span>}
                        {entry.status === 'error'   && <span className="text-red-400">✗</span>}
                      </span>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">
                          {entryDisplayName(entry.values, templateFields)}
                        </p>
                        {entrySummary(entry.values, templateFields) && (
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            {entrySummary(entry.values, templateFields)}
                          </p>
                        )}
                        {entry.status === 'success' && entry.username && (
                          <p className="text-xs text-blue-400 font-mono mt-0.5">@{entry.username}</p>
                        )}
                        {entry.status === 'error' && (
                          <p className="text-xs text-red-400 mt-0.5">{entry.errorMsg}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {entry.status === 'error' && (
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
                            onClick={() => retryEntry(entry)}
                          >
                            Retry
                          </button>
                        )}
                        {entry.status !== 'saving' && (
                          <button
                            type="button"
                            className="text-slate-500 hover:text-red-400 transition-colors text-base leading-none px-1"
                            onClick={() => removeEntry(entry.id)}
                            title="Remove from list"
                          >×</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button type="button" className="btn-secondary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}

        {/* ══ Upload CSV tab ════════════════════════════════════════════════════ */}
        {mode === 'csv' && (
          <>
            {/* ── Input step ── */}
            {csvStep === 'input' && (
              <>
                {/* Instructions */}
                <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-800/60 px-4 py-3">
                  <p className="text-xs text-slate-400">
                    Template columns are based on{' '}
                    <span className="text-slate-300 font-medium">Settings › User Template</span>
                  </p>
                  <button
                    type="button"
                    onClick={downloadCSVTemplate}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 transition-colors shrink-0 ml-3"
                  >
                    ↓ Download Template
                  </button>
                </div>

                <div>
                  <label className="label">CSV File</label>
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                      dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-slate-500 hover:border-slate-400'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileLoad(e.dataTransfer.files[0]) }}
                    onClick={() => fileRef.current?.click()}
                  >
                    <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                      onChange={(e) => handleFileLoad(e.target.files[0])} />
                    {text ? (
                      <p className="text-sm text-emerald-400 font-medium">
                        ✓ File loaded — {lineCount} line{lineCount !== 1 ? 's' : ''}
                      </p>
                    ) : (
                      <>
                        <p className="text-slate-300 text-sm font-medium mb-1">Drop a CSV file here or click to browse</p>
                        <p className="text-slate-500 text-xs">.csv or .txt files accepted</p>
                      </>
                    )}
                  </div>
                  {text && (
                    <div className="mt-2 p-3 bg-slate-800 rounded-lg space-y-0.5">
                      <p className="text-xs text-slate-400 font-semibold mb-1">Preview</p>
                      {text.trim().split('\n').slice(0, 4).map((l, i) => (
                        <p key={i} className="text-xs font-mono text-slate-300 truncate">{l}</p>
                      ))}
                      {lineCount > 4 && <p className="text-xs text-slate-500">…and {lineCount - 4} more lines</p>}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 items-end">
                  <div>
                    <label className="label">Default Role</label>
                    <select className="input" value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)}>
                      {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  </div>
                  <button type="button" className="btn-primary" onClick={handleCSVParse} disabled={!text.trim()}>
                    Preview →
                  </button>
                </div>
              </>
            )}

            {/* ── Preview step ── */}
            {csvStep === 'preview' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-white">{rows.length} entries parsed</span>
                    {rows.some((r) => !r.valid) && (
                      <span className="ml-2 text-xs text-amber-400">
                        ({rows.filter((r) => !r.valid).length} invalid — will be skipped)
                      </span>
                    )}
                  </div>
                  <button type="button" className="text-xs text-slate-400 hover:text-white transition-colors"
                    onClick={() => setCsvStep('input')}>← Edit</button>
                </div>

                {rows.length > 0 ? (
                  <div className="rounded-lg border border-slate-600 overflow-hidden">
                    <div className="max-h-80 overflow-y-auto overflow-x-auto">
                      <table className="text-sm min-w-full">
                        <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide sticky top-0">
                          <tr>
                            {templateFields.map((f) => (
                              <th key={f.id} className="px-2 py-2 text-left whitespace-nowrap">{f.label}</th>
                            ))}
                            <th className="px-2 py-2 text-left whitespace-nowrap">Username</th>
                            <th className="px-2 py-2 text-left w-24 whitespace-nowrap">Role</th>
                            <th className="px-2 py-2 w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-600">
                          {rows.map((r, i) => {
                            const { firstName, lastName } = parseName(r.values['full_name'] || '')
                            return (
                              <tr key={i} className={r.valid ? '' : 'bg-red-500/10'}>
                                {templateFields.map((f) => (
                                  <td key={f.id} className="px-2 py-1.5">
                                    {f.id === 'team_name' ? (
                                      <select
                                        className="bg-slate-700 border border-slate-600 rounded text-xs text-white px-1 py-0.5 w-full min-w-[100px]"
                                        value={r.values[f.id] || ''}
                                        onChange={(e) => setRowField(i, f.id, e.target.value)}
                                      >
                                        <option value="">—</option>
                                        {teams.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                                      </select>
                                    ) : (
                                      <input
                                        className="bg-transparent outline-none text-slate-200 text-xs w-full min-w-[80px]"
                                        type={getInputType(f)}
                                        placeholder="—"
                                        value={r.values[f.id] || ''}
                                        onChange={(e) => setRowField(i, f.id, e.target.value)}
                                      />
                                    )}
                                  </td>
                                ))}
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                  <span className="font-mono text-xs text-blue-400">
                                    @{previewUsername(firstName, lastName)}
                                  </span>
                                </td>
                                <td className="px-2 py-1.5">
                                  <select
                                    className="bg-slate-700 border border-slate-600 rounded text-xs text-white px-1 py-0.5 w-full"
                                    value={r.role}
                                    onChange={(e) => setRowField(i, 'role', e.target.value)}
                                  >
                                    {ROLES.map((rl) => <option key={rl} value={rl}>{rl}</option>)}
                                  </select>
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <button type="button"
                                    className="text-slate-500 hover:text-red-400 transition-colors text-lg leading-none"
                                    onClick={() => removeRow(i)}>×</button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-6">No entries to add.</p>
                )}

                <p className="text-xs text-slate-500">
                  Username preview is approximate — the server resolves any collisions.
                </p>

                <div className="flex items-center justify-between pt-1">
                  <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                  <button type="button" className="btn-primary" onClick={handleCSVSubmit}
                    disabled={!validRows.length || csvSaving}>
                    {csvSaving ? 'Creating accounts…' : `Add ${validRows.length} Member${validRows.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}

            {/* ── Results step ── */}
            {csvStep === 'results' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="card p-4 text-center border-emerald-500/30">
                    <div className="text-3xl font-bold text-emerald-400">{results.filter((r) => r.success).length}</div>
                    <div className="text-xs text-slate-400 mt-1">Added</div>
                  </div>
                  <div className="card p-4 text-center border-red-500/30">
                    <div className="text-3xl font-bold text-red-400">{results.filter((r) => !r.success).length}</div>
                    <div className="text-xs text-slate-400 mt-1">Failed</div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-600 overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-600">
                        {results.map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2.5 w-6 text-center text-base">
                              {r.success
                                ? <span className="text-emerald-400">✓</span>
                                : <span className="text-red-400">✗</span>}
                            </td>
                            <td className="px-3 py-2.5 text-slate-200 text-sm">{r.name}</td>
                            <td className="px-3 py-2.5 font-mono text-xs text-blue-400">
                              {r.username ? `@${r.username}` : ''}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-right">
                              {r.success
                                ? <span className="text-slate-400">{r.member?.role}</span>
                                : <span className="text-red-400">{r.error}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button type="button" className="btn-primary" onClick={onClose}>Done</button>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </Modal>
  )
}
