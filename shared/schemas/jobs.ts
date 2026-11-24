import { z } from 'zod'

/**
 * BullMQ job payloads. The web service enqueues these; the worker consumes
 * them. Validating on both sides keeps the queue contract honest.
 */

/** `campaign.dispatch` — fan-out job: read recipients, enqueue per-send jobs. */
export const campaignDispatchJobSchema = z.object({
  campaignId: z.string().uuid(),
})
export type CampaignDispatchJob = z.infer<typeof campaignDispatchJobSchema>

/** `email.send` — one job per recipient. */
export const emailSendJobSchema = z.object({
  sendId: z.string().uuid(),
  campaignId: z.string().uuid(),
  contactId: z.string().uuid(),
  to: z.string().email(),
  subject: z.string(),
  html: z.string(),
  fromName: z.string(),
  fromEmail: z.string().email(),
  /**
   * This send's `/t/u/:token` URL, advertised in the List-Unsubscribe headers.
   * Absent when dispatch ran without a public APP_URL (no tracking tokens), and
   * on jobs enqueued before the field existed.
   */
  unsubscribeUrl: z.string().url().optional(),
})
export type EmailSendJob = z.infer<typeof emailSendJobSchema>

export const QUEUE_NAMES = {
  campaignDispatch: 'campaign.dispatch',
  emailSend: 'email.send',
} as const

/**
 * Deterministic BullMQ job id for a campaign's dispatch job.
 *
 * BullMQ de-duplicates on job id while a job exists, so the web producer, the
 * scheduler and the worker's recovery sweep can all enqueue the same campaign
 * without ever fanning it out twice. `removeOnComplete` frees the id after a
 * successful dispatch; the worker's terminal-failure handler removes the job
 * after recording the failure, so a dead job can't block a later retry.
 */
export function dispatchJobId(campaignId: string): string {
  return `dispatch:${campaignId}`
}

/**
 * Shared enqueue options for `campaign.dispatch`. Used by every producer so a
 * dispatch retries the same way wherever it was triggered from. Dispatch is the
 * single point of failure for a whole campaign, so unlike the old
 * single-attempt default it retries with backoff before giving up.
 */
export const DISPATCH_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: false,
} as const
