import { USERS, type UserId } from '../store/session'
import { haptic } from '../lib/haptics'
import './OwnerTabs.css'

interface Props {
  value: UserId
  onChange: (owner: UserId) => void
  counts?: Partial<Record<UserId, number>>
  /** Admin belongs to neither side, so it gets plain names instead of "Yours". */
  me: UserId | null
}

const ORDER: UserId[] = ['ry', 'sarah']

/** Switches a section between the two people's own posts. */
export function OwnerTabs({ value, onChange, counts, me }: Props) {
  return (
    <div className="owner-tabs" role="tablist">
      {ORDER.map((owner) => (
        <button
          key={owner}
          type="button"
          role="tab"
          aria-selected={value === owner}
          className={`owner-tab ${value === owner ? 'is-active' : ''}`}
          onClick={() => {
            haptic('select')
            onChange(owner)
          }}
        >
          <span>{me && owner === me ? 'Yours' : `${USERS[owner].name}’s`}</span>
          {counts?.[owner] !== undefined && <span className="owner-count">{counts[owner]}</span>}
        </button>
      ))}
    </div>
  )
}
