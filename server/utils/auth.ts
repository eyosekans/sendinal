import type { H3Event } from 'h3'
import { serverSupabaseUser } from '#supabase/server'

/**
 * Guard for authenticated API routes. Returns the Supabase user or throws a
 * 401. Use at the top of every protected handler:
 *
 *   export default defineEventHandler(async (event) => {
 *     await requireUser(event)
 *     // ...
 *   })
 *
 * Public routes (tracking pixels/redirects, the SES webhook, /api/health) must
 * NOT call this. Page-level access is handled separately by @nuxtjs/supabase's
 * redirect middleware; this covers the server/API side.
 */
export async function requireUser(event: H3Event) {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return user
}
