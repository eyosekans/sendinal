import type { Job } from 'bullmq'
import { Queue } from 'bullmq'
import {
  campaignDispatchJobSchema,
  QUEUE_NAMES,
} from '../../shared/schemas/jobs.ts'
import type { EmailSendJob } from '../../shared/schemas/jobs.ts'
import { connection } from '../queues/connection.ts'
import { supabase } from '../lib/supabase.ts'
import { finalizeCampaignIfComplete } from '../lib/sends.ts'

const MAX_ATTEMPTS = 3

/**
 * Fan-out processor: reads a campaign's recipients (list members that are
 * active and not deleted), creates one `sends` row per recipient, and enqueues
 * an `email.send` job for each.
 *
 * Tracking-token injection (open pixel, click rewrite, unsubscribe) is Phase
 * 2.3–2.5; this sends the campaign HTML as-is.
 */
export async function processCampaignDispatch(job: Job) {
  const { campaignId } = campaignDispatchJobSchema.parse(job.data)
  console.log(`[campaign.dispatch] campaign ${campaignId}`)

  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('id, subject, html, from_name, from_email, list_id, status')
    .eq('id', campaignId)
    .single()
  if (cErr || !campaign) throw new Error(`campaign ${campaignId} not found`)
  if (!campaign.list_id) throw new Error(`campaign ${campaignId} has no list`)

  // Resolve recipients: list members that are still sendable.
  const { data: members, error: mErr } = await supabase
    .from('list_contacts')
    .select('contact_id')
    .eq('list_id', campaign.list_id)
  if (mErr) throw mErr

  const memberIds = (members ?? []).map((m) => m.contact_id)
  if (memberIds.length === 0) {
    await finalizeCampaignIfComplete(campaignId)
    console.log(`[campaign.dispatch] campaign ${campaignId}: no members`)
    return
  }

  const { data: contacts, error: ctErr } = await supabase
    .from('contacts')
    .select('id, email')
    .in('id', memberIds)
    .eq('status', 'active')
    .is('deleted_at', null)
  if (ctErr) throw ctErr

  if (!contacts || contacts.length === 0) {
    await finalizeCampaignIfComplete(campaignId)
    console.log(
      `[campaign.dispatch] campaign ${campaignId}: no eligible contacts`,
    )
    return
  }

  // Create all sends in one insert, then enqueue jobs in bulk.
  const { data: inserted, error: insErr } = await supabase
    .from('sends')
    .insert(
      contacts.map((c) => ({
        campaign_id: campaignId,
        contact_id: c.id,
        status: 'queued' as const,
      })),
    )
    .select('id, contact_id')
  if (insErr) throw insErr

  const emailByContact = new Map(contacts.map((c) => [c.id, c.email]))
  const emailQueue = new Queue(QUEUE_NAMES.emailSend, { connection })
  try {
    const jobs = (inserted ?? []).map((s) => {
      const data: EmailSendJob = {
        sendId: s.id,
        campaignId,
        contactId: s.contact_id,
        to: emailByContact.get(s.contact_id)!,
        subject: campaign.subject,
        html: campaign.html,
        fromName: campaign.from_name,
        fromEmail: campaign.from_email,
      }
      return {
        name: 'send',
        data,
        opts: {
          attempts: MAX_ATTEMPTS,
          backoff: { type: 'exponential' as const, delay: 5000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      }
    })
    await emailQueue.addBulk(jobs)
  } finally {
    await emailQueue.close()
  }

  console.log(
    `[campaign.dispatch] campaign ${campaignId}: enqueued ${inserted?.length ?? 0} sends`,
  )
}
