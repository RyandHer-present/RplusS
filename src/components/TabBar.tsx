import type { ReactElement } from 'react'
import { NavLink } from 'react-router-dom'
import { haptic } from '../lib/haptics'
import './TabBar.css'

export interface Tab {
  to: string
  label: string
  icon: ReactElement
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const TABS: Tab[] = [
  {
    to: '/chat',
    label: 'Chat',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-3.6-.7L3 21l1.9-4.9A8.3 8.3 0 0 1 4 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8 8.4Z" />
      </svg>
    ),
  },
  {
    to: '/notes',
    label: 'Notes',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H15l4 4v12.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5Z" />
        <path d="M14.5 3v4.5H19M8.5 12h7M8.5 16h4.5" />
      </svg>
    ),
  },
  {
    to: '/gallery',
    label: 'Gallery',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="8.5" cy="9.5" r="1.6" />
        <path d="m3.5 16.5 4.2-4.2a2 2 0 0 1 2.7-.1l3.4 3 1.6-1.4a2 2 0 0 1 2.7.1l2.4 2.3" />
      </svg>
    ),
  },
  {
    to: '/voice',
    label: 'Voice',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
        <path d="M5 11.5a7 7 0 0 0 14 0M12 18.5V21.5" />
      </svg>
    ),
  },
  {
    to: '/you',
    label: 'You',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="12" cy="8.5" r="3.8" />
        <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
      </svg>
    ),
  },
]

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => `tab ${isActive ? 'is-active' : ''}`}
          onClick={() => haptic('select')}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
          <span className="tab-glow" aria-hidden="true" />
        </NavLink>
      ))}
    </nav>
  )
}
