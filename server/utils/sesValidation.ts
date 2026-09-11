import {
  SESv2Client,
  GetEmailAddressInsightsCommand,
  type EmailAddressInsightsVerdict,
} from '@aws-sdk/client-sesv2'
import type {
  EmailValidation,
  EmailValidationChecks,
  ValidationVerdict,
} from '#shared/schemas'
import { VALIDATION_CONCURRENCY } from '#shared/validation'

/**
 * Amazon SES email validation — SESv2 `GetEmailAddressInsights`.
 *
 * SES checks an address without sending to it (syntax, DNS/MX, mailbox
 * existence, plus disposable/role/random-string risk signals) and answers with a
 * HIGH | MEDIUM | LOW confidence per check. See
 * https://docs.aws.amazon.com/ses/latest/dg/email-validation-api.html
 *
 * Two things shape this wrapper:
 *
 *   - **It is one address per call, and it is billed.** Callers batch and cap;
 *     here we only bound concurrency so a batch doesn't trip SES throttling.
 *   - **It must never block an import.** Missing credentials, an unsupported
 *     region, a throttle that outlives its retries — all degrade to "no verdict
 *     for this address" rather than an error. An import that can't be validated
 *     still has to run.
 *
 * Sending runs on SES v1 (`@aws-sdk/client-ses`, see worker/lib/ses.ts) which
 * has no insights operation, hence the separate SESv2 client here.
 *
 * IAM: the calling identity needs `ses:GetEmailAddressInsights` (and
 * `iam:CreateServiceLinkedRole` for SES's CloudWatch validation metrics).
 */

const region = process.env.NUXT_AWS_REGION ?? process.env.AWS_REGION
const accessKeyId =
  process.env.NUXT_AWS_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID
const secretAccessKey =
  process.env.NUXT_AWS_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY

/**
 * Kill switch for the whole feature. Set `NUXT_SES_VALIDATION_DISABLED=true` to
 * stop spending on validation without touching the wizard; it also engages
 * automatically with no AWS credentials, so local dev works untouched.
 */
export const VALIDATION_DISABLED =
  process.env.NUXT_SES_VALIDATION_DISABLED === 'true' ||
  !region ||
  !accessKeyId ||
  !secretAccessKey

let client: SESv2Client | null = null
function getClient(): SESv2Client {
  if (!client) {
    client = new SESv2Client({
      region: region!,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    })
  }
  return client
}

/** One address's result. `validation: null` means "we couldn't get a verdict". */
export interface ValidationLookup {
  email: string
  validation: EmailValidation | null
  /** Present when the lookup failed; surfaced to the wizard, not to recipients. */
  error?: string
}

function verdictOf(v: EmailAddressInsightsVerdict | undefined) {
  return (v?.ConfidenceVerdict ?? undefined) as ValidationVerdict | undefined
}

/** Drops undefined checks so the stored JSON only carries what SES answered. */
function checksOf(
  evaluations:
    | Record<string, EmailAddressInsightsVerdict | undefined>
    | undefined,
): EmailValidationChecks {
  const raw: EmailValidationChecks = {
    hasValidSyntax: verdictOf(evaluations?.HasValidSyntax),
    hasValidDnsRecords: verdictOf(evaluations?.HasValidDnsRecords),
    mailboxExists: verdictOf(evaluations?.MailboxExists),
    isRoleAddress: verdictOf(evaluations?.IsRoleAddress),
    isDisposable: verdictOf(evaluations?.IsDisposable),
    isRandomInput: verdictOf(evaluations?.IsRandomInput),
  }
  return Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined),
  ) as EmailValidationChecks
}

const RETRYABLE = new Set(['TooManyRequestsException', 'ThrottlingException'])
const MAX_ATTEMPTS = 3

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Validates one address, retrying SES throttles with exponential backoff.
 * Any other failure (BadRequestException for a malformed address, a region
 * without the feature, a network error) resolves to a null verdict.
 */
async function validateOne(email: string): Promise<ValidationLookup> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await getClient().send(
        new GetEmailAddressInsightsCommand({ EmailAddress: email }),
      )
      const isValid = verdictOf(res.MailboxValidation?.IsValid)
      if (!isValid) {
        return { email, validation: null, error: 'SES returned no verdict' }
      }
      return {
        email,
        validation: {
          isValid,
          checks: checksOf(
            res.MailboxValidation?.Evaluations as
              | Record<string, EmailAddressInsightsVerdict | undefined>
              | undefined,
          ),
          checkedAt: new Date().toISOString(),
        },
      }
    } catch (err) {
      const name = (err as { name?: string })?.name ?? 'Error'
      if (RETRYABLE.has(name) && attempt < MAX_ATTEMPTS) {
        await sleep(2 ** attempt * 250) // 500ms, 1s
        continue
      }
      const message = (err as { message?: string })?.message ?? name
      console.warn(`[ses:validate] ${email} failed: ${name}: ${message}`)
      return { email, validation: null, error: name }
    }
  }
  return { email, validation: null, error: 'Exhausted retries' }
}

/**
 * Validates a batch of addresses with bounded concurrency. Always resolves with
 * one entry per input address, in input order — never rejects.
 */
export async function validateEmailAddresses(
  emails: string[],
): Promise<ValidationLookup[]> {
  if (VALIDATION_DISABLED) {
    return emails.map((email) => ({
      email,
      validation: null,
      error: 'Validation disabled',
    }))
  }

  const results: ValidationLookup[] = new Array(emails.length)
  let cursor = 0

  // A fixed pool of workers pulling off a shared cursor: keeps exactly
  // VALIDATION_CONCURRENCY calls in flight regardless of per-call latency.
  const workers = Array.from(
    { length: Math.min(VALIDATION_CONCURRENCY, emails.length) },
    async () => {
      for (;;) {
        const i = cursor++
        if (i >= emails.length) return
        results[i] = await validateOne(emails[i]!)
      }
    },
  )
  await Promise.all(workers)

  return results
}
