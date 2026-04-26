import { useState } from 'react'
import { createEvent, updateEvent } from '../../services/api'
import toast from 'react-hot-toast'
import Modal from './Modal'

const EVENT_TYPES = [
  'athletics', 'tournament', 'swimming', 'cycling', 'football', 'basketball',
  'tennis', 'volleyball', 'cricket', 'baseball', 'rugby', 'golf', 'boxing',
  'wrestling', 'gymnastics', 'multi-sport', 'other',
]

export default function CreateEventModal({ event, onClose, onSave }) {
  const [form, setForm] = useState({
    name: event?.name || '',
    description: event?.description || '',
    event_type: event?.event_type || 'athletics',
    location: event?.location || '',
    start_date: event?.start_date || '',
    end_date: event?.end_date || '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.end_date) delete payload.end_date
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
