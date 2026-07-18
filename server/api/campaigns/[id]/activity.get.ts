import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { activityStatusSchema } from '#shared/schemas'

/**
 * GET /api/campaigns/:id/activity?page=&limit=&search=&status=
 * Paginated "individual send results": one row per recipient with their derived
 * engagement status (clicked > opened > unsubscribed > the send's delivery
 * status) and the time of the latest signal. `search` matches the recipient's
 * email or name; `status` filters on the derived status, so `total` always
 * reflects the filtered set and stays consistent with pagination.
 *
 * The derived status lives across two tables, so filtering loads the campaign's
 * sends + events and derives in-app — same trade-off as the stats endpoint
 * (revisit with caching in task 4.7 if campaigns outgrow it).
 */
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  /** Case-insensitive substring match on recipient email or first/last name. */
  search: z.string().trim().min(1).optional(),
  /** Filter on the derived per-recipient status. */
  status: activityStatusSchema.optional(),
})

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid campaign id' })
  }
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid query parameters' })
  }
  const { page, limit, search, status } = parsed.data

  const supabase = await serverSupabaseClient<Database>(event)

  // All sends for the campaign with their recipient embedded (avoids an
  // unbounded `.in(contact_id, …)` URL when searching).
  const { data: sends, error: sErr } = await supabase
    .from('sends')
    .select(
      'id, contact_id, status, sent_at, created_at, contacts(email, first_name, last_name)',
    )
    .eq('campaign_id', id)
  if (sErr) throw createError({ statusCode: 500, statusMessage: sErr.message })

  // All engagement events for the campaign (filtered via the sends join).
  const signal = new Map<string, { clicked: boolean; opened: boolean; unsub: boolean }>()
  const latest = new Map<string, string>()
  if (sends?.length) {
    const { data: events, error: eErr } = await supabase
      .from('email_events')
      .select('send_id, type, occurred_at, sends!inner(campaign_id)')
      .eq('sends.campaign_id', id)
    if (eErr) throw createError({ statusCode: 500, statusMessage: eErr.message })
    for (const e of events ?? []) {
      const sig = signal.get(e.send_id) ?? {
        clicked: false,
        opened: false,
        unsub: false,
      }
      if (e.type === 'clicked') sig.clicked = true
      else if (e.type === 'opened') sig.opened = true
      else if (e.type === 'unsubscribed') sig.unsub = true
      signal.set(e.send_id, sig)
      const cur = latest.get(e.send_id)
      if (!cur || e.occurred_at > cur) latest.set(e.send_id, e.occurred_at)
    }
  }

  const statusFor = (s: NonNullable<typeof sends>[number]): string => {
    const sig = signal.get(s.id)
    if (sig?.clicked) return 'clicked'
    if (sig?.opened) return 'opened'
    if (sig?.unsub) return 'unsubscribed'
    if (s.status === 'sent') return 'delivered'
    return s.status // bounced | complained | failed | queued
  }

  const q = search?.toLowerCase()
  const matchesSearch = (c: NonNullable<typeof sends>[number]['contacts']) => {
    if (!q) return true
    if (!c) return false
    return (
      c.email.toLowerCase().includes(q) ||
      (c.first_name ?? '').toLowerCase().includes(q) ||
      (c.last_name ?? '').toLowerCase().includes(q)
    )
  }

  const filtered = (sends ?? [])
    .map((s) => ({
      sendId: s.id,
      email: s.contacts?.email ?? '—',
      status: statusFor(s),
      at: latest.get(s.id) ?? s.sent_at,
      contacts: s.contacts,
      sentAt: s.sent_at,
      createdAt: s.created_at,
    }))
    .filter((r) => matchesSearch(r.contacts) && (!status || r.status === status))

  // Same order as before: sent_at desc (nulls last), then created_at desc.
  filtered.sort((a, b) => {
    if (a.sentAt !== b.sentAt) {
      if (a.sentAt === null) return 1
      if (b.sentAt === null) return -1
      return a.sentAt < b.sentAt ? 1 : -1
    }
    const ac = a.createdAt ?? ''
    const bc = b.createdAt ?? ''
    return ac < bc ? 1 : ac > bc ? -1 : 0
  })

  const from = (page - 1) * limit
  const data = filtered
    .slice(from, from + limit)
    .map(({ sendId, email, status: st, at }) => ({ sendId, email, status: st, at }))

  return { data, total: filtered.length, page, limit }
})
