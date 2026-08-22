/**
 * Full-screen decorative layers.
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

interface Props {
  /** The shell hangs `--scroll` on this node. See the note in Shell. */
  deepRef?: React.Ref<HTMLDivElement>
}

export function Atmosphere({ deepRef }: Props) {
  return (
    <>
      {/*
        Painted behind the UI, and the only layers that parallax. Grouping them
        under one node is what lets the shell write --scroll here rather than to
        .shell — custom properties inherit, so setting one on .shell invalidates
        the style of every element in the app, once per scroll frame.
      */}
      <div className="atmo-deep" ref={deepRef} aria-hidden="true">
        <div className="atmo-orbs">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>

        <div className="atmo-ribbons">
          <span /><span />
        </div>

        <div className="atmo-stars">
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

        <div className="atmo-horizon" />
      </div>

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
