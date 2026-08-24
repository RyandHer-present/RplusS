import { lazy, type ComponentType } from 'react'

/**
 * `lazy`, but survives a deploy.
 *
 * Every screen is a separate chunk fetched the first time you open that tab.
 * Deploying replaces every chunk with a new hashed filename and deletes the
 * old ones, so a page that has been open since before the deploy is holding a
 * list of files that no longer exist. The next tab you touch requests one, gets
 * a 404, and the import rejects — which, with nothing catching it, unmounts the
 * whole app and leaves a black screen.
 *
 * A reload fixes it, because it fetches the new index and its new filenames.
 * So this does exactly that, once, and only for the first failure: if the very
 * next load fails too then the problem is not a stale filename and reloading
 * forever would be worse than showing the error.
 */

const GUARD = 'rpluss.chunk-reload'

export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const loaded = await factory()
      // Got there in the end, so let a future deploy have its one reload too.
      sessionStorage.removeItem(GUARD)
      return loaded
    } catch (error) {
      if (!sessionStorage.getItem(GUARD)) {
        sessionStorage.setItem(GUARD, String(Date.now()))
        window.location.reload()
        // The reload is taking over, so this deliberately never settles —
        // resolving would render a screen that is about to be thrown away.
        return new Promise<never>(() => {})
      }
      throw error
    }
  })
}
