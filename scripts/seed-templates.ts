/**
 * Seed a few shared starter templates into the `templates` table (task 3.4).
 *
 * Templates are global (the table has no per-user isolation), so these become
 * available to everyone on the team. Run once per environment, AFTER applying
 * the category migration (`20260627000002_templates_add_category.sql`):
 *
 *   node --env-file=.env scripts/seed-templates.ts
 *
 * Idempotent: a template whose exact name already exists is skipped, so re-runs
 * are safe. Each template carries clean responsive HTML (used by the library
 * preview + when sent) and a valid Unlayer `design` (a single HTML content
 * block) so "Use in new campaign" loads + re-exports correctly in the builder.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NUXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.NUXT_SUPABASE_SECRET_KEY
if (!url || !serviceKey) {
  console.error(
    'Missing NUXT_PUBLIC_SUPABASE_URL / NUXT_SUPABASE_SECRET_KEY. Run with: node --env-file=.env scripts/seed-templates.ts',
  )
  process.exit(1)
}
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
})

/** Brand colours, kept in sync with the app's slate-teal palette. */
const PRIMARY = '#1a7a6e'
const INK = '#28241e'
const MUTED = '#787068'
const LINE = '#e2ded9'

/** Wrap a content fragment in a full, email-safe responsive document. */
function emailDoc(inner: string, bg = '#f4f4f5'): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${bg};font-family:Arial,Helvetica,sans-serif;color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid ${LINE};border-radius:10px;overflow:hidden;">
${inner}
</table>
</td></tr></table>
</body></html>`
}

/** The shared footer fragment with the unsubscribe placeholder the worker fills. */
const FOOTER = `<tr><td style="padding:20px 32px;background:#faf9f7;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
You're receiving this because you subscribed.<br>
<a href="{{unsubscribe_url}}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>
</td></tr>`

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:${PRIMARY};color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:13px 26px;border-radius:6px;">${label}</a>`
}

type Category =
  | 'Newsletter'
  | 'Promotion'
  | 'Announcement'
  | 'Transactional'
  | 'Seasonal'

interface SeedTemplate {
  name: string
  subject: string
  category: Category
  inner: string
}

/**
 * File-based templates: pre-built email HTML (e.g. an Unlayer export) dropped
 * in `scripts/templates/`. The full file is the template HTML (preview + send);
 * the design wraps its <style> + <body> content in one Unlayer HTML block so
 * "Use in new campaign" still loads + re-exports it.
 */
interface FileTemplate {
  file: string
  name: string
  subject: string
  category: Category
}
const FILE_TEMPLATES: FileTemplate[] = [
  {
    file: 'springtime-newsletter.html',
    name: 'Springtime Newsletter',
    subject: 'Springtime is here',
    category: 'Seasonal',
  },
]

/** Pull the <style> blocks + <body> inner out of a full HTML document. */
function extractInner(full: string): string {
  const styles = (full.match(/<style[\s\S]*?<\/style>/gi) ?? []).join('\n')
  const body = full.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? full
  return `${styles}\n${body}`
}

const STORAGE_BUCKET = 'template-assets'
const CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

/**
 * Upload a file template's relative `images/...` assets to the public
 * `template-assets` bucket and rewrite the HTML to their CDN URLs. Email clients
 * (and the library preview iframe) can't resolve relative paths, so every image
 * must be an absolute public URL. Uploads use a stable per-template path with
 * `upsert`, so re-running doesn't duplicate objects.
 */
async function hostImages(file: FileTemplate, html: string): Promise<string> {
  const stem = file.file.replace(/\.html?$/i, '')
  const refs = [
    ...new Set(
      [...html.matchAll(/src="(images\/[^"]+)"/gi)].map((m) => m[1]!),
    ),
  ]
  let out = html
  for (const ref of refs) {
    const base = ref.slice('images/'.length)
    const ext = (base.split('.').pop() ?? 'bin').toLowerCase()
    const data = readFileSync(
      new URL(`./templates/images/${base}`, import.meta.url),
    )
    const path = `template-seed/${stem}/${base}`
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, data, {
        contentType: CONTENT_TYPE[ext] ?? 'application/octet-stream',
        upsert: true,
      })
    if (error) throw new Error(`upload ${base}: ${error.message}`)
    const {
      data: { publicUrl },
    } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
    out = out.split(ref).join(publicUrl)
    console.log(`  ↑ ${base}`)
  }
  return out
}

const TEMPLATES: SeedTemplate[] = [
  {
    name: 'Monthly Newsletter',
    subject: 'Your monthly update is here',
    category: 'Newsletter',
    inner: `<tr><td style="padding:32px 32px 8px;">
<div style="font-size:13px;letter-spacing:.5px;text-transform:uppercase;color:${PRIMARY};font-weight:bold;">Monthly Digest</div>
<h1 style="margin:8px 0 0;font-size:26px;line-height:1.25;color:${INK};">What's new this month</h1>
</td></tr>
<tr><td style="padding:16px 32px;font-size:15px;line-height:1.7;color:#3d3830;">
Hi there,<br><br>
Here's a quick roundup of everything that happened this month — new features, helpful tips, and what's coming next.
</td></tr>
<tr><td style="padding:8px 32px 24px;">
<h2 style="margin:0 0 6px;font-size:17px;color:${INK};">Highlight of the month</h2>
<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#3d3830;">A short paragraph describing your most important update. Keep it focused and link out for the details.</p>
${button('Read the full story', 'https://example.com/blog')}
</td></tr>
${FOOTER}`,
  },
  {
    name: 'Product Announcement',
    subject: 'Introducing something new',
    category: 'Announcement',
    inner: `<tr><td style="padding:0;">
<div style="background:${PRIMARY};padding:40px 32px;text-align:center;">
<div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#c8ebe4;font-weight:bold;">Just launched</div>
<h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;color:#ffffff;">Meet our newest feature</h1>
</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.7;color:#3d3830;text-align:center;">
We've been hard at work, and today we're thrilled to share what's new. Here's how it helps you get more done.
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">${button('See what changed', 'https://example.com/whats-new')}</td></tr>
${FOOTER}`,
  },
  {
    name: 'Special Offer',
    subject: 'A little something for you — inside',
    category: 'Promotion',
    inner: `<tr><td style="padding:0;">
<div style="background:#fef3d0;padding:36px 32px;text-align:center;">
<h1 style="margin:0;font-size:30px;line-height:1.15;color:#92620a;">Save 20% this week</h1>
<p style="margin:10px 0 0;font-size:15px;color:#92620a;">Our biggest offer of the season — for a limited time only.</p>
</div>
</td></tr>
<tr><td style="padding:28px 32px;text-align:center;font-size:15px;line-height:1.7;color:#3d3830;">
Use code <strong style="font-family:'Courier New',monospace;background:#f0eeeb;padding:3px 8px;border-radius:4px;">SAVE20</strong> at checkout.
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">${button('Shop the sale', 'https://example.com/shop')}</td></tr>
${FOOTER}`,
  },
  {
    name: 'Welcome Email',
    subject: 'Welcome aboard 👋',
    category: 'Transactional',
    inner: `<tr><td style="padding:36px 32px 8px;">
<h1 style="margin:0;font-size:26px;line-height:1.25;color:${INK};">Welcome aboard!</h1>
</td></tr>
<tr><td style="padding:12px 32px;font-size:15px;line-height:1.7;color:#3d3830;">
We're glad you're here. Here are a few things to help you get started:
<ul style="margin:14px 0;padding-left:20px;color:#3d3830;">
<li style="margin-bottom:8px;">Complete your profile</li>
<li style="margin-bottom:8px;">Explore the dashboard</li>
<li>Invite a teammate</li>
</ul>
</td></tr>
<tr><td style="padding:8px 32px 32px;">${button('Get started', 'https://example.com/start')}</td></tr>
${FOOTER}`,
  },
]

/** A valid Unlayer design (schemaVersion 16) wrapping one HTML content block. */
function htmlDesign(html: string) {
  return {
    counters: { u_row: 1, u_column: 1, u_content_html: 1 },
    body: {
      id: 'u_body',
      rows: [
        {
          id: 'u_row_1',
          cells: [1],
          columns: [
            {
              id: 'u_column_1',
              contents: [
                {
                  id: 'u_content_html_1',
                  type: 'html',
                  values: {
                    html,
                    hideDesktop: false,
                    hideMobile: false,
                    displayCondition: null,
                    containerPadding: '0px',
                    anchor: '',
                    _meta: {
                      htmlID: 'u_content_html_1',
                      htmlClassNames: 'u_content_html',
                    },
                    selectable: true,
                    draggable: true,
                    duplicatable: true,
                    deletable: true,
                  },
                },
              ],
              values: {
                _meta: {
                  htmlID: 'u_column_1',
                  htmlClassNames: 'u_column',
                },
                border: {},
                padding: '0px',
                backgroundColor: '',
              },
            },
          ],
          values: {
            displayCondition: null,
            columns: false,
            backgroundColor: '',
            columnsBackgroundColor: '',
            backgroundImage: {
              url: '',
              fullWidth: true,
              repeat: 'no-repeat',
              size: 'custom',
              position: 'center',
            },
            padding: '0px',
            anchor: '',
            _meta: { htmlID: 'u_row_1', htmlClassNames: 'u_row' },
            selectable: true,
            draggable: true,
            duplicatable: true,
            deletable: true,
            hideDesktop: false,
            hideMobile: false,
            noStackMobile: false,
          },
        },
      ],
      headers: [],
      footers: [],
      values: {
        popupPosition: 'center',
        contentWidth: '600px',
        contentAlign: 'center',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        textColor: '#000000',
        backgroundColor: '#f4f4f5',
        backgroundImage: {
          url: '',
          fullWidth: true,
          repeat: 'no-repeat',
          size: 'custom',
          position: 'center',
        },
        preheaderText: '',
        linkStyle: {
          body: true,
          linkColor: '#0000ee',
          linkHoverColor: '#0000ee',
          linkUnderline: true,
          linkHoverUnderline: true,
        },
        _meta: { htmlID: 'u_body', htmlClassNames: 'u_body' },
      },
    },
    schemaVersion: 16,
  }
}

interface TemplateRecord {
  name: string
  subject: string
  category: Category
  html: string
  design: ReturnType<typeof htmlDesign>
}

async function buildRecords(): Promise<TemplateRecord[]> {
  const records: TemplateRecord[] = TEMPLATES.map((t) => ({
    name: t.name,
    subject: t.subject,
    category: t.category,
    html: emailDoc(t.inner),
    design: htmlDesign(t.inner),
  }))
  for (const f of FILE_TEMPLATES) {
    const full = readFileSync(
      new URL(`./templates/${f.file}`, import.meta.url),
      'utf8',
    )
    console.log(`uploading images for ${f.name}…`)
    const hosted = await hostImages(f, full)
    records.push({
      name: f.name,
      subject: f.subject,
      category: f.category,
      html: hosted,
      design: htmlDesign(extractInner(hosted)),
    })
  }
  return records
}

async function main() {
  const { data: existing, error: exErr } = await supabase
    .from('templates')
    .select('name')
  if (exErr) {
    console.error('Failed to read existing templates:', exErr.message)
    process.exit(1)
  }
  const have = new Set((existing ?? []).map((t: { name: string }) => t.name))

  let inserted = 0
  let skipped = 0
  for (const t of await buildRecords()) {
    if (have.has(t.name)) {
      console.log(`• skip (exists): ${t.name}`)
      skipped++
      continue
    }
    const { error } = await supabase.from('templates').insert({
      name: t.name,
      subject: t.subject,
      html: t.html,
      design: t.design,
      category: t.category,
    })
    if (error) {
      console.error(`✗ ${t.name}: ${error.message}`)
      process.exit(1)
    }
    console.log(`✓ inserted: ${t.name} (${t.category})`)
    inserted++
  }

  console.log(`\nDone — ${inserted} inserted, ${skipped} skipped.`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
