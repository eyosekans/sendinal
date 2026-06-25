import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * GET /api/campaigns/:id/links
 * Top clicked links: groups the campaign's `clicked` events by destination URL
 * with total clicks and unique-recipient clicks, sorted by total (top 10).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid campaign id' })
  }

  const supabase = await serverSupabaseClient<Database>(event)

  const { data: sendRows, error: sErr } = await supabase
    .from('sends')
    .select('id')
    .eq('campaign_id', id)
  if (sErr) throw createError({ statusCode: 500, statusMessage: sErr.message })
  const sendIds = (sendRows ?? []).map((s) => s.id)

  if (!sendIds.length) return { links: [] }

  const { data: clicks, error: eErr } = await supabase
    .from('email_events')
    .select('send_id, url')
    .in('send_id', sendIds)
    .eq('type', 'clicked')
  if (eErr) throw createError({ statusCode: 500, statusMessage: eErr.message })

  const totals = new Map<string, number>()
  const uniques = new Map<string, Set<string>>()
  for (const c of clicks ?? []) {
    if (!c.url) continue
    totals.set(c.url, (totals.get(c.url) ?? 0) + 1)
    if (!uniques.has(c.url)) uniques.set(c.url, new Set())
    uniques.get(c.url)!.add(c.send_id)
  }

  const links = [...totals.entries()]
    .map(([url, total]) => ({ url, total, unique: uniques.get(url)!.size }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  return { links }
})
