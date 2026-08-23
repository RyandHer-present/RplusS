import { supabase } from '../lib/supabase'
import type { UserId } from '../store/session'

/**
 * Turning on notifications.
 *
 * The iOS rules are strict enough to be worth stating, because every one of
 * them is a way this silently does nothing:
 *
 *   - only works in an app added to the home screen, never in Safari
 *   - iOS 16.4 or later
 *   - the permission prompt must come from a real tap, not from page load
 *
 * A subscription belongs to a browser on a device, not to a person, so the same
 * person on a phone and a laptop is two rows. The endpoint is the identity.
 */

export const VAPID_PUBLIC_KEY = 'BPTkhgXN-LvSte8iGov7acBNeNQGlTEApAuHI9bAbMSdx5c0BE_HOSFIOUlPDhSBH6uWCj2mdI5oLrauVLr484k'

export type PushState =
  | 'unsupported'
  | 'needs-install'
  | 'denied'
  | 'off'
  | 'on'

const b64ToBytes = (base64: string): Uint8Array => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

const bytesToB64 = (buffer: ArrayBuffer | null): string => {
  if (!buffer) return ''
  let s = ''
  for (const b of new Uint8Array(buffer)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as unknown as { standalone?: boolean }).standalone === true

const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // On iOS the APIs are genuinely absent until the app is installed, so this
    // is the case that needs the friendlier explanation rather than "no".
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  }
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (Notification.permission === 'denied') return 'denied'

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  return existing ? 'on' : 'off'
}

/** Must be called directly from a tap; iOS ignores a prompt that is not. */
export async function enablePush(me: UserId): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return { ok: false, reason: 'Not connected.' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return {
      ok: false,
      reason:
        permission === 'denied'
          ? 'Notifications are blocked for this app. iOS only asks once — turn them back on in Settings, Notifications, R+S.'
          : 'Not granted.',
    }
  }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      // Required by every browser, and the reason a push cannot be silent.
      userVisibleOnly: true,
      applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) as BufferSource,
    })
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: me,
      endpoint: subscription.endpoint,
      p256dh: bytesToB64(subscription.getKey('p256dh')),
      auth: bytesToB64(subscription.getKey('auth')),
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: 'endpoint' },
  )

  if (error) return { ok: false, reason: error.message }
  return { ok: true }
}

export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  // Remove the row first: a device that unsubscribed but stayed in the table
  // would be pushed to forever and always fail.
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
}

/** Re-registers after the browser rotates a subscription behind our back. */
export async function resubscribe(me: UserId): Promise<void> {
  const state = await pushState()
  if (state === 'off' && Notification.permission === 'granted') await enablePush(me)
}
