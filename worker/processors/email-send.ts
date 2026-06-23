import type { Job } from 'bullmq'
import { emailSendJobSchema } from '../../shared/schemas/jobs.ts'
import { supabase } from '../lib/supabase.ts'
import { sendEmail } from '../lib/ses.ts'
import { finalizeCampaignIfComplete } from '../lib/sends.ts'

/**
 * Per-recipient send: calls SES and records the result on the `sends` row.
 * Throws on failure so BullMQ retries (exponential backoff, max attempts set on
 * the job). Terminal failure handling (after retries are exhausted) lives in
 * the worker's `failed` event in index.ts.
 */
export async function processEmailSend(job: Job) {
  const data = emailSendJobSchema.parse(job.data)

  // Idempotency: if a prior attempt already marked this send done, skip.
  const { data: send } = await supabase
    .from('sends')
    .select('status')
    .eq('id', data.sendId)
    .maybeSingle()
  if (!send || send.status === 'sent') return

  const messageId = await sendEmail({
    to: data.to,
    subject: data.subject,
    html: data.html,
    fromName: data.fromName,
    fromEmail: data.fromEmail,
  })

  await supabase
    .from('sends')
    .update({
      status: 'sent',
      ses_message_id: messageId,
      sent_at: new Date().toISOString(),
    })
    .eq('id', data.sendId)

  await finalizeCampaignIfComplete(data.campaignId)
}
