import type { Queue } from 'bullmq'
import { supabase } from './supabase.ts'
import { finalizeCampaignIfComplete } from './sends.ts'
import {
  DISPATCH_JOB_OPTS,
  dispatchJobId,
} from '../../shared/schemas/jobs.ts'

/**
 * Recovery sweep for campaigns wedged in `sending`.
 *
 * Why this exists: the web app (Vercel) enqueues `campaign.dispatch` over the
 * public internet to Railway's Redis. That hop is the one part of the chain
 * that can fail while every service still reports healthy — Railway tears down
 * the Redis TCP proxy when a project is suspended (failed payment), which is
 * exactly how a campaign ended up `sending` with zero sends and no job in the
 * queue. The worker, however, reaches Redis on the private network, so it can
 * always enqueue. This sweep therefore treats the `campaigns` row — not the
 * queue — as the durable record of intent and repairs the queue from it.
 *
 * Safety: the sweep only re-dispatches a campaign with **zero** `sends` rows.
 * `processCampaignDispatch` inserts every send row in a single statement before
 * it enqueues a single `email.send` job, so "no sends" proves no message has
 * reached SES and a re-dispatch cannot duplicate mail. Campaigns that already
 * have sends are never re-dispatched: they are either finalized (when nothing
 * is left `queued`) or flagged for a human.
 *
 * Disabled via NUXT_DISPATCH_RECOVERY_DISABLED=true. Returns a `stop()`.
 */

/** How long a campaign may sit in `sending` before the sweep touches it. */
const STALE_AFTER_MS = 90_000
/**
 * Upper bound: beyond this a campaign is a historical anomaly, not an in-flight
 * send, so the sweep reports it instead of silently mailing a list that may be
 * weeks out of date.
 */
const TOO_OLD_MS = 24 * 60 * 60 * 1000
const TICK_MS = 60_000

type StuckCampaign = {
  id: string
  name: string | null
  created_by: string | null
  updated_at: string
}

/**
 * Alert the campaign's creator, at most once per campaign per alert type. The
 * sweep re-examines a stalled campaign every tick (its status never changes),
 * so without this guard it would refill the notification feed every minute.
 */
async function notify(
  campaign: StuckCampaign,
  type: string,
  title: string,
  body: string,
  severity: 'info' | 'warning' | 'critical',
) {
  if (!campaign.created_by) return

  const { count, error: existsErr } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('type', type)
  if (existsErr) {
    console.error('[recovery] notification lookup failed:', existsErr.message)
    return
  }
  if ((count ?? 0) > 0) return

  const { error } = await supabase.from('notifications').insert({
    user_id: campaign.created_by,
    type,
    severity,
    title,
    body,
    campaign_id: campaign.id,
  })
  if (error) console.error('[recovery] notification insert failed:', error.message)
}

export function startDispatchRecovery(dispatchQueue: Queue): {
  stop: () => void
} {
  if (process.env.NUXT_DISPATCH_RECOVERY_DISABLED === 'true') {
    console.log('[recovery] disabled via NUXT_DISPATCH_RECOVERY_DISABLED')
    return { stop: () => {} }
  }

  let running = true

  async function tick(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString()

    const { data: stuck, error } = await supabase
      .from('campaigns')
      .select('id, name, created_by, updated_at')
      .eq('status', 'sending')
      .lt('updated_at', staleBefore)
      .order('updated_at', { ascending: true })
      .limit(20)
    if (error) throw error
    if (!stuck?.length) return

    for (const campaign of stuck as StuckCampaign[]) {
      const ageMs = Date.now() - new Date(campaign.updated_at).getTime()

      // How far did this campaign actually get?
      const [{ count: total, error: tErr }, { count: queued, error: qErr }] =
        await Promise.all([
          supabase
            .from('sends')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id),
          supabase
            .from('sends')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id)
            .eq('status', 'queued'),
        ])
      if (tErr) throw tErr
      if (qErr) throw qErr

      // Case 1 — fan-out never ran. Nothing was mailed, so re-dispatching is
      // safe. The deterministic job id makes this a no-op if a dispatch job is
      // already waiting, active or delayed.
      if ((total ?? 0) === 0) {
        if (ageMs > TOO_OLD_MS) {
          console.warn(
            `[recovery] campaign ${campaign.id} has been sending for ${Math.round(ageMs / 3_600_000)}h with no sends — leaving it for review`,
          )
          continue
        }
        try {
          const job = await dispatchQueue.add(
            'dispatch',
            { campaignId: campaign.id },
            { ...DISPATCH_JOB_OPTS, jobId: dispatchJobId(campaign.id) },
          )
          const state = await job.getState()
          if (state === 'waiting' || state === 'delayed' || state === 'active') {
            console.log(
              `[recovery] re-dispatched campaign ${campaign.id} (stuck ${Math.round(ageMs / 1000)}s, 0 sends, job ${state})`,
            )
          }
        } catch (err) {
          console.error(
            `[recovery] re-dispatch failed for ${campaign.id}:`,
            (err as Error).message,
          )
        }
        continue
      }

      // Case 2 — every send reached a terminal state but the campaign was never
      // finalized (e.g. the worker died between the last send and the flip).
      if ((queued ?? 0) === 0) {
        await finalizeCampaignIfComplete(campaign.id)
        console.log(
          `[recovery] finalized campaign ${campaign.id} (${total} sends, none queued)`,
        )
        continue
      }

      // Case 3 — sends exist and some are still `queued`. Their `email.send`
      // jobs may have been lost, but re-creating them from here would risk
      // mailing recipients twice (the per-send job payload, with its tracking
      // tokens, is not reconstructible from the row). Deliberately a human
      // decision: report once and leave the data untouched.
      if (ageMs > TOO_OLD_MS) continue
      console.warn(
        `[recovery] campaign ${campaign.id} has ${queued}/${total} sends still queued after ${Math.round(ageMs / 1000)}s — needs review`,
      )
      await notify(
        campaign,
        'dispatch_stalled',
        'Campaign send stalled',
        `"${campaign.name ?? 'Untitled campaign'}" still has ${queued} of ${total} recipients queued. No mail is being sent for them. Check the worker logs before retrying — re-sending could deliver duplicates.`,
        'critical',
      )
    }
  }

  const timer = setInterval(() => {
    if (running)
      void tick().catch((err) => console.error('[recovery] tick error', err))
  }, TICK_MS)

  // First sweep shortly after boot — a restart is exactly when campaigns get
  // orphaned, so don't wait a full minute to look.
  const boot = setTimeout(() => {
    if (running)
      void tick().catch((err) => console.error('[recovery] tick error', err))
  }, 10_000)

  console.log(
    `[recovery] started — re-dispatching campaigns stuck in sending every ${TICK_MS / 1000}s`,
  )

  return {
    stop: () => {
      running = false
      clearInterval(timer)
      clearTimeout(boot)
    },
  }
}
