import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * GET /api/lists
 * All lists, oldest first, each with its member count (`contactCount`).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const supabase = await serverSupabaseClient<Database>(event)

  const { data: lists, error } = await supabase
    .from('lists')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  // One pass over the junction table to tally membership per list.
  const { data: memberships, error: mErr } = await supabase
    .from('list_contacts')
    .select('list_id')
  if (mErr) {
    throw createError({ statusCode: 500, statusMessage: mErr.message })
  }

  const counts = new Map<string, number>()
  for (const m of memberships ?? []) {
    counts.set(m.list_id, (counts.get(m.list_id) ?? 0) + 1)
  }

  return (lists ?? []).map((l) => ({
    ...l,
    contactCount: counts.get(l.id) ?? 0,
  }))
})
