import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * DELETE /api/campaigns/:id
 * Permanently delete a campaign. Its sends, email_events, and tracking_tokens
 * are removed via ON DELETE CASCADE.
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
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  }

  return { id: data.id, deleted: true }
})
