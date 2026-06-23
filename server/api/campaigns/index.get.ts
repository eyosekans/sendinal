import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { listCampaignsQuerySchema } from '#shared/schemas'

/**
 * GET /api/campaigns
 * Paginated campaign list enriched with delivery metrics derived from `sends`
 * and `email_events`:
 *   - recipients: number of send rows for the campaign
 *   - openRate / clickRate: unique opens|clicks ÷ recipients (null until sent)
 *
 * Server-sortable columns: name, status, sentDate (sent_at), createdAt.
 * Derived columns (recipients/open/click) are sorted client-side per page.
 *
 * Note: metrics are computed in-app for the current page. Phase 4.7 moves this
 * to a cached/aggregated query for scale.
 *
 * Returns: { data, total, page, limit }
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const parsed = listCampaignsQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid query parameters',
      data: parsed.error.flatten(),
    })
  }
  const { page, limit, search, status, sort, dir } = parsed.data

  const supabase = await serverSupabaseClient<Database>(event)

  let query = supabase
    .from('campaigns')
    .select('id, name, subject, status, scheduled_at, sent_at, created_at', {
      count: 'exact',
    })

  if (status) query = query.eq('status', status)
  if (search) {
    // Strip PostgREST `or()` delimiters from user input before interpolating.
    const safe = search.replace(/[,()]/g, ' ')
    query = query.or(`name.ilike.%${safe}%,subject.ilike.%${safe}%`)
  }

  const column =
    sort === 'name'
      ? 'name'
      : sort === 'status'
        ? 'status'
        : sort === 'sentDate'
          ? 'sent_at'
          : 'created_at'
  query = query.order(column, { ascending: dir === 'asc', nullsFirst: false })

  const from = (page - 1) * limit
  query = query.range(from, from + limit - 1)

  const { data, error, count } = await query
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const rows = data ?? []
  const ids = rows.map((r) => r.id)

  const recipients = new Map<string, number>()
  const opens = new Map<string, Set<string>>()
  const clicks = new Map<string, Set<string>>()

  if (ids.length) {
    const { data: sends, error: sErr } = await supabase
      .from('sends')
      .select('id, campaign_id')
      .in('campaign_id', ids)
    if (sErr) {
      throw createError({ statusCode: 500, statusMessage: sErr.message })
    }

    const sendToCampaign = new Map<string, string>()
    for (const s of sends ?? []) {
      sendToCampaign.set(s.id, s.campaign_id)
      recipients.set(s.campaign_id, (recipients.get(s.campaign_id) ?? 0) + 1)
    }

    const sendIds = [...sendToCampaign.keys()]
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
        const cid = sendToCampaign.get(e.send_id)
        if (!cid) continue
        const bucket = e.type === 'opened' ? opens : clicks
        if (!bucket.has(cid)) bucket.set(cid, new Set())
        bucket.get(cid)!.add(e.send_id)
      }
    }
  }

  const enriched = rows.map((r) => {
    const total = recipients.get(r.id) ?? 0
    const o = opens.get(r.id)?.size ?? 0
    const c = clicks.get(r.id)?.size ?? 0
    return {
      ...r,
      recipients: total,
      openRate: total ? Number(((o / total) * 100).toFixed(1)) : null,
      clickRate: total ? Number(((c / total) * 100).toFixed(1)) : null,
    }
  })

  return { data: enriched, total: count ?? 0, page, limit }
})
