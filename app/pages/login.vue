<script setup lang="ts">
/**
 * Email + password sign-in for the internal team (no public sign-up; accounts
 * are provisioned via the Supabase dashboard). Built from the Claude Design
 * handoff `docs/sign-in-screen-design/SignIn.dc.html`.
 *
 * Deviations from the mock (intentional): brand stays **Sendinal** (not the
 * mock's "Cadence") with the app's paper-plane mark; the Google SSO button +
 * divider are dropped (our auth is email+password only — the mock defaults SSO
 * off too). The left brand panel shows on wide screens and collapses on narrow.
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

const status = ref<'idle' | 'loading' | 'success'>('idle')

// Bounce already-authenticated users (and complete the redirect after login).
watch(
  user,
  () => {
    if (user.value) {
      status.value = 'success'
      navigateTo(redirectTo.value)
    }
  },
  { immediate: true },
)

/* ---------- form state ---------- */
const email = ref('')
const password = ref('')
const showPw = ref(false)
const remember = ref(true) // visual only — Supabase persists the session regardless
const focusField = ref<'email' | 'password' | null>(null)
const emailErr = ref('')
const pwErr = ref('')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function validEmail(v: string) {
  return EMAIL_RE.test(v)
}

const formDisabled = computed(() => status.value !== 'idle')

function blurEmail() {
  focusField.value = null
  if (email.value && !validEmail(email.value))
    emailErr.value = 'Enter a valid email address'
}

async function onSubmit() {
  emailErr.value = ''
  pwErr.value = ''
  if (!email.value) emailErr.value = 'Email is required'
  else if (!validEmail(email.value))
    emailErr.value = 'Enter a valid email address'
  if (!password.value) pwErr.value = 'Password is required'
  if (emailErr.value || pwErr.value) return

  status.value = 'loading'
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })

  if (error) {
    status.value = 'idle'
    toast.add({
      title: 'Sign in failed',
      description: error.message,
      color: 'error',
    })
    return
  }
  // Success: the `user` watcher flips to the success view and navigates.
}

async function forgot() {
  if (!email.value || !validEmail(email.value)) {
    toast.add({
      title: 'Enter your email first',
      description: "Type your email above and we'll send you a reset link.",
      color: 'warning',
    })
    return
  }
  const redirect =
    typeof window !== 'undefined' ? `${window.location.origin}/confirm` : undefined
  const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
    redirectTo: redirect,
  })
  if (error) {
    toast.add({ title: 'Could not send reset link', description: error.message, color: 'error' })
    return
  }
  toast.add({
    title: 'Reset link sent',
    description: `Check ${email.value} for a link to reset your password.`,
    color: 'success',
  })
}
</script>

<template>
  <div class="auth">
    <!-- Brand panel (wide screens only) -->
    <aside class="brand">
      <div class="brand__glow brand__glow--tr" />
      <div class="brand__glow brand__glow--bl" />

      <div class="brand__logo">
        <span class="brand__mark"><i class="ph-fill ph-paper-plane-tilt" /></span>
        <span class="brand__name">Sendinal</span>
      </div>

      <div class="brand__body">
        <div class="brand__copy">
          <h1 class="brand__title">Where every campaign comes together.</h1>
          <p class="brand__sub">
            Draft, schedule, and measure your team's email — all in one calm,
            focused workspace.
          </p>
        </div>

        <!-- Browser-chrome mockup with a faux dashboard preview -->
        <div class="shot">
          <div class="shot__bar">
            <span class="shot__dot" />
            <span class="shot__dot" />
            <span class="shot__dot" />
            <span class="shot__url">app.sendinal.io/campaigns</span>
          </div>
          <div class="shot__body">
            <div class="shot__row shot__row--head" />
            <div class="shot__cards">
              <div class="shot__card" />
              <div class="shot__card" />
              <div class="shot__card" />
            </div>
            <div class="shot__row" />
            <div class="shot__row shot__row--short" />
            <div class="shot__row" />
          </div>
        </div>
      </div>
    </aside>

    <!-- Form panel -->
    <main class="panel">
      <div class="panel__inner">
        <template v-if="status !== 'success'">
          <span class="form__logo"><i class="ph-fill ph-paper-plane-tilt" /></span>
          <h2 class="form__title">Sign in to Sendinal</h2>
          <p class="form__lead">Welcome back. Sign in to manage your campaigns.</p>

          <form novalidate @submit.prevent="onSubmit">
            <div class="field">
              <label for="email" class="field__label">Email</label>
              <input
                id="email"
                v-model="email"
                type="email"
                autocomplete="username"
                placeholder="you@company.com"
                :disabled="formDisabled"
                class="input input--mono"
                :class="{ 'input--error': emailErr }"
                @focus="focusField = 'email'"
                @blur="blurEmail"
              />
              <div v-if="emailErr" class="field__err">
                <i class="ph ph-warning-circle" />
                <span>{{ emailErr }}</span>
              </div>
            </div>

            <div class="field">
              <label for="password" class="field__label">Password</label>
              <div class="field__wrap">
                <input
                  id="password"
                  v-model="password"
                  :type="showPw ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="Enter your password"
                  :disabled="formDisabled"
                  class="input input--mono input--pw"
                  :class="{ 'input--error': pwErr }"
                  @focus="focusField = 'password'"
                  @blur="focusField = null"
                />
                <button
                  type="button"
                  class="field__toggle"
                  aria-label="Toggle password visibility"
                  @click="showPw = !showPw"
                >
                  <i class="ph" :class="showPw ? 'ph-eye-slash' : 'ph-eye'" />
                </button>
              </div>
              <div v-if="pwErr" class="field__err">
                <i class="ph ph-warning-circle" />
                <span>{{ pwErr }}</span>
              </div>
            </div>

            <div class="row">
              <label class="check">
                <input v-model="remember" type="checkbox" class="check__input" />
                <span class="check__box"><i class="ph ph-check" /></span>
                <span class="check__label">Remember me</span>
              </label>
              <button type="button" class="link" @click="forgot">
                Forgot password?
              </button>
            </div>

            <button type="submit" class="submit" :disabled="formDisabled">
              <template v-if="status === 'loading'">
                <span class="spinner" />
                <span>Signing in…</span>
              </template>
              <span v-else>Sign in</span>
            </button>
          </form>

          <p class="form__foot">
            Need access?
            <a href="mailto:it-admin@sendinal.io" class="link">Contact your workspace admin</a>
          </p>
        </template>

        <!-- Success / redirecting -->
        <div v-else class="done">
          <div class="done__icon"><i class="ph ph-check" /></div>
          <h2 class="done__title">You're signed in</h2>
          <p class="done__sub">Taking you to your dashboard…</p>
          <div class="done__redirect">
            <span class="spinner spinner--teal" />
            <span>Redirecting</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100vh;
  width: 100%;
  display: flex;
  background: #ffffff;
  font-family: 'Inter', system-ui, sans-serif;
  color: #3d3830;
}

/* ---------- brand panel ---------- */
.brand {
  position: relative;
  overflow: hidden;
  flex: 1 1 0;
  min-width: 0;
  background: linear-gradient(158deg, #0f5247 0%, #092f29 100%);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 56px 56px 0;
}
.brand__glow {
  position: absolute;
  border-radius: 9999px;
  pointer-events: none;
}
.brand__glow--tr {
  top: -130px;
  right: -90px;
  width: 380px;
  height: 380px;
  background: radial-gradient(circle, #1a7a6e 0%, rgba(26, 122, 110, 0) 70%);
  opacity: 0.55;
}
.brand__glow--bl {
  bottom: 80px;
  left: -150px;
  width: 340px;
  height: 340px;
  background: radial-gradient(circle, #2fa898 0%, rgba(47, 168, 152, 0) 70%);
  opacity: 0.28;
}
.brand__logo {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
}
.brand__mark {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.brand__mark .ph-fill {
  font-size: 17px;
  color: #ffffff;
}
.brand__name {
  font-family: 'DM Sans', system-ui, sans-serif;
  font-weight: 500;
  font-size: 20px;
  letter-spacing: -0.01em;
}
.brand__body {
  position: relative;
}
.brand__copy {
  max-width: 440px;
  margin-bottom: 40px;
}
.brand__title {
  font-family: 'DM Sans', system-ui, sans-serif;
  font-weight: 500;
  font-size: 40px;
  line-height: 1.14;
  letter-spacing: -0.02em;
  margin: 0 0 16px;
  text-wrap: balance;
}
.brand__sub {
  font-size: 16px;
  line-height: 1.6;
  color: #94d5c8;
  margin: 0;
  max-width: 400px;
}

/* browser-chrome product mock */
.shot {
  position: relative;
  border-radius: 12px 12px 0 0;
  background: #ffffff;
  box-shadow: 0 28px 70px rgba(9, 47, 41, 0.5);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-bottom: none;
}
.shot__bar {
  height: 42px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  background: #f8f7f5;
  border-bottom: 1px solid #e2ded9;
}
.shot__dot {
  width: 11px;
  height: 11px;
  border-radius: 9999px;
  background: #e2ded9;
}
.shot__url {
  margin-left: 12px;
  height: 24px;
  flex: 1;
  max-width: 300px;
  border-radius: 9999px;
  background: #f0eeeb;
  border: 1px solid #e2ded9;
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #a09990;
  overflow: hidden;
  white-space: nowrap;
}
.shot__body {
  height: 300px;
  background: #f8f7f5;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.shot__row {
  height: 14px;
  border-radius: 6px;
  background: #e8e5e0;
}
.shot__row--head {
  width: 45%;
  height: 18px;
  background: #ddd9d3;
}
.shot__row--short {
  width: 70%;
}
.shot__cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin: 2px 0;
}
.shot__card {
  height: 64px;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid #ece9e4;
}

/* ---------- form panel ---------- */
.panel {
  flex: 1 1 0;
  min-width: 0;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 40px;
}
.panel__inner {
  width: 100%;
  max-width: 400px;
}
.form__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #edf7f5;
  margin-bottom: 28px;
}
.form__logo .ph-fill {
  font-size: 20px;
  color: #1a7a6e;
}
.form__title {
  font-family: 'DM Sans', system-ui, sans-serif;
  font-weight: 500;
  font-size: 30px;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: #18150f;
  margin: 0 0 8px;
}
.form__lead {
  font-size: 14px;
  line-height: 1.6;
  color: #787068;
  margin: 0 0 28px;
}

.field {
  margin-bottom: 18px;
}
.field:last-of-type {
  margin-bottom: 14px;
}
.field__label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #3d3830;
  margin-bottom: 8px;
}
.field__wrap {
  position: relative;
}
.input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border-radius: 6px;
  border: 1px solid #e2ded9;
  outline: 2px solid transparent;
  outline-offset: 0;
  background: #ffffff;
  font-size: 14px;
  color: #28241e;
  transition:
    border-color 100ms ease,
    background-color 100ms ease,
    outline-color 100ms ease;
}
.input--mono {
  font-family: 'JetBrains Mono', monospace;
}
.input--pw {
  padding-right: 44px;
}
.input::placeholder {
  color: #a09990;
  opacity: 1;
}
.input:focus {
  border-color: #1a7a6e;
  outline-color: #c8ebe4;
}
.input:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
.input--error {
  border-color: #c0272d;
  background: #fffafa;
}
.input--error:focus {
  border-color: #c0272d;
  outline-color: #fde8e8;
}
.field__toggle {
  position: absolute;
  top: 0;
  right: 0;
  height: 44px;
  width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #787068;
}
.field__toggle .ph {
  font-size: 18px;
}
.field__err {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 13px;
  color: #c0272d;
}
.field__err .ph {
  font-size: 14px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.check__input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.check__box {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid #c9c4bd;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  transition:
    background-color 100ms ease,
    border-color 100ms ease;
}
.check__box .ph {
  font-size: 12px;
  color: #ffffff;
  opacity: 0;
}
.check__input:checked + .check__box {
  background: #1a7a6e;
  border-color: #1a7a6e;
}
.check__input:checked + .check__box .ph {
  opacity: 1;
}
.check__input:focus-visible + .check__box {
  outline: 2px solid #c8ebe4;
  outline-offset: 1px;
}
.check__label {
  font-size: 13px;
  color: #534d46;
}
.link {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: #1a7a6e;
  text-decoration: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.link:hover {
  text-decoration: underline;
}

.submit {
  width: 100%;
  height: 44px;
  border: none;
  border-radius: 6px;
  background: #1a7a6e;
  color: #ffffff;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: background-color 100ms ease;
}
.submit:hover:not(:disabled) {
  background: #0f5247;
}
.submit:disabled {
  cursor: not-allowed;
  opacity: 0.9;
}
.form__foot {
  margin: 24px 0 0;
  text-align: center;
  font-size: 13px;
  color: #787068;
}

.spinner {
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #ffffff;
  animation: spin 0.7s linear infinite;
  display: inline-block;
  flex: none;
}
.spinner--teal {
  width: 16px;
  height: 16px;
  border-color: #c8ebe4;
  border-top-color: #1a7a6e;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* success state */
.done {
  text-align: center;
  padding: 24px 0;
}
.done__icon {
  width: 64px;
  height: 64px;
  border-radius: 9999px;
  background: #edf7f5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
}
.done__icon .ph {
  font-size: 32px;
  color: #1a7a6e;
}
.done__title {
  font-family: 'DM Sans', system-ui, sans-serif;
  font-weight: 500;
  font-size: 24px;
  line-height: 1.25;
  color: #18150f;
  margin: 0 0 8px;
}
.done__sub {
  font-size: 14px;
  line-height: 1.6;
  color: #787068;
  margin: 0 0 24px;
}
.done__redirect {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #787068;
  font-size: 13px;
}

@media (max-width: 900px) {
  .brand {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 0.001ms;
    animation-iteration-count: 1;
  }
}
</style>
