import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * POST /api/campaigns/:id/send
 * Dispatch a campaign immediately: flip it to `sending` and enqueue a
 * `campaign.dispatch` job for the worker to fan out. Only draft/scheduled
 * campaigns can be sent, and the campaign must target a list.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid campaign id' })
  }

  const supabase = await serverSupabaseClient<Database>(event)

  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('id, status, list_id')
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
      statusMessage: `Campaign is already ${campaign.status}`,
    })
  }
  if (!campaign.list_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Campaign has no recipient list',
    })
  }

  // Atomically claim the campaign for sending (guards against double-dispatch).
  const { data: claimed, error: upErr } = await supabase
    .from('campaigns')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['draft', 'scheduled'])
    .select('id')
    .maybeSingle()
  if (upErr) {
    throw createError({ statusCode: 500, statusMessage: upErr.message })
  }
  if (!claimed) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Campaign is already being sent',
    })
  }

  try {
    await getCampaignDispatchQueue().add(
      'dispatch',
      { campaignId: id },
      { removeOnComplete: true, removeOnFail: false },
    )
  } catch (err) {
    // Roll back so the campaign can be retried.
    await supabase.from('campaigns').update({ status: 'draft' }).eq('id', id)
    throw createError({
      statusCode: 503,
      statusMessage:
        'Could not enqueue the campaign — the job queue is unavailable',
      data: { error: (err as Error).message },
    })
  }

  return { id, status: 'sending' }
})
