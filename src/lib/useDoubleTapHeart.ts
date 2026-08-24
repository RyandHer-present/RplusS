import { useRef, useState } from 'react'
import { usePostReactions, type ReactableEntity } from '../store/postReactions'
import { useSession } from '../store/session'
import { haptic } from '../lib/haptics'

const DOUBLE_TAP_MS = 280

/**
 * Double tap to like, the same gesture and the same window the chat uses.
 *
 * Only ever adds. A double tap is an enthusiastic gesture and people do it
 * twice by accident; making the second one silently undo the first would read
 * as the app dropping it. Unliking is a deliberate tap on the heart instead.
 */
export function useDoubleTapHeart(entity: ReactableEntity, id: string | null) {
  const me = useSession((s) => s.user)
  const toggle = usePostReactions((s) => s.toggle)
  const mine = usePostReactions((s) =>
    id ? (s.byTarget[`${entity}:${id}`] ?? []).some((r) => r.user_id === me && r.emoji === '❤️') : false,
  )

  const lastTap = useRef(0)
  const [burst, setBurst] = useState(0)

  const onTap = () => {
    if (!me || !id) return
    const now = Date.now()
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0
      haptic('success')
      // The burst plays either way, so a double tap on something already
      // liked still feels like it did something rather than nothing.
      setBurst((n) => n + 1)
      if (!mine) void toggle(entity, id, '❤️', me)
    } else {
      lastTap.current = now
    }
  }

  const unlike = () => {
    if (!me || !id || !mine) return
    haptic('tap')
    void toggle(entity, id, '❤️', me)
  }

  return { onTap, unlike, liked: mine, burst, canLike: Boolean(me && id) }
}
