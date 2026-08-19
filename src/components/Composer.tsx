import { useEffect, useRef, useState } from 'react'
import { useChat } from '../store/chat'
import { usePresence } from '../store/presence'
import { USERS, useSession } from '../store/session'
import { haptic } from '../lib/haptics'
import './Composer.css'

const MAX_ROWS_HEIGHT = 132

export function Composer() {
  const [text, setText] = useState('')
  const me = useSession((s) => s.user)
  const send = useChat((s) => s.send)
  const replyTo = useChat((s) => s.replyTo)
  const setReplyTo = useChat((s) => s.setReplyTo)
  const editing = useChat((s) => s.editing)
  const setEditing = useChat((s) => s.setEditing)
  const saveEdit = useChat((s) => s.saveEdit)
  const setTyping = usePresence((s) => s.setTyping)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Grow with the content instead of scrolling a one-line box.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_HEIGHT)}px`
  }, [text])

  useEffect(() => {
    if (replyTo) inputRef.current?.focus()
  }, [replyTo])

  // Entering edit mode loads the existing text so it can be amended in place.
  useEffect(() => {
    if (!editing) return
    setText(editing.body ?? '')
    inputRef.current?.focus()
  }, [editing])

  const cancelEdit = () => {
    setEditing(null)
    setText('')
  }

  const submit = () => {
    if (!text.trim() || !me) return
    haptic('send')

    if (editing) {
      void saveEdit(editing.id, text)
    } else {
      void send(text, me)
    }

    setText('')
    setTyping(false)
  }

  return (
    <div className="composer">
      {editing && (
        <div className="reply-bar is-editing">
          <div className="reply-info">
            <span className="reply-to">Editing</span>
            <span className="reply-text">{editing.body}</span>
          </div>
          <button type="button" className="reply-close" onClick={cancelEdit} aria-label="Cancel edit">
            ✕
          </button>
        </div>
      )}

      {replyTo && !editing && (
        <div className="reply-bar">
          <div className="reply-info">
            <span className="reply-to">
              Replying to {replyTo.sender_id === me ? 'yourself' : USERS[replyTo.sender_id].name}
            </span>
            <span className="reply-text">{replyTo.body ?? 'Attachment'}</span>
          </div>
          <button type="button" className="reply-close" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
            ✕
          </button>
        </div>
      )}

      <div className="composer-row">
        <textarea
          ref={inputRef}
          className="composer-input"
          value={text}
          rows={1}
          placeholder={editing ? 'Edit message' : 'Message'}
          onChange={(e) => {
            setText(e.target.value)
            // Editing an old message is not "typing" to the other person.
            if (!editing) setTyping(e.target.value.length > 0)
          }}
          onBlur={() => setTyping(false)}
          onKeyDown={(e) => {
            // Enter sends on a physical keyboard; Shift+Enter makes a new line.
            // On touch keyboards Enter always inserts a newline, since there is
            // a send button right there.
            if (e.key === 'Escape' && editing) {
              cancelEdit()
              return
            }
            if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button
          type="button"
          className={`send ${text.trim() ? 'is-ready' : ''}`}
          onClick={submit}
          disabled={!text.trim()}
          aria-label={editing ? 'Save edit' : 'Send'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 12h13M12 5.5 18.5 12 12 18.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}
