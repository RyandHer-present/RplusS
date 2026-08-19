import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import Lock from './screens/Lock'
import { useSession } from './store/session'
import { supabase } from './lib/supabase'

// Route-level code splitting: the lock screen is all most sessions load first,
// so the section bundles stay off the critical path.
const Chat = lazy(() => import('./screens/Chat'))
const Notes = lazy(() => import('./screens/Notes'))
const Gallery = lazy(() => import('./screens/Gallery'))
const Voice = lazy(() => import('./screens/Voice'))
const You = lazy(() => import('./screens/You'))

export default function App() {
  const user = useSession((s) => s.user)
  const signOut = useSession((s) => s.signOut)

  // The remembered user and the Supabase session are stored separately, so they
  // can drift — a revoked or expired session would otherwise leave the app
  // looking signed in while every request silently failed.
  useEffect(() => {
    if (!user || !supabase) return
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && !data.session) signOut()
    })
    return () => {
      cancelled = true
    }
  }, [user, signOut])

  if (!user) return <Lock />

  return (
    <Suspense fallback={<div className="shell" />}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/chat" element={<Chat />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/voice" element={<Voice />} />
          <Route path="/you" element={<You />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
