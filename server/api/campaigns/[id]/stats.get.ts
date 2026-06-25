import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database, SendStatus } from '~~/app/types/database.types'

/**
 * GET /api/campaigns/:id/stats
 * Delivery summary for a campaign: a count of `sends` per status plus a few
 * derived rates. After task 1.8, a bounced/complained recipient moves out of
 * `sent`, so `sent` here means "delivered to SES and neither bounced nor
 * complained" — used as the Delivered figure.
 *
 * Phase 2.6 extends this with open_count / click_count / open_rate / click_rate.
 */
const STATUSES = [
  'queued',
  'sent',
  'failed',
  'bounced',
  'complained',
] as const satisfies readonly SendStatus[]

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid campaign id' })
  }

  const supabase = await serverSupabaseClient<Database>(event)

  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (cErr) {
    throw createError({ statusCode: 500, statusMessage: cErr.message })
  }
  if (!campaign) {
    throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  }

  // One indexed COUNT per status (sends.campaign_id is indexed), run in parallel.
  const pairs = await Promise.all(
    STATUSES.map(async (status) => {
      const { count, error } = await supabase
        .from('sends')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', id)
        .eq('status', status)
      if (error) {
        throw createError({ statusCode: 500, statusMessage: error.message })
      }
      return [status, count ?? 0] as const
    }),
  )

  const counts = Object.fromEntries(pairs) as Record<
    (typeof STATUSES)[number],
    number
  >
  const recipients = STATUSES.reduce((sum, s) => sum + counts[s], 0)
  const pct = (n: number) =>
    recipients ? Number(((n / recipients) * 100).toFixed(1)) : null

  return {
    campaignId: id,
    recipients,
    counts,
    rates: {
      delivered: pct(counts.sent),
      bounce: pct(counts.bounced),
      complaint: pct(counts.complained),
      failed: pct(counts.failed),
    },
  }
})
