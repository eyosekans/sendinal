import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { computeReputation, REPUTATION_WINDOW_DAYS } from '#shared/reputation'

/**
 * GET /api/dashboard/stats
 * Aggregate marketing metrics for the overview dashboard (2.6):
 *   - totalSent (+ month-over-month trend), activeContacts (+ trend)
 *   - avgOpenRate / avgClickRate across delivered sends, with sentCampaigns count
 *   - campaign health (delivered / bounced / complained + deliverability %)
 *   - sendsOverTime: daily delivered count for the last 30 days
 *   - reputation: 7-day bounce/complaint rate + SES-threshold flags (task 4.1)
 *
 * Metrics are computed in-app over the raw tables; Phase 4.7 caches this.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const supabase = await serverSupabaseClient<Database>(event)

  const now = new Date()
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )
  const lastMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  )
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const reputationWindowStart = new Date(
    now.getTime() - REPUTATION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  )

  const pctChange = (cur: number, prev: number): number | null =>
    prev === 0 ? null : Number((((cur - prev) / prev) * 100).toFixed(1))
  const rate = (n: number, base: number): number | null =>
    base === 0 ? null : Number(((n / base) * 100).toFixed(1))

  // --- sends: status + sent_at (one pass for sent total, health, time series) ---
  const { data: sends, error: sErr } = await supabase
    .from('sends')
    .select('status, sent_at')
  if (sErr) throw createError({ statusCode: 500, statusMessage: sErr.message })

  let delivered = 0
  let bounced = 0
  let complained = 0
  let sentThisMonth = 0
  let sentLastMonth = 0
  // Rolling reputation window (task 4.1) — bounced/complained sends keep the
  // `sent_at` from their original send, so the window filter catches them.
  let delivered7 = 0
  let bounced7 = 0
  let complained7 = 0
  const dailyDelivered = new Map<string, number>()

  for (const s of sends ?? []) {
    if (s.status === 'sent') delivered++
    else if (s.status === 'bounced') bounced++
    else if (s.status === 'complained') complained++

    if (s.sent_at) {
      const t = new Date(s.sent_at)
      if (t >= monthStart) sentThisMonth++
      else if (t >= lastMonthStart) sentLastMonth++
      if (t >= thirtyDaysAgo) {
        const day = s.sent_at.slice(0, 10) // YYYY-MM-DD
        dailyDelivered.set(day, (dailyDelivered.get(day) ?? 0) + 1)
      }
      if (t >= reputationWindowStart) {
        if (s.status === 'sent') delivered7++
        else if (s.status === 'bounced') bounced7++
        else if (s.status === 'complained') complained7++
      }
    }
  }

  const reputation = computeReputation({
    totalSent: delivered7 + bounced7 + complained7,
    bounced: bounced7,
    complained: complained7,
  })
  // "Total Sent" = anything that actually left for SES (delivered + bounced + complained).
  const totalSent = delivered + bounced + complained
  const deliverability = rate(delivered, delivered + bounced + complained)

  // 30-day series, zero-filled.
  const sendsOverTime: { date: string; count: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    sendsOverTime.push({ date: key, count: dailyDelivered.get(key) ?? 0 })
  }

  // --- unique opens / clicks across all events ---
  const { data: events, error: eErr } = await supabase
    .from('email_events')
    .select('send_id, type')
    .in('type', ['opened', 'clicked'])
  if (eErr) throw createError({ statusCode: 500, statusMessage: eErr.message })

  const openedSends = new Set<string>()
  const clickedSends = new Set<string>()
  for (const e of events ?? []) {
    ;(e.type === 'opened' ? openedSends : clickedSends).add(e.send_id)
  }

  // --- contacts: active total + this/last month new ---
  const [activeRes, newThisRes, newLastRes, sentCampRes] = await Promise.all([
    supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('deleted_at', null),
    supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', monthStart.toISOString()),
    supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', lastMonthStart.toISOString())
      .lt('created_at', monthStart.toISOString()),
    supabase
      .from('campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent'),
  ])
  for (const r of [activeRes, newThisRes, newLastRes, sentCampRes]) {
    if (r.error) throw createError({ statusCode: 500, statusMessage: r.error.message })
  }

  const activeContacts = activeRes.count ?? 0

  return {
    totalSent,
    totalSentTrend: pctChange(sentThisMonth, sentLastMonth),
    activeContacts,
    activeContactsTrend: pctChange(newThisRes.count ?? 0, newLastRes.count ?? 0),
    avgOpenRate: rate(openedSends.size, delivered),
    avgClickRate: rate(clickedSends.size, delivered),
    sentCampaigns: sentCampRes.count ?? 0,
    health: { delivered, bounced, complained, deliverability },
    sendsOverTime,
    reputation,
  }
})
