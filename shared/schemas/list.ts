import { z } from 'zod'

/**
 * Supported custom-attribute field types. Drives how the dynamic contact form
 * renders an input and how the 3.2 segment builder will offer operators
 * (e.g. `number`/`date` get greater_than/less_than).
 */
export const attributeFieldTypeSchema = z.enum([
  'text',
  'number',
  'date',
  'boolean',
  'select',
])
export type AttributeFieldType = z.infer<typeof attributeFieldTypeSchema>

/**
 * A single custom-attribute definition on a list. `key` is the JSONB key stored
 * under `contacts.attributes`; `label` is what the UI shows; `options` applies
 * only to `select` fields.
 */
export const attributeFieldSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(
        /^[a-zA-Z][a-zA-Z0-9_]*$/,
        'Key must start with a letter and contain only letters, numbers, or underscores',
      ),
    label: z.string().trim().min(1).max(60),
    type: attributeFieldTypeSchema.default('text'),
    options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  })
  .refine((f) => f.type !== 'select' || (f.options?.length ?? 0) > 0, {
    message: 'Select fields need at least one option',
    path: ['options'],
  })
export type AttributeField = z.infer<typeof attributeFieldSchema>

/**
 * A list's full attribute schema: an array of field definitions with unique
 * keys (case-insensitive).
 */
export const attributeSchemaSchema = z
  .array(attributeFieldSchema)
  .max(50)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>()
    fields.forEach((f, i) => {
      const k = f.key.toLowerCase()
      if (seen.has(k)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate attribute key: ${f.key}`,
          path: [i, 'key'],
        })
      }
      seen.add(k)
    })
  })
export type AttributeSchema = z.infer<typeof attributeSchemaSchema>

/** Payload accepted when creating a list (POST /api/lists). */
export const createListSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  attributeSchema: attributeSchemaSchema.default([]),
})
export type CreateListInput = z.infer<typeof createListSchema>

/** Payload accepted when updating a list (PATCH /api/lists/:id). */
export const updateListSchema = createListSchema.partial()
export type UpdateListInput = z.infer<typeof updateListSchema>

/** Payload for adding contacts to a list (POST /api/lists/:id/contacts). */
export const addContactsToListSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(10000),
})
export type AddContactsToListInput = z.infer<typeof addContactsToListSchema>
