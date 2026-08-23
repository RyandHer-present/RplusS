import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ThemeProvider } from './theme/ThemeProvider'
import App from './App'
import { reportVisit } from './lib/visit'
import './index.css'
import './visuals.css'
import './visuals-layers.css'

// HashRouter rather than BrowserRouter: GitHub Pages has no server-side rewrite,
// so deep links on a normal router would 404 on refresh.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  </StrictMode>,
)

// Outside the tree on purpose: this should happen once when the page opens,
// whoever it is and whether or not they ever get past the lock screen.
reportVisit()

/*
 * Register the service worker, which is what makes this installable to the
 * home screen and openable with no connection.
 *
 * Dev is excluded deliberately: a worker caching the shell in front of Vite's
 * dev server produces changes that do not appear, which is a miserable way to
 * lose an afternoon.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        // A new worker parked in `waiting` means a deploy landed while the app
        // was open. Take it on the next load rather than interrupting now.
        registration.addEventListener('updatefound', () => {
          const next = registration.installing
          next?.addEventListener('statechange', () => {
            if (next.state === 'installed' && navigator.serviceWorker.controller) {
              next.postMessage('skip-waiting')
            }
          })
        })
      })
      .catch(() => {
        // Private mode, an unsupported browser, or the file failed to load.
        // The site works without it; only offline and install do not.
      })
  })
}
