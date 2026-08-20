import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOGGLES, useVisuals } from '../store/visuals'
import { haptic } from '../lib/haptics'
import { sfx } from '../lib/sound'
import './Visuals.css'

export default function Visuals() {
  const navigate = useNavigate()
  const enabled = useVisuals((s) => s.enabled)
  const toggle = useVisuals((s) => s.toggle)
  const setAll = useVisuals((s) => s.setAll)
  const reset = useVisuals((s) => s.reset)

  const groups = useMemo(() => {
    const map = new Map<string, typeof TOGGLES>()
    for (const item of TOGGLES) {
      const list = map.get(item.group)
      if (list) list.push(item)
      else map.set(item.group, [item])
    }
    return [...map.entries()]
  }, [])

  const onCount = TOGGLES.filter((t) => enabled[t.id]).length

  return (
    <div className="screen-scroll">
      <button type="button" className="screen-back" onClick={() => navigate(-1)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Back
      </button>

      <header className="screen-head">
        <h1 className="screen-title">Visuals</h1>
        <p className="screen-sub">
          {onCount} of {TOGGLES.length} on
        </p>
      </header>

      <div className="vis-bulk">
        <button type="button" onClick={() => { haptic('select'); sfx.tab(); setAll(true) }}>
          All on
        </button>
        <button type="button" onClick={() => { haptic('select'); setAll(false) }}>
          All off
        </button>
        <button type="button" onClick={() => { haptic('select'); reset() }}>
          Default
        </button>
      </div>

      {groups.map(([group, items]) => (
        <section key={group} className="vis-group">
          <h2 className="vis-group-label">{group}</h2>
          <div className="vis-list">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="switch"
                aria-checked={Boolean(enabled[item.id])}
                className={`vis-row ${enabled[item.id] ? 'is-on' : ''}`}
                onClick={() => {
                  haptic('select')
                  sfx.tab()
                  toggle(item.id)
                }}
              >
                <span className="vis-text">
                  <span className="vis-label">{item.label}</span>
                  <span className="vis-hint">{item.hint}</span>
                </span>
                <span className="vis-switch" aria-hidden="true">
                  <span className="vis-knob" />
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <p className="vis-foot">
        Every effect here is a single composited layer, so turning them all on does not
        cost framerate. They are yours alone — Sarah&rsquo;s settings are separate.
      </p>
    </div>
  )
}
