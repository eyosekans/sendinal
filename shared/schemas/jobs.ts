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
