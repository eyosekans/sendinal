import { z } from 'zod'

export const campaignStatusSchema = z.enum([
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled',
  'failed',
])
export type CampaignStatus = z.infer<typeof campaignStatusSchema>

/** Payload for creating a draft campaign (POST /api/campaigns). */
export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(300),
  fromName: z.string().trim().min(1).max(200).optional(),
  fromEmail: z.string().trim().toLowerCase().email().optional(),
  // html/design come from the Unlayer editor (Phase 2.1); empty for a bare draft.
  html: z.string().default(''),
  design: z.record(z.string(), z.unknown()).default({}),
  listId: z.string().uuid().optional(),
  segmentRules: z.record(z.string(), z.unknown()).default({}),
})
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>

/** Payload for updating a draft campaign (PATCH /api/campaigns/:id). */
export const updateCampaignSchema = createCampaignSchema.partial()
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>

/** Query params for listing campaigns (GET /api/campaigns). */
export const listCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /** Case-insensitive substring match on name or subject. */
  search: z.string().trim().min(1).optional(),
  status: campaignStatusSchema.optional(),
  /** Sortable columns (derived columns are sorted client-side). */
  sort: z
    .enum(['name', 'status', 'sentDate', 'createdAt'])
    .default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
})
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>
