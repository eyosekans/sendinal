import { supabaseAdmin } from '~~/server/utils/supabaseAdmin'

/**
 * GET /t/c/:token — click redirect (public, no auth).
 *
 * Resolves the token to a send + destination URL, records a `clicked` event
 * (every click, no dedup), and 302-redirects to the destination. Recording is
 * best-effort — the redirect happens even if the insert fails.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) {
    throw createError({ statusCode: 404, statusMessage: 'Link not found' })
  }

  const db = supabaseAdmin()
  const { data: tok } = await db
    .from('tracking_tokens')
    .select('send_id, url')
    .eq('token', token)
    .eq('type', 'click')
    .maybeSingle()

  // Only ever redirect to an http(s) destination we stored ourselves.
  if (!tok?.url || !/^https?:\/\//i.test(tok.url)) {
    throw createError({ statusCode: 404, statusMessage: 'Link not found' })
  }

  try {
    await db.from('email_events').insert({
      send_id: tok.send_id,
      type: 'clicked',
      url: tok.url,
    })
  } catch (err) {
    console.error('[t/c] click-tracking error', err)
  }

  return sendRedirect(event, tok.url, 302)
})
