/**
 * Sending-rate constants shared by the worker's BullMQ limiter and the campaign
 * builder's throttle warning (task 3.5). Kept here so the worker (NodeNext) and
 * the Nuxt app reference one source of truth instead of drifting magic numbers.
 */

/** SES per-second send rate the `email.send` limiter enforces by default. */
export const DEFAULT_SES_RATE_PER_SECOND = 14

/** Warn in the builder once a campaign's recipient count exceeds this. */
export const THROTTLE_WARNING_RECIPIENTS = 10_000
