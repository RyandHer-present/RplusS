import { THEME_LIST } from '../theme/themes'
import { useTheme } from '../theme/useTheme'
import { USERS, useSession } from '../store/session'
import { haptic, hapticsSupported } from '../lib/haptics'
import { signOutRemote } from '../lib/auth'
import './You.css'

export default function You() {
  const themeId = useTheme((s) => s.themeId)
  const setTheme = useTheme((s) => s.setTheme)
  const user = useSession((s) => s.user)
  const signOut = useSession((s) => s.signOut)

  const me = user ? USERS[user] : null

  return (
    <div className="screen-scroll">
      <header className="screen-head">
        <h1 className="screen-title">You</h1>
        {me && <p className="screen-sub">{me.name}</p>}
      </header>

      <section className="panel">
        <h2 className="panel-title">Theme</h2>
        <p className="panel-note">Only changes how it looks for you.</p>

        <div className="themes">
          {THEME_LIST.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`theme-card ${theme.id === themeId ? 'is-active' : ''}`}
              onClick={() => {
                haptic('select')
                setTheme(theme.id)
              }}
              aria-pressed={theme.id === themeId}
            >
              <span
                className="theme-swatch"
                style={{
                  background: `linear-gradient(135deg, ${theme.tokens['--a1']}, ${theme.tokens['--a2']} 50%, ${theme.tokens['--a3']})`,
                }}
                aria-hidden="true"
              />
              <span className="theme-name">{theme.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">This device</h2>
        <dl className="facts">
          <div>
            <dt>Haptics</dt>
            <dd>{hapticsSupported ? 'Supported' : 'Not supported (iOS Safari)'}</dd>
          </div>
          <div>
            <dt>Screen</dt>
            <dd>
              {window.innerWidth}×{window.innerHeight} @{window.devicePixelRatio}x
            </dd>
          </div>
        </dl>
      </section>

      <button
        type="button"
        className="signout"
        onClick={() => {
          haptic('tap')
          void signOutRemote()
          signOut()
        }}
      >
        Lock
      </button>
    </div>
  )
}
