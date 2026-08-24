import { useVibe } from '../store/vibe'
import { VIBE_LIST, VIBES } from '../theme/vibes'
import { USERS, useSession } from '../store/session'
import { haptic } from '../lib/haptics'
import './VibePicker.css'

/**
 * Setting a vibe is not a preference — it changes the other person's screen
 * too, wherever they are. The copy says so plainly, because a control that
 * reaches into someone else's phone should not look like a theme switcher.
 */
export function VibePicker() {
  const vibe = useVibe((s) => s.vibe)
  const setBy = useVibe((s) => s.setBy)
  const setVibe = useVibe((s) => s.set)
  const me = useSession((s) => s.user)

  const choose = (id: (typeof VIBE_LIST)[number]['id']) => {
    if (!me) return
    haptic('select')
    void setVibe(vibe === id ? null : id, me)
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Vibe</h2>
      <div className="vibe-grid">
        {VIBE_LIST.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`vibe-card ${vibe === v.id ? 'is-on' : ''}`}
            style={
              {
                '--v1': v.tokens['--a1'],
                '--v2': v.tokens['--a2'],
                '--v3': v.tokens['--a3'],
                '--vbg': v.tokens['--bg'],
              } as React.CSSProperties
            }
            onClick={() => choose(v.id)}
            aria-pressed={vibe === v.id}
          >
            <span className="vibe-swatch" aria-hidden="true" />
            <span className="vibe-name">{v.name}</span>
            <span className="vibe-line">{v.blurb}</span>
          </button>
        ))}
      </div>

      {vibe && (
        <p className="vibe-current">
          <strong>{VIBES[vibe].name}</strong> is on
          {setBy ? ` — set by ${setBy === me ? 'you' : (USERS[setBy]?.name ?? setBy)}` : ''}
        </p>
      )}
    </section>
  )
}
