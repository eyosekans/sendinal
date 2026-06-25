import { randomBytes } from 'node:crypto'

/**
 * Tracking helpers used at dispatch time to personalise each recipient's HTML.
 * Open tracking (2.3) injects a unique 1×1 pixel; click rewrite (2.4) and the
 * unsubscribe link (2.5) extend the same per-send injection step.
 */

/** Random 16-char URL-safe token (PK of `tracking_tokens`). */
export function generateToken(): string {
  // 12 bytes → exactly 16 base64url chars (no padding, no +/ characters).
  return randomBytes(12).toString('base64url')
}

/**
 * Inject a 1×1 open-tracking pixel just before `</body>` (or append it when the
 * HTML has no body tag). Kept as a plain visible-size img (no display:none) so
 * email clients actually request it.
 */
export function injectOpenPixel(html: string, pixelUrl: string): string {
  const pixel = `<img src="${pixelUrl}" alt="" width="1" height="1" style="border:0;width:1px;height:1px;" />`
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`)
  }
  return html + pixel
}

/**
 * Rewrite every `<a href="http(s)://…">` to a tracked `{originUrl}/t/c/{token}`
 * redirect, returning the new HTML and the token→original-URL pairs to store.
 * Only http/https links are rewritten — `mailto:`, `tel:`, `#anchors` and merge
 * tags are left untouched.
 */
export function rewriteClickLinks(
  html: string,
  originUrl: string,
  makeToken: () => string,
): { html: string; links: { token: string; url: string }[] } {
  const links: { token: string; url: string }[] = []
  const out = html.replace(
    /(<a\b[^>]*?\shref=)("|')(.*?)\2/gi,
    (match, prefix: string, quote: string, url: string) => {
      if (!/^https?:\/\//i.test(url)) return match
      const token = makeToken()
      links.push({ token, url })
      return `${prefix}${quote}${originUrl}/t/c/${token}${quote}`
    },
  )
  return { html: out, links }
}

/**
 * Ensure the email has a working unsubscribe link. If the template marks a spot
 * with `{{unsubscribe_url}}`, every occurrence is replaced; otherwise a minimal
 * compliant footer is appended before `</body>`. Must run AFTER click rewriting
 * so the unsubscribe link isn't turned into a /t/c redirect.
 */
export function injectUnsubscribe(html: string, unsubUrl: string): string {
  if (html.includes('{{unsubscribe_url}}')) {
    return html.replaceAll('{{unsubscribe_url}}', unsubUrl)
  }
  const footer = `<div style="margin-top:24px;padding:16px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#888888;">You're receiving this email because you opted in. <a href="${unsubUrl}" style="color:#888888;text-decoration:underline;">Unsubscribe</a>.</div>`
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`)
  }
  return html + footer
}
