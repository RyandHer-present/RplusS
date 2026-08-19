interface Props {
  title: string
  sub?: string
  heading: string
  body: string
  phase: string
}

/** Placeholder for a section that has its shell but not its features yet. */
export function Stub({ title, sub, heading, body, phase }: Props) {
  return (
    <div className="screen-scroll">
      <header className="screen-head">
        <h1 className="screen-title">{title}</h1>
        {sub && <p className="screen-sub">{sub}</p>}
      </header>
      <section className="stub">
        <h2>{heading}</h2>
        <p>{body}</p>
        <span className="stub-phase">{phase}</span>
      </section>
    </div>
  )
}
