/**
 * One-off retrofit: append the mandatory unsubscribe block to every stored
 * template that doesn't already carry one (design row + static HTML footer).
 * Idempotent — templates that already have the block/placeholder are skipped.
 *
 * Run:  node --env-file=.env scripts/add-unsubscribe-block.ts [--dry-run]
 */
import { createClient } from '@supabase/supabase-js'
import {
  appendUnsubscribeFooter,
  designHasUnsubscribe,
  ensureUnsubscribeRow,
  htmlHasUnsubscribe,
} from '../shared/unsubscribe.ts'

const SUPABASE_URL = process.env.NUXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.NUXT_SUPABASE_SECRET_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing NUXT_PUBLIC_SUPABASE_URL / NUXT_SUPABASE_SECRET_KEY in env',
  )
  process.exit(1)
}
const dryRun = process.argv.includes('--dry-run')

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

const { data: templates, error } = await admin
  .from('templates')
  .select('id, name, design, html')
if (error) throw error

let updated = 0
let skipped = 0
for (const t of templates ?? []) {
  const hasDesign = designHasUnsubscribe(t.design)
  const hasHtml = htmlHasUnsubscribe(t.html ?? '')
  if (hasDesign && hasHtml) {
    skipped++
    console.log(`skip    ${t.name} (${t.id}) — already has the block`)
    continue
  }

  const design = hasDesign ? t.design : ensureUnsubscribeRow(t.design).design
  const html = appendUnsubscribeFooter(t.html ?? '')

  if (dryRun) {
    console.log(`would update ${t.name} (${t.id}) design=${!hasDesign} html=${!hasHtml}`)
    updated++
    continue
  }

  const { error: updateErr } = await admin
    .from('templates')
    .update({ design, html })
    .eq('id', t.id)
  if (updateErr) {
    console.error(`FAILED  ${t.name} (${t.id}): ${updateErr.message}`)
    process.exitCode = 1
    continue
  }
  updated++
  console.log(`updated ${t.name} (${t.id}) design=${!hasDesign} html=${!hasHtml}`)
}

console.log(
  `\n${dryRun ? '[dry-run] ' : ''}${updated} updated, ${skipped} skipped (of ${templates?.length ?? 0})`,
)
