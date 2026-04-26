import { useState, useRef } from 'react'
import { bulkAddMembers } from '../../services/api'
import toast from 'react-hot-toast'
import Modal from './Modal'

const ROLES = ['member', 'viewer', 'admin']

// client-side username preview (server may differ slightly due to collision handling)
function previewUsername(firstName, lastName) {
  const initials = firstName.trim().split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, '')[0]?.toLowerCase() || '')
    .join('')
  const lastWord = lastName.trim().split(/\s+/).filter(Boolean).at(-1)
    ?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''
  return (initials + lastWord) || '—'
}

// "First Last" per line → {first_name, last_name}
// Also handles "First,Last" and "First Last,Age,Club"
function parsePasteText(text, defaultRole) {
  return text.trim().split(/\r?\n/).filter((l) => l.trim()).map((line) => {
    const parts = line.split(',').map((p) => p.trim())
    let firstName = '', lastName = ''
    if (parts.length >= 2 && parts[0].includes(' ')) {
      // "First Last, Age, Club, ..."
      const words = parts[0].split(/\s+/)
      lastName    = words.pop()
      firstName   = words.join(' ')
    } else if (parts.length >= 2) {
      // "First, Last" CSV style
      firstName = parts[0]; lastName = parts[1]
    } else {
      const words = parts[0].split(/\s+/)
      if (words.length === 1) return null
      lastName  = words.pop()
      firstName = words.join(' ')
    }
    return { first_name: firstName, last_name: lastName, age: '', club: '', address: '', role: defaultRole }
  }).filter(Boolean)
}

// CSV with header row: first_name, last_name, age, club, address, role
function parseCSV(text, defaultRole) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []

  const CSV_COLS = ['first_name', 'last_name', 'age', 'club', 'address', 'role']
  const firstLine = lines[0].toLowerCase()
  const hasHeader = CSV_COLS.some((c) => firstLine.includes(c))

  let colMap = { first_name: 0, last_name: 1, age: 2, club: 3, address: 4, role: 5 }
  let dataLines = lines

  if (hasHeader) {
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ''))
    colMap = {}
    headers.forEach((h, i) => { colMap[h] = i })
    dataLines = lines.slice(1)
  }

  const get = (parts, key) => {
    const idx = colMap[key]
    if (idx === undefined) return ''
    return (parts[idx] || '').trim().replace(/^["']|["']$/g, '')
  }

  return dataLines.map((line) => {
    const parts = line.split(',')
    const firstName = get(parts, 'first_name')
    const lastName  = get(parts, 'last_name')
    if (!firstName && !lastName) return null
    const role = get(parts, 'role')
    return {
      first_name: firstName,
      last_name:  lastName,
      age:        get(parts, 'age'),
      club:       get(parts, 'club'),
      address:    get(parts, 'address'),
      role:       ROLES.includes(role) ? role : defaultRole,
    }
  }).filter(Boolean)
}

export default function BulkAddMembersModal({ eventId, onClose, onSave }) {
  const [mode, setMode]               = useState('text')
  const [text, setText]               = useState('')
  const [defaultRole, setDefaultRole] = useState('member')
  const [step, setStep]               = useState('input')   // 'input' | 'preview' | 'results'
  const [rows, setRows]               = useState([])
  const [results, setResults]         = useState([])
  const [saving, setSaving]           = useState(false)
  const [dragOver, setDragOver]       = useState(false)
  const fileRef = useRef(null)

  const switchMode = (m) => { setMode(m); setText(''); setStep('input'); setRows([]); setResults([]) }

  const handleParse = () => {
    const raw = mode === 'csv' ? parseCSV(text, defaultRole) : parsePasteText(text, defaultRole)
    const deduped = raw.filter((r, i, arr) =>
      arr.findIndex((x) => x.first_name.toLowerCase() === r.first_name.toLowerCase() &&
                           x.last_name.toLowerCase()  === r.last_name.toLowerCase()) === i
    )
    setRows(deduped.map((r) => ({
      ...r,
      valid: r.first_name.trim() !== '' && r.last_name.trim() !== '',
    })))
    setStep('preview')
  }

  const removeRow     = (i) => setRows((p) => p.filter((_, idx) => idx !== i))
  const setRowField   = (i, key, val) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, [key]: val } : r))

  const validRows = rows.filter((r) => r.valid)

  const handleSubmit = async () => {
    if (!validRows.length) return
    setSaving(true)
    try {
      const { data } = await bulkAddMembers(eventId, {
        members: validRows.map((r) => ({
          first_name: r.first_name,
          last_name:  r.last_name,
          age:        r.age ? parseInt(r.age, 10) : 0,
          club:       r.club,
          address:    r.address,
          role:       r.role,
        })),
      })
      setResults(data.results)
      setStep('results')
      const added = data.results.filter((r) => r.success && r.member).map((r) => r.member)
      if (added.length) onSave(added)
      const count = data.results.filter((r) => r.success).length
      toast.success(`${count} member${count !== 1 ? 's' : ''} added`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Bulk add failed')
    } finally {
      setSaving(false)
    }
  }

  const handleFileLoad = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => { setText(e.target.result); setStep('input'); setRows([]) }
    reader.readAsText(file)
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false); handleFileLoad(e.dataTransfer.files[0])
  }

  const lineCount = text.trim() ? text.trim().split('\n').length : 0

  return (
    <Modal title="Bulk Add Members" onClose={onClose} size="xl">
      <div className="space-y-5">

        {/* Mode switcher */}
        {step === 'input' && (
          <div className="flex rounded-lg border border-slate-600 overflow-hidden w-fit">
            {[{ key: 'text', label: 'Paste Names' }, { key: 'csv', label: 'Upload CSV' }].map(({ key, label }, i) => (
              <button key={key} type="button" onClick={() => switchMode(key)}
                className={`px-4 py-1.5 text-sm transition-colors ${i > 0 ? 'border-l border-slate-600' : ''} ${
                  mode === key ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                }`}>{label}</button>
            ))}
          </div>
        )}

        {/* ── Input step ──────────────────────────────────────────────── */}
        {step === 'input' && (
          <>
            {mode === 'text' ? (
              <div>
                <label className="label">Names (one per line)</label>
                <textarea
                  className="input resize-none font-mono text-sm"
                  rows={8}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={"Sojan Maman\nJohn Doe\nMaria Garcia"}
                  autoFocus
                />
                <p className="text-xs text-slate-500 mt-1">
                  Format: <code className="text-slate-400">First Last</code> per line. Usernames are auto-generated.
                </p>
              </div>
            ) : (
              <div>
                <label className="label">CSV File</label>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                    dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-slate-500 hover:border-slate-400'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
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
                      <p className="text-slate-500 text-xs">
                        Columns: <code className="text-slate-400">first_name, last_name</code> (required) +{' '}
                        <code className="text-slate-400">age, club, address, role</code> (optional)
                      </p>
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
            )}

            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <label className="label">Default Role</label>
                <select className="input" value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <button type="button" className="btn-primary" onClick={handleParse} disabled={!text.trim()}>
                Preview →
              </button>
            </div>
          </>
        )}

        {/* ── Preview step ─────────────────────────────────────────────── */}
        {step === 'preview' && (
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
                onClick={() => setStep('input')}>← Edit</button>
            </div>

            {rows.length > 0 ? (
              <div className="rounded-lg border border-slate-600 overflow-hidden">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left">First Name</th>
                        <th className="px-2 py-2 text-left">Last Name</th>
                        <th className="px-2 py-2 text-left">Username</th>
                        <th className="px-2 py-2 text-left w-16">Age</th>
                        <th className="px-2 py-2 text-left w-28">Club / Team</th>
                        <th className="px-2 py-2 text-left w-24">Role</th>
                        <th className="px-2 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-600">
                      {rows.map((r, i) => (
                        <tr key={i} className={r.valid ? '' : 'bg-red-500/10'}>
                          <td className="px-2 py-1.5">
                            <input
                              className="bg-transparent outline-none text-slate-200 text-xs w-full"
                              value={r.first_name}
                              onChange={(e) => setRowField(i, 'first_name', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="bg-transparent outline-none text-slate-200 text-xs w-full"
                              value={r.last_name}
                              onChange={(e) => setRowField(i, 'last_name', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="font-mono text-xs text-blue-400">
                              @{previewUsername(r.first_name, r.last_name)}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="bg-transparent outline-none text-slate-200 text-xs w-full"
                              type="number"
                              min="1"
                              max="120"
                              placeholder="—"
                              value={r.age}
                              onChange={(e) => setRowField(i, 'age', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="bg-transparent outline-none text-slate-200 text-xs w-full"
                              placeholder="—"
                              value={r.club}
                              onChange={(e) => setRowField(i, 'club', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select className="bg-slate-700 border border-slate-600 rounded text-xs text-white px-1 py-0.5 w-full"
                              value={r.role} onChange={(e) => setRowField(i, 'role', e.target.value)}>
                              {ROLES.map((rl) => <option key={rl} value={rl}>{rl}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button type="button"
                              className="text-slate-500 hover:text-red-400 transition-colors text-lg leading-none"
                              onClick={() => removeRow(i)}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-6">No entries to add.</p>
            )}

            <p className="text-xs text-slate-500">
              Username preview is approximate — the server resolves any collisions. First and last name are required.
            </p>

            <div className="flex items-center justify-between pt-1">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleSubmit}
                disabled={!validRows.length || saving}>
                {saving ? 'Creating accounts…' : `Add ${validRows.length} Member${validRows.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* ── Results step ─────────────────────────────────────────────── */}
        {step === 'results' && (
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
                          {r.success ? (
                            <span className="text-slate-400">{r.member?.role}</span>
                          ) : (
                            <span className="text-red-400">{r.error}</span>
                          )}
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

      </div>
    </Modal>
  )
}
