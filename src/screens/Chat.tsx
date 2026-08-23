import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { MessageBubble } from '../components/MessageBubble'
import { Composer } from '../components/Composer'
import { MediaViewer } from '../components/MediaViewer'
import { YouButton } from '../components/ScreenHeader'
import { useChat } from '../store/chat'
import { usePresence } from '../store/presence'
import { usePeople } from '../store/people'
import { USERS, useSession, type UserId } from '../store/session'
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
  const me = useSession((s) => s.user)
  const isAdmin = useSession((s) => s.isAdmin)
  // Admin is looking in from outside; the header still needs a subject, so it
  // shows Sarah's side by convention.
  const other: UserId = me === 'ry' ? 'sarah' : me === 'sarah' ? 'ry' : 'sarah'

  const messages = useChat((s) => s.messages)
  const reactions = useChat((s) => s.reactions)
  const status = useChat((s) => s.status)
  const load = useChat((s) => s.load)
  const loadOlder = useChat((s) => s.loadOlder)
  const firstItemIndex = useChat((s) => s.firstItemIndex)
  const subscribe = useChat((s) => s.subscribe)
  const setReplyTo = useChat((s) => s.setReplyTo)
  const toggleReaction = useChat((s) => s.toggleReaction)
  const togglePin = useChat((s) => s.togglePin)
  const markSeen = useChat((s) => s.markSeen)
  const retry = useChat((s) => s.retry)
  const setEditing = useChat((s) => s.setEditing)
  const queued = useChat((s) => s.queued)
  const watchConnection = useChat((s) => s.watchConnection)
  const unsend = useChat((s) => s.unsend)

  const connect = usePresence((s) => s.connect)
  const otherOnline = usePresence((s) => s.otherOnline)
  const otherTyping = usePresence((s) => s.otherTyping)
  const otherLastSeen = usePresence((s) => s.otherLastSeen)

  const theirMood = usePeople((s) => s.people[other]?.mood_color)
  const [menuFor, setMenuFor] = useState<Message | null>(null)
  const [viewing, setViewing] = useState<Message | null>(null)
  const listRef = useRef<VirtuosoHandle>(null)

  // Where the list opens. This has to be decided once: it is an *initial*
  // position, and recomputing it from the live message count re-applies it as
  // messages arrive, which drags the view off whatever you were reading.
  const openAt = useRef<number | null>(null)
  if (openAt.current === null && messages.length > 0) openAt.current = messages.length - 1

  useEffect(() => {
    void load()
  }, [load])

  // Delivery receipts and presence both need an identity, so neither runs for
  // admin — it observes without appearing online or acknowledging anything.
  useEffect(() => (me ? subscribe(me) : undefined), [subscribe, me])
  useEffect(() => (me ? connect(me) : undefined), [connect, me])
  useEffect(() => (me ? watchConnection(me) : undefined), [watchConnection, me])

  // With a single conversation, having the chat open and focused *is* the read
  // signal — the same behaviour as every phone messaging app.
  useEffect(() => {
    const flush = () => {
      if (document.hidden || !me) return
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
        // Indexes are offset by firstItemIndex, so an array position is not a
        // list position once any history has been loaded.
        listRef.current?.scrollToIndex({ index: firstItemIndex + index, align: 'center', behavior: 'smooth' })
        haptic('tap')
      }
    },
    [messages, firstItemIndex],
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
        <div
          className={`avatar ${otherOnline ? 'is-online' : ''} ${theirMood ? 'has-mood' : ''}`}
          style={theirMood ? ({ '--mood': theirMood } as React.CSSProperties) : undefined}
        >
          {USERS[other].initial}
        </div>
        <div className="chat-who">
          <span className="chat-name">{USERS[other].name}</span>
          <span className={`chat-status ${otherTyping ? 'is-typing' : ''}`}>{statusLine}</span>
        </div>
        {queued > 0 && (
          <span className="chat-queued" title="Waiting for a connection">
            {queued} waiting
          </span>
        )}
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
            // Only follow new messages when you are already at the bottom, and
            // jump rather than animate: a smooth scroll runs for hundreds of
            // milliseconds, and a thumb moving during it fights the animation.
            followOutput={(atBottom) => (atBottom ? 'auto' : false)}
            firstItemIndex={firstItemIndex}
            initialTopMostItemIndex={openAt.current ?? 0}
            startReached={() => void loadOlder()}
            increaseViewportBy={{ top: 400, bottom: 400 }}
            itemContent={(index, message) => {
              const next = messages[index - firstItemIndex + 1]
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
                  onQuickReact={(m) => me && void toggleReaction(m.id, '❤️', me)}
                  onMenu={setMenuFor}
                  onRetry={(m) => me && void retry(m.id, me)}
                  onOpenMedia={setViewing}
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

      {me ? <Composer /> : <p className="chat-readonly">Admin view — read only</p>}

      {viewing?.media && (
        <MediaViewer
          media={viewing.media}
          caption={viewing.sender_id === me ? 'You' : USERS[viewing.sender_id].name}
          onClose={() => setViewing(null)}
        />
      )}

      {menuFor && (
        <div className="sheet-backdrop" onClick={() => setMenuFor(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="sheet-emoji">
              {me && QUICK_EMOJI.map((emoji) => (
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
            {(menuFor.sender_id === me || isAdmin) && menuFor.body && !menuFor.pending && (
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
            {(menuFor.sender_id === me || isAdmin) && !menuFor.pending && (
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
