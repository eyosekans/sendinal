import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * GET /api/lists
 * All lists, oldest first, each with its member count (`contactCount`).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const supabase = await serverSupabaseClient<Database>(event)

  // Membership is counted by Postgres via the embedded aggregate. Tallying the
  // junction rows here instead would silently stop at PostgREST's max-rows
  // (1000): every list past the first thousand memberships reads short.
  const { data: lists, error } = await supabase
    .from('lists')
    .select('*, list_contacts(count)')
    .order('created_at', { ascending: true })
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return (lists ?? []).map(({ list_contacts, ...l }) => ({
    ...l,
    contactCount: list_contacts[0]?.count ?? 0,
  }))
})
