import { z } from 'zod'

/** Payload accepted when creating a list (POST /api/lists). */
export const createListSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
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
