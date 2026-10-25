/**
 * BAAKI Supabase Auth Client
 *
 * Uses env vars injected by Vite (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
 * If these are missing the client cannot be initialised and auth calls will fail.
 * No service-role key is ever used here.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let supabase: SupabaseClient | null = null

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
} else if (import.meta.env.DEV) {
  console.warn(
    'Supabase auth is disabled. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Frontend/.env.'
  )
}

export { supabase }
export const isSupabaseConfigured = Boolean(supabase)
