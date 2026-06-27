import { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '~~/app/types/database.types'
import { createTemplateSchema } from '#shared/schemas'

/**
 * POST /api/templates
 * Save the current campaign builder design as a reusable template.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const parsed = createTemplateSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid template payload',
      data: parsed.error.flatten(),
    })
  }
  const body = parsed.data

  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase
    .from('templates')
    .insert({
      name: body.name,
      subject: body.subject,
      html: body.html,
      design: body.design as Json,
      category: body.category ?? null,
    })
    .select('id, name, subject, category, created_at, updated_at')
    .single()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)
  return data
})
