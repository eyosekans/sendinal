/**
 * Shared Zod schemas — the single source of truth for data shapes used by
 * both the Nuxt app (server routes + client validation) and the BullMQ worker.
 *
 * Keep these runtime-agnostic: no Nuxt/Nitro or Node-only imports here.
 *
 * The Nuxt app imports this barrel (bundler resolution, extensionless). The
 * worker runs under Node's native TypeScript, which requires explicit `.ts`
 * extensions on relative imports — so the worker imports the concrete schema
 * files directly (e.g. `shared/schemas/jobs.ts`) rather than this barrel.
 */
export * from './contact'
export * from './list'
export * from './campaign'
export * from './template'
export * from './jobs'
