import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '~~/app/types/database.types'

/**
 * POST /api/templates/:id/duplicate
 * Clone a template into a new "<name> (copy)" row (same subject/html/design).
 * Returns the new template (list shape) with 201. 404 if the source is gone.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid template id' })
  }

  const supabase = await serverSupabaseClient<Database>(event)

  const { data: src, error: srcErr } = await supabase
    .from('templates')
    .select('name, subject, html, design, category')
    .eq('id', id)
    .maybeSingle()
  if (srcErr) {
    throw createError({ statusCode: 500, statusMessage: srcErr.message })
  }
  if (!src) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  const { data, error } = await supabase
    .from('templates')
    .insert({
      name: `${src.name} (copy)`.slice(0, 200),
      subject: src.subject,
      html: src.html,
      design: src.design as Json,
      category: src.category,
    })
    .select('id, name, subject, category, created_at, updated_at')
    .single()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)
  return data
})
