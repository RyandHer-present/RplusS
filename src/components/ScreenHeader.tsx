import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { USERS, useSession } from '../store/session'
import { usePeople } from '../store/people'
import { haptic } from '../lib/haptics'
import './ScreenHeader.css'

interface Props {
  title: string
  sub?: string
  /** Extra controls placed to the left of the profile button. */
  actions?: ReactNode
}

/** Opens the profile/theme screen. Lives in the corner rather than the tab bar. */
export function YouButton() {
  const navigate = useNavigate()
  const me = useSession((s) => s.user)
  const live = usePeople((s) => (me ? s.people[me]?.mood_color : null))

  return (
    <button
      type="button"
      className={`you-button ${live ? 'has-mood' : ''}`}
      style={live ? ({ '--mood': live } as React.CSSProperties) : undefined}
      onClick={() => {
        haptic('select')
        navigate('/you')
      }}
      aria-label="You"
    >
      {me ? USERS[me].initial : '?'}
    </button>
  )
}

export function ScreenHeader({ title, sub, actions }: Props) {
  return (
    <header className="screen-header">
      <div className="screen-header-text">
        <h1 className="screen-title">{title}</h1>
        {sub && <p className="screen-sub">{sub}</p>}
      </div>
      <div className="screen-header-actions">
        {actions}
        <YouButton />
      </div>
    </header>
  )
}
