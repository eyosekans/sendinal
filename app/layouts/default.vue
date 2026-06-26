<script setup lang="ts">
/**
 * Authenticated app shell — fixed left nav sidebar + a shared top bar over the
 * page content slot. The 240px warm-gray sidebar has a bordered brand header,
 * grouped nav (Workspace / Insights), and a user profile card pinned to the
 * bottom. The top bar (search + global actions) is owned here, not per page;
 * pages drive its search via `useTopbar()`.
 * Login/confirm opt out with `definePageMeta({ layout: false })`.
 */
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()

// Shared top bar — search query + placeholder come from the active page.
const { search, placeholder } = useTopbar()
function newCampaign() {
  navigateTo('/campaigns/new')
}

const workspaceNav = [
  { label: 'Dashboard', to: '/', icon: 'ph-house' },
  { label: 'Campaigns', to: '/campaigns', icon: 'ph-paper-plane-tilt' },
  { label: 'Contacts', to: '/contacts', icon: 'ph-users' },
  { label: 'Lists', to: '/lists', icon: 'ph-list-bullets' },
  { label: 'Templates', to: '/templates', icon: 'ph-layout' },
]

const insightsNav = [
  { label: 'Analytics', to: '/analytics', icon: 'ph-chart-line-up' },
  { label: 'Settings', to: '/settings', icon: 'ph-gear' },
]

function isActive(to: string) {
  return route.path === to || route.path.startsWith(to + '/')
}

// Profile card — derive a display name + initials from the signed-in user.
const displayName = computed<string>(() => {
  const meta = user.value?.user_metadata as Record<string, unknown> | undefined
  const fullName = (meta?.full_name || meta?.name) as string | undefined
  if (fullName) return fullName
  const email = user.value?.email
  return email ? email.split('@')[0]! : 'Account'
})
const displayEmail = computed(() => user.value?.email ?? '')
const initials = computed(() => {
  const name = displayName.value.trim()
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return name.slice(0, 2).toUpperCase() || 'AC'
})

const loggingOut = ref(false)
async function logout() {
  loggingOut.value = true
  await supabase.auth.signOut()
  loggingOut.value = false
  await navigateTo('/login')
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <!-- Brand header -->
      <div class="brand">
        <div class="brand__logo">
          <i class="ph-fill ph-paper-plane-tilt" />
        </div>
        <span class="brand__name">Sendinal</span>
      </div>

      <!-- Nav -->
      <nav class="nav">
        <div class="nav-label">Workspace</div>
        <NuxtLink
          v-for="item in workspaceNav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ 'nav-item--active': isActive(item.to) }"
        >
          <i class="ph" :class="item.icon" />
          <span>{{ item.label }}</span>
        </NuxtLink>

        <div class="nav-label nav-label--spaced">Insights</div>
        <NuxtLink
          v-for="item in insightsNav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ 'nav-item--active': isActive(item.to) }"
        >
          <i class="ph" :class="item.icon" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <!-- Help / Log Out, pinned just above the profile card -->
      <div class="nav-footer">
        <a
          href="https://help.sendinal.com"
          target="_blank"
          rel="noopener"
          class="nav-item"
        >
          <i class="ph ph-question" />
          <span>Help Center</span>
        </a>
        <button
          type="button"
          class="nav-item nav-item--button"
          :disabled="loggingOut"
          @click="logout"
        >
          <i class="ph ph-sign-out" />
          <span>Log Out</span>
        </button>
      </div>

      <!-- User profile card -->
      <div class="profile">
        <div class="profile__avatar">{{ initials }}</div>
        <div class="profile__meta">
          <div class="profile__name">{{ displayName }}</div>
          <div class="profile__email">{{ displayEmail }}</div>
        </div>
        <i class="ph ph-caret-up-down profile__caret" />
      </div>
    </aside>

    <main class="main">
      <!-- Shared top bar -->
      <header class="topbar">
        <div class="search">
          <i class="ph ph-magnifying-glass search__icon" />
          <input v-model="search" class="search__input" :placeholder="placeholder" />
          <span class="search__kbd">⌘K</span>
        </div>
        <div class="topbar__right">
          <button type="button" class="icon-btn" title="Notifications">
            <i class="ph ph-bell" />
            <span class="icon-btn__dot" />
          </button>
          <button type="button" class="btn-primary" @click="newCampaign">
            <i class="ph ph-plus" /> New Campaign
          </button>
        </div>
      </header>

      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background: var(--gray-50);
}

.sidebar {
  width: 240px;
  flex: none;
  background: var(--gray-100);
  border-right: 1px solid var(--gray-200);
  display: flex;
  flex-direction: column;
}

/* Brand header */
.brand {
  height: 64px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  border-bottom: 1px solid var(--gray-200);
}
.brand__logo {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--primary-600);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  box-shadow: 0 1px 2px rgba(15, 82, 71, 0.35);
}
.brand__logo .ph-fill {
  font-size: 17px;
  color: #fff;
}
.brand__name {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 18px;
  color: var(--gray-800);
  letter-spacing: -0.3px;
}

/* Nav */
.nav {
  flex: 1;
  padding: 14px 12px;
  overflow-y: auto;
}
.nav-label {
  font-size: 11px;
  font-weight: 500;
  color: #a09990;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 12px 6px;
}
.nav-label--spaced {
  padding-top: 18px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  color: var(--gray-600);
  font-size: 13px;
  font-weight: 400;
  text-decoration: none;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background-color 120ms ease, color 120ms ease;
}
.nav-item .ph {
  font-size: 20px;
  color: var(--gray-500);
}
.nav-item:hover {
  background: var(--gray-200);
  color: var(--gray-800);
}
.nav-item:hover .ph {
  color: var(--gray-700);
}
.nav-item--active {
  background: var(--primary-100);
  color: var(--primary-800);
  font-weight: 500;
  border-left: 2px solid var(--primary-600);
  padding-left: 10px;
}
.nav-item--active .ph {
  color: var(--primary-600);
}
.nav-item--active:hover {
  background: var(--primary-100);
  color: var(--primary-800);
}
.nav-item--button {
  background: none;
  border: none;
  border-left: 2px solid transparent;
  width: 100%;
  font-family: var(--font-body);
  text-align: left;
}
.nav-item--button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Help / Log Out footer — pinned above the profile card */
.nav-footer {
  flex: none;
  padding: 4px 12px;
  display: flex;
  flex-direction: column;
}

/* Profile card */
.profile {
  flex: none;
  padding: 12px;
  border-top: 1px solid var(--gray-200);
  display: flex;
  align-items: center;
  gap: 10px;
}
.profile__avatar {
  width: 32px;
  height: 32px;
  border-radius: 9999px;
  background: var(--primary-600);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 500;
  flex: none;
}
.profile__meta {
  min-width: 0;
  flex: 1;
}
.profile__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-800);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.profile__email {
  font-size: 11px;
  color: var(--gray-500);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.profile__caret {
  font-size: 16px;
  color: #a09990;
  flex: none;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Top bar */
.topbar {
  height: 64px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 28px;
  border-bottom: 1px solid var(--gray-200);
  background: var(--gray-50);
}
.search {
  position: relative;
  flex: 1;
  max-width: 420px;
}
.search__icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 16px;
  color: var(--gray-400);
}
.search__input {
  width: 100%;
  height: 38px;
  padding: 0 40px 0 34px;
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  background: #fff;
  font-family: var(--font-body);
  font-size: 13.5px;
  color: var(--gray-800);
  outline: none;
}
.search__input:focus {
  border-color: var(--primary-600);
  outline: 2px solid var(--primary-100);
}
.search__kbd {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: var(--gray-400);
  border: 1px solid var(--gray-200);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: var(--font-mono);
}
.topbar__right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.icon-btn {
  position: relative;
  width: 38px;
  height: 38px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gray-600);
}
.icon-btn:hover {
  background: var(--gray-100);
}
.icon-btn .ph {
  font-size: 20px;
}
.icon-btn__dot {
  position: absolute;
  top: 8px;
  right: 9px;
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--danger-600);
  border: 1.5px solid var(--gray-50);
}
.btn-primary {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 38px;
  padding: 0 16px;
  background: var(--primary-600);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 13.5px;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(15, 82, 71, 0.25);
  transition: background-color 100ms ease;
}
.btn-primary:hover {
  background: var(--primary-800);
}
.btn-primary .ph {
  font-size: 16px;
}
</style>
