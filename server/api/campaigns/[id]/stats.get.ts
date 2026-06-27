import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import { abVariantsSchema } from '#shared/schemas'
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
    .select('id, subject, ab_variants')
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
    .select('id, status, variant')
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

  // Unique opens/clicks/unsubscribes: dedupe email_events back to distinct sends.
  const openedSends = new Set<string>()
  const clickedSends = new Set<string>()
  const unsubscribedSends = new Set<string>()
  const sendIds = sends.map((s) => s.id)
  if (sendIds.length) {
    const { data: events, error: eErr } = await supabase
      .from('email_events')
      .select('send_id, type')
      .in('send_id', sendIds)
      .in('type', ['opened', 'clicked', 'unsubscribed'])
    if (eErr) {
      throw createError({ statusCode: 500, statusMessage: eErr.message })
    }
    for (const e of events ?? []) {
      if (e.type === 'opened') openedSends.add(e.send_id)
      else if (e.type === 'clicked') clickedSends.add(e.send_id)
      else unsubscribedSends.add(e.send_id)
    }
  }
  const opened = openedSends.size
  const clicked = clickedSends.size
  const unsubscribed = unsubscribedSends.size

  const pct = (n: number) =>
    recipients ? Number(((n / recipients) * 100).toFixed(1)) : null

  // A/B per-variant breakdown (task 3.3). Winner = higher open rate, only when
  // both variants have recipients and there's a strict leader.
  const abParsed = abVariantsSchema.safeParse(campaign.ab_variants ?? [])
  const variantB = abParsed.success ? abParsed.data[0] : undefined
  let abTest: {
    metric: 'open'
    variants: {
      label: string
      subject: string
      recipients: number
      opened: number
      clicked: number
      openRate: number | null
      clickRate: number | null
      winner: boolean
    }[]
  } | null = null
  if (variantB) {
    const subjectByLabel: Record<string, string> = {
      A: campaign.subject,
      B: variantB.subject,
    }
    const variants = (['A', 'B'] as const).map((label) => {
      const vsends = sends.filter((s) => s.variant === label)
      const r = vsends.length
      const o = vsends.filter((s) => openedSends.has(s.id)).length
      const c = vsends.filter((s) => clickedSends.has(s.id)).length
      const vpct = (n: number) =>
        r ? Number(((n / r) * 100).toFixed(1)) : null
      return {
        label,
        subject: subjectByLabel[label] ?? '',
        recipients: r,
        opened: o,
        clicked: c,
        openRate: vpct(o),
        clickRate: vpct(c),
        winner: false,
      }
    })
    const eligible = variants.filter(
      (v) => v.recipients > 0 && v.openRate !== null,
    )
    if (eligible.length === 2) {
      const top = Math.max(...eligible.map((v) => v.openRate!))
      const leaders = eligible.filter((v) => v.openRate === top)
      if (leaders.length === 1) leaders[0]!.winner = true
    }
    abTest = { metric: 'open', variants }
  }

  return {
    campaignId: id,
    recipients,
    counts: { ...counts, opened, clicked, unsubscribed },
    rates: {
      delivered: pct(counts.sent),
      open: pct(opened),
      click: pct(clicked),
      unsubscribe: pct(unsubscribed),
      bounce: pct(counts.bounced),
      complaint: pct(counts.complained),
      failed: pct(counts.failed),
    },
    abTest,
  }
})
