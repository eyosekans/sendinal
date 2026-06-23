import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * DELETE /api/contacts/:id
 * Soft-delete: stamps deleted_at so the contact drops out of listings and future
 * sends while keeping its history. Idempotent — deleting an already-deleted (or
 * missing) contact returns 404.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid contact id' })
  }

  const now = new Date().toISOString()
  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase
    .from('contacts')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
  }

  return { id: data.id, deleted: true }
})
