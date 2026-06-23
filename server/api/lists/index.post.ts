import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { createListSchema } from '#shared/schemas'

/**
 * POST /api/lists
 * Create a list. Returns the new row (with contactCount: 0 for shape parity).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const parsed = createListSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid list payload',
      data: parsed.error.flatten(),
    })
  }

  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase
    .from('lists')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    })
    .select()
    .single()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)
  return { ...data, contactCount: 0 }
})
