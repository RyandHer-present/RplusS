import { supabase } from './supabase'

const ONCE_KEY = 'rpluss.visit'

/**
 * Tells the `visit-alert` function the site was opened. The function reads the
 * caller's address itself and decides whether it is worth a Discord message —
 * none of that logic lives here, because anything in this file is readable by
 * whoever the alert is about.
 *
 * Fire and forget: a failure here must never be visible on the page.
 */
export function reportVisit() {
  if (!supabase) return

  // One report per browser session. The function throttles per address anyway,
  // but there is no reason to make the request on every tab and refresh.
  try {
    if (sessionStorage.getItem(ONCE_KEY)) return
    sessionStorage.setItem(ONCE_KEY, '1')
  } catch {
    // Private mode with storage disabled. Report anyway; the server dedupes.
  }

  void supabase.functions
    .invoke('visit-alert', {
      body: {
        ua: navigator.userAgent.slice(0, 300),
        ref: document.referrer.slice(0, 300),
      },
    })
    .then(
      () => {},
      () => {},
    )
}
