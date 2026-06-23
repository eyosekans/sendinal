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

  // Restrict to a list's members by resolving member ids first. Empty list →
  // empty result without a second query.
  let memberIds: string[] | null = null
  if (listId) {
    const { data: members, error: mErr } = await supabase
      .from('list_contacts')
      .select('contact_id')
      .eq('list_id', listId)
    if (mErr) {
      throw createError({ statusCode: 500, statusMessage: mErr.message })
    }
    memberIds = (members ?? []).map((m) => m.contact_id)
    if (memberIds.length === 0) {
      return { data: [], total: 0, page, limit }
    }
  }

  let query = supabase.from('contacts').select('*', { count: 'exact' })

  if (memberIds) query = query.in('id', memberIds)
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

  return { data: data ?? [], total: count ?? 0, page, limit }
})
