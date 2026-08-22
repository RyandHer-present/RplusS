/**
 * Full-screen decorative layers.
 *
 * Every layer here is a single fixed element that never repaints on its own —
 * it either sits still or animates transform/opacity — so the cost is one
 * composited layer each regardless of what the app is doing underneath.
 *
 * Positions are generated from a fixed seed rather than Math.random so the
 * starfield does not rearrange itself on every render.
 */

/** Deterministic 0..1 sequence. Same layout every mount, no RNG. */
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const STARS = Array.from({ length: 42 }, (_, i) => ({
  x: seeded(i, 1) * 100,
  y: seeded(i, 2) * 100,
  size: 1 + seeded(i, 3) * 1.6,
  delay: seeded(i, 4) * 6,
  dur: 3 + seeded(i, 5) * 5,
}))

export function Atmosphere() {
  return (
    <>
      {/* Painted behind the UI. */}
      <div className="atmo-orbs" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ '--i': i } as React.CSSProperties} />
        ))}
      </div>

      <div className="atmo-ribbons" aria-hidden="true">
        <span /><span /><span />
      </div>

      <div className="atmo-stars" aria-hidden="true">
        {STARS.map((s, i) => (
          <span
            key={i}
            style={{
              '--x': `${s.x}%`,
              '--y': `${s.y}%`,
              '--s': `${s.size}px`,
              '--d': `${s.delay}s`,
              '--t': `${s.dur}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <div className="atmo-horizon" aria-hidden="true" />

      {/* Painted over the UI. */}
      <div className="atmo-edge" aria-hidden="true" />
      <div className="atmo-grain" aria-hidden="true" />
      <div className="atmo-vignette" aria-hidden="true" />
      <div className="atmo-beams" aria-hidden="true" />
      <div className="atmo-particles" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} style={{ '--i': i } as React.CSSProperties} />
        ))}
      </div>
    </>
  )
}
