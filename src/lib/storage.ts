/**
 * Media storage.
 *
 * Uploads go straight from the browser to Backblaze B2 using a presigned URL
 * minted by an Edge Function, so the bytes never pass through Supabase and
 * never count against its bandwidth.
 *
 * Until the B2 credentials are loaded server-side, `storageReady` is false and
 * the UI offers to do nothing rather than failing halfway through an upload.
 */
export const storageReady = import.meta.env.VITE_STORAGE_READY === 'true'
