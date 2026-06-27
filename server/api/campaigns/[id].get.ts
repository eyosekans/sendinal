import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * GET /api/campaigns/:id
 * Campaign details for the detail/stats page. Delivery counts come from the
 * sibling `/stats` endpoint.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid campaign id' })
  }

  const supabase = await serverSupabaseClient<Database>(event)

  const { data, error } = await supabase
    .from('campaigns')
    .select(
      'id, name, subject, from_name, from_email, html, design, status, list_id, template_id, segment_rules, ab_variants, scheduled_at, sent_at, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  }

  // Resolve the list name for display (campaigns may target no list).
  let listName: string | null = null
  if (data.list_id) {
    const { data: list } = await supabase
      .from('lists')
      .select('name')
      .eq('id', data.list_id)
      .maybeSingle()
    listName = list?.name ?? null
  }

  return { ...data, listName }
})
