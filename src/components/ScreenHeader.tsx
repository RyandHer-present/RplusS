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

export function SearchButton() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="header-icon"
      aria-label="Search"
      onClick={() => {
        haptic('select')
        navigate('/search')
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </svg>
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
        <SearchButton />
        <YouButton />
      </div>
    </header>
  )
}
