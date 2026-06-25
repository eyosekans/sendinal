import { supabaseAdmin } from '~~/server/utils/supabaseAdmin'

/**
 * Nitro plugin: every 60s, dispatch campaigns whose `scheduled_at` is due.
 *
 * Each due campaign is claimed atomically (`scheduled` → `sending` guarded by a
 * status-matched UPDATE), so concurrent web replicas can't double-dispatch; the
 * winner enqueues a `campaign.dispatch` job for the worker (same path as an
 * immediate send). On enqueue failure the claim is rolled back to `scheduled`.
 *
 * Disabled when Redis isn't configured (local dev without a queue) or via
 * NUXT_SCHEDULER_DISABLED=true.
 */
export default defineNitroPlugin((nitroApp) => {
  if (process.env.NUXT_SCHEDULER_DISABLED === 'true') {
    console.log('[scheduler] disabled via NUXT_SCHEDULER_DISABLED')
    return
  }
  const redis = process.env.REDIS_URL ?? process.env.NUXT_REDIS_URL
  if (!redis) {
    console.log('[scheduler] disabled (REDIS_URL not set)')
    return
  }

  let running = true

  async function tick(): Promise<void> {
    const db = supabaseAdmin()
    const { data: due, error } = await db
      .from('campaigns')
      .select('id')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .limit(50)
    if (error) throw error

    for (const c of due ?? []) {
      // Atomic claim — only one worker/replica wins this row.
      const { data: claimed, error: claimErr } = await db
        .from('campaigns')
        .update({ status: 'sending', updated_at: new Date().toISOString() })
        .eq('id', c.id)
        .eq('status', 'scheduled')
        .select('id')
        .maybeSingle()
      if (claimErr) {
        console.error('[scheduler] claim failed', c.id, claimErr.message)
        continue
      }
      if (!claimed) continue // someone else claimed it

      try {
        await getCampaignDispatchQueue().add(
          'dispatch',
          { campaignId: c.id },
          { removeOnComplete: true, removeOnFail: false },
        )
        console.log(`[scheduler] dispatched scheduled campaign ${c.id}`)
      } catch (err) {
        // Couldn't enqueue — return it to the schedule for the next tick.
        await db
          .from('campaigns')
          .update({ status: 'scheduled' })
          .eq('id', c.id)
        console.error('[scheduler] enqueue failed, rolled back', c.id, err)
      }
    }
  }

  const timer = setInterval(() => {
    if (running)
      void tick().catch((err) => console.error('[scheduler] tick error', err))
  }, 60_000)

  // First sweep shortly after boot (don't wait a full minute).
  const boot = setTimeout(() => {
    if (running)
      void tick().catch((err) => console.error('[scheduler] tick error', err))
  }, 5_000)

  console.log('[scheduler] started — dispatching due campaigns every 60s')

  nitroApp.hooks.hook('close', () => {
    running = false
    clearInterval(timer)
    clearTimeout(boot)
  })
})
