import { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '~~/app/types/database.types'
import type {
  EmailValidation,
  EmailValidationChecks,
  ValidationVerdict,
} from '#shared/schemas'
import { validateEmailsSchema } from '#shared/schemas'
import { VALIDATION_CACHE_DAYS, isValidationStale } from '#shared/validation'

/**
 * POST /api/contacts/validate
 * Runs one wizard batch of addresses through Amazon SES email validation
 * (SESv2 `GetEmailAddressInsights`) on the way into the Review step, so risky
 * addresses can be flagged or dropped before they ever enter the contact list.
 *
 * SES bills per address, so every batch is served from the DB first: a contact
 * whose stored verdict is younger than VALIDATION_CACHE_DAYS is re-used and
 * never re-purchased. Fresh verdicts are written back onto contacts that already
 * exist (new addresses get theirs persisted by POST /api/contacts/import).
 *
 * Degrades rather than fails: with no AWS credentials, the feature switched off
 * (`NUXT_SES_VALIDATION_DISABLED`), or SES erroring, it returns
 * `available: false` / an empty result and the import proceeds unvalidated.
 *
 * Returns: { available, results: Record<email, EmailValidation>, cached, validated, failed }
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const parsed = validateEmailsSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid payload',
      data: parsed.error.flatten(),
    })
  }

  const emails = [...new Set(parsed.data.emails)]
  const results: Record<string, EmailValidation> = {}

  const supabase = await serverSupabaseClient<Database>(event)

  // 1. Re-use verdicts we already paid for. Chunked: a full 500-email batch
  //    would sit right on the PostgREST URL limit (see server/utils/inChunks).
  const known: {
    email: string
    email_validation_verdict: ValidationVerdict | null
    email_validation_checks: Json
    email_validated_at: string | null
  }[] = []
  for (const batch of chunked(emails)) {
    const { data, error: knownErr } = await supabase
      .from('contacts')
      .select(
        'email, email_validation_verdict, email_validation_checks, email_validated_at',
      )
      .in('email', batch)
      .not('email_validated_at', 'is', null)
    if (knownErr) {
      throw createError({ statusCode: 500, statusMessage: knownErr.message })
    }
    known.push(...(data ?? []))
  }

  for (const row of known) {
    if (!row.email_validation_verdict) continue
    if (isValidationStale(row.email_validated_at, VALIDATION_CACHE_DAYS))
      continue
    results[row.email] = {
      isValid: row.email_validation_verdict,
      checks: (row.email_validation_checks ?? {}) as EmailValidationChecks,
      checkedAt: row.email_validated_at!,
    }
  }
  const cached = Object.keys(results).length

  // 2. Buy verdicts for the rest.
  const missing = emails.filter((e) => !results[e])
  if (VALIDATION_DISABLED) {
    return { available: false, results, cached, validated: 0, failed: missing }
  }

  const failed: string[] = []
  const fresh: { email: string; validation: EmailValidation }[] = []
  for (const lookup of await validateEmailAddresses(missing)) {
    if (!lookup.validation) {
      failed.push(lookup.email)
      continue
    }
    results[lookup.email] = lookup.validation
    fresh.push({ email: lookup.email, validation: lookup.validation })
  }

  // 3. Warm the cache for addresses that are already contacts. New addresses are
  //    persisted by the import itself; a write failure here only costs a repeat
  //    lookup later, so it must not fail the request.
  if (fresh.length) {
    const existing: { id: string; email: string }[] = []
    let exErr: { message: string } | null = null
    for (const batch of chunked(fresh.map((f) => f.email))) {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, email')
        .in('email', batch)
      if (error) {
        exErr = error
        break
      }
      existing.push(...(data ?? []))
    }
    if (exErr) {
      console.warn(`[ses:validate] cache warm lookup failed: ${exErr.message}`)
    } else {
      const byEmail = new Map(existing.map((r) => [r.email, r.id]))
      await Promise.all(
        fresh
          .filter((f) => byEmail.has(f.email))
          .map(async (f) => {
            const { error } = await supabase
              .from('contacts')
              .update({
                email_validation_verdict: f.validation.isValid,
                email_validation_checks: f.validation.checks as Json,
                email_validated_at: f.validation.checkedAt,
              })
              .eq('id', byEmail.get(f.email)!)
            if (error) {
              console.warn(
                `[ses:validate] cache warm failed for ${f.email}: ${error.message}`,
              )
            }
          }),
      )
    }
  }

  return {
    available: true,
    results,
    cached,
    validated: fresh.length,
    failed,
  }
})
