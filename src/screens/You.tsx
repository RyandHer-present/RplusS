import { useNavigate } from 'react-router-dom'
import { THEME_LIST } from '../theme/themes'
import { useTheme } from '../theme/useTheme'
import { USERS, useSession } from '../store/session'
import { useState } from 'react'
import { haptic, hapticsSupported } from '../lib/haptics'
import { isMuted, setMuted, sfx } from '../lib/sound'
import { signOutRemote } from '../lib/auth'
import { MOODS, usePeople } from '../store/people'
import './You.css'

export default function You() {
  const themeId = useTheme((s) => s.themeId)
  const setTheme = useTheme((s) => s.setTheme)
  const user = useSession((s) => s.user)
  const isAdmin = useSession((s) => s.isAdmin)
  const signOut = useSession((s) => s.signOut)

  const me = user ? USERS[user] : null
  const navigate = useNavigate()
  const [muted, setMutedState] = useState(isMuted())
  const people = usePeople((s) => s.people)
  const setMood = usePeople((s) => s.setMood)
  const myMood = user ? people[user]?.mood : null

  return (
    <div className="screen-scroll">
      <button type="button" className="screen-back" onClick={() => navigate(-1)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Back
      </button>
      <header className="screen-head">
        <h1 className="screen-title">{isAdmin ? 'Admin' : 'You'}</h1>
        {me && <p className="screen-sub">{me.name}</p>}
      </header>

      {isAdmin && (
        <section className="panel is-admin">
          <h2 className="panel-title">Admin mode</h2>
          <p className="panel-note">
            Signed in as neither person. You can edit and remove anything, but not post.
          </p>
          <button type="button" className="panel-link" onClick={() => navigate('/logs')}>
            Open logs
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </section>
      )}

      {user && (
        <section className="panel">
          <h2 className="panel-title">Mood</h2>
          <p className="panel-note">Tints your ring wherever it shows. Tap again to clear.</p>
          <div className="moods">
            {MOODS.map((mood) => (
              <button
                key={mood.label}
                type="button"
                className={`mood ${myMood === mood.label ? 'is-active' : ''}`}
                style={{ '--mood': mood.color } as React.CSSProperties}
                onClick={() => {
                  haptic('select')
                  const clearing = myMood === mood.label
                  void setMood(user, clearing ? null : mood.label, clearing ? null : mood.color)
                }}
              >
                <span className="mood-dot" aria-hidden="true" />
                <span className="mood-label">{mood.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

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
        <h2 className="panel-title">Visuals</h2>
        <p className="panel-note">Turn individual effects on or off.</p>
        <button type="button" className="panel-link" onClick={() => navigate('/visuals')}>
          Open visual settings
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </section>

      <section className="panel">
        <h2 className="panel-title">Sound</h2>
        <p className="panel-note">Taps, sends and the unlock chime.</p>
        <button
          type="button"
          className={`toggle ${muted ? '' : 'is-on'}`}
          role="switch"
          aria-checked={!muted}
          onClick={() => {
            const next = !muted
            setMuted(next)
            setMutedState(next)
            haptic('select')
            // Play the confirmation *after* unmuting, so turning it on is audible.
            if (!next) sfx.key(2)
          }}
        >
          <span className="toggle-label">{muted ? 'Off' : 'On'}</span>
          <span className="toggle-track" aria-hidden="true"><span className="toggle-knob" /></span>
        </button>
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
