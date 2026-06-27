import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { listTemplatesQuerySchema } from '#shared/schemas'

/**
 * GET /api/templates
 * Paginated template list (name/subject/timestamps only — the heavy `design`
 * JSON is fetched per-template via GET /api/templates/:id). Returns
 * { data, total, page, limit }.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const parsed = listTemplatesQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid query parameters',
      data: parsed.error.flatten(),
    })
  }
  const { page, limit, search } = parsed.data

  const supabase = await serverSupabaseClient<Database>(event)

  let query = supabase
    .from('templates')
    // `html` is included so the library can render real card thumbnails; it's
    // the bulk of the payload, so revisit with a thumbnail cache at scale (4.7).
    .select('id, name, subject, category, html, created_at, updated_at', {
      count: 'exact',
    })
    .order('updated_at', { ascending: false })

  if (search) {
    const safe = search.replace(/[,()]/g, ' ')
    query = query.ilike('name', `%${safe}%`)
  }

  const from = (page - 1) * limit
  query = query.range(from, from + limit - 1)

  const { data, error, count } = await query
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { data: data ?? [], total: count ?? 0, page, limit }
})
