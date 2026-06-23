import { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '~~/app/types/database.types'
import { importContactsSchema } from '#shared/schemas'

/**
 * POST /api/contacts/import
 * Bulk upsert contacts by email (the UI parses the CSV + maps columns, then
 * posts rows here). Existing emails are updated and soft-deleted ones restored;
 * if `listId` is given, every imported contact is added to that list.
 *
 * Note: import is authoritative — a blank name in the payload overwrites an
 * existing one. Returns: { received, imported, listId }
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const parsed = importContactsSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid import payload',
      data: parsed.error.flatten(),
    })
  }
  const { listId, contacts } = parsed.data

  const supabase = await serverSupabaseClient<Database>(event)

  // If a list is targeted, confirm it exists before importing anything.
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

  // De-dupe by email within the payload (last occurrence wins).
  const byEmail = new Map<string, (typeof contacts)[number]>()
  for (const c of contacts) byEmail.set(c.email, c)

  const now = new Date().toISOString()
  const rows = [...byEmail.values()].map((c) => ({
    email: c.email,
    first_name: c.firstName ?? null,
    last_name: c.lastName ?? null,
    attributes: c.attributes as Json,
    deleted_at: null,
    updated_at: now,
  }))

  const { data: upserted, error } = await supabase
    .from('contacts')
    .upsert(rows, { onConflict: 'email' })
    .select('id')
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (listId && upserted) {
    const junction = upserted.map((c) => ({
      list_id: listId,
      contact_id: c.id,
    }))
    const { error: jErr } = await supabase
      .from('list_contacts')
      .upsert(junction, {
        onConflict: 'list_id,contact_id',
        ignoreDuplicates: true,
      })
    if (jErr) {
      throw createError({ statusCode: 500, statusMessage: jErr.message })
    }
  }

  return {
    received: contacts.length,
    imported: upserted?.length ?? 0,
    listId: listId ?? null,
  }
})
