<script setup lang="ts">
import type { ContactStatus } from '#shared/schemas'

const props = defineProps<{ status: ContactStatus }>()

/** bg / text / border / dot per status (design-system status badge tokens). */
const META: Record<
  ContactStatus,
  { label: string; bg: string; fg: string; border: string; dot: string }
> = {
  active: {
    label: 'Active',
    bg: '#dcf3e8',
    fg: '#1a7a46',
    border: '#7dd3aa',
    dot: '#1a7a46',
  },
  unsubscribed: {
    label: 'Unsubscribed',
    bg: '#f0eeeb',
    fg: '#534d46',
    border: '#e2ded9',
    dot: '#a09990',
  },
  bounced: {
    label: 'Bounced',
    bg: '#fdf0e8',
    fg: '#984a14',
    border: '#f5c4a0',
    dot: '#984a14',
  },
  complained: {
    label: 'Complained',
    bg: '#fde8e8',
    fg: '#c0272d',
    border: '#f5a3a3',
    dot: '#c0272d',
  },
}

const meta = computed(() => META[props.status])
</script>

<template>
  <span
    class="badge"
    :style="{
      background: meta.bg,
      color: meta.fg,
      border: `1px solid ${meta.border}`,
    }"
  >
    <span class="badge__dot" :style="{ background: meta.dot }" />
    {{ meta.label }}
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.badge__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex: none;
}
</style>
