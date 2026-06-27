// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxtjs/supabase', '@nuxt/eslint'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400&display=swap',
        },
        {
          rel: 'stylesheet',
          href: 'https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css',
        },
        {
          rel: 'stylesheet',
          href: 'https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css',
        },
      ],
    },
  },

  supabase: {
    redirect: true,
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      // Tracking pixels/redirects and SES webhooks must stay public.
      exclude: ['/t/*', '/api/webhooks/*'],
    },
  },

  runtimeConfig: {
    // Server-only secrets (override via NUXT_* env vars in production).
    supabaseServiceKey: '',
    awsRegion: '',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    sesFromEmail: '',
    sesFromName: '',
    // SES per-second send rate (binds NUXT_SES_RATE_LIMIT_PER_SECOND); the
    // worker's BullMQ limiter and the builder's throttle estimate read it.
    sesRateLimitPerSecond: '',
    sqsQueueUrl: '',
    redisUrl: '',
    public: {
      // Public base URL used to build tracking pixel/redirect links.
      appUrl: '',
    },
  },

  future: {
    compatibilityVersion: 4,
  },
})
