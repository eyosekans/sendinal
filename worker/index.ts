import { Worker } from 'bullmq'
import { connection } from './queues/connection.ts'
import { QUEUE_NAMES, emailSendJobSchema } from '../shared/schemas/jobs.ts'
import { processCampaignDispatch } from './processors/campaign-dispatch.ts'
import { processEmailSend } from './processors/email-send.ts'
import { markSendFailed, finalizeCampaignIfComplete } from './lib/sends.ts'
import { SES_DRY_RUN } from './lib/ses.ts'

/**
 * BullMQ worker entry point (Railway: worker service).
 *
 * Standalone Node.js process — not part of the Nuxt app. Runs with Node's
 * native TypeScript support (`node worker/index.ts`).
 */

// SES per-second send quota (sandbox default is 14/s). Match it on the queue.
const SES_RATE = Number(process.env.NUXT_SES_RATE_LIMIT_PER_SECOND ?? '14')

const dispatchWorker = new Worker(
  QUEUE_NAMES.campaignDispatch,
  processCampaignDispatch,
  {
    connection,
  },
)

const emailWorker = new Worker(QUEUE_NAMES.emailSend, processEmailSend, {
  connection,
  // Throttle SES sends to the per-second quota across this worker.
  limiter: { max: SES_RATE, duration: 1000 },
})

const workers: Worker[] = [dispatchWorker, emailWorker]

for (const worker of workers) {
  worker.on('ready', () => console.log(`[worker] ${worker.name} ready`))
  worker.on('failed', (job, err) =>
    console.error(
      `[worker] ${worker.name} job ${job?.id} failed:`,
      err.message,
    ),
  )
}

/**
 * Terminal failure for a send: once BullMQ has used up every attempt, record
 * the failure on the `sends` row and let the campaign finalize.
 */
emailWorker.on('failed', async (job, err) => {
  if (!job) return
  const maxAttempts = job.opts.attempts ?? 1
  if (job.attemptsMade < maxAttempts) return // more retries pending

  const parsed = emailSendJobSchema.safeParse(job.data)
  if (!parsed.success) return
  try {
    await markSendFailed(parsed.data.sendId, err.message)
    await finalizeCampaignIfComplete(parsed.data.campaignId)
  } catch (e) {
    console.error('[worker] failed to record terminal send failure:', e)
  }
})

console.log(
  `[worker] started, listening for jobs… (SES ${SES_DRY_RUN ? 'DRY-RUN' : 'live'}, rate ${SES_RATE}/s)`,
)

/** Graceful shutdown — drain active jobs before exit (hardened in 4.6). */
async function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, shutting down…`)
  await Promise.all(workers.map((w) => w.close()))
  await connection.quit()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
