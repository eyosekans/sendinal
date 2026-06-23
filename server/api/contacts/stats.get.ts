import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import type { ContactStatus } from '#shared/schemas'

/**
 * GET /api/contacts/stats
 * Per-status counts across non-deleted contacts, used to populate the status
 * tab badges. Returns: { all, active, unsubscribed, bounced, complained }
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const supabase = await serverSupabaseClient<Database>(event)

  const statuses: ContactStatus[] = [
    'active',
    'unsubscribed',
    'bounced',
    'complained',
  ]

  // head:true returns only the exact count, no rows.
  const countFor = (status?: ContactStatus) => {
    let q = supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
    if (status) q = q.eq('status', status)
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
