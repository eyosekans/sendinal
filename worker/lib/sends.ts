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
 * Flip a campaign to `sent` once none of its sends are still `queued`. A
 * failed send also counts as "done", so a campaign with some failures still
 * finalizes. Idempotent — only updates while the campaign is `sending`.
 */
export async function finalizeCampaignIfComplete(campaignId: string) {
  const { count, error } = await supabase
    .from('sends')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'queued')
  if (error) throw error

  if ((count ?? 0) === 0) {
    await supabase
      .from('campaigns')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('status', 'sending')
  }
}
