import { Suspense, lazy, useEffect, useRef } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import Lock from './screens/Lock'
import { useSession } from './store/session'
import { supabase } from './lib/supabase'
import { usePeople } from './store/people'
import { useVibe } from './store/vibe'
import { usePostReactions } from './store/postReactions'
import { usePanic } from './store/panic'
import { PanicScreen } from './components/PanicScreen'
import { installPanicGesture } from './lib/panicGesture'
import { resubscribe } from './lib/push'
import { destinationFor, readIncoming } from './lib/incoming'

// Route-level code splitting: the lock screen is all most sessions load first,
// so the section bundles stay off the critical path.
const Chat = lazy(() => import('./screens/Chat'))
const Notes = lazy(() => import('./screens/Notes'))
const Gallery = lazy(() => import('./screens/Gallery'))
const Voice = lazy(() => import('./screens/Voice'))
const Fits = lazy(() => import('./screens/Fits'))
const Jam = lazy(() => import('./screens/Jam'))
const Play = lazy(() => import('./screens/Play'))
const Logs = lazy(() => import('./screens/Logs'))
const Health = lazy(() => import('./screens/Health'))
const Search = lazy(() => import('./screens/Search'))
const Visuals = lazy(() => import('./screens/Visuals'))
const You = lazy(() => import('./screens/You'))

export default function App() {
  const role = useSession((s) => s.role)
  const loadPeople = usePeople((s) => s.load)
  const subscribePeople = usePeople((s) => s.subscribe)
  const loadVibe = useVibe((s) => s.load)
  const loadPostReactions = usePostReactions((s) => s.load)
  const subscribePostReactions = usePostReactions((s) => s.subscribe)
  const subscribeVibe = useVibe((s) => s.subscribe)
  const signOut = useSession((s) => s.signOut)
  const hidden = usePanic((s) => s.hidden)

  // Installed at the root rather than per screen: it has to work from anywhere,
  // including the lock screen.
  useEffect(() => installPanicGesture(), [])

  // A share, or a Shortcut opening a URL. Read once, before anything else has
  // a chance to navigate, and only acted on once signed in — otherwise it
  // would be thrown away by the lock screen.
  const incoming = useRef(readIncoming())
  useEffect(() => {
    if (!role) return
    const arrived = incoming.current
    if (!arrived) return
    incoming.current = null

    if (arrived.text) {
      const where = destinationFor(arrived.text)
      // Left for the destination screen to pick up and prefill.
      sessionStorage.setItem('rpluss.shared', arrived.text)
      window.location.hash = where
    } else if (arrived.to) {
      window.location.hash = `/${arrived.to}`
    }
  }, [role])

  // The service worker talks back for two reasons: a notification was tapped
  // and wants a screen opened, or the browser rotated the push subscription
  // behind our back and the new one has to be registered.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string } | undefined
      if (data?.type === 'navigate' && data.path) window.location.hash = data.path
      if (data?.type === 'resubscribe') {
        const me = useSession.getState().user
        if (me) void resubscribe(me)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  // The remembered user and the Supabase session are stored separately, so they
  // can drift — a revoked or expired session would otherwise leave the app
  // looking signed in while every request silently failed.
  useEffect(() => {
    if (!role || !supabase) return
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && !data.session) signOut()
    })
    return () => {
      cancelled = true
    }
  }, [role, signOut])

  useEffect(() => {
    if (!role) return
    void loadPeople()
    return subscribePeople()
  }, [role, loadPeople, subscribePeople])

  // The vibe belongs to the pair, so it is read once signed in and then
  // watched — the other person changing it has to arrive here unprompted.
  useEffect(() => {
    if (!role) return
    void loadVibe()
    return subscribeVibe()
  }, [role, loadVibe, subscribeVibe])

  // Reactions on fits, gallery posts and notes. One subscription covers all of
  // them, so a heart appearing on her screen needs no per-screen wiring.
  useEffect(() => {
    if (!role) return
    void loadPostReactions()
    return subscribePostReactions()
  }, [role, loadPostReactions, subscribePostReactions])

  // Checked before anything else, so nothing of the app renders underneath it.
  if (hidden) return <PanicScreen />

  if (!role) return <Lock />

  return (
    <Suspense fallback={<div className="shell" />}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/chat" element={<Chat />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/fits" element={<Fits />} />
          <Route path="/jam" element={<Jam />} />
          <Route path="/play" element={<Play />} />
          <Route path="/voice" element={<Voice />} />
          <Route path="/you" element={<You />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/health" element={<Health />} />
          <Route path="/search" element={<Search />} />
          <Route path="/visuals" element={<Visuals />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
