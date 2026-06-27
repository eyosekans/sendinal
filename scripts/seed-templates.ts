/**
 * Seed the shared starter templates into the `templates` table (task 3.4).
 *
 * Templates are global (the table has no per-user isolation), so these become
 * available to everyone on the team. Run once per environment, AFTER applying
 * the category migration (`20260627000002_templates_add_category.sql`):
 *
 *   node --env-file=.env scripts/seed-templates.ts
 *
 * Idempotent: an existing inline template (by exact name) is skipped; an
 * existing file template is refreshed (re-hosted html/design), so re-runs are
 * safe and pick up asset/HTML changes. Each template carries clean responsive
 * HTML (used by the library preview + when sent) and a valid Unlayer `design`
 * (a single HTML content block) so "Use in new campaign" loads + re-exports
 * correctly in the builder.
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

type Category =
  | 'Newsletter'
  | 'Promotion'
  | 'Announcement'
  | 'Transactional'
  | 'Seasonal'

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
  {
    file: 'summer-travel-offer.html',
    name: 'Summer Travel Offer',
    subject: 'Experience wonders like never before — 30% off',
    category: 'Promotion',
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
  // Catch both <img src="images/…"> and inline background-image: url('images/…').
  const refs = [
    ...new Set(
      [
        ...html.matchAll(/images\/[^"')\s]+\.(?:png|jpe?g|gif|webp|svg)/gi),
      ].map((m) => m[0]),
    ),
  ]
  let out = html
  for (const ref of refs) {
    const base = ref.slice('images/'.length)
    const ext = (base.split('.').pop() ?? 'bin').toLowerCase()
    const data = readFileSync(
      new URL(`../public/images/templates/${stem}/${base}`, import.meta.url),
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
  const records: TemplateRecord[] = []
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
  // File templates carry external assets + HTML that can change between runs, so
  // an existing one is REFRESHED (re-hosted html/design) rather than skipped —
  // this also repairs rows seeded before `hostImages` caught `url(...)` refs.
  const fileNames = new Set(FILE_TEMPLATES.map((f) => f.name))

  let inserted = 0
  let updated = 0
  let skipped = 0
  for (const t of await buildRecords()) {
    if (have.has(t.name)) {
      if (!fileNames.has(t.name)) {
        console.log(`• skip (exists): ${t.name}`)
        skipped++
        continue
      }
      const { error } = await supabase
        .from('templates')
        .update({
          subject: t.subject,
          html: t.html,
          design: t.design,
          category: t.category,
        })
        .eq('name', t.name)
      if (error) {
        console.error(`✗ ${t.name}: ${error.message}`)
        process.exit(1)
      }
      console.log(`↻ refreshed: ${t.name} (${t.category})`)
      updated++
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

  console.log(
    `\nDone — ${inserted} inserted, ${updated} refreshed, ${skipped} skipped.`,
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
