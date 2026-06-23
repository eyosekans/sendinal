import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '~~/app/types/database.types'
import { updateCampaignSchema } from '#shared/schemas'

/**
 * PATCH /api/campaigns/:id
 * Update a campaign's content. Only `draft` and `scheduled` campaigns are
 * editable; once sending/sent/cancelled/failed they're locked (409).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid campaign id' })
  }

  const parsed = updateCampaignSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid campaign payload',
      data: parsed.error.flatten(),
    })
  }

  const update: Database['public']['Tables']['campaigns']['Update'] = {
    updated_at: new Date().toISOString(),
  }
  const b = parsed.data
  if (b.name !== undefined) update.name = b.name
  if (b.subject !== undefined) update.subject = b.subject
  if (b.fromName !== undefined) update.from_name = b.fromName
  if (b.fromEmail !== undefined) update.from_email = b.fromEmail
  if (b.html !== undefined) update.html = b.html
  if (b.design !== undefined) update.design = b.design as Json
  if (b.listId !== undefined) update.list_id = b.listId
  if (b.segmentRules !== undefined)
    update.segment_rules = b.segmentRules as Json

  const supabase = await serverSupabaseClient<Database>(event)

  // Lock editing once a campaign has left the draft/scheduled stage.
  const { data: existing, error: exErr } = await supabase
    .from('campaigns')
    .select('status')
    .eq('id', id)
    .maybeSingle()
  if (exErr) {
    throw createError({ statusCode: 500, statusMessage: exErr.message })
  }
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  }
  if (existing.status !== 'draft' && existing.status !== 'scheduled') {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot edit a campaign that is ${existing.status}`,
    })
  }

  const { data, error } = await supabase
    .from('campaigns')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
