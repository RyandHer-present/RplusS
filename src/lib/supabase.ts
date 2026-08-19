import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Both values are public by design — they are compiled into this bundle, which
 * anyone can read. Row Level Security is what actually protects the data, so an
 * anonymous caller holding these can reach nothing.
 */
export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = supabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'rpluss.auth',
      },
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null
