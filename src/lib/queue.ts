import { openDB, type IDBPDatabase } from 'idb'
import type { UserId } from '../store/session'

/**
 * Messages written with no signal.
 *
 * They live in IndexedDB rather than memory, so closing the tab — or the phone
 * killing the page in the background — does not lose what you typed. Anything
 * queued is sent the moment the connection returns.
 */

export interface QueuedMessage {
  id: string
  sender_id: UserId
  body: string
  reply_to_id: string | null
  queued_at: string
}

const DB_NAME = 'rpluss'
const STORE = 'outbox'

let dbPromise: Promise<IDBPDatabase> | null = null

function db() {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'id' })
      }
    },
  })
  return dbPromise
}

export async function enqueue(message: QueuedMessage) {
  await (await db()).put(STORE, message)
}

export async function dequeue(id: string) {
  await (await db()).delete(STORE, id)
}

export async function pending(): Promise<QueuedMessage[]> {
  const all = (await (await db()).getAll(STORE)) as QueuedMessage[]
  return all.sort((a, b) => a.queued_at.localeCompare(b.queued_at))
}

export async function pendingCount(): Promise<number> {
  return (await db()).count(STORE)
}

/**
 * Runs `send` over everything queued, oldest first, stopping at the first
 * failure so ordering is preserved rather than shuffled by partial success.
 */
export async function flush(send: (message: QueuedMessage) => Promise<boolean>) {
  if (!navigator.onLine) return 0

  let sent = 0
  for (const message of await pending()) {
    const ok = await send(message)
    if (!ok) break
    await dequeue(message.id)
    sent++
  }
  return sent
}
