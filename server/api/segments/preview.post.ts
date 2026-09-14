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
/** Rows per page; must not exceed PostgREST's max-rows (1000). */
const PAGE_SIZE = 1000

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

  // Same sendability filter as campaign-dispatch, and the same join-based
  // membership filter — `.in('id', memberIds)` would overflow the request URL
  // on a large list. Paged like dispatch too: one select stops at PostgREST's
  // max-rows (1000), so the estimate would cap there while the send doesn't.
  const rows: EvaluableContact[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error: cErr } = await supabase
      .from('contacts')
      .select(
        'email, first_name, last_name, status, attributes, list_contacts!inner(list_id)',
      )
      .eq('list_contacts.list_id', listId)
      .eq('status', 'active')
      .eq('email_unverified', false)
      .is('deleted_at', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (cErr) {
      throw createError({ statusCode: 500, statusMessage: cErr.message })
    }
    rows.push(...(data as EvaluableContact[]))
    if (data.length < PAGE_SIZE) break
  }

  const count = rows.filter((c) => matchesSegmentRules(c, rules.rules)).length
  return { count, total: rows.length }
})
