<script setup lang="ts">
/**
 * Authenticated app shell — fixed left nav sidebar + main content slot.
 * Matches the design-system sidebar (240px, warm-gray surface, slate-teal
 * active state). Login/confirm opt out with `definePageMeta({ layout: false })`.
 */
const supabase = useSupabaseClient()
const route = useRoute()

const nav = [
  { label: 'Campaigns', to: '/campaigns', icon: 'ph-paper-plane-tilt' },
  { label: 'Contacts', to: '/contacts', icon: 'ph-users' },
  { label: 'Templates', to: '/templates', icon: 'ph-layout' },
  { label: 'Analytics', to: '/analytics', icon: 'ph-chart-line-up' },
  { label: 'Settings', to: '/settings', icon: 'ph-gear' },
]

function isActive(to: string) {
  return route.path === to || route.path.startsWith(to + '/')
}

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
    <nav class="sidebar">
      <!-- Brand -->
      <div class="brand">
        <div class="brand__logo">
          <i class="ph ph-paper-plane-tilt" />
        </div>
        <div class="brand__text">
          <div class="brand__name">Sendinal</div>
          <div class="brand__sub">Marketing Admin</div>
        </div>
      </div>

      <NuxtLink to="/campaigns/new" class="new-campaign">
        <i class="ph ph-plus" /> New Campaign
      </NuxtLink>

      <!-- Primary nav -->
      <div class="nav-group">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ 'nav-item--active': isActive(item.to) }"
        >
          <i class="ph" :class="item.icon" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </div>

      <!-- Footer nav -->
      <div class="nav-footer">
        <div class="nav-item nav-item--muted">
          <i class="ph ph-question" /> <span>Help Center</span>
        </div>
        <button
          type="button"
          class="nav-item nav-item--muted nav-item--button"
          :disabled="loggingOut"
          @click="logout"
        >
          <i class="ph ph-sign-out" /> <span>Log Out</span>
        </button>
      </div>
    </nav>

    <main class="main">
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
  padding: 20px 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 22px 8px;
}
.brand__logo {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: var(--primary-600);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.brand__logo .ph {
  font-size: 19px;
  color: #fff;
}
.brand__text {
  line-height: 1.2;
}
.brand__name {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 16px;
  color: var(--gray-800);
}
.brand__sub {
  font-size: 12px;
  color: var(--gray-500);
}

.new-campaign {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--primary-600);
  color: #fff;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  margin-bottom: 24px;
  transition: background-color 100ms ease;
}
.new-campaign:hover {
  background: var(--primary-800);
}
.new-campaign .ph {
  font-size: 16px;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  color: var(--gray-600);
  font-size: 14px;
  font-weight: 400;
  text-decoration: none;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background-color 120ms ease;
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

.nav-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 16px;
  border-top: 1px solid var(--gray-200);
}
.nav-item--muted {
  color: var(--gray-500);
}
.nav-item--muted .ph {
  color: var(--gray-500);
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

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
