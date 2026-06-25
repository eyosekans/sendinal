import { z } from 'zod'

/**
 * Reusable email template (Unlayer design + exported HTML). Saved from the
 * campaign builder and loaded back into the editor when starting a campaign.
 */

/** Payload for saving a template (POST /api/templates). */
export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(300),
  // Exported HTML and the Unlayer design JSON that produced it.
  html: z.string().min(1),
  design: z.record(z.string(), z.unknown()),
})
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>

/** Payload for updating a template (PATCH /api/templates/:id). */
export const updateTemplateSchema = createTemplateSchema.partial()
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>

/** Query params for listing templates (GET /api/templates). */
export const listTemplatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Case-insensitive substring match on name. */
  search: z.string().trim().min(1).optional(),
})
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>
