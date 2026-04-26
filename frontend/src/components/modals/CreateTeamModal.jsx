import { useState, useRef } from 'react'
import { createTeam, updateTeam } from '../../services/api'
import toast from 'react-hot-toast'
import Modal from './Modal'

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b',
]

// Resize + compress to JPEG before base64-encoding. Keeps Couchbase doc small.
// Uses URL.createObjectURL (not FileReader.readAsDataURL) so the browser decodes
// the image directly without loading the full file into memory first — this is
// critical on mobile where large camera photos would otherwise exhaust memory
// and trigger img.onerror before the canvas ever runs.
function compressImage(file, maxPx = 256, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('decode'))
    }
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > maxPx || h > maxPx) {
        const ratio = Math.min(maxPx / w, maxPx / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas')); return }
      try {
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        if (!dataUrl || dataUrl === 'data:,') { reject(new Error('export')); return }
        resolve(dataUrl)
      } catch (e) {
        reject(e)
      }
    }
    img.src = objectUrl
  })
}

function TeamPreview({ name, color, logoSrc }) {
  const [imgError, setImgError] = useState(false)
  const initial = name?.charAt(0)?.toUpperCase() || '?'

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-800 border border-slate-600">
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
        style={{ backgroundColor: color }}
      >
        {logoSrc && !imgError ? (
          <img
            src={logoSrc}
            alt="logo preview"
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-2xl font-bold text-white">{initial}</span>
        )}
      </div>
      <div>
        <div className="font-semibold text-white text-sm">{name || 'Team Name'}</div>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-xs text-slate-400">{color}</span>
        </div>
      </div>
    </div>
  )
}

export default function CreateTeamModal({ eventId, team, onClose, onSave }) {
  const [form, setForm] = useState({
    name:        team?.name        || '',
    color:       team?.color       || '#3b82f6',
    description: team?.description || '',
    logo_url:    team?.logo_url    || '',
  })
  const [logoMode, setLogoMode]   = useState('upload') // 'upload' | 'url'
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [dragOver, setDragOver]   = useState(false)
  const fileInputRef              = useRef(null)

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const processFile = async (file) => {
    if (!file) return
    // Some Android file managers return an empty file.type for valid images —
    // fall back to checking the file extension before rejecting.
    const typeOk = file.type.startsWith('image/') ||
      /\.(jpe?g|png|gif|webp|bmp|avif|svg)$/i.test(file.name)
    if (!typeOk) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10 MB')
      return
    }
    setUploading(true)
    try {
      const b64 = await compressImage(file)
      setForm((p) => ({ ...p, logo_url: b64 }))
    } catch (err) {
      if (err?.message === 'decode') {
        toast.error('Image format not supported — try JPEG or PNG')
      } else if (err?.message === 'canvas') {
        toast.error('Image processing unavailable — use the URL option instead')
      } else {
        toast.error('Failed to process image — try a smaller file or a different format')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (e) => processFile(e.target.files[0])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    processFile(e.dataTransfer.files[0])
  }

  const clearLogo = () => {
    setForm((p) => ({ ...p, logo_url: '' }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.logo_url)    delete payload.logo_url
      if (!payload.description) delete payload.description
      const { data } = team
        ? await updateTeam(team.id, payload)
        : await createTeam(eventId, payload)
      toast.success(team ? 'Team updated' : 'Team created')
      onSave(data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save team')
    } finally {
      setSaving(false)
    }
  }

  const isBase64 = form.logo_url?.startsWith('data:')

  return (
    <Modal title={team ? 'Edit Team' : 'Add Team'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Live preview */}
        <TeamPreview name={form.name} color={form.color} logoSrc={form.logo_url} />

        {/* Name */}
        <div>
          <label className="label">Team Name *</label>
          <input
            className="input"
            value={form.name}
            onChange={set('name')}
            required
            placeholder="e.g. Team Alpha"
          />
        </div>

        {/* Color */}
        <div>
          <label className="label">Team Color</label>
          <div className="flex gap-2 flex-wrap items-center">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => setForm((p) => ({ ...p, color: c }))}
                className="w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none"
                style={{
                  backgroundColor: c,
                  boxShadow: form.color === c ? `0 0 0 2px #1e293b, 0 0 0 4px ${c}` : 'none',
                }}
              />
            ))}
            <label
              title="Custom color"
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors text-xs overflow-hidden"
              style={{
                backgroundColor: PRESET_COLORS.includes(form.color) ? '#334155' : form.color,
                boxShadow: !PRESET_COLORS.includes(form.color) ? `0 0 0 2px #1e293b, 0 0 0 4px ${form.color}` : 'none',
                color: PRESET_COLORS.includes(form.color) ? '#94a3b8' : 'transparent',
              }}
            >
              +
              <input type="color" value={form.color} onChange={set('color')} className="sr-only" />
            </label>
          </div>
        </div>

        {/* Logo */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">
              Team Logo
              <span className="text-slate-500 text-xs font-normal ml-1">(optional)</span>
            </label>
            <div className="flex rounded-lg border border-slate-600 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setLogoMode('upload')}
                className={`px-3 py-1 transition-colors ${logoMode === 'upload' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Upload
              </button>
              <button
                type="button"
                onClick={() => setLogoMode('url')}
                className={`px-3 py-1 border-l border-slate-600 transition-colors ${logoMode === 'url' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                URL
              </button>
            </div>
          </div>

          {logoMode === 'upload' ? (
            <div>
              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-blue-400 bg-blue-500/10'
                    : 'border-slate-500 hover:border-slate-500 bg-slate-700/50'
                }`}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-slate-400">Processing image…</p>
                  </div>
                ) : isBase64 ? (
                  <div className="flex flex-col items-center gap-2">
                    <img src={form.logo_url} alt="logo" className="w-16 h-16 rounded-lg object-cover mx-auto" />
                    <p className="text-xs text-emerald-400">Image uploaded</p>
                    <p className="text-xs text-slate-500">Click to replace</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <div className="text-3xl">🖼️</div>
                    <p className="text-sm font-medium text-slate-300">Drop image here or click to browse</p>
                    <p className="text-xs">PNG, JPG, WEBP — max 10 MB · resized to 256 × 256</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
              {form.logo_url && (
                <button
                  type="button"
                  onClick={clearLogo}
                  className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove logo
                </button>
              )}
            </div>
          ) : (
            <div>
              <input
                className="input"
                value={isBase64 ? '' : form.logo_url}
                onChange={set('logo_url')}
                placeholder="https://example.com/logo.png"
                type="url"
              />
              <p className="text-xs text-slate-500 mt-1">Paste a public image URL — preview updates live.</p>
              {form.logo_url && (
                <button
                  type="button"
                  onClick={clearLogo}
                  className="mt-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove logo
                </button>
              )}
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="label">
            Description
            <span className="text-slate-500 text-xs font-normal ml-1">(optional)</span>
          </label>
          <textarea
            className="input resize-none"
            rows={3}
            value={form.description}
            onChange={set('description')}
            placeholder="Brief description of the team…"
          />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || uploading}>
            {saving ? 'Saving…' : team ? 'Update Team' : 'Create Team'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
