<script setup lang="ts">
/**
 * Topbar notification bell (task 4.2). Loads the signed-in user's alert feed,
 * shows an unread badge, and opens a dropdown panel. Clicking an alert marks it
 * read and (if it references a campaign) navigates there. Polls every 60s so a
 * worker-generated alert appears without a reload.
 */
import type {
  NotificationItem,
  NotificationsResponse,
} from '~/types/notification'
import type { NotificationSeverity } from '~/types/database.types'

const items = ref<NotificationItem[]>([])
const unread = ref(0)
const open = ref(false)
const root = ref<HTMLElement | null>(null)

async function load() {
  try {
    const res = await $fetch<NotificationsResponse>('/api/notifications')
    items.value = res.data
    unread.value = res.unread
  } catch {
    // Silent — a transient feed error shouldn't break the shell.
  }
}

let timer: ReturnType<typeof setInterval> | null = null
function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => {
  void load()
  timer = setInterval(() => void load(), 60_000)
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('click', onDocClick)
})

async function toggle() {
  open.value = !open.value
  if (open.value) await load()
}

async function markAll() {
  await $fetch('/api/notifications/read', { method: 'POST', body: {} })
  await load()
}

async function openItem(n: NotificationItem) {
  if (!n.read_at) {
    await $fetch('/api/notifications/read', {
      method: 'POST',
      body: { id: n.id },
    })
  }
  open.value = false
  if (n.campaign_id) await navigateTo(`/campaigns/${n.campaign_id}`)
  else await load()
}

const DOT: Record<NotificationSeverity, string> = {
  info: 'var(--primary-600)',
  warning: 'var(--warning-600)',
  critical: 'var(--danger-600)',
}
function dot(sev: NotificationSeverity) {
  return DOT[sev] ?? DOT.info
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
</script>

<template>
  <div ref="root" class="bell">
    <button
      type="button"
      class="icon-btn"
      title="Notifications"
      @click="toggle"
    >
      <i class="ph ph-bell" />
      <span v-if="unread > 0" class="icon-btn__badge">{{
        unread > 9 ? '9+' : unread
      }}</span>
    </button>

    <div v-if="open" class="panel">
      <div class="panel__head">
        <span class="panel__title">Notifications</span>
        <button
          v-if="unread > 0"
          type="button"
          class="panel__action"
          @click="markAll"
        >
          Mark all read
        </button>
      </div>

      <div v-if="!items.length" class="panel__empty">
        <i class="ph ph-check-circle" />
        <span>You're all caught up.</span>
      </div>

      <ul v-else class="list">
        <li
          v-for="n in items"
          :key="n.id"
          class="item"
          :class="{ 'item--unread': !n.read_at }"
          @click="openItem(n)"
        >
          <span class="item__dot" :style="{ background: dot(n.severity) }" />
          <div class="item__body">
            <div class="item__title">{{ n.title }}</div>
            <div class="item__text">{{ n.body }}</div>
            <div class="item__time">{{ relTime(n.created_at) }}</div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.bell {
  position: relative;
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
.icon-btn__badge {
  position: absolute;
  top: 3px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 9999px;
  background: var(--danger-600);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  border: 1.5px solid var(--gray-50);
}

/* dropdown panel */
.panel {
  position: absolute;
  top: 46px;
  right: 0;
  width: 380px;
  max-height: 460px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 12px;
  box-shadow: var(--shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.12));
  z-index: 50;
  overflow: hidden;
}
.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  border-bottom: 1px solid var(--gray-100);
}
.panel__title {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 15px;
  color: var(--gray-800);
}
.panel__action {
  border: none;
  background: none;
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--primary-600);
  padding: 4px 6px;
  border-radius: 5px;
}
.panel__action:hover {
  background: var(--primary-50);
}
.panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 36px 16px;
  color: var(--gray-500);
  font-size: 13px;
}
.panel__empty .ph {
  font-size: 28px;
  color: var(--success-600);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
}
.item {
  display: flex;
  gap: 10px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--gray-100);
  cursor: pointer;
  transition: background-color 80ms ease;
}
.item:hover {
  background: var(--gray-50);
}
.item--unread {
  background: var(--primary-50);
}
.item--unread:hover {
  background: var(--primary-100);
}
.item__dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  margin-top: 5px;
  flex: none;
}
.item__body {
  min-width: 0;
}
.item__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-800);
  margin-bottom: 2px;
}
.item__text {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--gray-600);
}
.item__time {
  font-size: 11px;
  color: var(--gray-400);
  margin-top: 4px;
}
</style>
