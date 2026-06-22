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
})
export type EmailSendJob = z.infer<typeof emailSendJobSchema>

export const QUEUE_NAMES = {
  campaignDispatch: 'campaign.dispatch',
  emailSend: 'email.send',
} as const
