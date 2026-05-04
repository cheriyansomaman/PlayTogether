import { useState, useRef } from 'react'
import { createEvent, updateEvent } from '../../services/api'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { ImageIcon } from 'lucide-react'

const EVENT_TYPES = [
  'athletics', 'tournament', 'swimming', 'cycling', 'football', 'basketball',
  'tennis', 'volleyball', 'cricket', 'baseball', 'rugby', 'golf', 'boxing',
  'wrestling', 'gymnastics', 'multi-sport', 'other',
]

function compressImage(file, maxPx = 256, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('decode')) }
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > maxPx || h > maxPx) {
        const ratio = Math.min(maxPx / w, maxPx / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas')); return }
      try {
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        if (!dataUrl || dataUrl === 'data:,') { reject(new Error('export')); return }
        resolve(dataUrl)
      } catch (e) { reject(e) }
    }
    img.src = objectUrl
  })
}

export default function CreateEventModal({ event, onClose, onSave }) {
  const [form, setForm] = useState({
    name:        event?.name        || '',
    description: event?.description || '',
    event_type:  event?.event_type  || 'athletics',
    location:    event?.location    || '',
    start_date:  event?.start_date  || '',
    end_date:    event?.end_date    || '',
    logo_src:    event?.logo_base64 || event?.logo_url || '',
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [dragOver, setDragOver]   = useState(false)
  const fileInputRef              = useRef(null)

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const processFile = async (file) => {
    if (!file) return
    const typeOk = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(file.name)
    if (!typeOk) { toast.error('Please select an image file'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10 MB'); return }
    setUploading(true)
    try {
      const b64 = await compressImage(file)
      setForm((p) => ({ ...p, logo_src: b64 }))
    } catch (err) {
      if (err?.message === 'decode') toast.error('Image format not supported — try JPEG or PNG')
      else toast.error('Failed to process image')
    } finally { setUploading(false) }
  }

  const handleFileChange = (e) => processFile(e.target.files[0])

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files[0]) }

  const clearLogo = () => { setForm((p) => ({ ...p, logo_src: '' })); if (fileInputRef.current) fileInputRef.current.value = '' }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name:        form.name,
        description: form.description,
        event_type:  form.event_type,
        location:    form.location,
        start_date:  form.start_date,
        end_date:    form.end_date || undefined,
      }
      if (form.logo_src?.startsWith('data:')) {
        payload.logo_base64 = form.logo_src
      } else if (form.logo_src) {
        payload.logo_url = form.logo_src
      } else {
        payload.logo_base64 = ''
        payload.logo_url = ''
      }
      const { data } = event
        ? await updateEvent(event.id, payload)
        : await createEvent(payload)
      toast.success(event ? 'Event updated' : 'Event created')
      onSave(data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={event ? 'Edit Event' : 'Create Event'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Event Name *</label>
          <input className="input" value={form.name} onChange={set('name')} required placeholder="Summer Championship 2025" />
        </div>
        <div>
          <label className="label">Event Type *</label>
          <select className="input" value={form.event_type} onChange={set('event_type')}>
            {EVENT_TYPES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ')}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Start Date *</label>
            <input className="input" type="date" value={form.start_date} onChange={set('start_date')} required />
          </div>
          <div>
            <label className="label">End Date <span className="text-slate-500 text-xs">(optional)</span></label>
            <input className="input" type="date" value={form.end_date} onChange={set('end_date')} />
          </div>
        </div>
        <div>
          <label className="label">Location</label>
          <input className="input" value={form.location} onChange={set('location')} placeholder="City, Venue" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input resize-none" rows={3} value={form.description} onChange={set('description')} placeholder="Describe the event…" />
        </div>

        {/* Event Logo */}
        <div>
          <label className="label">Event Logo <span className="text-slate-500 text-xs">(optional)</span></label>
          <div
            className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-2">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Processing…
              </div>
            ) : form.logo_src ? (
              <div className="flex items-center gap-4">
                <img src={form.logo_src} alt="event logo" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                <div className="text-left">
                  <p className="text-xs text-emerald-400">Logo uploaded</p>
                  <p className="text-xs text-slate-500">Click to replace</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <div className="text-slate-400"><ImageIcon size={32} /></div>
                <p className="text-sm font-medium text-slate-300">Drop image here or click to browse</p>
                <p className="text-xs">PNG, JPG, WEBP — max 10 MB · resized to 256 × 256</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
          {form.logo_src && (
            <button type="button" onClick={clearLogo} className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors">
              Remove logo
            </button>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : event ? 'Update Event' : 'Create Event'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
