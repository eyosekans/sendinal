<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

/**
 * Email + password sign-in for the internal team. There is no public sign-up;
 * accounts are provisioned via the Supabase dashboard.
 *
 * `@nuxtjs/supabase` (redirect: true) sends unauthenticated users here and
 * preserves their intended path in `?redirect=`. Once a session exists we send
 * them on.
 */
definePageMeta({ layout: false })
useHead({ title: 'Sign in — Sendinal' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()
const toast = useToast()

const redirectTo = computed(() => {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') ? r : '/'
})

// Bounce already-authenticated users (and complete the redirect after login).
watch(
  user,
  () => {
    if (user.value) navigateTo(redirectTo.value)
  },
  { immediate: true },
)

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
type Schema = z.output<typeof schema>

const state = reactive<{ email?: string; password?: string }>({
  email: undefined,
  password: undefined,
})

const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  const { error } = await supabase.auth.signInWithPassword({
    email: event.data.email,
    password: event.data.password,
  })
  loading.value = false

  if (error) {
    toast.add({
      title: 'Sign in failed',
      description: error.message,
      color: 'error',
    })
    return
  }
  // The `user` watcher above handles navigation once the session is set.
}
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center p-4 bg-(--ui-bg-muted)"
  >
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="text-center">
          <h1 class="text-xl font-bold">Sendinal</h1>
          <p class="text-sm text-(--ui-text-muted) mt-1">Sign in to continue</p>
        </div>
      </template>

      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField label="Email" name="email">
          <UInput
            v-model="state.email"
            type="email"
            autocomplete="email"
            placeholder="you@company.com"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Password" name="password">
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            class="w-full"
          />
        </UFormField>

        <UButton type="submit" block :loading="loading"> Sign in </UButton>
      </UForm>
    </UCard>
  </div>
</template>
