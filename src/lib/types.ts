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

export interface Media {
  id: string
  owner_id: UserId
  kind: 'image' | 'video' | 'audio' | 'doodle'
  b2_key: string
  thumb_key: string | null
  blur: string | null
  width: number | null
  height: number | null
  duration_ms: number | null
  bytes: number | null
  created_at: string
}

export interface Fit {
  id: string
  author_id: UserId
  media_id: string
  caption: string | null
  day: string
  created_at: string
  media?: Media | null
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
