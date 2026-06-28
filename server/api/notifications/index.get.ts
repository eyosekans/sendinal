import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

/**
 * GET /api/notifications
 * The signed-in user's notification feed (newest first) + unread count. RLS
 * scopes both queries to `user_id = auth.uid()`, so a user only ever sees their
 * own alerts (task 4.2).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const supabase = await serverSupabaseClient<Database>(event)

  const [listRes, unreadRes] = await Promise.all([
    supabase
      .from('notifications')
      .select(
        'id, type, severity, title, body, campaign_id, metadata, read_at, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .is('read_at', null),
  ])
  if (listRes.error)
    throw createError({ statusCode: 500, statusMessage: listRes.error.message })
  if (unreadRes.error)
    throw createError({ statusCode: 500, statusMessage: unreadRes.error.message })

  return { data: listRes.data ?? [], unread: unreadRes.count ?? 0 }
})
