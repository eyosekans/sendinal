/**
 * Unit tests for the SES email-validation policy (shared/validation.ts) — the
 * rules that turn a `GetEmailAddressInsights` verdict into an import decision.
 *
 * The wizard's Review screen and POST /api/contacts/import both call
 * `validationOutcome`, so these cases pin down what an operator is shown and
 * what actually lands in the DB. Self-contained: no server, no AWS, no DB.
 *
 * Run:  node --test tests/validation-policy.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  VALIDATION_CACHE_DAYS,
  classifyValidation,
  isValidationStale,
  validationOutcome,
} from '../shared/validation.ts'

/** Builds a verdict: `isValid` rollup plus any individual checks. */
const v = (isValid, checks = {}) => ({
  isValid,
  checks,
  checkedAt: new Date().toISOString(),
})

test('a healthy address is clean under every policy', () => {
  const good = v('HIGH', {
    hasValidSyntax: 'HIGH',
    hasValidDnsRecords: 'HIGH',
    mailboxExists: 'HIGH',
    isRoleAddress: 'LOW',
    isDisposable: 'LOW',
    isRandomInput: 'LOW',
  })
  for (const policy of ['off', 'flag', 'skip']) {
    const out = validationOutcome(good, policy)
    assert.equal(out.risk, 'clean')
    assert.equal(out.importable, true)
    assert.equal(out.unverified, false)
  }
})

test('LOW overall confidence is risky, and the policy decides its fate', () => {
  const bad = v('LOW')
  assert.equal(classifyValidation(bad).risk, 'risky')

  const flagged = validationOutcome(bad, 'flag')
  assert.equal(flagged.importable, true)
  assert.equal(flagged.unverified, true)

  const skipped = validationOutcome(bad, 'skip')
  assert.equal(skipped.importable, false)
  assert.equal(skipped.unverified, false)

  // 'off' must not judge a verdict that was never meant to be applied.
  assert.deepEqual(validationOutcome(bad, 'off'), {
    risk: 'clean',
    reason: '',
    importable: true,
    unverified: false,
  })
})

test('risk-shaped checks are risky at HIGH, health-shaped ones at LOW', () => {
  // HIGH confidence that it IS disposable / random = bad news.
  assert.equal(
    classifyValidation(v('HIGH', { isDisposable: 'HIGH' })).risk,
    'risky',
  )
  assert.equal(
    classifyValidation(v('HIGH', { isRandomInput: 'HIGH' })).risk,
    'risky',
  )
  // LOW confidence that the mailbox / DNS is there = also bad news.
  assert.equal(
    classifyValidation(v('HIGH', { mailboxExists: 'LOW' })).risk,
    'risky',
  )
  assert.equal(
    classifyValidation(v('HIGH', { hasValidDnsRecords: 'LOW' })).risk,
    'risky',
  )
  assert.equal(
    classifyValidation(v('HIGH', { hasValidSyntax: 'LOW' })).risk,
    'risky',
  )
})

test('a role address is surfaced but never dropped', () => {
  const role = v('HIGH', { isRoleAddress: 'HIGH' })
  const out = validationOutcome(role, 'skip')
  assert.equal(out.risk, 'caution')
  assert.equal(out.importable, true)
  assert.equal(out.unverified, false)
  assert.match(out.reason, /role address/i)
})

test('MEDIUM signals are caution, not risky', () => {
  assert.equal(classifyValidation(v('MEDIUM')).risk, 'caution')
  assert.equal(
    classifyValidation(v('HIGH', { isDisposable: 'MEDIUM' })).risk,
    'caution',
  )
  assert.equal(
    classifyValidation(v('HIGH', { mailboxExists: 'MEDIUM' })).risk,
    'caution',
  )

  const out = validationOutcome(v('MEDIUM'), 'skip')
  assert.equal(out.importable, true, 'caution must survive a skip policy')
  assert.equal(out.unverified, false)
})

test('no verdict never blocks an import', () => {
  // SES unavailable, past the per-import cap, or the row was never checked.
  for (const missing of [null, undefined]) {
    for (const policy of ['off', 'flag', 'skip']) {
      const out = validationOutcome(missing, policy)
      assert.equal(out.importable, true)
      assert.equal(out.unverified, false)
      assert.equal(out.risk, 'clean')
    }
  }
})

test('every risky and caution outcome carries a reason to show the operator', () => {
  const graded = [
    v('LOW'),
    v('MEDIUM'),
    v('HIGH', { isDisposable: 'HIGH' }),
    v('HIGH', { isRoleAddress: 'HIGH' }),
  ]
  for (const verdict of graded) {
    const { risk, reason } = classifyValidation(verdict)
    assert.notEqual(risk, 'clean')
    assert.ok(
      reason.length > 0,
      `expected a reason for ${JSON.stringify(verdict)}`,
    )
  }
})

test('cache staleness governs when a verdict is re-purchased', () => {
  const daysAgo = (n) =>
    new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

  assert.equal(isValidationStale(daysAgo(VALIDATION_CACHE_DAYS - 1)), false)
  assert.equal(isValidationStale(daysAgo(VALIDATION_CACHE_DAYS + 1)), true)
  // Missing or unparseable timestamps must re-validate rather than trust junk.
  assert.equal(isValidationStale(null), true)
  assert.equal(isValidationStale(''), true)
  assert.equal(isValidationStale('not-a-date'), true)
})
