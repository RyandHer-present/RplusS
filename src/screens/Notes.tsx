import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { useNotes, NOTE_COLORS, type Note, type NoteColor } from '../store/notes'
import { USERS, useSession } from '../store/session'
import { groupByDate, dayLabel, timeLabel } from '../lib/dates'
import { haptic } from '../lib/haptics'
import { sfx } from '../lib/sound'
import './Notes.css'

interface DraftState {
  id: string | null
  title: string
  body: string
  color: NoteColor
}

const EMPTY: DraftState = { id: null, title: '', body: '', color: 'a1' }

function Editor({
  draft,
  onChange,
  onClose,
  onSave,
  onDelete,
  saving,
  readOnly,
  author,
}: {
  draft: DraftState
  onChange: (next: DraftState) => void
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  saving: boolean
  readOnly: boolean
  author?: string
}) {
  const [confirming, setConfirming] = useState(false)

  return createPortal(
    <div className="note-editor" role="dialog" aria-modal="true">
      <header className="note-editor-bar">
        <button type="button" className="note-cancel" onClick={onClose}>
          {readOnly ? 'Close' : 'Cancel'}
        </button>
        <span className="note-editor-who">{author ?? (draft.id ? 'Editing' : 'New note')}</span>
        {readOnly ? (
          <span className="note-save is-ghost" />
        ) : (
          <button
            type="button"
            className="note-save"
            disabled={!draft.body.trim() || saving}
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </header>

      {!readOnly && (
        <div className="note-colors">
          {NOTE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`note-swatch is-${color} ${draft.color === color ? 'is-active' : ''}`}
              aria-label={color}
              onClick={() => {
                haptic('tap')
                onChange({ ...draft, color })
              }}
            />
          ))}
        </div>
      )}

      <div className="note-editor-body">
        <input
          className="note-title-input"
          placeholder="Title (optional)"
          value={draft.title}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
        <textarea
          className="note-body-input"
          placeholder="Say whatever."
          value={draft.body}
          readOnly={readOnly}
          autoFocus={!readOnly && !draft.id}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
        />
      </div>

      {onDelete && (
        <footer className="note-editor-foot">
          <button
            type="button"
            className={`note-delete ${confirming ? 'is-confirming' : ''}`}
            onClick={() => {
              // Two taps. A note can be long, and this cannot be undone.
              if (!confirming) {
                setConfirming(true)
                haptic('tap')
                window.setTimeout(() => setConfirming(false), 3000)
                return
              }
              haptic('error')
              onDelete()
            }}
          >
            {confirming ? 'Tap again to delete' : 'Delete note'}
          </button>
        </footer>
      )}
    </div>,
    document.body,
  )
}

export default function Notes() {
  const me = useSession((s) => s.user)
  const isAdmin = useSession((s) => s.isAdmin)

  const notes = useNotes((s) => s.notes)
  const status = useNotes((s) => s.status)
  const saving = useNotes((s) => s.saving)
  const load = useNotes((s) => s.load)
  const subscribe = useNotes((s) => s.subscribe)
  const create = useNotes((s) => s.create)
  const update = useNotes((s) => s.update)
  const togglePin = useNotes((s) => s.togglePin)
  const remove = useNotes((s) => s.remove)

  const [draft, setDraft] = useState<DraftState | null>(null)
  const [reading, setReading] = useState<Note | null>(null)

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => subscribe(), [subscribe])

  const pinned = useMemo(() => notes.filter((n) => n.pinned), [notes])
  const rest = useMemo(() => notes.filter((n) => !n.pinned), [notes])
  const days = useMemo(() => groupByDate(rest, (n) => n.created_at), [rest])

  const openNote = (note: Note) => {
    haptic('tap')
    const canEdit = note.author_id === me || isAdmin
    if (canEdit) {
      setDraft({
        id: note.id,
        title: note.title ?? '',
        body: note.body,
        color: (note.color as NoteColor) ?? 'a1',
      })
    } else {
      setReading(note)
    }
  }

  const save = async () => {
    if (!draft) return
    sfx.send()
    if (draft.id) {
      await update(draft.id, {
        title: draft.title.trim() || null,
        body: draft.body.trim(),
        color: draft.color,
      })
    } else if (me) {
      await create({ title: draft.title, body: draft.body, color: draft.color }, me)
    }
    setDraft(null)
  }

  const card = (note: Note) => (
    <button
      key={note.id}
      type="button"
      className={`note-card is-${note.color ?? 'a1'}`}
      onClick={() => openNote(note)}
    >
      <span className="note-card-edge" aria-hidden="true" />
      <span className="note-card-main">
        {note.title && <span className="note-card-title">{note.title}</span>}
        <span className="note-card-body">{note.body}</span>
        <span className="note-card-meta">
          <span>{note.author_id === me ? 'You' : USERS[note.author_id].name}</span>
          <span>{timeLabel(note.created_at)}</span>
          {note.updated_at !== note.created_at && <span className="note-edited">edited</span>}
        </span>
      </span>
      {(note.author_id === me || isAdmin) && (
        <span
          className={`note-pin ${note.pinned ? 'is-on' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={note.pinned ? 'Unpin' : 'Pin'}
          onClick={(e) => {
            // Sits inside the card, so it must not also open the editor.
            e.stopPropagation()
            haptic('select')
            void togglePin(note.id)
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2v6l3 4v2h-4v6l-1 2-1-2v-6H7v-2l3-4V2z" />
          </svg>
        </span>
      )}
    </button>
  )

  return (
    <div className="screen-scroll">
      <ScreenHeader title="Notes" sub={notes.length ? `${notes.length} written` : undefined} />

      {me && (
        <button
          type="button"
          className="note-new"
          onClick={() => {
            haptic('select')
            setDraft({ ...EMPTY })
          }}
        >
          Write something
        </button>
      )}

      {status === 'ready' && notes.length === 0 && (
        <p className="note-empty">Nothing written yet.</p>
      )}

      {pinned.length > 0 && (
        <section className="note-group">
          <h2 className="note-group-label">Pinned</h2>
          <div className="note-list stagger">{pinned.map(card)}</div>
        </section>
      )}

      {days.map(([day, items]) => (
        <section key={day} className="note-group">
          <h2 className="note-group-label">{dayLabel(day)}</h2>
          <div className="note-list stagger">{items.map(card)}</div>
        </section>
      ))}

      {draft && (
        <Editor
          draft={draft}
          saving={saving}
          readOnly={false}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={() => void save()}
          onDelete={
            draft.id
              ? () => {
                  void remove(draft.id!)
                  setDraft(null)
                }
              : undefined
          }
        />
      )}

      {reading && (
        <Editor
          draft={{
            id: reading.id,
            title: reading.title ?? '',
            body: reading.body,
            color: (reading.color as NoteColor) ?? 'a1',
          }}
          saving={false}
          readOnly
          author={USERS[reading.author_id].name}
          onChange={() => {}}
          onClose={() => setReading(null)}
          onSave={() => {}}
        />
      )}
    </div>
  )
}
