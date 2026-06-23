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
  // Normalised to lowercase so the UNIQUE(email) constraint dedupes reliably.
  email: z.string().trim().toLowerCase().email(),
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

/** Query params for listing contacts (GET /api/contacts). */
export const listContactsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /** Case-insensitive substring match on email. */
  search: z.string().trim().min(1).optional(),
  status: contactStatusSchema.optional(),
  /** Restrict to members of this list. */
  listId: z.string().uuid().optional(),
  /** Include soft-deleted contacts (deleted_at IS NOT NULL). Defaults to false. */
  includeDeleted: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>

/**
 * Bulk contact import (POST /api/contacts/import). The UI parses the CSV and
 * maps columns client-side, then posts the rows here. Existing emails are
 * updated (and soft-deleted ones restored); optionally all rows are added to
 * `listId`.
 */
export const importContactsSchema = z.object({
  listId: z.string().uuid().optional(),
  contacts: z.array(createContactSchema).min(1).max(10000),
})
export type ImportContactsInput = z.infer<typeof importContactsSchema>
