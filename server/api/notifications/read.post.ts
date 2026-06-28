import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'

const bodySchema = z.object({
  /** Mark one notification read; omit to mark all of the user's unread read. */
  id: z.string().uuid().optional(),
})

/**
 * POST /api/notifications/read
 * Mark the given notification read, or all of the user's unread when `id` is
 * omitted. RLS limits the update to the caller's own rows (task 4.2).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }

  const supabase = await serverSupabaseClient<Database>(event)
  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  if (parsed.data.id) query = query.eq('id', parsed.data.id)

  const { error } = await query
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { ok: true }
})
