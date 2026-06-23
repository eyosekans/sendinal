import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * DELETE /api/lists/:id
 * Delete a list. Membership rows in `list_contacts` are removed automatically
 * (ON DELETE CASCADE); the contacts themselves are untouched.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid list id' })
  }

  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase
    .from('lists')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'List not found' })
  }

  return { id: data.id, deleted: true }
})
