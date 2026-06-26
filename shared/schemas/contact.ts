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

/** Loose email format check (matches the wizard's client-side validation). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** How to handle a row whose email already exists. */
export const duplicateStrategySchema = z.enum(['update', 'skip'])
export type DuplicateStrategy = z.infer<typeof duplicateStrategySchema>

/**
 * One row in a bulk import. Email is normally format-validated, but a row may
 * carry `emailUnverified: true` (the wizard's "import anyway and flag" option),
 * in which case a malformed address is allowed through and stored flagged.
 */
export const importContactSchema = z
  .object({
    email: z.string().trim().toLowerCase().min(1).max(320),
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    attributes: z.record(z.string(), z.unknown()).default({}),
    emailUnverified: z.boolean().default(false),
  })
  .superRefine((c, ctx) => {
    if (!c.emailUnverified && !EMAIL_RE.test(c.email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'Invalid email address',
      })
    }
  })
export type ImportContactInput = z.infer<typeof importContactSchema>

/**
 * Bulk contact import (POST /api/contacts/import). The wizard parses the CSV,
 * maps columns, and validates rows client-side, then posts the importable rows
 * here. `duplicateStrategy` decides what happens to emails that already exist;
 * if `listId` is given, every imported/updated contact is added to that list.
 */
export const importContactsSchema = z.object({
  listId: z.string().uuid().optional(),
  duplicateStrategy: duplicateStrategySchema.default('update'),
  contacts: z.array(importContactSchema).min(1).max(10000),
})
export type ImportContactsInput = z.infer<typeof importContactsSchema>

/** Body for POST /api/contacts/import-check — dry-run new vs existing split. */
export const importCheckSchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().min(1)).min(1).max(10000),
})
export type ImportCheckInput = z.infer<typeof importCheckSchema>
