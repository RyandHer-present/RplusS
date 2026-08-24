import { Component, type ErrorInfo, type ReactNode } from 'react'
import './ErrorBoundary.css'

/**
 * The last thing between a crash and a black screen.
 *
 * React unmounts the entire tree when a render throws and nothing catches it,
 * which is why a single bad component used to take the whole app down to
 * nothing — no message, no way back, nothing to report. Anything is better
 * than that, so this shows what happened and offers the two things that
 * actually help: reload, or go back to the chat.
 */

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  detail: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, detail: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept for the person looking at it, since there is no error reporting yet.
    this.setState({ detail: info.componentStack?.slice(0, 600) ?? null })
    console.error('[RplusS] render failed', error, info)
  }

  render() {
    const { error, detail } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash">
        <div className="crash-card">
          <h1 className="crash-title">That broke</h1>
          <p className="crash-body">
            Something went wrong drawing this screen. Nothing has been lost —
            everything lives on the server, not in here.
          </p>

          <div className="crash-actions">
            <button type="button" className="crash-btn is-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              type="button"
              className="crash-btn"
              onClick={() => {
                window.location.hash = '/chat'
                window.location.reload()
              }}
            >
              Back to the chat
            </button>
          </div>

          <details className="crash-detail">
            <summary>What happened</summary>
            <pre>{error.message}{detail ? `\n${detail}` : ''}</pre>
          </details>
        </div>
      </div>
    )
  }
}
