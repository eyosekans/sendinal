import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/app/types/database.types'

/**
 * Service-role Supabase client for trusted server-side flows that run without a
 * user session — the SES webhook (`/api/webhooks/ses`) and the SQS poller
 * plugin. Bypasses RLS, so it must never be reached from an unauthenticated,
 * user-facing route. Reads the same env chain as the worker's client
 * (`worker/lib/supabase.ts`) to stay consistent. Created lazily and reused.
 */
let client: SupabaseClient<Database> | null = null

export function supabaseAdmin(): SupabaseClient<Database> {
  if (!client) {
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

    client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}
