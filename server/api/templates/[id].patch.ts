import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '~~/app/types/database.types'
import { updateTemplateSchema } from '#shared/schemas'

/**
 * PATCH /api/templates/:id
 * Update a template (rename, or save new subject/HTML/design). Partial — only
 * the provided fields change. `updated_at` is set manually (the DB trigger is
 * deferred to task 4.3).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid template id' })
  }

  const parsed = updateTemplateSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid template payload',
      data: parsed.error.flatten(),
    })
  }
  const b = parsed.data

  const update: Database['public']['Tables']['templates']['Update'] = {
    updated_at: new Date().toISOString(),
  }
  if (b.name !== undefined) update.name = b.name
  if (b.subject !== undefined) update.subject = b.subject
  if (b.html !== undefined) update.html = b.html
  if (b.design !== undefined) update.design = b.design as Json
  if (b.category !== undefined) update.category = b.category ?? null

  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase
    .from('templates')
    .update(update)
    .eq('id', id)
    .select('id, name, subject, category, created_at, updated_at')
    .maybeSingle()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  return data
})
