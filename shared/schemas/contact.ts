import { z } from 'zod'

export const contactStatusSchema = z.enum([
  'active',
  'unsubscribed',
  'bounced',
  'complained',
])
export type ContactStatus = z.infer<typeof contactStatusSchema>

const contactFieldsSchema = z.object({
  // Normalised to lowercase so the UNIQUE(email) constraint dedupes reliably.
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
})

/**
 * Payload accepted when creating a contact (POST /api/contacts). With `listId`,
 * the contact is also added to that list — and an already-existing email is
 * updated instead of rejected (solo add must not force a CSV import).
 */
export const createContactSchema = contactFieldsSchema.extend({
  listId: z.string().uuid().optional(),
})
export type CreateContactInput = z.infer<typeof createContactSchema>

/** Payload accepted when updating a contact (PATCH /api/contacts/:id). */
export const updateContactSchema = contactFieldsSchema.partial().extend({
  status: contactStatusSchema.optional(),
})
export type UpdateContactInput = z.infer<typeof updateContactSchema>

/** Query params for listing contacts (GET /api/contacts). */
export const listContactsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /** Case-insensitive substring match on email, first or last name. */
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

/** Query params for per-status counts (GET /api/contacts/stats). */
export const contactStatsQuerySchema = z.object({
  /** Count only members of this list. */
  listId: z.string().uuid().optional(),
  /** Count only contacts matching this search (same match as GET /api/contacts). */
  search: z.string().trim().min(1).optional(),
})

/** Loose email format check (matches the wizard's client-side validation). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** How to handle a row whose email already exists. */
export const duplicateStrategySchema = z.enum(['update', 'skip'])
export type DuplicateStrategy = z.infer<typeof duplicateStrategySchema>

/* ---------------------------------------------------------------------------
 * Amazon SES email validation (SESv2 `GetEmailAddressInsights`)
 * ------------------------------------------------------------------------- */

/** SES answers every check with a confidence level, never a boolean. */
export const validationVerdictSchema = z.enum(['HIGH', 'MEDIUM', 'LOW'])
export type ValidationVerdict = z.infer<typeof validationVerdictSchema>

/**
 * The six checks `GetEmailAddressInsights` performs, camelCased from the API's
 * `MailboxValidation.Evaluations`. All optional — SES omits a check it could
 * not run (e.g. no DNS answer for the domain).
 */
export const emailValidationChecksSchema = z
  .object({
    hasValidSyntax: validationVerdictSchema,
    hasValidDnsRecords: validationVerdictSchema,
    mailboxExists: validationVerdictSchema,
    isRoleAddress: validationVerdictSchema,
    isDisposable: validationVerdictSchema,
    isRandomInput: validationVerdictSchema,
  })
  .partial()
export type EmailValidationChecks = z.infer<typeof emailValidationChecksSchema>

/** One address's validation result, as stored on `contacts` and echoed to the UI. */
export const emailValidationSchema = z.object({
  /** `MailboxValidation.IsValid` — the overall delivery-likelihood rollup. */
  isValid: validationVerdictSchema,
  checks: emailValidationChecksSchema.default({}),
  /** When SES produced this result (ISO 8601); drives cache expiry. */
  checkedAt: z.string().datetime(),
})
export type EmailValidation = z.infer<typeof emailValidationSchema>

/**
 * What the import should do with an address SES flags as risky.
 *   off  — don't call SES at all
 *   flag — import it, but mark `email_unverified` (excluded from sending)
 *   skip — leave it out of the import entirely
 */
export const validationPolicySchema = z.enum(['off', 'flag', 'skip'])
export type ValidationPolicy = z.infer<typeof validationPolicySchema>

/** Body for POST /api/contacts/validate — one wizard batch of addresses. */
export const validateEmailsSchema = z.object({
  emails: z
    .array(z.string().trim().toLowerCase().min(1).max(320))
    .min(1)
    .max(500),
})
export type ValidateEmailsInput = z.infer<typeof validateEmailsSchema>

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
    /**
     * SES verdict for this address, as returned by POST /api/contacts/validate.
     * Absent when validation was off, unavailable, or skipped for this row.
     * The server re-derives the flag/skip decision from it — it never trusts
     * `emailUnverified` alone to represent a validation outcome.
     */
    validation: emailValidationSchema.optional(),
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
  validationPolicy: validationPolicySchema.default('off'),
  contacts: z.array(importContactSchema).min(1).max(10000),
})
export type ImportContactsInput = z.infer<typeof importContactsSchema>

/** Body for POST /api/contacts/import-check — dry-run new vs existing split. */
export const importCheckSchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().min(1)).min(1).max(10000),
})
export type ImportCheckInput = z.infer<typeof importCheckSchema>
