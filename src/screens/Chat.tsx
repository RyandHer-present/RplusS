import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { MessageBubble } from '../components/MessageBubble'
import { Composer } from '../components/Composer'
import { YouButton } from '../components/ScreenHeader'
import { useChat } from '../store/chat'
import { usePresence } from '../store/presence'
import { USERS, useSession } from '../store/session'
import { haptic } from '../lib/haptics'
import type { Message } from '../lib/types'
import './Chat.css'

const QUICK_EMOJI = ['❤️', '😂', '🔥', '😭', '💀', '👀']
const GROUP_GAP_MS = 5 * 60 * 1000

function relativeTime(iso: string | null) {
  if (!iso) return 'offline'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function Chat() {
  const me = useSession((s) => s.user)!
  const other = me === 'ry' ? 'sarah' : 'ry'

  const messages = useChat((s) => s.messages)
  const reactions = useChat((s) => s.reactions)
  const status = useChat((s) => s.status)
  const load = useChat((s) => s.load)
  const loadOlder = useChat((s) => s.loadOlder)
  const subscribe = useChat((s) => s.subscribe)
  const setReplyTo = useChat((s) => s.setReplyTo)
  const toggleReaction = useChat((s) => s.toggleReaction)
  const togglePin = useChat((s) => s.togglePin)
  const markSeen = useChat((s) => s.markSeen)
  const retry = useChat((s) => s.retry)
  const setEditing = useChat((s) => s.setEditing)
  const unsend = useChat((s) => s.unsend)

  const connect = usePresence((s) => s.connect)
  const otherOnline = usePresence((s) => s.otherOnline)
  const otherTyping = usePresence((s) => s.otherTyping)
  const otherLastSeen = usePresence((s) => s.otherLastSeen)

  const [menuFor, setMenuFor] = useState<Message | null>(null)
  const listRef = useRef<VirtuosoHandle>(null)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => subscribe(me), [subscribe, me])
  useEffect(() => connect(me), [connect, me])

  // With a single conversation, having the chat open and focused *is* the read
  // signal — the same behaviour as every phone messaging app.
  useEffect(() => {
    const flush = () => {
      if (document.hidden) return
      const unseen = messages.filter((m) => m.sender_id !== me && !m.seen_at).map((m) => m.id)
      if (unseen.length) void markSeen(unseen)
    }
    flush()
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('focus', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('focus', flush)
    }
  }, [messages, me, markSeen])

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])
  const pinned = useMemo(() => messages.filter((m) => m.pinned), [messages])

  const scrollToMessage = useCallback(
    (id: string) => {
      const index = messages.findIndex((m) => m.id === id)
      if (index >= 0) {
        listRef.current?.scrollToIndex({ index, align: 'center', behavior: 'smooth' })
        haptic('tap')
      }
    },
    [messages],
  )

  const statusLine = otherTyping
    ? 'typing…'
    : otherOnline
      ? 'online'
      : otherLastSeen
        ? `last seen ${relativeTime(otherLastSeen)}`
        : 'offline'

  return (
    <div className="chat">
      <header className="chat-head">
        <div className={`avatar ${otherOnline ? 'is-online' : ''}`}>{USERS[other].initial}</div>
        <div className="chat-who">
          <span className="chat-name">{USERS[other].name}</span>
          <span className={`chat-status ${otherTyping ? 'is-typing' : ''}`}>{statusLine}</span>
        </div>
        <YouButton />
      </header>

      {pinned.length > 0 && (
        <div className="pinned" data-no-swipe>
          {pinned.map((m) => (
            <button key={m.id} type="button" className="pinned-item" onClick={() => scrollToMessage(m.id)}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M14 2v6l3 4v2h-4v6l-1 2-1-2v-6H7v-2l3-4V2z" />
              </svg>
              <span>{m.body ?? 'Attachment'}</span>
            </button>
          ))}
        </div>
      )}

      <div className="chat-list">
        {status === 'loading' && <p className="chat-hint">Loading…</p>}

        {status === 'ready' && messages.length === 0 && (
          <div className="chat-empty">
            <p className="chat-empty-title">Nothing here yet</p>
            <p className="chat-empty-sub">Say something.</p>
          </div>
        )}

        {messages.length > 0 && (
          <Virtuoso
            ref={listRef}
            className="chat-scroll"
            data={messages}
            followOutput="smooth"
            initialTopMostItemIndex={messages.length - 1}
            startReached={() => void loadOlder()}
            increaseViewportBy={{ top: 400, bottom: 400 }}
            itemContent={(index, message) => {
              const next = messages[index + 1]
              // Only the last message of a run shows its timestamp, so a burst
              // of messages does not turn into a wall of clock readings.
              const showTime =
                !next ||
                next.sender_id !== message.sender_id ||
                new Date(next.created_at).getTime() - new Date(message.created_at).getTime() > GROUP_GAP_MS

              return (
                <MessageBubble
                  message={message}
                  me={me}
                  replyTarget={message.reply_to_id ? byId.get(message.reply_to_id) : undefined}
                  reactions={reactions[message.id] ?? []}
                  showTime={showTime}
                  onReply={setReplyTo}
                  onQuickReact={(m) => void toggleReaction(m.id, '❤️', me)}
                  onMenu={setMenuFor}
                  onRetry={(m) => void retry(m.id, me)}
                />
              )
            }}
          />
        )}

        {otherTyping && (
          <div className="typing" aria-live="polite">
            <span /><span /><span />
          </div>
        )}
      </div>

      <Composer />

      {menuFor && (
        <div className="sheet-backdrop" onClick={() => setMenuFor(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="sheet-emoji">
              {QUICK_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    haptic('select')
                    void toggleReaction(menuFor.id, emoji, me)
                    setMenuFor(null)
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="sheet-action"
              onClick={() => {
                setReplyTo(menuFor)
                setMenuFor(null)
              }}
            >
              Reply
            </button>
            <button
              type="button"
              className="sheet-action"
              onClick={() => {
                void togglePin(menuFor.id)
                setMenuFor(null)
              }}
            >
              {menuFor.pinned ? 'Unpin' : 'Pin to top'}
            </button>
            {menuFor.body && (
              <button
                type="button"
                className="sheet-action"
                onClick={() => {
                  void navigator.clipboard?.writeText(menuFor.body!)
                  setMenuFor(null)
                }}
              >
                Copy
              </button>
            )}
            {menuFor.sender_id === me && menuFor.body && !menuFor.pending && (
              <button
                type="button"
                className="sheet-action"
                onClick={() => {
                  setEditing(menuFor)
                  setMenuFor(null)
                }}
              >
                Edit
              </button>
            )}
            {menuFor.sender_id === me && !menuFor.pending && (
              <button
                type="button"
                className="sheet-action is-danger"
                onClick={() => {
                  haptic('error')
                  void unsend(menuFor.id)
                  setMenuFor(null)
                }}
              >
                Unsend
              </button>
            )}
            <button type="button" className="sheet-action is-cancel" onClick={() => setMenuFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
