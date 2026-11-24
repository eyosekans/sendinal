import { supabase } from './supabase.ts'

/**
 * Mark a send as permanently failed (after BullMQ exhausts its retries).
 */
export async function markSendFailed(sendId: string, error: string) {
  await supabase
    .from('sends')
    .update({ status: 'failed', error: error.slice(0, 1000) })
    .eq('id', sendId)
}

/**
 * Flip a campaign out of `sending` once none of its sends are still `queued`.
 * A failed send counts as "done", so a campaign with some failures still
 * finalizes. Idempotent — only updates while the campaign is `sending`.
 *
 * `sent` means "this campaign reached recipients". When every single send
 * failed (a misconfigured sender identity, say) the campaign is marked `failed`
 * instead: reporting a campaign where nothing left the building as `sent` hides
 * exactly the outage an operator needs to see. A campaign with no eligible
 * recipients has nothing to fail, so it still finalizes as `sent`.
 */
export async function finalizeCampaignIfComplete(campaignId: string) {
  const { count, error } = await supabase
    .from('sends')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'queued')
  if (error) throw error
  if ((count ?? 0) !== 0) return

  // Did anything actually reach SES? Bounced/complained/suppressed all mean the
  // message was accepted and handed over, so they count as delivered attempts.
  const [{ count: total, error: tErr }, { count: accepted, error: aErr }] =
    await Promise.all([
      supabase
        .from('sends')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId),
      supabase
        .from('sends')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('status', ['sent', 'bounced', 'complained', 'suppressed']),
    ])
  if (tErr) throw tErr
  if (aErr) throw aErr

  const allFailed = (total ?? 0) > 0 && (accepted ?? 0) === 0

  await supabase
    .from('campaigns')
    .update(
      allFailed
        ? { status: 'failed' }
        : { status: 'sent', sent_at: new Date().toISOString() },
    )
    .eq('id', campaignId)
    .eq('status', 'sending')
}
