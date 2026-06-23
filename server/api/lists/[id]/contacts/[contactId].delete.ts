import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * DELETE /api/lists/:id/contacts/:contactId
 * Remove a single contact from a list (deletes the membership row only).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  const contactId = getRouterParam(event, 'contactId')
  const uuid = z.string().uuid()
  if (
    !id ||
    !uuid.safeParse(id).success ||
    !contactId ||
    !uuid.safeParse(contactId).success
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase
    .from('list_contacts')
    .delete()
    .eq('list_id', id)
    .eq('contact_id', contactId)
    .select('contact_id')
    .maybeSingle()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Contact is not in this list',
    })
  }

  return { listId: id, contactId, removed: true }
})
