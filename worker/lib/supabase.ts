import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types.ts'

/**
 * Service-role Supabase client for the worker. Bypasses RLS (the worker is a
 * trusted backend process), so it can read campaigns/contacts and write sends.
 */
const url = process.env.NUXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const key =
  process.env.NUXT_SUPABASE_SECRET_KEY ??
  process.env.NUXT_SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_KEY

if (!url || !key) {
  throw new Error(
    'Supabase URL or service key missing — set NUXT_PUBLIC_SUPABASE_URL and NUXT_SUPABASE_SECRET_KEY.',
  )
}

export const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
