import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { DISPATCH_JOB_OPTS, dispatchJobId, QUEUE_NAMES } from '#shared/schemas'

/**
 * Web-side BullMQ producer. Nitro routes enqueue jobs that the standalone
 * worker process consumes. Connection + queue are created lazily and reused
 * across requests.
 *
 * The web app runs on Vercel and Redis lives on Railway, so this connection
 * crosses the public internet and WILL break whenever Railway's Redis TCP proxy
 * changes or disappears (it is torn down when a project is suspended, e.g. for
 * a failed payment). Every option below exists to make that failure *loud and
 * fast*: ioredis' defaults (`enableOfflineQueue`, infinite `retryStrategy`)
 * would otherwise park the command and never settle the promise, so the route
 * would hang until the serverless function was killed — leaving the campaign
 * wedged in `sending` with no error anywhere. Enqueue failure is survivable
 * (the worker's recovery sweep claims the campaign from the database), a silent
 * hang is not.
 */
let connection: Redis | null = null
let dispatchQueue: Queue | null = null

/** Hard ceiling for an enqueue, including connect + retries. */
const ENQUEUE_TIMEOUT_MS = 8_000

function getConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL ?? process.env.NUXT_REDIS_URL
    if (!url) {
      // A plain Error, not createError: callers treat "cannot enqueue" as a
      // deferral (the worker picks the campaign up), not a request failure.
      throw new Error('REDIS_URL is not configured')
    }
    const redis = new Redis(url, {
      // Bounded, unlike the default infinite retry: give up so the promise
      // rejects instead of hanging.
      maxRetriesPerRequest: 2,
      connectTimeout: 4_000,
      commandTimeout: 6_000,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 300, 1000)),
    })
    // An ioredis 'error' with no listener is an unhandled exception that would
    // take the whole function instance down.
    redis.on('error', (err: Error) =>
      console.error('[queue] redis error:', err.message),
    )
    // Once ioredis stops reconnecting the client is dead for good — drop it so
    // the next request builds a fresh one instead of reusing a corpse.
    redis.on('end', () => {
      if (connection === redis) {
        connection = null
        dispatchQueue = null
      }
    })
    connection = redis
  }
  return connection
}

export function getCampaignDispatchQueue(): Queue {
  if (!dispatchQueue) {
    dispatchQueue = new Queue(QUEUE_NAMES.campaignDispatch, {
      connection: getConnection(),
    })
  }
  return dispatchQueue
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      )
    }),
  ]).finally(() => clearTimeout(timer))
}

/**
 * Enqueue a campaign's fan-out job. Rejects (within `ENQUEUE_TIMEOUT_MS`) when
 * Redis is unreachable — it never hangs. The deterministic job id makes a
 * repeat enqueue a no-op while the job is still pending, so racing with the
 * scheduler or the worker's recovery sweep cannot double-send a campaign.
 */
export async function enqueueCampaignDispatch(campaignId: string) {
  const queue = getCampaignDispatchQueue()
  await withTimeout(
    queue.add(
      'dispatch',
      { campaignId },
      { ...DISPATCH_JOB_OPTS, jobId: dispatchJobId(campaignId) },
    ),
    ENQUEUE_TIMEOUT_MS,
    'campaign.dispatch enqueue',
  )
}
