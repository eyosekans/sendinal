/**
 * Unsubscribe flow shared by `GET` and `POST /t/u/:token`.
 *
 * Why two verbs: the link sits in every campaign email, and corporate mail
 * security scanners (Safe Links and friends) fetch every URL in a message
 * within seconds of delivery. When a GET unsubscribed on the spot, those
 * scanners unsubscribed real people — one campaign lost ~19% of its recipients
 * that way, each with every link "clicked" ~30s after the send. So:
 *
 *   GET  — resolves the token and renders a confirmation page. No side effect.
 *   POST — performs the unsubscribe. Sent by the confirmation page's button, or
 *          directly by a mailbox provider's one-click unsubscribe (RFC 8058,
 *          `List-Unsubscribe-Post: List-Unsubscribe=One-Click`), which only
 *          fires on the recipient's own action.
 */
import { supabaseAdmin } from '~~/server/utils/supabaseAdmin'

export interface UnsubscribeTarget {
  sendId: string
  contactId: string
  contactStatus: string
}

/** Token → send → contact, or null when the token doesn't resolve. */
export async function resolveUnsubscribeToken(
  token: string | undefined,
): Promise<UnsubscribeTarget | null> {
  if (!token) return null
  const db = supabaseAdmin()

  const { data: tok } = await db
    .from('tracking_tokens')
    .select('send_id')
    .eq('token', token)
    .eq('type', 'unsubscribe')
    .maybeSingle()
  if (!tok) return null

  const { data: send } = await db
    .from('sends')
    .select('contact_id, contacts(status)')
    .eq('id', tok.send_id)
    .maybeSingle()
  if (!send?.contacts) return null

  return {
    sendId: tok.send_id,
    contactId: send.contact_id,
    contactStatus: send.contacts.status,
  }
}

/**
 * Unsubscribes the contact behind `target`. Idempotent: a contact that is
 * already unsubscribed is left alone and no second event is recorded.
 *
 * The `unsubscribed` event is tied to the send, which is what attributes the
 * unsubscribe to its campaign. Only an `active` contact is moved to
 * `unsubscribed`; a bounced or complained one is already excluded from every
 * dispatch and keeps the more specific status, but the event is still recorded.
 */
export async function performUnsubscribe(target: UnsubscribeTarget) {
  if (target.contactStatus === 'unsubscribed') return
  const db = supabaseAdmin()

  if (target.contactStatus === 'active') {
    const { data: changed, error } = await db
      .from('contacts')
      .update({ status: 'unsubscribed' })
      .eq('id', target.contactId)
      .eq('status', 'active')
      .select('id')
    if (error) throw error
    // Lost a race with a concurrent unsubscribe — that request records the event.
    if (!changed?.length) return
  }

  const { error: evErr } = await db
    .from('email_events')
    .insert({ send_id: target.sendId, type: 'unsubscribed' })
  if (evErr) throw evErr
}

/* ---------- pages ---------- */

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const SHELL = (
  accent: string,
  icon: string,
  title: string,
  body: string,
  extra = '',
) => `<!doctype html>
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
  form { margin:24px 0 0; }
  button { height:42px; padding:0 22px; border:none; border-radius:8px; background:#1a7a6e; color:#fff;
    font:inherit; font-size:14px; font-weight:600; cursor:pointer; }
  button:hover { background:#135c53; }
</style></head>
<body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${body}</p>${extra}</div></body></html>`

/**
 * GET response. A plain form POST back to the same URL — deliberately no
 * script that submits it, since some scanners execute page JavaScript.
 */
export const confirmPage = (token: string) =>
  SHELL(
    '#1a7a6e',
    '&#9993;',
    'Unsubscribe from our emails?',
    "You'll stop receiving marketing emails from us.",
    `<form method="post" action="/t/u/${escapeHtml(encodeURIComponent(token))}">
  <button type="submit">Unsubscribe</button>
</form>`,
  )

export const successPage = () =>
  SHELL(
    '#1a7a6e',
    '&#10003;',
    "You've been unsubscribed",
    "You won't receive any more marketing emails from us. If this was a mistake, just reach out and we'll add you back.",
  )

export const errorPage = () =>
  SHELL(
    '#b54708',
    '&#33;',
    'Something went wrong',
    "We couldn't process your unsubscribe just now. Please try the link again in a few minutes.",
  )

export const invalidPage = () =>
  SHELL(
    '#787068',
    '&#33;',
    'Link not valid',
    'This unsubscribe link is invalid or has expired. If you keep receiving unwanted emails, please contact us.',
  )
