import './InstallHint.css'

/**
 * Safari on iOS never offers to install anything — there is no prompt to hook
 * into and no way to trigger one, so the only option is to say where the button
 * is. Shown solely on an iPhone that has not already installed it; anywhere
 * else the browser handles this itself and a panel would just be noise.
 */

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

const installed =
  window.matchMedia('(display-mode: standalone)').matches ||
  // Safari's own flag, which predates the standard one and is still the only
  // thing that reports true on iOS.
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export function InstallHint() {
  if (installed || !isIOS) return null

  return (
    <section className="panel install-hint">
      <h2 className="panel-title">Add to your home screen</h2>
      <p className="install-blurb">
        Put R+S on your home screen and it opens like an app — its own icon, no
        Safari bars, and it still opens with no signal.
      </p>
      <ol className="install-steps">
        <li>
          Tap the <strong>Share</strong> button at the bottom of Safari — the
          square with an arrow coming out of it.
        </li>
        <li>
          Scroll down and tap <strong>Add to Home Screen</strong>.
        </li>
        <li>
          Tap <strong>Add</strong>.
        </li>
      </ol>
      <p className="install-note">
        It has to be Safari — Chrome on iPhone cannot do this.
      </p>
    </section>
  )
}
