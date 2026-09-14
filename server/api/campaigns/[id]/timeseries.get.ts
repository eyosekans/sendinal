import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * GET /api/campaigns/:id/timeseries
 * Daily opens + clicks for the campaign's "Engagement over time" chart. Buckets
 * `email_events.occurred_at` by day from the campaign's send date to today
 * (zero-filled, capped at 30 days).
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
    .select('id, sent_at')
    .eq('id', id)
    .maybeSingle()
  if (cErr) throw createError({ statusCode: 500, statusMessage: cErr.message })
  if (!campaign) {
    throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  }

  const opensByDay = new Map<string, number>()
  const clicksByDay = new Map<string, number>()
  let firstEventDay: string | null = null

  // Join-filtered: an `.in()` over every send id overflows the request URL.
  // Paged: a single select stops at 1000 rows and the chart would flatten out
  // once a campaign passed a thousand opens + clicks.
  const events = await fetchAllRows((from, to) =>
    supabase
      .from('email_events')
      .select('id, type, occurred_at, sends!inner(campaign_id)')
      .eq('sends.campaign_id', id)
      .in('type', ['opened', 'clicked'])
      .order('id')
      .range(from, to),
  )
  for (const e of events) {
    const day = e.occurred_at.slice(0, 10)
    const bucket = e.type === 'opened' ? opensByDay : clicksByDay
    bucket.set(day, (bucket.get(day) ?? 0) + 1)
    if (!firstEventDay || day < firstEventDay) firstEventDay = day
  }

  // Range start: send date, else first event day, else today.
  const todayMs = Date.now()
  const today = new Date(todayMs).toISOString().slice(0, 10)
  let startDay = campaign.sent_at?.slice(0, 10) ?? firstEventDay ?? today
  // Cap to the last 30 days.
  const cap = new Date(todayMs - 29 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  if (startDay < cap) startDay = cap

  const points: { date: string; opens: number; clicks: number }[] = []
  for (
    let d = new Date(`${startDay}T00:00:00Z`);
    d.toISOString().slice(0, 10) <= today;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const key = d.toISOString().slice(0, 10)
    points.push({
      date: key,
      opens: opensByDay.get(key) ?? 0,
      clicks: clicksByDay.get(key) ?? 0,
    })
  }

  return { points }
})
