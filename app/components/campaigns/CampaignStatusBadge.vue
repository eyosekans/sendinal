<script setup lang="ts">
import type { CampaignStatus } from '#shared/schemas'

const props = defineProps<{ status: CampaignStatus }>()

const META: Record<
  CampaignStatus,
  {
    label: string
    bg: string
    fg: string
    border: string
    dot: string
    pulse: boolean
  }
> = {
  draft: {
    label: 'Draft',
    bg: '#f0eeeb',
    fg: '#534d46',
    border: '#e2ded9',
    dot: '#a09990',
    pulse: false,
  },
  scheduled: {
    label: 'Scheduled',
    bg: '#fef3d0',
    fg: '#92620a',
    border: '#f2d68a',
    dot: '#cc8a0a',
    pulse: false,
  },
  sending: {
    label: 'Sending',
    bg: '#e3f0fd',
    fg: '#1a5fa8',
    border: '#aed0f5',
    dot: '#1a5fa8',
    pulse: true,
  },
  sent: {
    label: 'Sent',
    bg: '#dcf3e8',
    fg: '#1a7a46',
    border: '#7dd3aa',
    dot: '#1a7a46',
    pulse: false,
  },
  failed: {
    label: 'Failed',
    bg: '#fde8e8',
    fg: '#c0272d',
    border: '#f3b9b9',
    dot: '#c0272d',
    pulse: false,
  },
  cancelled: {
    label: 'Cancelled',
    bg: '#f0eeeb',
    fg: '#787068',
    border: '#e2ded9',
    dot: '#787068',
    pulse: false,
  },
  paused: {
    label: 'Paused',
    bg: '#fef3d0',
    fg: '#92620a',
    border: '#f2d68a',
    dot: '#cc8a0a',
    pulse: false,
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
    <span
      class="badge__dot"
      :class="{ 'badge__dot--pulse': meta.pulse }"
      :style="{ background: meta.dot }"
    />
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
.badge__dot--pulse {
  animation: sendingpulse 1.1s ease-in-out infinite;
}
@keyframes sendingpulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
</style>
