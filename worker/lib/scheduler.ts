import type { Queue } from 'bullmq'
import { supabase } from './supabase.ts'

/**
 * Every 60s, dispatch campaigns whose `scheduled_at` is due. Runs in the worker
 * (a persistent process) so it survives a serverless web tier on Vercel — the
 * equivalent Nitro plugin was removed.
 *
 * Each due campaign is claimed atomically (`scheduled` → `sending`, guarded by a
 * status-matched UPDATE) so a restart/overlap can't double-dispatch; the winner
 * enqueues a `campaign.dispatch` job (same path as an immediate send). On enqueue
 * failure the claim is rolled back to `scheduled` for the next tick.
 *
 * Disabled via NUXT_SCHEDULER_DISABLED=true. Returns a `stop()` for shutdown.
 */
export function startScheduler(dispatchQueue: Queue): { stop: () => void } {
  if (process.env.NUXT_SCHEDULER_DISABLED === 'true') {
    console.log('[scheduler] disabled via NUXT_SCHEDULER_DISABLED')
    return { stop: () => {} }
  }

  let running = true

  async function tick(): Promise<void> {
    const { data: due, error } = await supabase
      .from('campaigns')
      .select('id')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .limit(50)
    if (error) throw error

    for (const c of due ?? []) {
      // Atomic claim — only one tick wins this row.
      const { data: claimed, error: claimErr } = await supabase
        .from('campaigns')
        .update({ status: 'sending' })
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
        await dispatchQueue.add(
          'dispatch',
          { campaignId: c.id },
          { removeOnComplete: true, removeOnFail: false },
        )
        console.log(`[scheduler] dispatched scheduled campaign ${c.id}`)
      } catch (err) {
        // Couldn't enqueue — return it to the schedule for the next tick.
        await supabase
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

  return {
    stop: () => {
      running = false
      clearInterval(timer)
      clearTimeout(boot)
    },
  }
}
