/**
 * Health check endpoint used by Railway's web service healthcheck.
 * Phase 4.6 extends this to verify Supabase + Redis connectivity.
 */
export default defineEventHandler(() => {
  return {
    status: 'ok',
    service: 'web',
    timestamp: new Date().toISOString(),
  }
})
