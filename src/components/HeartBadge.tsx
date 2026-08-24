import { usePostReactions, type PostReaction, type ReactableEntity } from '../store/postReactions'
import './HeartBadge.css'

/*
 * One shared empty array. This must not be written inline as `?? []`: the
 * store is read through useSyncExternalStore, which compares each result to
 * the last by reference, so a fresh array every call reads as a change every
 * time and the render loop never settles.
 */
const NONE: PostReaction[] = []

interface Props {
  entity: ReactableEntity
  id: string
}

/**
 * Shows that something has been liked. Not a button — liking happens by
 * double tapping the thing itself, and a grid full of tappable hearts was
 * exactly the clutter this replaced.
 */
export function HeartBadge({ entity, id }: Props) {
  const hearts = usePostReactions((s) => s.byTarget[`${entity}:${id}`] ?? NONE)
  if (!hearts.length) return null

  return (
    <span className="heart-badge" aria-label={`Liked by ${hearts.length}`}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 21s-7.5-4.7-9.3-9A5.3 5.3 0 0 1 12 6.5 5.3 5.3 0 0 1 21.3 12c-1.8 4.3-9.3 9-9.3 9z" />
      </svg>
      {hearts.length > 1 && <span className="heart-badge-n">{hearts.length}</span>}
    </span>
  )
}
