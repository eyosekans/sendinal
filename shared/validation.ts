/**
 * Amazon SES email-validation policy — the single source of truth for turning a
 * raw `GetEmailAddressInsights` verdict into an import decision. Both the CSV
 * wizard (to preview each row) and `POST /api/contacts/import` (to decide what
 * actually lands in the DB) call `validationOutcome`, so the Review screen and
 * the stored result can never disagree.
 *
 * Runtime-agnostic: no Nuxt/Nitro or Node-only imports (see shared/schemas).
 */
import type { EmailValidation, ValidationPolicy } from './schemas/contact'

/** Addresses per `POST /api/contacts/validate` call (matches the Zod cap). */
export const VALIDATION_BATCH_SIZE = 500

/**
 * Hard ceiling on addresses validated in one import. SES bills per address and
 * each call is a round-trip, so a 50k-row CSV must not silently turn into 50k
 * billable calls — rows past the cap import unvalidated and the wizard says so.
 */
export const VALIDATION_MAX_PER_IMPORT = 5_000

/** Re-use a stored verdict rather than paying for it again within this window. */
export const VALIDATION_CACHE_DAYS = 90

/**
 * USD per address for the validation API, used only to show the operator what
 * an import would cost before they opt in. Auto Validation, by contrast, is
 * $0.01 per *thousand* — which is why this path is off by default.
 * https://aws.amazon.com/ses/pricing/
 */
export const VALIDATION_PRICE_PER_ADDRESS = 0.01

/** In-flight `GetEmailAddressInsights` calls. SES throttles; stay modest. */
export const VALIDATION_CONCURRENCY = 10

/**
 * How much the verdict should worry us:
 *   clean   — nothing to report
 *   caution — worth showing, still imported and sendable (e.g. a role address)
 *   risky   — the policy decides: flag as unverified, or leave it out
 */
export type ValidationRisk = 'clean' | 'caution' | 'risky'

export interface ValidationOutcome {
  risk: ValidationRisk
  /** Short human-readable reason, '' when clean. Shown in the Review table. */
  reason: string
  /** False only when the policy is `skip` and the address is risky. */
  importable: boolean
  /** True when the contact must be stored with `email_unverified = true`. */
  unverified: boolean
}

const CLEAN: ValidationOutcome = {
  risk: 'clean',
  reason: '',
  importable: true,
  unverified: false,
}

/**
 * Grades one SES verdict.
 *
 * `IsValid` is SES's own rollup of the six checks, so it leads. The individual
 * evaluations are read as *confidence in that check being true*: HIGH for
 * `IsDisposable` means "very likely disposable", HIGH for `MailboxExists` means
 * "the mailbox is very likely there". Note the inversion — for the risk-shaped
 * checks a HIGH verdict is bad news, for the health-shaped ones a LOW one is.
 *
 * Role addresses are deliberately only `caution`: support@/info@ are legitimate
 * B2B recipients and shouldn't be dropped, just surfaced.
 */
export function classifyValidation(
  validation: EmailValidation | null | undefined,
): { risk: ValidationRisk; reason: string } {
  if (!validation) return { risk: 'clean', reason: '' }
  const c = validation.checks ?? {}

  if (validation.isValid === 'LOW') {
    return { risk: 'risky', reason: 'SES: low delivery confidence' }
  }
  if (c.hasValidSyntax === 'LOW') {
    return { risk: 'risky', reason: 'SES: malformed address' }
  }
  if (c.hasValidDnsRecords === 'LOW') {
    return { risk: 'risky', reason: 'SES: domain cannot receive email' }
  }
  if (c.mailboxExists === 'LOW') {
    return { risk: 'risky', reason: 'SES: mailbox not found' }
  }
  if (c.isDisposable === 'HIGH') {
    return { risk: 'risky', reason: 'SES: disposable address' }
  }
  if (c.isRandomInput === 'HIGH') {
    return { risk: 'risky', reason: 'SES: looks randomly generated' }
  }

  if (validation.isValid === 'MEDIUM') {
    return { risk: 'caution', reason: 'SES: medium delivery confidence' }
  }
  if (c.isDisposable === 'MEDIUM') {
    return { risk: 'caution', reason: 'SES: may be a disposable address' }
  }
  if (c.isRandomInput === 'MEDIUM') {
    return { risk: 'caution', reason: 'SES: may be randomly generated' }
  }
  if (c.mailboxExists === 'MEDIUM') {
    return { risk: 'caution', reason: 'SES: mailbox unconfirmed' }
  }
  if (c.isRoleAddress === 'HIGH') {
    return { risk: 'caution', reason: 'SES: role address' }
  }

  return { risk: 'clean', reason: '' }
}

/**
 * Applies `policy` to a verdict. With no verdict (validation off, unavailable,
 * or the row was past the cap) the row passes through untouched — a failed
 * validation must never silently drop a contact.
 */
export function validationOutcome(
  validation: EmailValidation | null | undefined,
  policy: ValidationPolicy,
): ValidationOutcome {
  if (policy === 'off' || !validation) return CLEAN

  const { risk, reason } = classifyValidation(validation)
  if (risk !== 'risky')
    return { risk, reason, importable: true, unverified: false }

  return {
    risk,
    reason,
    importable: policy !== 'skip',
    unverified: policy === 'flag',
  }
}

/** True once a stored verdict is old enough to be worth re-checking. */
export function isValidationStale(
  checkedAt: string | null | undefined,
  days = VALIDATION_CACHE_DAYS,
): boolean {
  if (!checkedAt) return true
  const at = Date.parse(checkedAt)
  if (Number.isNaN(at)) return true
  return Date.now() - at > days * 24 * 60 * 60 * 1000
}
