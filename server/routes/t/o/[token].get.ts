import { supabaseAdmin } from '~~/server/utils/supabaseAdmin'

/**
 * GET /t/o/:token — email open pixel (public, no auth).
 *
 * Resolves the token to a send, records an `opened` event (deduplicated to once
 * per 24h per send), and always returns a 1×1 transparent GIF. Tracking is
 * best-effort — any failure still returns the pixel so the email renders.
 */

// 43-byte fully-transparent 1×1 GIF.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (token) {
    try {
      const db = supabaseAdmin()
      const { data: tok } = await db
        .from('tracking_tokens')
        .select('send_id')
        .eq('token', token)
        .eq('type', 'open')
        .maybeSingle()

      if (tok) {
        const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
        const { count } = await db
          .from('email_events')
          .select('*', { count: 'exact', head: true })
          .eq('send_id', tok.send_id)
          .eq('type', 'opened')
          .gte('occurred_at', since)

        if ((count ?? 0) === 0) {
          await db
            .from('email_events')
            .insert({ send_id: tok.send_id, type: 'opened' })
        }
      }
    } catch (err) {
      console.error('[t/o] open-tracking error', err)
    }
  }

  setResponseHeaders(event, {
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    Expires: '0',
  })
  return PIXEL
})
