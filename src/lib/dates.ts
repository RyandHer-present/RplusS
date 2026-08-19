import { localDay } from './streak'

/** Groups anything with a timestamp into calendar days, newest first. */
export function groupByDate<T>(items: T[], getDate: (item: T) => string): [string, T[]][] {
  const days = new Map<string, T[]>()
  for (const item of items) {
    const day = localDay(new Date(getDate(item)))
    const list = days.get(day)
    if (list) list.push(item)
    else days.set(day, [item])
  }
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

/** "Today", "Yesterday", a weekday for the past week, then a date. */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return date.toLocaleDateString([], { weekday: 'long' })
  if (date.getFullYear() === today.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function fullStamp(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}
