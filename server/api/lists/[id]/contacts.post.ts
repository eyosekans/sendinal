import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { addContactsToListSchema } from '#shared/schemas'

/**
 * POST /api/lists/:id/contacts
 * Add one or more contacts to a list. Idempotent — contacts already in the list
 * are ignored (no duplicate membership). Body: { contactIds: uuid[] }
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid list id' })
  }

  const parsed = addContactsToListSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid payload',
      data: parsed.error.flatten(),
    })
  }

  const supabase = await serverSupabaseClient<Database>(event)

  const { data: list, error: listErr } = await supabase
    .from('lists')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (listErr) {
    throw createError({ statusCode: 500, statusMessage: listErr.message })
  }
  if (!list) {
    throw createError({ statusCode: 404, statusMessage: 'List not found' })
  }

  const rows = parsed.data.contactIds.map((contactId) => ({
    list_id: id,
    contact_id: contactId,
  }))
  const { error } = await supabase
    .from('list_contacts')
    .upsert(rows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true })
  if (error) {
    // 23503 = foreign_key_violation (a contact_id doesn't exist).
    if ((error as { code?: string }).code === '23503') {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more contacts do not exist',
      })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { listId: id, added: rows.length }
})
