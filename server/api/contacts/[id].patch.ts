import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '~~/app/types/database.types'
import { updateContactSchema } from '#shared/schemas'

/**
 * PATCH /api/contacts/:id
 * Update a contact's details and/or status. Only provided fields are changed.
 * Soft-deleted contacts cannot be edited (restore them via POST instead).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid contact id' })
  }

  const parsed = updateContactSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid contact payload',
      data: parsed.error.flatten(),
    })
  }

  // Map camelCase input → snake_case columns, skipping absent fields so we never
  // overwrite with nulls.
  const update: Database['public']['Tables']['contacts']['Update'] = {
    updated_at: new Date().toISOString(),
  }
  const { email, firstName, lastName, attributes, status } = parsed.data
  if (email !== undefined) update.email = email
  if (firstName !== undefined) update.first_name = firstName
  if (lastName !== undefined) update.last_name = lastName
  if (attributes !== undefined) update.attributes = attributes as Json
  if (status !== undefined) update.status = status

  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase
    .from('contacts')
    .update(update)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .maybeSingle()

  if (error) {
    // 23505 = unique_violation (email collision with another contact).
    if ((error as { code?: string }).code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'A contact with this email already exists',
      })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
  }

  return data
})
