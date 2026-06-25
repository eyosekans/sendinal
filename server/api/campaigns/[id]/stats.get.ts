import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database, SendStatus } from '~~/app/types/database.types'

/**
 * GET /api/campaigns/:id/stats
 * Delivery + engagement summary for a campaign: a count of `sends` per status,
 * unique open/click counts from `email_events`, and derived rates. After task
 * 1.8 a bounced/complained recipient moves out of `sent`, so `sent` here means
 * "delivered to SES and neither bounced nor complained" — the Delivered figure.
 *
 * Open/click are **unique per send** (one recipient counted once). Rates are a
 * percentage of recipients. Metrics are computed in-app; Phase 4.7 caches this.
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
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (cErr) {
    throw createError({ statusCode: 500, statusMessage: cErr.message })
  }
  if (!campaign) {
    throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  }

  // All sends for the campaign (id + status), tallied in-app.
  const { data: sendRows, error: sErr } = await supabase
    .from('sends')
    .select('id, status')
    .eq('campaign_id', id)
  if (sErr) {
    throw createError({ statusCode: 500, statusMessage: sErr.message })
  }
  const sends = sendRows ?? []

  const counts: Record<SendStatus, number> = {
    queued: 0,
    sent: 0,
    failed: 0,
    bounced: 0,
    complained: 0,
  }
  for (const s of sends) counts[s.status]++
  const recipients = sends.length

  // Unique opens/clicks: dedupe email_events back to distinct send ids.
  const openedSends = new Set<string>()
  const clickedSends = new Set<string>()
  const sendIds = sends.map((s) => s.id)
  if (sendIds.length) {
    const { data: events, error: eErr } = await supabase
      .from('email_events')
      .select('send_id, type')
      .in('send_id', sendIds)
      .in('type', ['opened', 'clicked'])
    if (eErr) {
      throw createError({ statusCode: 500, statusMessage: eErr.message })
    }
    for (const e of events ?? []) {
      ;(e.type === 'opened' ? openedSends : clickedSends).add(e.send_id)
    }
  }
  const opened = openedSends.size
  const clicked = clickedSends.size

  const pct = (n: number) =>
    recipients ? Number(((n / recipients) * 100).toFixed(1)) : null

  return {
    campaignId: id,
    recipients,
    counts: { ...counts, opened, clicked },
    rates: {
      delivered: pct(counts.sent),
      open: pct(opened),
      click: pct(clicked),
      bounce: pct(counts.bounced),
      complaint: pct(counts.complained),
      failed: pct(counts.failed),
    },
  }
})
