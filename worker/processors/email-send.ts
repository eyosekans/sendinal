import type { Job } from 'bullmq'
import { emailSendJobSchema } from '../../shared/schemas/jobs.ts'

/**
 * Per-recipient send processor (Phase 1.7). Sends via SES and updates the
 * `sends` row. Stubbed for the Phase 1.1 scaffold.
 */
export async function processEmailSend(job: Job) {
  const data = emailSendJobSchema.parse(job.data)
  console.log(`[email.send] would send to ${data.to} (send ${data.sendId})`)
  // TODO(1.7): call worker/lib/ses, update sends.status + ses_message_id.
}
