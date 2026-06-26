import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { importCheckSchema } from '#shared/schemas'

/**
 * POST /api/contacts/import-check
 * Dry-run lookup used by the wizard's Review step: given the candidate emails,
 * returns which already exist (so the client can split rows into New vs Update
 * and show accurate counts before importing). Read-only — writes nothing.
 *
 * Returns: { existing: string[] }  // lowercased emails that already exist
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const parsed = importCheckSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid payload',
      data: parsed.error.flatten(),
    })
  }

  // De-dupe candidate emails before the lookup.
  const emails = [...new Set(parsed.data.emails)]

  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase
    .from('contacts')
    .select('email')
    .in('email', emails)
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { existing: (data ?? []).map((r) => r.email) }
})
