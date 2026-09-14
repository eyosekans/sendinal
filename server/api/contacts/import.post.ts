import { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '~~/app/types/database.types'
import { importContactsSchema } from '#shared/schemas'
import { validationOutcome } from '#shared/validation'

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
 * When a row carries an Amazon SES verdict (from POST /api/contacts/validate),
 * the verdict is stored on the contact and `validationPolicy` is re-applied here
 * rather than trusted from the client: a risky address is flagged unverified
 * (`flag`) or dropped (`skip`). Re-deriving it server-side also keeps the stored
 * `email_unverified` consistent with the Review screen the operator approved.
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
  const { listId, duplicateStrategy, validationPolicy, contacts } = parsed.data

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

  // Which of these emails already exist? Chunked: the payload allows 10,000
  // rows, and one `.in()` over them both overflows the request URL and would
  // return at most 1000 matches — the rest would be re-inserted as duplicates.
  const existingRows: { id: string; email: string }[] = []
  for (const batch of chunked(rows.map((r) => r.email))) {
    const { data, error: exErr } = await supabase
      .from('contacts')
      .select('id, email')
      .in('email', batch)
    if (exErr) {
      throw createError({ statusCode: 500, statusMessage: exErr.message })
    }
    existingRows.push(...(data ?? []))
  }
  const existing = new Map(existingRows.map((r) => [r.email, r.id]))

  const fieldsOf = (c: (typeof rows)[number]) => ({
    email: c.email,
    first_name: c.firstName ?? null,
    last_name: c.lastName ?? null,
    attributes: c.attributes as Json,
    // Malformed-format flag (client) OR risky-per-SES flag (re-derived here).
    email_unverified:
      c.emailUnverified || validationOutcome(c.validation, validationPolicy).unverified,
    // Only overwrite the stored verdict when this import actually carries one,
    // so an unvalidated re-import doesn't wipe an earlier result.
    ...(c.validation
      ? {
          email_validation_verdict: c.validation.isValid,
          email_validation_checks: c.validation.checks as Json,
          email_validated_at: c.validation.checkedAt,
        }
      : {}),
  })

  const toInsert: ReturnType<typeof fieldsOf>[] = []
  const toUpdate: { id: string; fields: ReturnType<typeof fieldsOf> }[] = []
  let skipped = 0
  for (const c of rows) {
    // Defence in depth: the wizard already filters these out, but a `skip`
    // policy must hold even if a caller posts the row anyway.
    if (!validationOutcome(c.validation, validationPolicy).importable) {
      skipped++
      continue
    }
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
      .update({ ...u.fields, deleted_at: null })
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
