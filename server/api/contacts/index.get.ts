import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { listContactsQuerySchema } from '#shared/schemas'

/**
 * GET /api/contacts
 * Paginated contact list with optional email search, status filter, and list
 * membership filter (`listId`). Soft-deleted contacts are hidden unless
 * `includeDeleted=true`.
 *
 * Returns: { data, total, page, limit }
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const parsed = listContactsQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid query parameters',
      data: parsed.error.flatten(),
    })
  }
  const { page, limit, search, status, listId, includeDeleted } = parsed.data

  const supabase = await serverSupabaseClient<Database>(event)

  // Restrict to a list's members through an inner join on the junction table.
  // Resolving member ids first and passing them to `.in('id', …)` put the whole
  // id list in the request URL, which overflows on a large list; only `listId`
  // travels now. The join is on a unique (list_id, contact_id) pair, so it
  // cannot duplicate a contact row or distort `count`.
  let query = listId
    ? supabase
        .from('contacts')
        .select('*, list_contacts!inner(list_id)', { count: 'exact' })
        .eq('list_contacts.list_id', listId)
    : supabase.from('contacts').select('*', { count: 'exact' })

  if (!includeDeleted) query = query.is('deleted_at', null)
  if (status) query = query.eq('status', status)
  if (search) query = query.ilike('email', `%${search}%`)

  const from = (page - 1) * limit
  query = query
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  const { data, error, count } = await query
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  // Drop the join artefact so the payload stays a plain contact row.
  const rows = (data ?? []).map((r) => {
    const { list_contacts: _joined, ...contact } = r as typeof r & {
      list_contacts?: unknown
    }
    return contact
  })

  return { data: rows, total: count ?? 0, page, limit }
})
