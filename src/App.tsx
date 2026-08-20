import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import Lock from './screens/Lock'
import { useSession } from './store/session'
import { supabase } from './lib/supabase'
import { usePeople } from './store/people'

// Route-level code splitting: the lock screen is all most sessions load first,
// so the section bundles stay off the critical path.
const Chat = lazy(() => import('./screens/Chat'))
const Notes = lazy(() => import('./screens/Notes'))
const Gallery = lazy(() => import('./screens/Gallery'))
const Voice = lazy(() => import('./screens/Voice'))
const Fits = lazy(() => import('./screens/Fits'))
const Logs = lazy(() => import('./screens/Logs'))
const Search = lazy(() => import('./screens/Search'))
const Visuals = lazy(() => import('./screens/Visuals'))
const You = lazy(() => import('./screens/You'))

export default function App() {
  const role = useSession((s) => s.role)
  const loadPeople = usePeople((s) => s.load)
  const subscribePeople = usePeople((s) => s.subscribe)
  const signOut = useSession((s) => s.signOut)

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

  if (!role) return <Lock />

  return (
    <Suspense fallback={<div className="shell" />}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/chat" element={<Chat />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/fits" element={<Fits />} />
          <Route path="/voice" element={<Voice />} />
          <Route path="/you" element={<You />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/search" element={<Search />} />
          <Route path="/visuals" element={<Visuals />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
