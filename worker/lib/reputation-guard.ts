import { supabase } from './supabase.ts'
import {
  computeReputation,
  REPUTATION_WINDOW_DAYS,
} from '../../shared/reputation.ts'

/**
 * Task 4.1 — SES reputation guard.
 *
 * Every 60s, measure the account-wide bounce/complaint rate over the rolling
 * window and, if either crosses its SES threshold (bounce > 2% / complaint >
 * 0.1%) with enough volume, flip every `sending` campaign to `paused`. The
 * `email.send` processor then skips any send whose campaign is no longer
 * `sending`, so the queued sends stop draining to SES almost immediately.
 *
 * Runs in the worker (a persistent process) alongside the scheduler + SQS
 * poller. Disabled via NUXT_REPUTATION_GUARD_DISABLED=true. Returns `stop()`.
 */
export function startReputationGuard(): { stop: () => void } {
  if (process.env.NUXT_REPUTATION_GUARD_DISABLED === 'true') {
    console.log('[reputation] disabled via NUXT_REPUTATION_GUARD_DISABLED')
    return { stop: () => {} }
  }

  let running = true

  async function tick(): Promise<void> {
    const since = new Date(
      Date.now() - REPUTATION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()

    // Count messages that left for SES in the window (head counts, no rows).
    // Bounced/complained sends keep their original `sent_at`, so the window
    // filter catches them.
    const [totalRes, bounceRes, complaintRes] = await Promise.all([
      supabase
        .from('sends')
        .select('*', { count: 'exact', head: true })
        .gte('sent_at', since)
        .in('status', ['sent', 'bounced', 'complained']),
      supabase
        .from('sends')
        .select('*', { count: 'exact', head: true })
        .gte('sent_at', since)
        .eq('status', 'bounced'),
      supabase
        .from('sends')
        .select('*', { count: 'exact', head: true })
        .gte('sent_at', since)
        .eq('status', 'complained'),
    ])
    for (const r of [totalRes, bounceRes, complaintRes]) {
      if (r.error) throw r.error
    }

    const rep = computeReputation({
      totalSent: totalRes.count ?? 0,
      bounced: bounceRes.count ?? 0,
      complained: complaintRes.count ?? 0,
    })
    if (!rep.bounceExceeded && !rep.complaintExceeded) return

    // Halt anything currently sending. (Queued sends linger as `queued` — the
    // campaign can be re-dispatched once reputation recovers.)
    const { data: paused, error } = await supabase
      .from('campaigns')
      .update({ status: 'paused' })
      .eq('status', 'sending')
      .select('id, name, created_by')
    if (error) throw error
    if (!paused?.length) return

    // Task 4.2 — in-app alert to each paused campaign's creator. The guard only
    // pauses on the healthy→exceeded transition (paused campaigns are no longer
    // `sending`), so this fires once per breach, not every tick.
    const notifications = paused
      .filter((c) => c.created_by)
      .map((c) => ({
        user_id: c.created_by as string,
        type: 'reputation_paused',
        severity: 'critical' as const,
        title: 'Campaign paused — deliverability at risk',
        body:
          `"${c.name}" was paused automatically. The account's ${rep.windowDays}-day ` +
          `bounce rate is ${rep.bounceRate ?? 0}% and complaint rate ${rep.complaintRate ?? 0}% ` +
          `(SES limits ${rep.bounceThreshold}% / ${rep.complaintThreshold}%). ` +
          `Sending stops until your rates recover.`,
        campaign_id: c.id,
        metadata: {
          bounceRate: rep.bounceRate,
          complaintRate: rep.complaintRate,
          bounceThreshold: rep.bounceThreshold,
          complaintThreshold: rep.complaintThreshold,
          windowDays: rep.windowDays,
        },
      }))
    if (notifications.length) {
      const { error: nErr } = await supabase
        .from('notifications')
        .insert(notifications)
      if (nErr)
        console.error('[reputation] failed to write notifications:', nErr.message)
    }

    console.warn(
      `[reputation] threshold exceeded (bounce ${rep.bounceRate}% / complaint ${rep.complaintRate}% over ${rep.totalSent} sends) — paused ${paused.length} campaign(s), notified ${notifications.length}`,
    )
  }

  const timer = setInterval(() => {
    if (running)
      void tick().catch((err) => console.error('[reputation] tick error', err))
  }, 60_000)

  // First sweep shortly after boot (don't wait a full minute).
  const boot = setTimeout(() => {
    if (running)
      void tick().catch((err) => console.error('[reputation] tick error', err))
  }, 8_000)

  console.log(
    `[reputation] started — auto-pause guard checking every 60s (${REPUTATION_WINDOW_DAYS}-day window)`,
  )

  return {
    stop: () => {
      running = false
      clearInterval(timer)
      clearTimeout(boot)
    },
  }
}
