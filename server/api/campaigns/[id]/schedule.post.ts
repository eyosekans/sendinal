import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { scheduleCampaignSchema } from '#shared/schemas'

/**
 * POST /api/campaigns/:id/schedule
 * Set a future send time and move the campaign to `scheduled`. The worker's
 * scheduler (`worker/lib/scheduler.ts`) picks it up once `scheduled_at <= NOW()`.
 * Allowed from `draft` or `scheduled` (reschedule); the campaign must target a
 * list.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid campaign id' })
  }

  const parsed = scheduleCampaignSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid schedule payload',
      data: parsed.error.flatten(),
    })
  }

  const when = new Date(parsed.data.scheduledAt)
  if (when.getTime() <= Date.now()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'scheduledAt must be in the future',
    })
  }

  const supabase = await serverSupabaseClient<Database>(event)

  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('status, list_id')
    .eq('id', id)
    .maybeSingle()
  if (cErr) {
    throw createError({ statusCode: 500, statusMessage: cErr.message })
  }
  if (!campaign) {
    throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  }
  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot schedule a campaign that is ${campaign.status}`,
    })
  }
  if (!campaign.list_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Campaign has no recipient list',
    })
  }

  const { data, error } = await supabase
    .from('campaigns')
    .update({
      status: 'scheduled',
      scheduled_at: when.toISOString(),
    })
    .eq('id', id)
    .in('status', ['draft', 'scheduled'])
    .select()
    .single()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
