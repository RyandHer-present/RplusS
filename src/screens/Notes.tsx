import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { useNotes, NOTE_COLORS, type Note, type NoteColor } from '../store/notes'
import { useCapsules, untilLabel } from '../store/capsules'
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
  const [capsuleDraft, setCapsuleDraft] = useState<{ body: string; when: string } | null>(null)
  const [openedText, setOpenedText] = useState<{ id: string; text: string } | null>(null)

  const capsules = useCapsules((s) => s.capsules)
  const loadCapsules = useCapsules((s) => s.load)
  const createCapsule = useCapsules((s) => s.create)
  const openCapsule = useCapsules((s) => s.open)
  const removeCapsule = useCapsules((s) => s.remove)

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => subscribe(), [subscribe])
  useEffect(() => {
    void loadCapsules()
  }, [loadCapsules])

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

      {me && (
        <button
          type="button"
          className="capsule-new"
          onClick={() => {
            haptic('select')
            // Defaults a month out, which is the common case.
            const when = new Date()
            when.setMonth(when.getMonth() + 1)
            setCapsuleDraft({ body: '', when: when.toISOString().slice(0, 10) })
          }}
        >
          Lock something for later
        </button>
      )}

      {capsules.length > 0 && (
        <section className="note-group">
          <h2 className="note-group-label">Time capsules</h2>
          <div className="note-list">
            {capsules.map((capsule) => {
              const until = untilLabel(capsule.unlock_at)
              const unlocked = !until
              const shown = openedText?.id === capsule.id ? openedText.text : null
              return (
                <button
                  key={capsule.id}
                  type="button"
                  className={`capsule ${unlocked ? 'is-open' : ''}`}
                  onClick={async () => {
                    if (!unlocked) {
                      haptic('error')
                      return
                    }
                    haptic('success')
                    const text = await openCapsule(capsule.id)
                    if (text) setOpenedText({ id: capsule.id, text })
                  }}
                >
                  <span className="capsule-head">
                    <span className="capsule-icon">{unlocked ? '\u{1F513}' : '\u{1F512}'}</span>
                    <span className="capsule-who">
                      {capsule.author_id === me ? 'You' : USERS[capsule.author_id].name}
                    </span>
                    <span className="capsule-when">
                      {until ?? new Date(capsule.unlock_at).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="capsule-body">
                    {shown ?? (unlocked ? 'Tap to open' : 'Sealed until then')}
                  </span>
                  {capsule.author_id === me && (
                    <span
                      className="capsule-scrap"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        void removeCapsule(capsule.id)
                      }}
                    >
                      Remove
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
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

      {capsuleDraft && me && (
        <div className="note-editor" role="dialog" aria-modal="true">
          <header className="note-editor-bar">
            <button type="button" className="note-cancel" onClick={() => setCapsuleDraft(null)}>
              Cancel
            </button>
            <span className="note-editor-who">Time capsule</span>
            <button
              type="button"
              className="note-save"
              disabled={!capsuleDraft.body.trim()}
              onClick={async () => {
                sfx.send()
                await createCapsule(
                  capsuleDraft.body,
                  new Date(`${capsuleDraft.when}T09:00:00`).toISOString(),
                  me,
                )
                setCapsuleDraft(null)
              }}
            >
              Lock
            </button>
          </header>

          <div className="note-editor-body">
            <label className="capsule-date">
              Opens on
              <input
                type="date"
                value={capsuleDraft.when}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setCapsuleDraft({ ...capsuleDraft, when: e.target.value })}
              />
            </label>
            <textarea
              className="note-body-input"
              placeholder="Neither of you can read this until then."
              value={capsuleDraft.body}
              autoFocus
              onChange={(e) => setCapsuleDraft({ ...capsuleDraft, body: e.target.value })}
            />
          </div>
        </div>
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
