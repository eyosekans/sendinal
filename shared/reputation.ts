/**
 * SES reputation thresholds + rate computation, shared by the dashboard widget
 * (task 4.1, banner + bounce/complaint readings) and the worker's auto-pause
 * guard. Kept dependency-free (no relative imports) so it type-checks under both
 * the Nuxt "shared" layer (bundler, `#shared/reputation`) and the worker
 * (NodeNext, `../shared/reputation.ts`) — same pattern as `shared/segments.ts`.
 */

/** SES places an account under review above a 2% bounce rate. */
export const BOUNCE_RATE_THRESHOLD = 2 // percent
/** SES places an account under review above a 0.1% complaint rate. */
export const COMPLAINT_RATE_THRESHOLD = 0.1 // percent
/** Rolling window the rates are measured over. */
export const REPUTATION_WINDOW_DAYS = 7
/**
 * Below this many sends in the window we don't flag/pause — a single bounce in a
 * handful of test sends shouldn't trip a scary banner or halt sending.
 */
export const REPUTATION_MIN_SAMPLE = 50

export interface ReputationInput {
  /** Messages that left for SES in the window = delivered + bounced + complained. */
  totalSent: number
  bounced: number
  complained: number
}

export interface Reputation {
  windowDays: number
  totalSent: number
  bounced: number
  complained: number
  /** Percentage, rounded to 2 dp; null when there were no sends in the window. */
  bounceRate: number | null
  complaintRate: number | null
  bounceThreshold: number
  complaintThreshold: number
  /** True only once the window holds enough volume AND the rate is over threshold. */
  bounceExceeded: boolean
  complaintExceeded: boolean
}

/** Compute the rolling reputation + threshold flags from raw window counts. */
export function computeReputation({
  totalSent,
  bounced,
  complained,
}: ReputationInput): Reputation {
  const rate = (n: number): number | null =>
    totalSent === 0 ? null : Number(((n / totalSent) * 100).toFixed(2))
  const bounceRate = rate(bounced)
  const complaintRate = rate(complained)
  const enough = totalSent >= REPUTATION_MIN_SAMPLE
  return {
    windowDays: REPUTATION_WINDOW_DAYS,
    totalSent,
    bounced,
    complained,
    bounceRate,
    complaintRate,
    bounceThreshold: BOUNCE_RATE_THRESHOLD,
    complaintThreshold: COMPLAINT_RATE_THRESHOLD,
    bounceExceeded:
      enough && bounceRate !== null && bounceRate > BOUNCE_RATE_THRESHOLD,
    complaintExceeded:
      enough &&
      complaintRate !== null &&
      complaintRate > COMPLAINT_RATE_THRESHOLD,
  }
}
