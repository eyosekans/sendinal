import { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '~~/app/types/database.types'
import { createContactSchema } from '#shared/schemas'

/**
 * POST /api/contacts
 * Create a single contact. Email is unique (case-insensitive). If a soft-deleted
 * contact already exists with the same email, it is restored and updated rather
 * than rejected; an active duplicate returns 409.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const parsed = createContactSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid contact payload',
      data: parsed.error.flatten(),
    })
  }
  const { email, firstName, lastName, attributes } = parsed.data

  const supabase = await serverSupabaseClient<Database>(event)

  const { data: existing, error: lookupError } = await supabase
    .from('contacts')
    .select('id, deleted_at')
    .eq('email', email)
    .maybeSingle()
  if (lookupError) {
    throw createError({ statusCode: 500, statusMessage: lookupError.message })
  }

  const fields = {
    email,
    first_name: firstName ?? null,
    last_name: lastName ?? null,
    attributes: attributes as Json,
  }

  if (existing) {
    if (!existing.deleted_at) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A contact with this email already exists',
      })
    }
    // Restore the soft-deleted contact with the new details.
    const { data, error } = await supabase
      .from('contacts')
      .update({
        ...fields,
        status: 'active',
        deleted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
    return data
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert(fields)
    .select()
    .single()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)
  return data
})
