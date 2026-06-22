import { Redis } from 'ioredis'

const redisUrl = process.env.REDIS_URL ?? process.env.NUXT_REDIS_URL

if (!redisUrl) {
  throw new Error('REDIS_URL is not set — the worker cannot connect to Redis.')
}

/**
 * Shared ioredis connection for BullMQ. BullMQ requires
 * `maxRetriesPerRequest: null` on connections used by Workers/QueueEvents.
 */
export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
})
