import { processSnsEnvelope } from '~~/server/utils/sesEvents'
import { verifySnsSignature, type SnsMessage } from '~~/server/utils/snsSignature'

/**
 * POST /api/webhooks/ses — public endpoint for an Amazon SNS HTTPS subscription
 * carrying SES bounce/complaint notifications. (Our default wiring delivers to
 * SQS instead, consumed by the worker's poller `worker/lib/sqs-poller.ts`; this
 * route covers the direct-subscription path and is kept public via nuxt.config
 * `exclude`.)
 *
 * Every message is authenticated by SNS signature before processing. SNS posts
 * with `Content-Type: text/plain`, so the body is read raw and parsed here.
 */
export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }

  let msg: SnsMessage
  try {
    msg = JSON.parse(rawBody.toString())
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  // Reject anything we can't authenticate as genuinely from SNS.
  const valid = await verifySnsSignature(msg)
  if (!valid) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid SNS signature' })
  }

  switch (msg.Type) {
    case 'SubscriptionConfirmation': {
      // Confirm the subscription by visiting the one-time SubscribeURL.
      if (msg.SubscribeURL) {
        try {
          await fetch(msg.SubscribeURL)
        } catch (err) {
          console.error('[ses-webhook] subscription confirm failed:', err)
        }
      }
      return { ok: true, confirmed: true }
    }

    case 'UnsubscribeConfirmation':
      // Informational — nothing to do, just acknowledge.
      return { ok: true }

    case 'Notification': {
      const result = await processSnsEnvelope(msg)
      // Always ack so SNS doesn't retry; unhandled cases are logged for review.
      if (!result.handled) {
        console.warn('[ses-webhook] unhandled notification:', result.reason)
      }
      return { ok: true, result }
    }

    default:
      return { ok: true, ignored: msg.Type }
  }
})
