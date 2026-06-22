import { Worker } from 'bullmq'
import { connection } from './queues/connection.ts'
import { QUEUE_NAMES } from '../shared/schemas/jobs.ts'
import { processCampaignDispatch } from './processors/campaign-dispatch.ts'
import { processEmailSend } from './processors/email-send.ts'

/**
 * BullMQ worker entry point (Railway: worker service).
 *
 * Standalone Node.js process — not part of the Nuxt app. Runs with Node's
 * native TypeScript support (`node worker/index.ts`).
 */

const workers: Worker[] = []

workers.push(
  new Worker(QUEUE_NAMES.campaignDispatch, processCampaignDispatch, {
    connection,
  }),
)

workers.push(
  new Worker(QUEUE_NAMES.emailSend, processEmailSend, {
    connection,
    // Rate limiting to match the SES per-second quota is configured in 1.7.
  }),
)

for (const worker of workers) {
  worker.on('ready', () => console.log(`[worker] ${worker.name} ready`))
  worker.on('failed', (job, err) =>
    console.error(`[worker] ${worker.name} job ${job?.id} failed:`, err.message),
  )
}

console.log('[worker] started, listening for jobs…')

/** Graceful shutdown — drain active jobs before exit (hardened in 4.6). */
async function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, shutting down…`)
  await Promise.all(workers.map((w) => w.close()))
  await connection.quit()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
