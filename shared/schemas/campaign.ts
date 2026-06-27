import { z } from 'zod'
import { segmentRulesSchema } from './segment'
import { abVariantsSchema } from './ab'

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
  // Drafts may start with no subject (the builder autosaves before it's typed);
  // a subject is only meaningful at send time.
  subject: z.string().trim().max(300).default(''),
  fromName: z.string().trim().min(1).max(200).optional(),
  fromEmail: z.string().trim().toLowerCase().email().optional(),
  // html/design come from the Unlayer editor (Phase 2.1); empty for a bare draft.
  html: z.string().default(''),
  design: z.record(z.string(), z.unknown()).default({}),
  listId: z.string().uuid().optional(),
  // Source template this campaign was created from (if any). The campaign keeps
  // its own copied html/design, so this is just a back-reference.
  templateId: z.string().uuid().optional(),
  // Structured AND-rules (task 3.2). A legacy `{}` parses to an empty segment.
  segmentRules: segmentRulesSchema.default({ match: 'all', rules: [] }),
  // Subject-line A/B variants (task 3.3); empty = no test.
  abVariants: abVariantsSchema,
})
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>

/** Payload for updating a draft campaign (PATCH /api/campaigns/:id). */
export const updateCampaignSchema = createCampaignSchema.partial().extend({
  // The only status transition allowed through PATCH is cancelling a
  // draft/scheduled campaign. All other transitions go through dedicated routes.
  status: z.literal('cancelled').optional(),
})
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>

/** Payload for scheduling a campaign (POST /api/campaigns/:id/schedule). */
export const scheduleCampaignSchema = z.object({
  // ISO 8601 instant (UTC `Z` or with an offset); must be in the future.
  scheduledAt: z.string().datetime({ offset: true }),
})
export type ScheduleCampaignInput = z.infer<typeof scheduleCampaignSchema>

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
