import { useCallback, useEffect, useState } from 'react'
import { disablePush, enablePush, pushState, type PushState } from '../lib/push'
import { USERS, other, useSession } from '../store/session'
import { haptic } from '../lib/haptics'
import './PushPanel.css'

export function PushPanel() {
  const me = useSession((s) => s.user)
  const them = me ? USERS[other(me)].name : null
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const refresh = useCallback(() => {
    void pushState().then(setState)
  }, [])

  useEffect(refresh, [refresh])

  if (!me) return null

  const toggle = async () => {
    setBusy(true)
    setProblem(null)
    try {
      if (state === 'on') {
        await disablePush()
      } else {
        const result = await enablePush(me)
        if (!result.ok) setProblem(result.reason ?? 'Could not turn them on.')
        else haptic('tap')
      }
      refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Notifications</h2>

      {state === 'needs-install' && (
        <p className="panel-note">
          iPhone only allows these once the site is added to your home screen. Open it from
          the R+S icon rather than Safari, then come back here.
        </p>
      )}

      {state === 'unsupported' && (
        <p className="panel-note">This browser cannot do notifications.</p>
      )}

      {state === 'denied' && (
        <p className="panel-note">
          Blocked for this app. iOS only asks once — turn them back on in Settings,
          Notifications, R+S.
        </p>
      )}

      {(state === 'on' || state === 'off') && (
        <>
          <p className="panel-note">
            {state === 'on'
              ? `This device will know when ${them} sends something, even with the app closed.`
              : `Know when ${them} sends something, without having to open the app.`}
          </p>
          <button
            type="button"
            className={`push-toggle ${state === 'on' ? 'is-on' : ''}`}
            onClick={() => void toggle()}
            disabled={busy}
          >
            {busy ? 'Just a second…' : state === 'on' ? 'Turn off on this device' : 'Turn on'}
          </button>
        </>
      )}

      {state === null && <p className="panel-note">Checking…</p>}
      {problem && <p className="push-problem">{problem}</p>}
    </section>
  )
}
