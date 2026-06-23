<script setup lang="ts">
/**
 * Auth callback target configured in nuxt.config (`redirectOptions.callback`).
 * Supabase redirects here after completing an auth flow; once the session is
 * established we forward to the app (or the originally requested path).
 */
definePageMeta({ layout: false })
useHead({ title: 'Signing in… — Sendinal' })

const user = useSupabaseUser()
const route = useRoute()

const redirectTo = computed(() => {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') ? r : '/'
})

watch(
  user,
  () => {
    if (user.value) navigateTo(redirectTo.value)
  },
  { immediate: true },
)
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-3">
    <UIcon
      name="i-lucide-loader-circle"
      class="size-6 animate-spin text-(--ui-text-muted)"
    />
    <p class="text-sm text-(--ui-text-muted)">Signing you in…</p>
  </div>
</template>
