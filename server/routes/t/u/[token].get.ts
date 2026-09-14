/**
 * GET /t/u/:token — unsubscribe link target (public, no auth).
 *
 * Renders a confirmation page and changes nothing: mail security scanners fetch
 * every link in an email, so a GET must never unsubscribe. The page's button
 * POSTs back to this URL (see [token].post.ts and server/utils/unsubscribe.ts).
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  let html = invalidPage()

  try {
    const target = await resolveUnsubscribeToken(token)
    if (target) {
      html =
        target.contactStatus === 'unsubscribed'
          ? successPage()
          : confirmPage(token!)
    }
  } catch (err) {
    console.error('[t/u] resolve error', err)
  }

  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')
  return html
})
