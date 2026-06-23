import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { QUEUE_NAMES } from '#shared/schemas'

/**
 * Web-side BullMQ producer. Nitro routes enqueue jobs that the standalone
 * worker process consumes. Connection + queue are created lazily and reused
 * across requests.
 */
let connection: Redis | null = null
let dispatchQueue: Queue | null = null

function getConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL ?? process.env.NUXT_REDIS_URL
    if (!url) {
      throw createError({
        statusCode: 500,
        statusMessage: 'REDIS_URL is not configured',
      })
    }
    connection = new Redis(url, { maxRetriesPerRequest: null })
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
