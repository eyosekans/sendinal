/**
 * POST /t/u/:token — performs the unsubscribe (public, no auth).
 *
 * Reached two ways, both on the recipient's own action:
 *   - the Unsubscribe button on the GET confirmation page (form post), and
 *   - a mailbox provider's one-click unsubscribe (RFC 8058): the send carries
 *     `List-Unsubscribe: <…/t/u/:token>` + `List-Unsubscribe-Post:
 *     List-Unsubscribe=One-Click`, and the provider POSTs that body here.
 *
 * Idempotent; the event is recorded only on the first unsubscribe. Any body is
 * accepted — the form sends none, RFC 8058 sends `List-Unsubscribe=One-Click` —
 * because the token alone authorises the request. Future
 * dispatches skip non-`active` contacts, so this stops further sends.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')

  try {
    const target = await resolveUnsubscribeToken(token)
    if (!target) {
      setResponseStatus(event, 404)
      return invalidPage()
    }
    await performUnsubscribe(target)
    return successPage()
  } catch (err) {
    // A 5xx (not the "invalid link" page) so the recipient — or the provider's
    // one-click request — knows to retry rather than assume it worked.
    console.error('[t/u] unsubscribe error', err)
    setResponseStatus(event, 500)
    return errorPage()
  }
})
