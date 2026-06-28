import { supabaseAdmin } from '~~/server/utils/supabaseAdmin'

/**
 * GET /t/u/:token — one-click unsubscribe (public, no auth).
 *
 * Resolves the token → send → contact, sets the contact to `unsubscribed`
 * (idempotent; the event is recorded only on the first unsubscribe), and renders
 * a standalone confirmation page. Future dispatches already skip non-`active`
 * contacts, so this immediately stops further sends.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  let ok = false

  if (token) {
    try {
      const db = supabaseAdmin()
      const { data: tok } = await db
        .from('tracking_tokens')
        .select('send_id')
        .eq('token', token)
        .eq('type', 'unsubscribe')
        .maybeSingle()

      if (tok) {
        const { data: send } = await db
          .from('sends')
          .select('contact_id')
          .eq('id', tok.send_id)
          .maybeSingle()

        if (send) {
          const { data: contact } = await db
            .from('contacts')
            .select('status')
            .eq('id', send.contact_id)
            .maybeSingle()

          ok = true
          if (contact && contact.status !== 'unsubscribed') {
            await db
              .from('contacts')
              .update({ status: 'unsubscribed' })
              .eq('id', send.contact_id)
            await db
              .from('email_events')
              .insert({ send_id: tok.send_id, type: 'unsubscribed' })
          }
        }
      }
    } catch (err) {
      console.error('[t/u] unsubscribe error', err)
    }
  }

  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')
  return ok ? successPage() : invalidPage()
})

const SHELL = (accent: string, icon: string, title: string, body: string) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:#f8f7f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif;
    color:#3d3830; padding:24px; }
  .card { width:100%; max-width:440px; background:#fff; border:1px solid #e2ded9; border-radius:16px;
    padding:40px 32px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.07); }
  .icon { width:56px; height:56px; border-radius:9999px; display:flex; align-items:center; justify-content:center;
    margin:0 auto 20px; font-size:28px; background:${accent}1a; color:${accent}; }
  h1 { margin:0 0 10px; font-size:22px; font-weight:600; color:#28241e; }
  p { margin:0; font-size:14px; line-height:1.6; color:#787068; }
</style></head>
<body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${body}</p></div></body></html>`

const successPage = () =>
  SHELL(
    '#1a7a6e',
    '&#10003;',
    "You've been unsubscribed",
    "You won't receive any more marketing emails from us. If this was a mistake, just reach out and we'll add you back.",
  )

const invalidPage = () =>
  SHELL(
    '#787068',
    '&#33;',
    'Link not valid',
    'This unsubscribe link is invalid or has expired. If you keep receiving unwanted emails, please contact us.',
  )
