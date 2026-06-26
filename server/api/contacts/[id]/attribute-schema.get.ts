import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { attributeSchemaSchema, type AttributeField } from '#shared/schemas'

/**
 * GET /api/contacts/:id/attribute-schema
 * The union of custom-attribute field definitions across every list the contact
 * belongs to. Keys are de-duplicated case-insensitively (first list wins).
 * Drives the dynamic fields rendered in the contact edit form.
 *
 * Returns: { fields: AttributeField[] }
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid contact id' })
  }

  const supabase = await serverSupabaseClient<Database>(event)

  const { data: memberships, error: mErr } = await supabase
    .from('list_contacts')
    .select('list_id')
    .eq('contact_id', id)
  if (mErr) {
    throw createError({ statusCode: 500, statusMessage: mErr.message })
  }

  const listIds = (memberships ?? []).map((m) => m.list_id)
  if (listIds.length === 0) return { fields: [] as AttributeField[] }

  const { data: lists, error: lErr } = await supabase
    .from('lists')
    .select('attribute_schema')
    .in('id', listIds)
  if (lErr) {
    throw createError({ statusCode: 500, statusMessage: lErr.message })
  }

  const fields: AttributeField[] = []
  const seen = new Set<string>()
  for (const l of lists ?? []) {
    const parsed = attributeSchemaSchema.safeParse(l.attribute_schema)
    if (!parsed.success) continue
    for (const f of parsed.data) {
      const k = f.key.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      fields.push(f)
    }
  }

  return { fields }
})
