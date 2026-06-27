import { z } from 'zod'

/**
 * Subject-line A/B testing (task 3.3). Kept in its own zod-only module (no
 * relative imports) so the worker can import it directly under NodeNext without
 * the extension conflict that `campaign.ts` (which imports `./segment`) would
 * trigger.
 *
 * Variant A is the campaign's own `subject`; `ab_variants` holds the extra
 * variant (B) as `[{ subject, weight }]`, where `weight` is B's percentage
 * share (1–99) of recipients — A gets the remainder. An empty array = no test.
 */
export const abVariantSchema = z.object({
  subject: z.string().trim().min(1).max(300),
  weight: z.number().int().min(1).max(99),
})
export type AbVariant = z.infer<typeof abVariantSchema>

export const abVariantsSchema = z.array(abVariantSchema).max(1).default([])
export type AbVariants = z.infer<typeof abVariantsSchema>
