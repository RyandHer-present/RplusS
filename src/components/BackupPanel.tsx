import { useRef, useState } from 'react'
import { downloadBackup, type Progress } from '../lib/backup'
import { haptic } from '../lib/haptics'
import './BackupPanel.css'

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function BackupPanel() {
  const [running, setRunning] = useState<null | 'data' | 'all'>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const run = async (includeMedia: boolean) => {
    haptic('select')
    setRunning(includeMedia ? 'all' : 'data')
    setResult(null)
    setError(null)

    const controller = new AbortController()
    abort.current = controller

    try {
      const bytes = await downloadBackup({
        includeMedia,
        signal: controller.signal,
        onProgress: setProgress,
      })
      haptic('success')
      setResult(`Saved — ${size(bytes)}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Cancelling is a choice, not a failure.
      if (message !== 'Cancelled' && !message.includes('abort')) setError(message)
    } finally {
      setRunning(null)
      setProgress(null)
      abort.current = null
    }
  }

  const percent =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <section className="panel">
      <h2 className="panel-title">Backup</h2>

      <p className="backup-blurb">
        Everything we've put here lives in one place. This makes a second copy
        to keep — readable without this site, or any internet.
      </p>

      {running ? (
        <div className="backup-running">
          <div className="backup-bar" role="progressbar" aria-valuenow={percent}>
            <span className="backup-bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="backup-status">
            {progress?.label ?? 'Working'}
            {progress?.bytes ? ` · ${size(progress.bytes)}` : ''}
          </p>
          <button
            type="button"
            className="backup-btn"
            onClick={() => {
              haptic('tap')
              abort.current?.abort()
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="backup-actions">
          <button type="button" className="backup-btn is-primary" onClick={() => void run(true)}>
            Everything
            <span>messages and the photos, video and audio</span>
          </button>
          <button type="button" className="backup-btn" onClick={() => void run(false)}>
            Words only
            <span>small and quick — no files</span>
          </button>
        </div>
      )}

      {result && <p className="backup-ok">{result}</p>}
      {error && <p className="backup-error">{error}</p>}

      <p className="backup-note">
        A full backup downloads every file, so do it on wi-fi and leave the
        screen on until it finishes.
      </p>
    </section>
  )
}
