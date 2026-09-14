import { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '~~/app/types/database.types'
import { createContactSchema } from '#shared/schemas'

/**
 * POST /api/contacts
 * Create a single contact. Email is unique (case-insensitive). If a soft-deleted
 * contact already exists with the same email, it is restored and updated rather
 * than rejected.
 *
 * With `listId` the contact is also added to that list, and an existing active
 * contact is updated (names overwrite when provided, attributes merge) instead
 * of being rejected — unless it is already a member of that list (409). Without
 * `listId`, an active duplicate is a 409 as before.
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
  const { email, firstName, lastName, attributes, listId } = parsed.data

  const supabase = await serverSupabaseClient<Database>(event)

  if (listId) {
    const { data: list, error: listErr } = await supabase
      .from('lists')
      .select('id')
      .eq('id', listId)
      .maybeSingle()
    if (listErr) {
      throw createError({ statusCode: 500, statusMessage: listErr.message })
    }
    if (!list) {
      throw createError({ statusCode: 404, statusMessage: 'List not found' })
    }
  }

  const { data: existing, error: lookupError } = await supabase
    .from('contacts')
    .select('id, deleted_at, attributes')
    .eq('email', email)
    .maybeSingle()
  if (lookupError) {
    throw createError({ statusCode: 500, statusMessage: lookupError.message })
  }

  async function addToList(contactId: string) {
    if (!listId) return
    const { error } = await supabase
      .from('list_contacts')
      .upsert(
        { list_id: listId, contact_id: contactId },
        { onConflict: 'list_id,contact_id', ignoreDuplicates: true },
      )
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
  }

  const fields = {
    email,
    first_name: firstName ?? null,
    last_name: lastName ?? null,
    attributes: attributes as Json,
  }

  if (existing) {
    if (!existing.deleted_at) {
      if (!listId) {
        throw createError({
          statusCode: 409,
          statusMessage: 'A contact with this email already exists',
        })
      }

      const { data: membership, error: memberErr } = await supabase
        .from('list_contacts')
        .select('contact_id')
        .eq('list_id', listId)
        .eq('contact_id', existing.id)
        .maybeSingle()
      if (memberErr) {
        throw createError({ statusCode: 500, statusMessage: memberErr.message })
      }
      if (membership) {
        throw createError({
          statusCode: 409,
          statusMessage: 'This contact is already in this list',
        })
      }

      // Update the existing contact with what the form provided: names only
      // when typed (a blank field must not wipe data), attributes merged so
      // keys outside this list's schema survive.
      const mergedAttributes = {
        ...((existing.attributes ?? {}) as Record<string, unknown>),
        ...attributes,
      }
      const update: Database['public']['Tables']['contacts']['Update'] = {
        attributes: mergedAttributes as Json,
      }
      if (firstName !== undefined) update.first_name = firstName
      if (lastName !== undefined) update.last_name = lastName

      const { data, error } = await supabase
        .from('contacts')
        .update(update)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) {
        throw createError({ statusCode: 500, statusMessage: error.message })
      }
      await addToList(existing.id)
      return data
    }

    // Restore the soft-deleted contact with the new details. Its status is kept
    // (as the CSV import does): deleting and re-adding someone who unsubscribed,
    // bounced or complained must not quietly make them sendable again.
    const { data, error } = await supabase
      .from('contacts')
      .update({
        ...fields,
        deleted_at: null,
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
    await addToList(existing.id)
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
  await addToList(data.id)

  setResponseStatus(event, 201)
  return data
})
