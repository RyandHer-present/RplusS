/*
 * Export everything.
 *
 * All of this lives in one free Supabase project and one Backblaze bucket. If
 * either goes — paused, deleted, locked out — there is no second copy. This
 * writes one instead: a zip you can put on a drive and still read in ten years
 * without this app, or Supabase, or an internet connection.
 *
 * That last part is why the archive holds plain text and JSON alongside the
 * media. JSON keeps every field for a future import; the text transcripts are
 * for a human with nothing but a text editor.
 */

import { supabase } from './supabase'
import { resolveMediaUrls } from './media'
import { ZipWriter } from './zip'
import type { Media } from './types'
import { USERS } from '../store/session'

export interface Progress {
  /** What is happening right now, in words meant for the person waiting. */
  label: string
  done: number
  total: number
  bytes: number
}

export interface BackupOptions {
  includeMedia: boolean
  onProgress?: (progress: Progress) => void
  /** Checked between files, so a long media download can be called off. */
  signal?: AbortSignal
}

/** Tables worth keeping, with the ordering that makes each readable. */
const TABLES: { name: string; select: string; order: string }[] = [
  { name: 'messages', select: '*', order: 'created_at' },
  { name: 'notes', select: '*', order: 'created_at' },
  { name: 'fits', select: '*', order: 'created_at' },
  { name: 'gallery', select: '*', order: 'created_at' },
  { name: 'voice_notes', select: '*', order: 'created_at' },
  { name: 'jams', select: '*', order: 'created_at' },
  { name: 'reactions', select: '*', order: 'created_at' },
  { name: 'media', select: '*', order: 'created_at' },
  // `body` is not granted to anyone before its unlock time, so asking for it
  // would fail the whole request.
  { name: 'capsules', select: 'id, author_id, media_id, unlock_at, opened_at, created_at', order: 'created_at' },
]

function who(id: string | null | undefined): string {
  if (!id) return 'Unknown'
  return USERS[id as keyof typeof USERS]?.name ?? id
}

function stamp(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

/** Rows in, readable transcript out. */
function transcript(rows: Record<string, unknown>[]): string {
  const lines: string[] = []
  let day = ''

  for (const row of rows) {
    const at = String(row.created_at ?? '')
    const thisDay = new Date(at).toDateString()
    if (thisDay !== day) {
      day = thisDay
      lines.push('', `---- ${day} ----`, '')
    }

    const author = who((row.sender_id ?? row.author_id ?? row.owner_id) as string)
    const body = (row.body ?? row.caption ?? row.note ?? row.title ?? '') as string
    const attachment = row.media_id ? ' [attachment]' : ''
    const edited = row.edited_at ? ' (edited)' : ''

    lines.push(`${stamp(at)}  ${author}: ${body}${attachment}${edited}`)
  }

  return lines.join('\n')
}

export async function buildBackup(options: BackupOptions): Promise<Blob> {
  if (!supabase) throw new Error('Not connected')
  const { includeMedia, onProgress, signal } = options

  const zip = new ZipWriter()
  const now = new Date()
  const data: Record<string, Record<string, unknown>[]> = {}
  const problems: string[] = []

  // --- the tables --------------------------------------------------------
  let done = 0
  for (const table of TABLES) {
    if (signal?.aborted) throw new Error('Cancelled')
    onProgress?.({ label: `Reading ${table.name}`, done, total: TABLES.length, bytes: zip.bytes })

    const { data: rows, error } = await supabase
      .from(table.name)
      .select(table.select)
      .order(table.order, { ascending: true })

    if (error) {
      problems.push(`${table.name}: ${error.message}`)
      data[table.name] = []
    } else {
      data[table.name] = (rows ?? []) as unknown as Record<string, unknown>[]
    }

    await zip.addFile(
      `data/${table.name}.json`,
      JSON.stringify(data[table.name], null, 2),
      now,
    )
    done++
  }

  // --- readable versions -------------------------------------------------
  for (const name of ['messages', 'notes', 'jams', 'fits', 'gallery'] as const) {
    if (data[name]?.length) {
      await zip.addFile(`readable/${name}.txt`, transcript(data[name]), now)
    }
  }

  // --- the files themselves ----------------------------------------------
  const media = (data.media ?? []) as unknown as Media[]
  let saved = 0

  if (includeMedia && media.length) {
    const keys = media.map((m) => m.b2_key).filter(Boolean)
    const byKey = new Map(media.map((m) => [m.b2_key, m]))

    // Signed URLs come in batches; asking for hundreds at once would time out.
    for (let i = 0; i < keys.length; i += 40) {
      if (signal?.aborted) throw new Error('Cancelled')
      const batch = keys.slice(i, i + 40)

      let urls: Record<string, string> = {}
      try {
        urls = await resolveMediaUrls(batch)
      } catch (err) {
        problems.push(`Could not sign ${batch.length} files: ${String(err)}`)
        continue
      }

      for (const key of batch) {
        if (signal?.aborted) throw new Error('Cancelled')

        const item = byKey.get(key)
        const url = urls[key]
        onProgress?.({
          label: `Downloading files (${saved + 1} of ${keys.length})`,
          done: saved,
          total: keys.length,
          bytes: zip.bytes,
        })

        if (!url || !item) {
          problems.push(`No download link for ${key}`)
          continue
        }

        try {
          const response = await fetch(url, { signal })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const blob = await response.blob()

          // Named by date and owner so the folder is browsable on its own.
          const ext = key.split('.').pop() ?? 'bin'
          const date = item.created_at.slice(0, 10)
          const name = `media/${item.kind}/${date}-${who(item.owner_id).toLowerCase()}-${item.id.slice(0, 8)}.${ext}`
          await zip.addFile(name, blob, new Date(item.created_at))
          saved++
        } catch (err) {
          // One dead file must not cost the whole backup.
          problems.push(`${key}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  }

  // --- what this is ------------------------------------------------------
  const counts = Object.entries(data)
    .map(([name, rows]) => `  ${name}: ${rows.length}`)
    .join('\n')

  const readme = [
    'RplusS backup',
    `Taken ${now.toLocaleString()}`,
    '',
    'What is in here',
    '  data/      every row, as JSON. Complete, and what an import would read.',
    '  readable/  the same thing as plain text, for reading without any software.',
    includeMedia
      ? `  media/     the actual photos, video and audio. ${saved} of ${media.length} files.`
      : '  media/     not included in this backup — data only.',
    '',
    'Rows',
    counts,
    '',
    problems.length
      ? `Problems (${problems.length})\n  ${problems.join('\n  ')}`
      : 'No problems: everything asked for was written.',
    '',
    'The JSON is the authoritative copy. Text files are generated from it and',
    'drop some fields for the sake of being readable.',
  ].join('\n')

  await zip.addFile('README.txt', readme, now)

  onProgress?.({ label: 'Packing', done: 1, total: 1, bytes: zip.bytes })
  return zip.finish()
}

/** Builds a backup and hands it to the browser to save. */
export async function downloadBackup(options: BackupOptions): Promise<number> {
  const blob = await buildBackup(options)
  const name = `rpluss-backup-${new Date().toISOString().slice(0, 10)}.zip`

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoking straight away cancels the save on some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)

  return blob.size
}
