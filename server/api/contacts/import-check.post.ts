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

  // The payload allows up to 10 000 emails, far more than one `.in()` can carry
  // in the request URL, so the lookup runs in chunks (see server/utils/inChunks).
  const existing: string[] = []
  for (const batch of chunked(emails)) {
    const { data, error } = await supabase
      .from('contacts')
      .select('email')
      .in('email', batch)
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
    for (const r of data ?? []) existing.push(r.email)
  }

  return { existing }
})
