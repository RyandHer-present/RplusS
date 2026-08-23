import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Message } from '../lib/types'
import type { UserId } from './session'

export interface AuditEntry {
  id: number
  at: string
  actor: string | null
  /**
   * The three row operations come from the audit triggers. The two sign-in
   * kinds are written by the `pin-login` function, which has no table of its
   * own to be audited.
   */
  action: 'insert' | 'update' | 'delete' | 'login' | 'login_failed'
  entity: string
  entity_id: string | null
  detail: Record<string, unknown> | null
}

export interface PresenceEntry {
  id: number
  user_id: UserId
  event: 'online' | 'offline'
  at: string
}

export interface Stats {
  totals: Record<UserId, number>
  words: Record<UserId, number>
  busiestHour: { hour: number; count: number } | null
  perDay: number
  activeDays: number
  topWords: [string, number][]
  topEmoji: [string, number][]
  edited: number
  unsent: number
  medianReplyMs: number | null
  sessionsByUser: Record<UserId, { count: number; totalMs: number }>
  content: Record<string, number>
}

interface LogsState {
  audit: AuditEntry[]
  presence: PresenceEntry[]
  stats: Stats | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  load: () => Promise<void>
}

const STOP_WORDS = new Set([
  'the', 'and', 'you', 'that', 'was', 'for', 'are', 'but', 'not', 'with', 'have', 'this',
  'just', 'like', 'its', 'it', 'to', 'a', 'i', 'is', 'of', 'in', 'on', 'so', 'im', 'my',
  'me', 'do', 'be', 'at', 'if', 'or', 'we', 'he', 'she', 'they', 'u', 'ok', 'lol',
])

// Covers the emoji blocks people actually type, without pulling in a library.
const EMOJI_RE = /\p{Extended_Pictographic}/gu

function computeStats(messages: Message[], presence: PresenceEntry[], audit: AuditEntry[]): Stats {
  const totals = { ry: 0, sarah: 0 }
  const words = { ry: 0, sarah: 0 }
  const hours = new Array(24).fill(0)
  const days = new Set<string>()
  const wordCounts = new Map<string, number>()
  const emojiCounts = new Map<string, number>()

  for (const message of messages) {
    totals[message.sender_id]++
    const at = new Date(message.created_at)
    hours[at.getHours()]++
    days.add(at.toDateString())

    const body = message.body ?? ''
    for (const match of body.match(EMOJI_RE) ?? []) {
      emojiCounts.set(match, (emojiCounts.get(match) ?? 0) + 1)
    }

    const tokens = body.toLowerCase().replace(EMOJI_RE, ' ').match(/[a-z']{2,}/g) ?? []
    words[message.sender_id] += tokens.length
    for (const token of tokens) {
      if (STOP_WORDS.has(token)) continue
      wordCounts.set(token, (wordCounts.get(token) ?? 0) + 1)
    }
  }

  const busiest = hours.reduce(
    (best, count, hour) => (count > best.count ? { hour, count } : best),
    { hour: 0, count: 0 },
  )

  // How long the other person typically takes to answer, measured only where
  // the sender actually changes. The median ignores the odd overnight gap that
  // would wreck an average.
  const gaps: number[] = []
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].sender_id === messages[i - 1].sender_id) continue
    const gap = new Date(messages[i].created_at).getTime() - new Date(messages[i - 1].created_at).getTime()
    if (gap > 0 && gap < 6 * 60 * 60 * 1000) gaps.push(gap)
  }
  gaps.sort((a, b) => a - b)

  // Presence rows are newest first; walking backwards pairs each arrival with
  // the departure that follows it.
  const sessions = { ry: { count: 0, totalMs: 0 }, sarah: { count: 0, totalMs: 0 } }
  const openedAt: Partial<Record<UserId, number>> = {}
  for (const entry of [...presence].reverse()) {
    const time = new Date(entry.at).getTime()
    if (entry.event === 'online') {
      openedAt[entry.user_id] = time
    } else if (openedAt[entry.user_id] !== undefined) {
      sessions[entry.user_id].count++
      sessions[entry.user_id].totalMs += time - openedAt[entry.user_id]!
      delete openedAt[entry.user_id]
    }
  }

  const content: Record<string, number> = {}
  for (const entry of audit) {
    if (entry.action !== 'insert') continue
    content[entry.entity] = (content[entry.entity] ?? 0) + 1
  }

  const top = (map: Map<string, number>, n: number) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)

  return {
    totals,
    words,
    busiestHour: busiest.count ? busiest : null,
    activeDays: days.size,
    perDay: days.size ? Math.round((messages.length / days.size) * 10) / 10 : 0,
    topWords: top(wordCounts, 12),
    topEmoji: top(emojiCounts, 8),
    edited: audit.filter((e) => e.entity === 'messages' && e.action === 'update' && e.detail && 'body' in e.detail).length,
    unsent: audit.filter((e) => e.entity === 'messages' && e.action === 'delete').length,
    medianReplyMs: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
    sessionsByUser: sessions,
    content,
  }
}

export const useLogs = create<LogsState>()((set) => ({
  audit: [],
  presence: [],
  stats: null,
  status: 'idle',
  error: null,

  load: async () => {
    if (!supabase) return
    set({ status: 'loading', error: null })

    const [auditResult, presenceResult, messagesResult] = await Promise.all([
      supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(1000),
      supabase.from('presence_log').select('*').order('at', { ascending: false }).limit(1000),
      supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(5000),
    ])

    if (auditResult.error) {
      set({ status: 'error', error: auditResult.error.message })
      return
    }

    const audit = (auditResult.data ?? []) as AuditEntry[]
    const presence = (presenceResult.data ?? []) as PresenceEntry[]
    const messages = (messagesResult.data ?? []) as Message[]

    set({ audit, presence, stats: computeStats(messages, presence, audit), status: 'ready' })
  },
}))
