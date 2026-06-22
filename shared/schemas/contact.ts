import { z } from 'zod'

export const contactStatusSchema = z.enum([
  'active',
  'unsubscribed',
  'bounced',
  'complained',
])
export type ContactStatus = z.infer<typeof contactStatusSchema>

/** Payload accepted when creating a contact (POST /api/contacts). */
export const createContactSchema = z.object({
  email: z.string().email(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
})
export type CreateContactInput = z.infer<typeof createContactSchema>

/** Payload accepted when updating a contact (PATCH /api/contacts/:id). */
export const updateContactSchema = createContactSchema.partial().extend({
  status: contactStatusSchema.optional(),
})
export type UpdateContactInput = z.infer<typeof updateContactSchema>
