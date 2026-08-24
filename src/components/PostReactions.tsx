import { usePostReactions, type PostReaction, type ReactableEntity } from '../store/postReactions'
import { useSession, USERS } from '../store/session'
import { haptic } from '../lib/haptics'
import './PostReactions.css'

/*
 * One shared empty array for every post that has no reactions yet.
 *
 * This must not be written inline as `?? []`. The store is read through
 * useSyncExternalStore, which decides whether anything changed by comparing
 * the selector's result to the last one by reference — so a fresh [] every
 * call reads as "changed" every time, and the render loop never settles.
 * React eventually gives up with "Maximum update depth exceeded".
 */
const NONE: PostReaction[] = []

/** The same six the chat offers, so reacting means the same thing everywhere. */
export const FULL_SET = ['❤️', '😂', '🔥', '😭', '💀', '👀']

interface Props {
  entity: ReactableEntity
  id: string
  /** Which emoji can be added here. A photo gets a heart; a note gets the lot. */
  choices?: string[]
  /** Lay it over the bottom of an image rather than sitting under it. */
  overlay?: boolean
}

export function PostReactions({ entity, id, choices = ['❤️'], overlay }: Props) {
  const me = useSession((s) => s.user)
  const reactions = usePostReactions((s) => s.byTarget[`${entity}:${id}`] ?? NONE)
  const toggle = usePostReactions((s) => s.toggle)

  // Grouped so two people picking the same emoji is one chip showing two, not
  // two identical chips.
  const counts = new Map<string, string[]>()
  for (const r of reactions) {
    counts.set(r.emoji, [...(counts.get(r.emoji) ?? []), r.user_id])
  }

  const press = (emoji: string) => {
    if (!me) return
    haptic('tap')
    void toggle(entity, id, emoji, me)
  }

  return (
    <div className={`post-reactions ${overlay ? 'is-overlay' : ''}`}>
      {[...counts.entries()].map(([emoji, who]) => (
        <button
          key={emoji}
          type="button"
          className={`post-reaction ${me && who.includes(me) ? 'is-mine' : ''}`}
          onClick={() => press(emoji)}
          title={who.map((w) => USERS[w as 'ry' | 'sarah']?.name ?? w).join(' and ')}
          disabled={!me}
        >
          <span aria-hidden="true">{emoji}</span>
          {who.length > 1 && <span className="post-reaction-n">{who.length}</span>}
        </button>
      ))}

      {me &&
        choices
          // Anything already on the post is shown above as a chip; offering it
          // twice in a row would just be the same button beside itself.
          .filter((emoji) => !counts.has(emoji))
          .map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="post-reaction is-add"
              onClick={() => press(emoji)}
              aria-label={`React ${emoji}`}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
    </div>
  )
}
