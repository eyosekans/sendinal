<script setup lang="ts">
import type { CampaignDetail, CampaignStats } from '~/types/campaign'
import CampaignStatusBadge from '~/components/campaigns/CampaignStatusBadge.vue'

const route = useRoute()
const id = route.params.id as string

const user = useSupabaseUser()
const userInitials = computed(() =>
  (user.value?.email ?? 'U').slice(0, 2).toUpperCase(),
)

const {
  data: campaign,
  error: campaignError,
  refresh: refreshCampaign,
} = await useFetch<CampaignDetail>(`/api/campaigns/${id}`)

const {
  data: stats,
  pending: statsPending,
  refresh: refreshStats,
} = await useFetch<CampaignStats>(`/api/campaigns/${id}/stats`)

useHead({
  title: computed(() =>
    campaign.value
      ? `${campaign.value.name} — Sendinal`
      : 'Campaign — Sendinal',
  ),
})

const notFound = computed(() => campaignError.value?.statusCode === 404)
const canEdit = computed(
  () =>
    campaign.value?.status === 'draft' ||
    campaign.value?.status === 'scheduled',
)

const refreshing = ref(false)
async function refreshAll() {
  refreshing.value = true
  try {
    await Promise.all([refreshCampaign(), refreshStats()])
  } finally {
    refreshing.value = false
  }
}

/* ---------- formatting ---------- */
function fmtNum(n: number) {
  return n.toLocaleString('en-US')
}
function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function pct(v: number | null) {
  return v === null ? '—' : `${v.toFixed(1)}%`
}

/* ---------- summary cards ---------- */
interface Card {
  key: string
  label: string
  value: number
  sub: string | null
  icon: string
  tone: 'neutral' | 'success' | 'warning' | 'danger'
}
const cards = computed<Card[]>(() => {
  const s = stats.value
  if (!s) return []
  return [
    {
      key: 'recipients',
      label: 'Recipients',
      value: s.recipients,
      sub: s.counts.queued ? `${fmtNum(s.counts.queued)} queued` : null,
      icon: 'ph-users',
      tone: 'neutral',
    },
    {
      key: 'delivered',
      label: 'Delivered',
      value: s.counts.sent,
      sub: pct(s.rates.delivered),
      icon: 'ph-check-circle',
      tone: 'success',
    },
    {
      key: 'bounced',
      label: 'Bounced',
      value: s.counts.bounced,
      sub: pct(s.rates.bounce),
      icon: 'ph-arrow-u-down-left',
      tone: 'warning',
    },
    {
      key: 'complained',
      label: 'Complained',
      value: s.counts.complained,
      sub: pct(s.rates.complaint),
      icon: 'ph-flag',
      tone: 'danger',
    },
    {
      key: 'failed',
      label: 'Failed',
      value: s.counts.failed,
      sub: pct(s.rates.failed),
      icon: 'ph-warning-circle',
      tone: 'danger',
    },
  ]
})

/* ---------- delivery breakdown bar ---------- */
const SEGMENTS = [
  { key: 'sent', label: 'Delivered', color: 'var(--success-600)' },
  { key: 'bounced', label: 'Bounced', color: 'var(--warning-600)' },
  { key: 'complained', label: 'Complained', color: 'var(--danger-600)' },
  { key: 'failed', label: 'Failed', color: '#9a4040' },
  { key: 'queued', label: 'Queued', color: 'var(--gray-300)' },
] as const

const breakdown = computed(() => {
  const s = stats.value
  if (!s || s.recipients === 0) return []
  return SEGMENTS.map((seg) => {
    const count = s.counts[seg.key]
    return {
      ...seg,
      count,
      width: (count / s.recipients) * 100,
    }
  }).filter((seg) => seg.count > 0)
})
</script>

<template>
  <div class="page">
    <!-- top utility bar -->
    <div class="topbar">
      <NuxtLink to="/campaigns" class="back">
        <i class="ph ph-arrow-left" /> Campaigns
      </NuxtLink>
      <div class="topbar__right">
        <div class="avatar-me">{{ userInitials }}</div>
      </div>
    </div>

    <div class="scroll">
      <div class="content">
        <!-- not found -->
        <div v-if="notFound" class="empty">
          <div class="empty__icon"><i class="ph ph-magnifying-glass" /></div>
          <div class="empty__title">Campaign not found</div>
          <div class="empty__desc">
            This campaign may have been deleted.
            <NuxtLink to="/campaigns" class="empty__link"
              >Back to campaigns</NuxtLink
            >.
          </div>
        </div>

        <template v-else-if="campaign">
          <!-- header -->
          <div class="header">
            <div class="header__main">
              <div class="header__titlerow">
                <h1 class="header__title">{{ campaign.name }}</h1>
                <CampaignStatusBadge :status="campaign.status" />
              </div>
              <div class="header__subject">{{ campaign.subject }}</div>
              <div class="header__meta">
                <span class="meta-item">
                  <i class="ph ph-paper-plane-tilt" />
                  {{
                    campaign.sent_at
                      ? fmtDateTime(campaign.sent_at)
                      : campaign.scheduled_at
                        ? `Scheduled ${fmtDateTime(campaign.scheduled_at)}`
                        : 'Not sent yet'
                  }}
                </span>
                <span class="meta-item">
                  <i class="ph ph-list-bullets" />
                  {{ campaign.listName ?? 'No list' }}
                </span>
                <span class="meta-item">
                  <i class="ph ph-envelope-simple" />
                  {{ campaign.from_name }} &lt;{{ campaign.from_email }}&gt;
                </span>
              </div>
            </div>
            <div class="header__actions">
              <NuxtLink
                v-if="canEdit"
                :to="`/campaigns/${id}/edit`"
                class="edit-btn"
              >
                <i class="ph ph-pencil-simple" /> Edit
              </NuxtLink>
              <button
                type="button"
                class="refresh-btn"
                :disabled="refreshing"
                @click="refreshAll"
              >
                <i
                  class="ph ph-arrows-clockwise"
                  :class="{ 'refresh-btn__spin': refreshing }"
                />
                Refresh
              </button>
            </div>
          </div>

          <!-- summary cards -->
          <div class="cards" :class="{ 'cards--loading': statsPending }">
            <div
              v-for="card in cards"
              :key="card.key"
              class="card"
              :class="`card--${card.tone}`"
            >
              <div class="card__top">
                <span class="card__label">{{ card.label }}</span>
                <i class="ph card__icon" :class="card.icon" />
              </div>
              <div class="card__value">{{ fmtNum(card.value) }}</div>
              <div v-if="card.sub" class="card__sub">{{ card.sub }}</div>
            </div>
          </div>

          <!-- delivery breakdown -->
          <div class="panel">
            <div class="panel__head">
              <h2 class="panel__title">Delivery breakdown</h2>
              <span class="panel__total"
                >{{ fmtNum(stats?.recipients ?? 0) }} total</span
              >
            </div>

            <template v-if="breakdown.length">
              <div class="bar">
                <div
                  v-for="seg in breakdown"
                  :key="seg.key"
                  class="bar__seg"
                  :style="{ width: seg.width + '%', background: seg.color }"
                  :title="`${seg.label}: ${fmtNum(seg.count)}`"
                />
              </div>
              <div class="legend">
                <div v-for="seg in breakdown" :key="seg.key" class="legend__it">
                  <span
                    class="legend__dot"
                    :style="{ background: seg.color }"
                  />
                  <span class="legend__label">{{ seg.label }}</span>
                  <span class="legend__count">{{ fmtNum(seg.count) }}</span>
                </div>
              </div>
            </template>

            <div v-else class="panel__empty">
              No recipients yet — this campaign hasn’t been dispatched.
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: contents;
}

/* top utility bar */
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
.back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  color: var(--gray-600);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: background-color 100ms ease;
}
.back:hover {
  background: var(--gray-100);
  color: var(--gray-800);
}
.back .ph {
  font-size: 16px;
}
.topbar__right {
  margin-left: auto;
}
.avatar-me {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-full);
  background: var(--primary-600);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 13px;
}

/* scroll + content */
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 28px;
}
.content {
  max-width: 1100px;
  margin: 0 auto;
}

/* header */
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 28px;
}
.header__titlerow {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.header__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 26px;
  line-height: 1.2;
  color: var(--gray-800);
}
.header__subject {
  font-size: 15px;
  color: var(--gray-600);
  margin-bottom: 14px;
}
.header__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}
.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--gray-500);
}
.meta-item .ph {
  font-size: 15px;
  color: var(--gray-400);
}
.header__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  border-radius: var(--radius-md);
  background: var(--primary-600);
  color: #fff;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: background-color 100ms ease;
}
.edit-btn:hover {
  background: var(--primary-800);
}
.edit-btn .ph {
  font-size: 15px;
}
.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px;
  flex: none;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: #fff;
  color: var(--gray-700);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.refresh-btn:hover:not(:disabled) {
  background: var(--gray-100);
}
.refresh-btn:disabled {
  color: var(--gray-400);
  cursor: not-allowed;
}
.refresh-btn .ph {
  font-size: 15px;
}
.refresh-btn__spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* summary cards */
.cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
  margin-bottom: 24px;
  transition: opacity 120ms ease;
}
.cards--loading {
  opacity: 0.6;
}
.card {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  padding: 16px;
}
.card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.card__label {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--gray-500);
}
.card__icon {
  font-size: 17px;
  color: var(--gray-300);
}
.card__value {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 28px;
  line-height: 1;
  color: var(--gray-800);
  font-variant-numeric: tabular-nums;
}
.card__sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--gray-500);
  font-variant-numeric: tabular-nums;
}
.card--success .card__icon {
  color: var(--success-600);
}
.card--warning .card__icon {
  color: var(--warning-600);
}
.card--danger .card__icon {
  color: var(--danger-600);
}

/* delivery breakdown panel */
.panel {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  padding: 20px;
}
.panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 18px;
}
.panel__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 16px;
  color: var(--gray-800);
}
.panel__total {
  font-size: 13px;
  color: var(--gray-500);
  font-variant-numeric: tabular-nums;
}
.bar {
  display: flex;
  height: 14px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--gray-100);
}
.bar__seg {
  height: 100%;
  min-width: 2px;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
  margin-top: 18px;
}
.legend__it {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.legend__dot {
  width: 9px;
  height: 9px;
  border-radius: var(--radius-full);
  flex: none;
}
.legend__label {
  font-size: 13px;
  color: var(--gray-600);
}
.legend__count {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-800);
  font-variant-numeric: tabular-nums;
}
.panel__empty {
  font-size: 13px;
  color: var(--gray-500);
  padding: 8px 0;
}

/* not-found / empty */
.empty {
  padding: 80px 32px;
  text-align: center;
}
.empty__icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-xl);
  background: var(--gray-100);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
}
.empty__icon .ph {
  font-size: 26px;
  color: var(--gray-300);
}
.empty__title {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 18px;
  color: var(--gray-800);
  margin-bottom: 8px;
}
.empty__desc {
  font-size: 13px;
  color: var(--gray-500);
  max-width: 360px;
  margin: 0 auto;
  line-height: 1.6;
}
.empty__link {
  color: var(--primary-600);
  text-decoration: none;
  font-weight: 500;
}
.empty__link:hover {
  text-decoration: underline;
}

@media (max-width: 880px) {
  .cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
