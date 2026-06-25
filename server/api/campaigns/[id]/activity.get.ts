import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * GET /api/campaigns/:id/activity?page=&limit=
 * Paginated "individual send results": one row per recipient with their derived
 * engagement status (clicked > opened > unsubscribed > the send's delivery
 * status) and the time of the latest signal. Returns { data, total, page, limit }.
 */
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
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
  const { page, limit } = parsed.data

  const supabase = await serverSupabaseClient<Database>(event)

  const from = (page - 1) * limit
  const { data: sends, error: sErr, count } = await supabase
    .from('sends')
    .select('id, contact_id, status, sent_at, created_at', { count: 'exact' })
    .eq('campaign_id', id)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)
  if (sErr) throw createError({ statusCode: 500, statusMessage: sErr.message })

  const rows = sends ?? []
  const sendIds = rows.map((s) => s.id)
  const contactIds = [...new Set(rows.map((s) => s.contact_id))]

  // Emails for this page of recipients.
  const emailById = new Map<string, string>()
  if (contactIds.length) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email')
      .in('id', contactIds)
    for (const c of contacts ?? []) emailById.set(c.id, c.email)
  }

  // Strongest engagement signal + latest time per send.
  const signal = new Map<string, { clicked: boolean; opened: boolean; unsub: boolean }>()
  const latest = new Map<string, string>()
  if (sendIds.length) {
    const { data: events } = await supabase
      .from('email_events')
      .select('send_id, type, occurred_at')
      .in('send_id', sendIds)
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

  const statusFor = (s: (typeof rows)[number]): string => {
    const sig = signal.get(s.id)
    if (sig?.clicked) return 'clicked'
    if (sig?.opened) return 'opened'
    if (sig?.unsub) return 'unsubscribed'
    if (s.status === 'sent') return 'delivered'
    return s.status // bounced | complained | failed | queued
  }

  const data = rows.map((s) => ({
    sendId: s.id,
    email: emailById.get(s.contact_id) ?? '—',
    status: statusFor(s),
    at: latest.get(s.id) ?? s.sent_at,
  }))

  return { data, total: count ?? 0, page, limit }
})
