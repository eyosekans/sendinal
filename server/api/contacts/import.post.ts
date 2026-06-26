import { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '~~/app/types/database.types'
import { importContactsSchema } from '#shared/schemas'

/**
 * POST /api/contacts/import
 * Bulk import a (pre-validated, column-mapped) batch of contacts from the import
 * wizard. The wizard sends importable rows in chunks; each call:
 *   - looks up which emails already exist,
 *   - inserts the new ones,
 *   - for existing ones, either updates them (`duplicateStrategy: 'update'`,
 *     restoring soft-deleted) or skips them (`'skip'`),
 *   - optionally adds every imported/updated contact to `listId`.
 *
 * Rows flagged `emailUnverified` are stored with `email_unverified = true`
 * (excluded from campaign dispatch until reviewed).
 *
 * Returns: { received, imported, updated, skipped, failed, listId }
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
  const { listId, duplicateStrategy, contacts } = parsed.data

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
  const rows = [...byEmail.values()]

  // Which of these emails already exist?
  const { data: existingRows, error: exErr } = await supabase
    .from('contacts')
    .select('id, email')
    .in(
      'email',
      rows.map((r) => r.email),
    )
  if (exErr) {
    throw createError({ statusCode: 500, statusMessage: exErr.message })
  }
  const existing = new Map((existingRows ?? []).map((r) => [r.email, r.id]))

  const now = new Date().toISOString()
  const fieldsOf = (c: (typeof rows)[number]) => ({
    email: c.email,
    first_name: c.firstName ?? null,
    last_name: c.lastName ?? null,
    attributes: c.attributes as Json,
    email_unverified: c.emailUnverified,
  })

  const toInsert: ReturnType<typeof fieldsOf>[] = []
  const toUpdate: { id: string; fields: ReturnType<typeof fieldsOf> }[] = []
  let skipped = 0
  for (const c of rows) {
    const id = existing.get(c.email)
    if (!id) {
      toInsert.push(fieldsOf(c))
    } else if (duplicateStrategy === 'skip') {
      skipped++
    } else {
      toUpdate.push({ id, fields: fieldsOf(c) })
    }
  }

  const affectedIds: string[] = []
  let imported = 0
  let updated = 0
  let failed = 0

  // Insert new contacts in one shot.
  if (toInsert.length) {
    const { data, error } = await supabase
      .from('contacts')
      .insert(toInsert)
      .select('id')
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
    imported = data?.length ?? 0
    for (const r of data ?? []) affectedIds.push(r.id)
  }

  // Update existing contacts (restores soft-deleted; keeps status as-is).
  for (const u of toUpdate) {
    const { data, error } = await supabase
      .from('contacts')
      .update({ ...u.fields, deleted_at: null, updated_at: now })
      .eq('id', u.id)
      .select('id')
      .maybeSingle()
    if (error || !data) {
      failed++
      continue
    }
    updated++
    affectedIds.push(data.id)
  }

  // Add every imported/updated contact to the target list.
  if (listId && affectedIds.length) {
    const junction = affectedIds.map((contactId) => ({
      list_id: listId,
      contact_id: contactId,
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
    imported,
    updated,
    skipped,
    failed,
    listId: listId ?? null,
  }
})
