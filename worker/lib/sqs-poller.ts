import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs'
import { processSnsEnvelope } from './ses-events.ts'

/**
 * Long-polls the SES bounce/complaint SQS queue and processes each message
 * (SES → SNS → SQS). Runs in the worker (a persistent process) so it survives a
 * serverless web tier on Vercel — the equivalent Nitro plugin was removed.
 *
 * Trust boundary: the queue's access policy only lets our SNS topic enqueue, so
 * messages are trusted and skip SNS signature verification. Processing is
 * idempotent, so redeliveries are safe.
 *
 * Disabled when the queue/region/credentials aren't set (local dev without AWS)
 * or via NUXT_SQS_POLLER_DISABLED=true. Returns a `stop()` for graceful shutdown.
 */
export function startSqsPoller(): { stop: () => void } {
  const queueUrl = process.env.NUXT_SQS_QUEUE_URL
  const region = process.env.NUXT_AWS_REGION
  const accessKeyId = process.env.NUXT_AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.NUXT_AWS_SECRET_ACCESS_KEY

  if (process.env.NUXT_SQS_POLLER_DISABLED === 'true') {
    console.log('[sqs-poller] disabled via NUXT_SQS_POLLER_DISABLED')
    return { stop: () => {} }
  }
  if (!queueUrl || !region || !accessKeyId || !secretAccessKey) {
    console.log(
      '[sqs-poller] disabled (queue URL / region / AWS credentials not set)',
    )
    return { stop: () => {} }
  }

  const sqs = new SQSClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  })

  let running = true
  const abort = new AbortController()

  async function pollOnce(): Promise<void> {
    const { Messages } = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20, // long poll — near-zero idle cost
        VisibilityTimeout: 60,
      }),
      { abortSignal: abort.signal },
    )

    for (const msg of Messages ?? []) {
      if (!msg.Body || !msg.ReceiptHandle) continue
      try {
        let envelope: unknown
        try {
          envelope = JSON.parse(msg.Body)
        } catch {
          envelope = msg.Body
        }
        const result = await processSnsEnvelope(envelope)
        if (!result.handled) {
          console.warn('[sqs-poller] unhandled message:', result.reason)
        }
        // Ack handled + unhandled (control/simulator) messages so the queue
        // drains; only a thrown DB error below leaves the message for redelivery.
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: msg.ReceiptHandle,
          }),
        )
      } catch (err) {
        // Leave the message on the queue; SQS redelivers after the visibility
        // timeout. Idempotent processing makes the retry safe.
        console.error('[sqs-poller] processing error (will retry):', err)
      }
    }
  }

  async function loop(): Promise<void> {
    console.log('[sqs-poller] started, long-polling SES bounce/complaint queue')
    while (running) {
      try {
        await pollOnce()
      } catch (err) {
        if (!running) break
        console.error('[sqs-poller] receive error, backing off 5s:', err)
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
    console.log('[sqs-poller] stopped')
  }

  void loop()

  return {
    stop: () => {
      running = false
      abort.abort()
    },
  }
}
