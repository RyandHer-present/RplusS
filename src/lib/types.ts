import type { UserId } from '../store/session'

export interface Message {
  id: string
  sender_id: UserId
  body: string | null
  media_id: string | null
  reply_to_id: string | null
  pinned: boolean
  created_at: string
  delivered_at: string | null
  seen_at: string | null
  edited_at: string | null
  /** Client-only: set while an optimistic message is still in flight. */
  pending?: boolean
  /** Client-only: the send failed and can be retried. */
  failed?: boolean
}

export interface Reaction {
  message_id: string
  user_id: UserId
  emoji: string
}

/** What the other person's client broadcasts about itself. */
export interface Presence {
  online: boolean
  typing: boolean
  lastSeen: string | null
}
