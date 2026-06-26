import { serverSupabaseClient } from '#supabase/server'
import { segmentPreviewSchema } from '#shared/schemas'
import { matchesSegmentRules, type EvaluableContact } from '#shared/segments'
import type { Database } from '~~/app/types/database.types'

/**
 * POST /api/segments/preview  (task 3.2)
 *
 * Estimates how many of a list's sendable contacts match a set of segment
 * rules — the number shown live in the campaign builder. Mirrors the dispatch
 * eligibility filter (active, not soft-deleted, not flagged) so the estimate
 * equals who would actually receive the campaign:
 *
 *   { count, total } — `total` sendable list members, `count` after the segment.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const body = await readBody(event)
  const parsed = segmentPreviewSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid segment',
    })
  }
  const { listId, rules } = parsed.data

  const supabase = await serverSupabaseClient<Database>(event)

  // Resolve list members.
  const { data: members, error: mErr } = await supabase
    .from('list_contacts')
    .select('contact_id')
    .eq('list_id', listId)
  if (mErr) {
    throw createError({ statusCode: 500, statusMessage: mErr.message })
  }
  const memberIds = (members ?? []).map((m) => m.contact_id)
  if (memberIds.length === 0) return { count: 0, total: 0 }

  // Same sendability filter as campaign-dispatch.
  const { data: contacts, error: cErr } = await supabase
    .from('contacts')
    .select('email, first_name, last_name, status, attributes')
    .in('id', memberIds)
    .eq('status', 'active')
    .eq('email_unverified', false)
    .is('deleted_at', null)
  if (cErr) {
    throw createError({ statusCode: 500, statusMessage: cErr.message })
  }

  const rows = (contacts ?? []) as EvaluableContact[]
  const count = rows.filter((c) => matchesSegmentRules(c, rules.rules)).length
  return { count, total: rows.length }
})
