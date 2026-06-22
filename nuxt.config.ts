// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxtjs/supabase', '@nuxt/eslint'],

  css: ['~/assets/css/main.css'],

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
