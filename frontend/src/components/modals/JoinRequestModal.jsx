import { useState, useEffect, useRef } from 'react'
import { requestToJoin, listTeams } from '../../services/api'
import toast from 'react-hot-toast'
import Modal from './Modal'

export const DEFAULT_QUESTIONS = [
  { id: 'age',     label: 'Age',         type: 'number',      required: true  },
  { id: 'team',    label: 'Team / Club', type: 'team-select', required: true  },
  { id: 'address', label: 'Address',     type: 'textarea',    required: true  },
  { id: 'tags',    label: 'Tags',        type: 'tags',        required: false },
]

function TagsInput({ value, onChange, required }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)
  const tags = value ? value.split(',').map((t) => t.trim()).filter(Boolean) : []

  const addTag = (raw) => {
    const tag = raw.trim().replace(/^#+/, '')
    if (!tag || tags.includes(tag)) { setInput(''); return }
    onChange([...tags, tag].join(','))
    setInput('')
  }

  const removeTag = (tag) =>
    onChange(tags.filter((t) => t !== tag).join(','))

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length) {
      removeTag(tags[tags.length - 1])
    }
  }

  return (
    <div
      className="input flex flex-wrap gap-1.5 min-h-[42px] cursor-text items-center"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2.5 py-0.5 text-xs font-medium"
        >
          #{tag}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
            className="hover:text-white leading-none"
          >×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input) addTag(input) }}
        placeholder={tags.length === 0 ? 'Type a tag and press Enter or comma…' : ''}
        className="bg-transparent outline-none text-sm flex-1 min-w-[160px] placeholder:text-slate-500"
        required={required && tags.length === 0}
      />
    </div>
  )
}

function QuestionInput({ question, value, onChange, teams }) {
  const base = 'input'
  switch (question.type) {
    case 'number':
      return (
        <input
          type="number"
          className={base}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={question.required}
          min={0}
        />
      )
    case 'textarea':
      return (
        <textarea
          className={`${base} resize-none`}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={question.required}
        />
      )
    case 'tags':
      return <TagsInput value={value} onChange={onChange} required={question.required} />
    case 'team-select':
      return (
        <select
          className={base}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={question.required}
        >
          <option value="">— Select a team —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
          <option value="Individual">Individual (no team)</option>
        </select>
      )
    default:
      return (
        <input
          type="text"
          className={base}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={question.required}
        />
      )
  }
}

export default function JoinRequestModal({ event, onClose, onSave }) {
  const questions = event.join_questions?.length > 0 ? event.join_questions : DEFAULT_QUESTIONS
  const [answers, setAnswers] = useState({})
  const [teams, setTeams] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    listTeams(event.id).then((r) => setTeams(r.data)).catch(() => {})
  }, [event.id])

  const setAnswer = (id, val) => setAnswers((p) => ({ ...p, [id]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    for (const q of questions) {
      if (q.required && !answers[q.id]?.toString().trim()) {
        toast.error(`${q.label} is required`)
        return
      }
    }
    setSubmitting(true)
    try {
      const { data } = await requestToJoin(event.id, answers)
      toast.success('Join request sent!')
      onSave(data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title={`Request to Join — ${event.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-400">
          Please fill in the details below. The event admin will review your request.
        </p>

        {questions.map((q) => (
          <div key={q.id}>
            <label className="label">
              {q.label}
              {!q.required && (
                <span className="text-slate-500 text-xs font-normal ml-1">(optional)</span>
              )}
            </label>
            <QuestionInput
              question={q}
              value={answers[q.id] || ''}
              onChange={(val) => setAnswer(q.id, val)}
              teams={teams}
            />
          </div>
        ))}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
