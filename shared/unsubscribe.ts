/**
 * The mandatory unsubscribe block every email design must carry (compliance:
 * CAN-SPAM / KVKK). Dependency-free (like `shared/segments.ts`) so it can be
 * imported by the Nuxt app (`#shared/unsubscribe`), the worker, and scripts.
 *
 * The block is an Unlayer row marked non-deletable/non-duplicatable; its text —
 * including the `{{unsubscribe_url}}` link the worker resolves per recipient at
 * dispatch — stays fully editable. If a user still manages to strip the link,
 * the worker's `injectUnsubscribe` fallback keeps the sent email compliant.
 */

export const UNSUBSCRIBE_PLACEHOLDER = '{{unsubscribe_url}}'

/** Stable marker used in the row/content ids so the block is recognisable even
 *  after the user edits the text (prevents duplicate re-insertion). */
export const UNSUBSCRIBE_MARKER = 'sendinal_unsubscribe'

/** Default, user-editable footer copy. */
export const UNSUBSCRIBE_TEXT_HTML =
  `<p style="line-height: 140%;">You're receiving this email because you subscribed to our list. ` +
  `<a rel="noopener" href="${UNSUBSCRIBE_PLACEHOLDER}" target="_self">Unsubscribe</a></p>`

/** Loose shape of an Unlayer design document — only what we touch. */
export interface UnlayerDesign {
  body?: { rows?: unknown[]; [k: string]: unknown }
  [k: string]: unknown
}

/** Build a fresh locked-footer row (Unlayer design JSON fragment). */
export function buildUnsubscribeRow(): Record<string, unknown> {
  return {
    id: UNSUBSCRIBE_MARKER,
    cells: [1],
    values: {
      _meta: {
        htmlID: `u_row_${UNSUBSCRIBE_MARKER}`,
        htmlClassNames: 'u_row',
      },
      anchor: '',
      locked: false,
      columns: false,
      padding: '0px',
      // The compliance guarantees: the row cannot be removed, duplicated,
      // hidden, or dragged away — but it stays selectable/editable.
      hideable: false,
      deletable: false,
      draggable: false,
      selectable: true,
      duplicatable: false,
      hideDesktop: false,
      backgroundColor: '',
      backgroundImage: {
        url: '',
        size: 'custom',
        repeat: 'no-repeat',
        position: 'center',
        fullWidth: true,
      },
      displayCondition: null,
      columnsBackgroundColor: '',
    },
    columns: [
      {
        id: `${UNSUBSCRIBE_MARKER}_col`,
        values: {
          _meta: {
            htmlID: `u_column_${UNSUBSCRIBE_MARKER}`,
            htmlClassNames: 'u_column',
          },
          border: {},
          locked: false,
          padding: '0px',
          deletable: false,
          borderRadius: '0px',
          backgroundColor: '',
        },
        contents: [
          {
            id: `${UNSUBSCRIBE_MARKER}_text`,
            type: 'text',
            values: {
              _meta: {
                htmlID: `u_content_${UNSUBSCRIBE_MARKER}`,
                htmlClassNames: 'u_content_text',
              },
              text: UNSUBSCRIBE_TEXT_HTML,
              anchor: '',
              locked: false,
              color: '#888888',
              fontSize: '12px',
              textAlign: 'center',
              lineHeight: '140%',
              linkStyle: {
                inherit: false,
                linkColor: '#888888',
                linkUnderline: true,
                linkHoverColor: '#888888',
                linkHoverUnderline: true,
              },
              hideable: false,
              deletable: false,
              draggable: false,
              selectable: true,
              duplicatable: false,
              hideDesktop: false,
              containerPadding: '16px 10px',
              displayCondition: null,
            },
          },
        ],
      },
    ],
  }
}

/** True when the design already carries the unsubscribe block (our marker) or
 *  an unsubscribe link of its own (the `{{unsubscribe_url}}` placeholder). */
export function designHasUnsubscribe(design: unknown): boolean {
  if (!design || typeof design !== 'object') return false
  const json = JSON.stringify(design)
  return json.includes(UNSUBSCRIBE_PLACEHOLDER) || json.includes(UNSUBSCRIBE_MARKER)
}

/**
 * Return a design that is guaranteed to contain the unsubscribe block,
 * appending the locked footer row when missing. Never mutates the input.
 */
export function ensureUnsubscribeRow(design: unknown): {
  design: UnlayerDesign
  added: boolean
} {
  const base: UnlayerDesign =
    design && typeof design === 'object' ? (design as UnlayerDesign) : {}
  if (designHasUnsubscribe(base)) return { design: base, added: false }

  const clone: UnlayerDesign = JSON.parse(JSON.stringify(base))
  if (!clone.body || typeof clone.body !== 'object') clone.body = {}
  if (!Array.isArray(clone.body.rows)) clone.body.rows = []
  clone.body.rows.push(buildUnsubscribeRow())
  return { design: clone, added: true }
}

/** True when exported/stored HTML already links the unsubscribe placeholder. */
export function htmlHasUnsubscribe(html: string): boolean {
  return html.includes(UNSUBSCRIBE_PLACEHOLDER)
}

/**
 * Append a static unsubscribe footer (placeholder link) to stored HTML — used
 * to retrofit templates saved before the block existed. Mirrors the worker's
 * `injectUnsubscribe` fallback markup, but keeps the placeholder so dispatch
 * resolves it per recipient.
 */
export function appendUnsubscribeFooter(html: string): string {
  if (htmlHasUnsubscribe(html)) return html
  const footer =
    `<div style="padding:16px 10px;text-align:center;font-family:Arial,Helvetica,sans-serif;` +
    `font-size:12px;line-height:1.4;color:#888888;">` +
    `You're receiving this email because you subscribed to our list. ` +
    `<a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:#888888;text-decoration:underline;">Unsubscribe</a>` +
    `</div>`
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`)
  }
  return html + footer
}
