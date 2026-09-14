/**
 * One-off: run the members of an existing list through Amazon SES email
 * validation (SESv2 `GetEmailAddressInsights`) — the same check the CSV import
 * wizard offers, for contacts that were imported with validation switched off.
 *
 * Grading goes through shared/validation.ts#validationOutcome, so a contact
 * flagged here is flagged for exactly the reason the wizard would have given.
 * Verdicts are written onto the contact (email_validation_*), which also makes
 * them the 90-day cache: re-running skips anything validated recently, so an
 * interrupted run can simply be started again without paying twice.
 *
 * SES bills $0.01 per address. `--limit` caps how many are bought in one run.
 *
 * Run:  node --env-file=.env scripts/validate-list.ts --list <name|uuid>
 *         [--limit N] [--policy flag|record] [--dry-run] [--report out.csv]
 *
 *   --policy flag    (default) risky addresses get email_unverified = true
 *   --policy record  store verdicts only, leave email_unverified untouched
 *   --dry-run        show what would be validated and the cost; no SES calls
 */
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import {
  GetEmailAddressInsightsCommand,
  SESv2Client,
  type EmailAddressInsightsVerdict,
} from '@aws-sdk/client-sesv2'
import {
  VALIDATION_CACHE_DAYS,
  VALIDATION_CONCURRENCY,
  VALIDATION_PRICE_PER_ADDRESS,
  classifyValidation,
  isValidationStale,
  validationOutcome,
} from '../shared/validation.ts'
import type { EmailValidation } from '../shared/schemas/contact.ts'

const { values: args } = parseArgs({
  options: {
    list: { type: 'string' },
    limit: { type: 'string' },
    policy: { type: 'string', default: 'flag' },
    'dry-run': { type: 'boolean', default: false },
    report: { type: 'string' },
  },
})

const SUPABASE_URL = process.env.NUXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.NUXT_SUPABASE_SECRET_KEY
const region = process.env.NUXT_AWS_REGION ?? process.env.AWS_REGION
const accessKeyId =
  process.env.NUXT_AWS_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID
const secretAccessKey =
  process.env.NUXT_AWS_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY

if (!SUPABASE_URL || !SERVICE_KEY || !region || !accessKeyId || !secretAccessKey) {
  console.error('Missing Supabase or AWS credentials in env')
  process.exit(1)
}
if (!args.list) {
  console.error('--list <name|uuid> is required')
  process.exit(1)
}
if (args.policy !== 'flag' && args.policy !== 'record') {
  console.error('--policy must be flag or record')
  process.exit(1)
}
const limit = args.limit ? Number(args.limit) : Infinity
if (Number.isNaN(limit) || limit < 0) {
  console.error('--limit must be a non-negative number')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})
const ses = new SESv2Client({
  region,
  credentials: { accessKeyId, secretAccessKey },
})

// --- Resolve the list and its members ---------------------------------------

const isUuid = /^[0-9a-f-]{36}$/i.test(args.list)
const { data: lists, error: listErr } = await admin
  .from('lists')
  .select('id, name')
  .eq(isUuid ? 'id' : 'name', args.list)
if (listErr) throw listErr
if (lists.length !== 1) {
  console.error(`Expected one list matching "${args.list}", found ${lists.length}`)
  process.exit(1)
}
const list = lists[0]!

interface Member {
  id: string
  email: string
  status: string
  email_unverified: boolean
  email_validation_verdict: string | null
  email_validated_at: string | null
}

// Filter through the join rather than `.in(ids)` — a large id list overflows
// the PostgREST request URL.
const members: Member[] = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await admin
    .from('contacts')
    .select(
      'id, email, status, email_unverified, email_validation_verdict, email_validated_at, list_contacts!inner(list_id)',
    )
    .eq('list_contacts.list_id', list.id)
    .order('id')
    .range(from, from + 999)
  if (error) throw error
  members.push(...(data as unknown as Member[]))
  if (data.length < 1000) break
}

// Only active contacts are worth paying for: unsubscribed/bounced/complained
// ones are never sent to again regardless of the verdict.
const active = members.filter((m) => m.status === 'active')
const due = active.filter(
  (m) =>
    !m.email_validation_verdict ||
    isValidationStale(m.email_validated_at, VALIDATION_CACHE_DAYS),
)
const batch = due.slice(0, limit)
const cost = batch.length * VALIDATION_PRICE_PER_ADDRESS

console.log(`List "${list.name}" (${list.id})`)
console.log(`  members: ${members.length}, active: ${active.length}`)
console.log(`  cached (< ${VALIDATION_CACHE_DAYS}d): ${active.length - due.length}`)
console.log(`  to validate now: ${batch.length} (~$${cost.toFixed(2)}), policy: ${args.policy}`)

if (args['dry-run'] || batch.length === 0) process.exit(0)

// --- Validate ---------------------------------------------------------------

const RETRYABLE = new Set(['TooManyRequestsException', 'ThrottlingException'])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const verdictOf = (v: EmailAddressInsightsVerdict | undefined) =>
  v?.ConfidenceVerdict as EmailValidation['isValid'] | undefined

async function validateOne(email: string): Promise<EmailValidation | string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await ses.send(
        new GetEmailAddressInsightsCommand({ EmailAddress: email }),
      )
      const mv = res.MailboxValidation
      const isValid = verdictOf(mv?.IsValid)
      if (!isValid) return 'SES returned no verdict'
      const ev = mv?.Evaluations
      const checks = Object.fromEntries(
        Object.entries({
          hasValidSyntax: verdictOf(ev?.HasValidSyntax),
          hasValidDnsRecords: verdictOf(ev?.HasValidDnsRecords),
          mailboxExists: verdictOf(ev?.MailboxExists),
          isRoleAddress: verdictOf(ev?.IsRoleAddress),
          isDisposable: verdictOf(ev?.IsDisposable),
          isRandomInput: verdictOf(ev?.IsRandomInput),
        }).filter(([, v]) => v !== undefined),
      )
      return { isValid, checks, checkedAt: new Date().toISOString() }
    } catch (err) {
      const name = (err as { name?: string })?.name ?? 'Error'
      if (RETRYABLE.has(name) && attempt < 5) {
        await sleep(2 ** attempt * 250)
        continue
      }
      return `${name}: ${(err as { message?: string })?.message ?? ''}`
    }
  }
}

interface Row {
  member: Member
  validation: EmailValidation | null
  error?: string
  writeError?: string
}

const rows: Row[] = new Array(batch.length)
let cursor = 0
let done = 0

const workers = Array.from(
  { length: Math.min(VALIDATION_CONCURRENCY, batch.length) },
  async () => {
    for (;;) {
      const i = cursor++
      if (i >= batch.length) return
      const member = batch[i]!
      const result = await validateOne(member.email)
      const row: Row =
        typeof result === 'string'
          ? { member, validation: null, error: result }
          : { member, validation: result }

      // Persist immediately so an interrupted run keeps what it paid for.
      if (row.validation) {
        const outcome = validationOutcome(row.validation, 'flag')
        const { error } = await admin
          .from('contacts')
          .update({
            email_validation_verdict: row.validation.isValid,
            email_validation_checks: row.validation.checks,
            email_validated_at: row.validation.checkedAt,
            // Only ever raise the flag: a clean verdict must not clear an
            // `email_unverified` set for another reason (e.g. SES suppression).
            ...(args.policy === 'flag' && outcome.unverified
              ? { email_unverified: true }
              : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', member.id)
        if (error) row.writeError = error.message
      }
      rows[i] = row
      if (++done % 50 === 0 || done === batch.length) {
        console.log(`  ${done}/${batch.length}`)
      }
    }
  },
)
await Promise.all(workers)

// --- Report -----------------------------------------------------------------

const graded = rows.map((r) => ({ ...r, ...classifyValidation(r.validation) }))
const count = (pred: (r: (typeof graded)[number]) => boolean) =>
  graded.filter(pred).length

console.log('\nResults')
console.log(`  validated: ${count((r) => !!r.validation)}, failed: ${count((r) => !r.validation)}`)
console.log(`  clean: ${count((r) => !!r.validation && r.risk === 'clean')}`)
console.log(`  caution: ${count((r) => r.risk === 'caution')}`)
console.log(
  `  risky: ${count((r) => r.risk === 'risky')}${args.policy === 'flag' ? ' (flagged email_unverified)' : ''}`,
)
const writeErrors = count((r) => !!r.writeError)
if (writeErrors) console.log(`  DB write errors: ${writeErrors}`)

const reasons = new Map<string, number>()
for (const r of graded) if (r.reason) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1)
for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${n}  ${reason}`)
}
const errors = new Map<string, number>()
for (const r of graded) if (r.error) errors.set(r.error, (errors.get(r.error) ?? 0) + 1)
for (const [e, n] of errors) console.log(`    ${n}  error: ${e}`)

if (args.report) {
  const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const header = ['email', 'risk', 'reason', 'is_valid', 'syntax', 'dns', 'mailbox', 'role', 'disposable', 'random', 'error']
  const lines = graded.map((r) => {
    const c = r.validation?.checks ?? {}
    return [
      r.member.email,
      r.validation ? r.risk : '',
      r.reason,
      r.validation?.isValid,
      c.hasValidSyntax,
      c.hasValidDnsRecords,
      c.mailboxExists,
      c.isRoleAddress,
      c.isDisposable,
      c.isRandomInput,
      r.error ?? r.writeError,
    ]
      .map(esc)
      .join(',')
  })
  writeFileSync(args.report, [header.join(','), ...lines].join('\n') + '\n')
  console.log(`\nReport: ${args.report}`)
}
