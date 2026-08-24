import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { Message } from '../lib/types'
import './PlainChatScroll.css'

/**
 * The desktop chat scroller.
 *
 * There is no virtualisation here at all, and that is the entire point. The
 * virtualised list kept fighting the browser for control of the scroll
 * position on desktop — the library moves scrollTop, Chrome moves scrollTop,
 * and the reader ends up somewhere neither intended. Two attempts at making
 * the two agree did not fix it.
 *
 * So this renders every loaded message as an ordinary element and lets the
 * browser scroll the way it scrolls everything else. Nothing measures rows,
 * nothing recycles them, nothing corrects your position. The cost is holding
 * a few hundred bubbles in the DOM, which a desktop does without noticing —
 * far cheaper than the bug was.
 *
 * The two places scroll position still has to be managed by hand are marked
 * below: arriving at the bottom on open, and holding your place when older
 * messages are added above you.
 */

const NEAR_BOTTOM_PX = 120

interface Props {
  messages: Message[]
  /** Rendered per message; identical to what the mobile list renders. */
  children: (message: Message, index: number) => React.ReactNode
  onReachTop: () => void
  /** Bumped by the parent to request a scroll to the newest message. */
  scrollToBottomKey?: number
}

export function PlainChatScroll({ messages, children, onReachTop }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)

  // What the list looked like last render, so a change can be classified as
  // "older messages were added above" or "a new message arrived below".
  const previous = useRef({ count: 0, firstId: '', height: 0, top: 0 })
  const loadingOlder = useRef(false)

  const isAtBottom = useCallback(() => {
    const el = ref.current
    if (!el) return true
    return el.scrollHeight - el.clientHeight - el.scrollTop <= NEAR_BOTTOM_PX
  }, [])

  // Record the position *before* the browser paints the new list, which is the
  // only moment the old measurements are still true.
  const before = useRef({ height: 0, top: 0 })
  before.current = {
    height: ref.current?.scrollHeight ?? 0,
    top: ref.current?.scrollTop ?? 0,
  }

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !messages.length) return

    const first = messages[0].id
    const prev = previous.current
    const grewAtTop = prev.count > 0 && prev.firstId !== first

    if (prev.count === 0) {
      // First paint: open at the newest message, with no animation.
      el.scrollTop = el.scrollHeight
    } else if (grewAtTop) {
      // Older messages were inserted above. Everything you were reading just
      // moved down by exactly however much was added, so move with it and the
      // page appears not to have changed at all.
      el.scrollTop = before.current.top + (el.scrollHeight - before.current.height)
      loadingOlder.current = false
    } else if (atBottom.current) {
      // A new message arrived and you were already at the bottom.
      el.scrollTop = el.scrollHeight
    }

    previous.current = {
      count: messages.length,
      firstId: first,
      height: el.scrollHeight,
      top: el.scrollTop,
    }
  }, [messages])

  // Images and voice notes settle after their message is already on screen. If
  // you are at the bottom, stay at the bottom as they do.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight
    })
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [messages.length])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    atBottom.current = isAtBottom()
    if (el.scrollTop < 300 && !loadingOlder.current) {
      loadingOlder.current = true
      onReachTop()
      // Released when older messages actually arrive, or after a moment if
      // none do, so reaching the top of a fully loaded history is not a
      // permanent block on ever asking again.
      window.setTimeout(() => {
        loadingOlder.current = false
      }, 1500)
    }
  }

  return (
    <div ref={ref} className="plain-chat-scroll" onScroll={onScroll}>
      {messages.map((message, index) => (
        <div key={message.id} className="plain-chat-row">
          {children(message, index)}
        </div>
      ))}
    </div>
  )
}
