import { useEffect, useState } from 'react'

/**
 * Whether this is a mouse-and-keyboard machine.
 *
 * Used to pick the chat scroller: the virtualised list behaves on touch and
 * misbehaves on desktop, so desktop gets a plain one. Asking about the input
 * device rather than the window width is deliberate — a narrow window on a PC
 * is still a PC, and a tablet in landscape is still touch.
 */
const QUERY = '(hover: hover) and (pointer: fine)'

export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const update = () => setDesktop(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return desktop
}
