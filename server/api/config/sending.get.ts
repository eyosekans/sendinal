import {
  DEFAULT_SES_RATE_PER_SECOND,
  THROTTLE_WARNING_RECIPIENTS,
} from '#shared/sending'

/**
 * GET /api/config/sending
 * Sending-rate config for the campaign builder's throttle warning (task 3.5):
 * the SES per-second rate the worker's limiter enforces and the recipient count
 * above which a large-send warning + estimated duration is shown.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const config = useRuntimeConfig()
  const ratePerSecond =
    Number(config.sesRateLimitPerSecond) || DEFAULT_SES_RATE_PER_SECOND
  return { ratePerSecond, warnThreshold: THROTTLE_WARNING_RECIPIENTS }
})
