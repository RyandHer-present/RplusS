import { useEffect, useRef, useState } from 'react'
import { useVibe } from '../store/vibe'
import { VIBES } from '../theme/vibes'
import { USERS, useSession } from '../store/session'

/**
 * The coloured light a vibe lays over the app, plus a brief word about who
 * changed it.
 *
 * The banner only appears when the *other* person set it. Your own choice
 * needs no announcement — you just made it, and the screen changing is
 * confirmation enough.
 */
export function VibeLayer() {
  const vibe = useVibe((s) => s.vibe)
  const setBy = useVibe((s) => s.setBy)
  const me = useSession((s) => s.user)

  const [announcing, setAnnouncing] = useState(false)
  // Skips the announcement on first load, when the vibe was set hours ago and
  // is simply what the app looks like now.
  const seen = useRef<string | null>(null)
  const first = useRef(true)

  useEffect(() => {
    const key = `${vibe ?? 'none'}:${setBy ?? ''}`
    if (first.current) {
      first.current = false
      seen.current = key
      return
    }
    if (key === seen.current) return
    seen.current = key

    if (!vibe || !setBy || setBy === me) return

    setAnnouncing(true)
    const timer = setTimeout(() => setAnnouncing(false), 4000)
    return () => clearTimeout(timer)
  }, [vibe, setBy, me])

  return (
    <>
      <div className="vibe-wash" aria-hidden="true" />
      {announcing && vibe && setBy && (
        <div className="vibe-banner" role="status">
          <span className="vibe-banner-dot" aria-hidden="true" />
          {USERS[setBy]?.name ?? setBy} set the vibe to {VIBES[vibe].name}
        </div>
      )}
    </>
  )
}
