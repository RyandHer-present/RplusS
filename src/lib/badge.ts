/**
 * The number on the home screen icon.
 *
 * Supported in installed web apps on iOS 16.4+, and on desktop Chrome and Edge
 * for installed apps. Everywhere else these calls simply do not exist, which is
 * why every one of them is guarded rather than assumed.
 *
 * Two limits worth stating plainly, because they decide what this is good for:
 *
 * iOS only shows the badge once notification permission has been granted, even
 * though the badge itself is not a notification.
 *
 * A page can only set the badge while it is running. For the count to change
 * while the app is closed — which is the case that actually matters — the push
 * handler in the service worker has to set it. That is why this is exported for
 * both sides.
 */

type BadgeWindow = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

export const badgeSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'setAppBadge' in (navigator as BadgeWindow)

export async function setBadge(count: number): Promise<void> {
  const nav = navigator as BadgeWindow
  try {
    if (count > 0) await nav.setAppBadge?.(count)
    else await nav.clearAppBadge?.()
  } catch {
    // Permission not granted, or not installed. Nothing to do and nothing worth
    // telling the user — the in-app dots still work.
  }
}
