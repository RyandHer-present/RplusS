import { useState } from 'react'
import { useChat } from '../store/chat'
import { useNotes } from '../store/notes'
import { useGallery } from '../store/gallery'
import { useFits } from '../store/fits'
import { useJams } from '../store/jams'
import { useVoice } from '../store/voice'
import { usePostReactions } from '../store/postReactions'
import { useUnread } from '../store/unread'
import { useSession } from '../store/session'
import { haptic } from '../lib/haptics'
import './RefreshButton.css'

/**
 * Pulls everything down again.
 *
 * Realtime normally keeps all of this current, so needing this at all means
 * something was missed — a dropped socket, a phone that was asleep. It also
 * asks the service worker to look for a new version of the app, since the
 * other reason a screen looks wrong is that it is running last week's code.
 */
export function RefreshButton() {
  const me = useSession((s) => s.user)
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle')

  const run = async () => {
    if (state === 'working') return
    setState('working')
    haptic('tap')

    await Promise.allSettled([
      useChat.getState().load(),
      useNotes.getState().load(),
      useGallery.getState().load(),
      useFits.getState().load(),
      useJams.getState().load(),
      useVoice.getState().load(),
      usePostReactions.getState().load(),
      me ? useUnread.getState().load(me) : Promise.resolve(),
      'serviceWorker' in navigator
        ? navigator.serviceWorker.getRegistration().then((r) => r?.update())
        : Promise.resolve(),
    ])

    setState('done')
    window.setTimeout(() => setState('idle'), 1600)
  }

  return (
    <button
      type="button"
      className={`refresh-btn is-${state}`}
      onClick={() => void run()}
      disabled={state === 'working'}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      {state === 'working' ? 'Refreshing' : state === 'done' ? 'Up to date' : 'Refresh'}
    </button>
  )
}
