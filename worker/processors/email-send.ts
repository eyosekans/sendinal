import type { Job } from 'bullmq'
import { UnrecoverableError } from 'bullmq'
import { emailSendJobSchema } from '../../shared/schemas/jobs.ts'
import { supabase } from '../lib/supabase.ts'
import { sendEmail } from '../lib/ses.ts'
import { finalizeCampaignIfComplete } from '../lib/sends.ts'

/**
 * Per-recipient send: calls SES and records the result on the `sends` row.
 * Throws on failure so BullMQ retries (exponential backoff, max attempts set on
 * the job). Terminal failure handling (after retries are exhausted) lives in
 * the worker's `failed` event in index.ts.
 *
 * Retries are for *transient* trouble (throttling, a network blip, a 5xx).
 * A rejection SES will repeat verbatim — an unverified sender identity, a
 * suspended account, a payload that fails validation — is thrown as an
 * `UnrecoverableError` so the send is recorded as failed at once instead of
 * occupying the SES rate limit for three attempts per recipient.
 */

/** SES/BullMQ error names that will never succeed on a retry. */
const PERMANENT_SES_ERRORS = new Set([
  'MessageRejected',
  'MailFromDomainNotVerifiedException',
  'AccountSuspendedException',
  'SendingPausedException',
  'BadRequestException',
])

function isPermanent(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? ''
  const message = (err as { message?: string })?.message ?? ''
  return (
    PERMANENT_SES_ERRORS.has(name) ||
    /not verified|no longer verified/i.test(message)
  )
}

export async function processEmailSend(job: Job) {
  // A payload that fails validation cannot be fixed by retrying it.
  const parsed = emailSendJobSchema.safeParse(job.data)
  if (!parsed.success) {
    throw new UnrecoverableError(
      `invalid email.send payload: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    )
  }
  const data = parsed.data

  // Idempotency: if a prior attempt already marked this send done, skip.
  const { data: send } = await supabase
    .from('sends')
    .select('status')
    .eq('id', data.sendId)
    .maybeSingle()
  if (!send || send.status === 'sent') return

  // Stop sending if the campaign was paused (reputation guard, task 4.1) or
  // cancelled while its jobs were still draining — the send stays `queued` so a
  // re-dispatch can resume it.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('status')
    .eq('id', data.campaignId)
    .maybeSingle()
  if (!campaign || campaign.status !== 'sending') {
    console.log(
      `[email.send] skip ${data.sendId} — campaign ${campaign?.status ?? 'missing'}`,
    )
    return
  }

  let messageId: string
  try {
    messageId = await sendEmail({
      to: data.to,
      subject: data.subject,
      html: data.html,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      unsubscribeUrl: data.unsubscribeUrl,
    })
  } catch (err) {
    if (isPermanent(err)) {
      throw new UnrecoverableError((err as Error).message)
    }
    throw err
  }

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
