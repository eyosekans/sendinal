import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import type { ContactStatus } from '#shared/schemas'
import { contactStatsQuerySchema } from '#shared/schemas'

/**
 * GET /api/contacts/stats
 * Per-status counts across non-deleted contacts, used to populate the status
 * tab badges. `listId` and `search` narrow the counts exactly as they narrow
 * GET /api/contacts, so each badge equals the table total on that tab.
 * Returns: { all, active, unsubscribed, bounced, complained }
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const parsed = contactStatsQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid query parameters',
      data: parsed.error.flatten(),
    })
  }
  const { listId, search } = parsed.data

  const supabase = await serverSupabaseClient<Database>(event)

  const statuses: ContactStatus[] = [
    'active',
    'unsubscribed',
    'bounced',
    'complained',
  ]

  // head:true returns only the exact count, no rows. List scope goes through
  // the same inner join as GET /api/contacts (unique pair, so no double count).
  const countFor = (status?: ContactStatus) => {
    let q = listId
      ? supabase
          .from('contacts')
          .select('id, list_contacts!inner(list_id)', {
            count: 'exact',
            head: true,
          })
          .eq('list_contacts.list_id', listId)
      : supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true })
    q = q.is('deleted_at', null)
    if (status) q = q.eq('status', status)
    if (search) q = q.or(containsAnyFilter(CONTACT_SEARCH_COLUMNS, search))
    return q
  }

  const [all, ...perStatus] = await Promise.all([
    countFor(),
    ...statuses.map((s) => countFor(s)),
  ])

  const firstError = [all, ...perStatus].find((r) => r.error)?.error
  if (firstError) {
    throw createError({ statusCode: 500, statusMessage: firstError.message })
  }

  const result: Record<string, number> = { all: all.count ?? 0 }
  statuses.forEach((s, i) => {
    result[s] = perStatus[i]?.count ?? 0
  })

  return result as { all: number } & Record<ContactStatus, number>
})
