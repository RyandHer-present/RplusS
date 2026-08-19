import { memo, useRef, useState } from 'react'
import type { Message, Reaction } from '../lib/types'
import { USERS, type UserId } from '../store/session'
import { MediaImage } from './MediaImage'
import { haptic } from '../lib/haptics'
import './MessageBubble.css'

const SWIPE_TRIGGER = 56
const SWIPE_MAX = 74
const LONG_PRESS_MS = 480
const DOUBLE_TAP_MS = 280

interface Props {
  message: Message
  /** Null in admin mode, where no message is "yours". */
  me: UserId | null
  replyTarget?: Message
  reactions: Reaction[]
  showTime: boolean
  onReply: (message: Message) => void
  onQuickReact: (message: Message) => void
  onMenu: (message: Message) => void
  onRetry: (message: Message) => void
  onOpenMedia: (message: Message) => void
}

function receiptLabel(message: Message) {
  if (message.failed) return 'Failed'
  if (message.pending) return 'Sending'
  if (message.seen_at) return 'Seen'
  if (message.delivered_at) return 'Delivered'
  return 'Sent'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export const MessageBubble = memo(function MessageBubble({
  message,
  me,
  replyTarget,
  reactions,
  showTime,
  onReply,
  onQuickReact,
  onMenu,
  onRetry,
  onOpenMedia,
}: Props) {
  const mine = message.sender_id === me
  const [offset, setOffset] = useState(0)

  const startX = useRef(0)
  const startY = useRef(0)
  const axis = useRef<'x' | 'y' | null>(null)
  const pressTimer = useRef<number | undefined>(undefined)
  const lastTap = useRef(0)
  const triggered = useRef(false)

  const endGesture = () => {
    window.clearTimeout(pressTimer.current)
    if (offset >= SWIPE_TRIGGER) onReply(message)
    setOffset(0)
    axis.current = null
    triggered.current = false
  }

  return (
    <div
      className={`row ${mine ? 'is-mine' : 'is-theirs'}`}
      onTouchStart={(e) => {
        startX.current = e.touches[0].clientX
        startY.current = e.touches[0].clientY
        axis.current = null
        pressTimer.current = window.setTimeout(() => {
          haptic('select')
          triggered.current = true
          onMenu(message)
        }, LONG_PRESS_MS)
      }}
      onTouchMove={(e) => {
        const dx = e.touches[0].clientX - startX.current
        const dy = e.touches[0].clientY - startY.current

        if (!axis.current) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
          axis.current = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
          // Any real movement means this is not a long press.
          window.clearTimeout(pressTimer.current)
        }
        if (axis.current !== 'x') return

        // Reply pulls rightwards only, with resistance past the trigger point.
        const pulled = Math.max(0, dx)
        const eased = pulled > SWIPE_TRIGGER ? SWIPE_TRIGGER + (pulled - SWIPE_TRIGGER) * 0.3 : pulled
        const next = Math.min(eased, SWIPE_MAX)

        if (next >= SWIPE_TRIGGER && offset < SWIPE_TRIGGER) haptic('tap')
        setOffset(next)
      }}
      onTouchEnd={endGesture}
      onTouchCancel={endGesture}
      onClick={() => {
        if (triggered.current) return
        const now = Date.now()
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          haptic('success')
          onQuickReact(message)
          lastTap.current = 0
        } else {
          lastTap.current = now
        }
      }}
      onContextMenu={(e) => {
        // Desktop right-click gets the same menu as a long press.
        e.preventDefault()
        onMenu(message)
      }}
    >
      <span className="reply-hint" style={{ opacity: Math.min(offset / SWIPE_TRIGGER, 1) }} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v5" />
        </svg>
      </span>

      <div className="bubble-wrap" style={{ transform: `translate3d(${offset}px,0,0)` }}>
        {replyTarget && (
          <div className="quote">
            <span className="quote-who">
              {replyTarget.sender_id === me ? 'You' : USERS[replyTarget.sender_id].name}
            </span>
            <span className="quote-body">{replyTarget.body ?? 'Attachment'}</span>
          </div>
        )}

        <div
          className={`bubble ${message.failed ? 'is-failed' : ''} ${message.pending ? 'is-pending' : ''} ${
            message.media ? 'has-media' : ''
          }`}
        >
          {message.pinned && (
            <span className="pin-flag" aria-label="Pinned">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2v6l3 4v2h-4v6l-1 2-1-2v-6H7v-2l3-4V2z" />
              </svg>
            </span>
          )}
          {message.media && (
            <button
              type="button"
              className="bubble-media"
              onClick={(e) => {
                e.stopPropagation()
                onOpenMedia(message)
              }}
            >
              <MediaImage media={message.media} size="thumb" alt="" />
            </button>
          )}
          {message.body && <p className="bubble-body">{message.body}</p>}
        </div>

        {reactions.length > 0 && (
          <div className="reactions">
            {reactions.map((r) => (
              <span key={`${r.user_id}-${r.emoji}`} className={`chip ${r.user_id === me ? 'is-mine' : ''}`}>
                {r.emoji}
              </span>
            ))}
          </div>
        )}

        {(showTime || mine || message.edited_at) && (
          <div className="meta">
            {message.edited_at && <span className="edited">edited</span>}
            {showTime && <span>{formatTime(message.created_at)}</span>}
            {mine && <span className={`receipt is-${receiptLabel(message).toLowerCase()}`}>{receiptLabel(message)}</span>}
            {message.failed && (
              <button type="button" className="retry" onClick={() => onRetry(message)}>
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
