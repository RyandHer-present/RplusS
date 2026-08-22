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
