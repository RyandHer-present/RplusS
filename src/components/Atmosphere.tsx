/**
 * Full-screen decorative layers.
 *
 * All four are single fixed elements that never repaint on their own — they
 * either sit still or animate transform/opacity — so the cost is one composited
 * layer each regardless of what the app is doing underneath.
 */
export function Atmosphere() {
  return (
    <>
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
