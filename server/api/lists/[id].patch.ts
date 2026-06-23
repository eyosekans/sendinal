import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { updateListSchema } from '#shared/schemas'

/**
 * PATCH /api/lists/:id
 * Rename a list or change its description. Only provided fields are updated.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid list id' })
  }

  const parsed = updateListSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid list payload',
      data: parsed.error.flatten(),
    })
  }

  const update: Database['public']['Tables']['lists']['Update'] = {}
  if (parsed.data.name !== undefined) update.name = parsed.data.name
  if (parsed.data.description !== undefined)
    update.description = parsed.data.description

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase
    .from('lists')
    .update(update)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'List not found' })
  }

  return data
})
