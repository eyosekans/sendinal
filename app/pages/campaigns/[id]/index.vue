<script setup lang="ts">
import type {
  CampaignActivityRow,
  CampaignDetail,
  CampaignLink,
  CampaignStats,
  CampaignTimeseries,
} from '~/types/campaign'
import CampaignStatusBadge from '~/components/campaigns/CampaignStatusBadge.vue'
import ConfirmDeleteModal from '~/components/ConfirmDeleteModal.vue'
import EngagementLineChart from '~/components/dashboard/EngagementLineChart.client.vue'

const route = useRoute()
const id = route.params.id as string

const { data: campaign, error: campaignError, refresh: refreshCampaign } =
  await useFetch<CampaignDetail>(`/api/campaigns/${id}`)
const { data: stats, refresh: refreshStats } = await useFetch<CampaignStats>(
  `/api/campaigns/${id}/stats`,
)
const { data: series } = await useFetch<CampaignTimeseries>(
  `/api/campaigns/${id}/timeseries`,
  { default: () => ({ points: [] }) },
)
const { data: linksRes } = await useFetch<{ links: CampaignLink[] }>(
  `/api/campaigns/${id}/links`,
  { default: () => ({ links: [] }) },
)
const activityPage = ref(1)
const { data: activityRes, refresh: refreshActivity } = await useFetch(`/api/campaigns/${id}/activity`, {
  query: { page: activityPage, limit: 8 },
  default: () => ({
    data: [] as CampaignActivityRow[],
    total: 0,
    page: 1,
    limit: 8,
  }),
})

useHead({
  title: computed(() =>
    campaign.value ? `${campaign.value.name} — Sendinal` : 'Campaign — Sendinal',
  ),
})

const { search, placeholder } = useTopbar()
search.value = ''
placeholder.value = 'Search campaigns, contacts…'

const notFound = computed(() => campaignError.value?.statusCode === 404)
const canEdit = computed(
  () =>
    campaign.value?.status === 'draft' ||
    campaign.value?.status === 'scheduled',
)
const isScheduled = computed(() => campaign.value?.status === 'scheduled')

/* ---------- live send progress (polling while status='sending') ---------- */
const isSending = computed(() => campaign.value?.status === 'sending')
const sendProgress = computed(() => {
  const s = stats.value
  if (!s || !s.recipients) return null
  const total = s.recipients
  // A send leaves 'queued' once the worker processes it (sent/failed/bounced/
  // complained), so processed = total - queued drives the bar to 100%.
  const processed = total - s.counts.queued
  return {
    total,
    sent: s.counts.sent,
    failed: s.counts.failed,
    queued: s.counts.queued,
    processed,
    pct: Math.min(100, Math.round((processed / total) * 100)),
  }
})

let pollTimer: ReturnType<typeof setInterval> | null = null
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
function startPolling() {
  if (pollTimer || !import.meta.client) return
  pollTimer = setInterval(async () => {
    await Promise.all([refreshStats(), refreshCampaign(), refreshActivity()])
    // campaign flips to 'sent'/'paused'/'cancelled' when the worker finishes.
    if (campaign.value?.status !== 'sending') stopPolling()
  }, 3000)
}
onMounted(() => {
  if (isSending.value) startPolling()
})
watch(isSending, (sending) => (sending ? startPolling() : stopPolling()))
onBeforeUnmount(stopPolling)

/* ---------- cancel a scheduled send ---------- */
const showCancel = ref(false)
const cancelling = ref(false)
async function confirmCancel() {
  cancelling.value = true
  try {
    await $fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      body: { status: 'cancelled' },
    })
    showCancel.value = false
    await refreshCampaign()
  } finally {
    cancelling.value = false
  }
}

/* ---------- formatting ---------- */
const compactFmt = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const compact = (n: number) =>
  compactFmt.format(n).replace('K', 'k').replace('M', 'm')
const fmtNum = (n: number) => n.toLocaleString('en-US')
const fmtPct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`)
function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
function fmtShort(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
function fmtActivityTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/* ---------- stat cards ---------- */
const cards = computed(() => {
  const s = stats.value
  return [
    {
      key: 'delivered',
      label: 'Delivered',
      value: s ? compact(s.counts.sent) : '—',
      icon: 'ph-paper-plane-tilt',
      pill: s ? fmtPct(s.rates.delivered) : '—',
      tone: 'good',
    },
    {
      key: 'open',
      label: 'Open rate',
      value: s ? fmtPct(s.rates.open) : '—',
      icon: 'ph-envelope-open',
      pill: s ? `${compact(s.counts.opened)} opens` : '—',
      tone: 'teal',
    },
    {
      key: 'click',
      label: 'Click rate',
      value: s ? fmtPct(s.rates.click) : '—',
      icon: 'ph-cursor-click',
      pill: s ? `${compact(s.counts.clicked)} clicks` : '—',
      tone: 'teal',
    },
    {
      key: 'unsub',
      label: 'Unsubscribed',
      value: s ? compact(s.counts.unsubscribed) : '—',
      icon: 'ph-user-minus',
      pill: s ? fmtPct(s.rates.unsubscribe) : '—',
      tone: 'muted',
    },
  ]
})

/* ---------- chart ---------- */
const chartLabels = computed(
  () => series.value?.points.map((p) => fmtShort(p.date)) ?? [],
)
const chartOpens = computed(
  () => series.value?.points.map((p) => p.opens) ?? [],
)
const chartClicks = computed(
  () => series.value?.points.map((p) => p.clicks) ?? [],
)
const hasEngagement = computed(
  () =>
    chartOpens.value.some((n) => n > 0) || chartClicks.value.some((n) => n > 0),
)

const topLinks = computed(() => linksRes.value?.links ?? [])
const activity = computed(
  () => (activityRes.value?.data ?? []) as CampaignActivityRow[],
)
const activityTotal = computed(() => activityRes.value?.total ?? 0)
const activityLimit = computed(() => activityRes.value?.limit ?? 8)
const activityPages = computed(() =>
  Math.max(1, Math.ceil(activityTotal.value / activityLimit.value)),
)

/* ---------- activity status badges ---------- */
const ACT: Record<string, { label: string; bg: string; fg: string; bd: string }> =
  {
    clicked: { label: 'Clicked', bg: '#c8ebe4', fg: '#0f5247', bd: '#94d5c8' },
    opened: { label: 'Opened', bg: '#dcf3e8', fg: '#1a7a46', bd: '#7dd3aa' },
    delivered: { label: 'Delivered', bg: '#f0eeeb', fg: '#534d46', bd: '#e2ded9' },
    unsubscribed: { label: 'Unsubscribed', bg: '#f0eeeb', fg: '#787068', bd: '#e2ded9' },
    bounced: { label: 'Bounced', bg: '#fdf0e8', fg: '#984a14', bd: '#f5c4a0' },
    complained: { label: 'Complained', bg: '#fde8e8', fg: '#c0272d', bd: '#f5a3a3' },
    failed: { label: 'Failed', bg: '#fde8e8', fg: '#c0272d', bd: '#f5a3a3' },
    queued: { label: 'Queued', bg: '#e3f0fd', fg: '#1a5fa8', bd: '#93c4f7' },
  }
const actMeta = (s: string) => ACT[s] ?? ACT.delivered!
</script>

<template>
  <div class="page">
    <div class="scroll">
      <div class="content">
        <!-- not found -->
        <div v-if="notFound" class="empty">
          <div class="empty__icon"><i class="ph ph-magnifying-glass" /></div>
          <div class="empty__title">Campaign not found</div>
          <div class="empty__desc">
            This campaign may have been deleted.
            <NuxtLink to="/campaigns" class="empty__link">Back to campaigns</NuxtLink>.
          </div>
        </div>

        <template v-else-if="campaign">
          <!-- header -->
          <div class="header">
            <div class="header__main">
              <div class="crumb">
                <NuxtLink to="/campaigns" class="crumb__link">Campaigns</NuxtLink>
                <i class="ph ph-caret-right" />
                <span class="crumb__cur">{{ campaign.name }}</span>
              </div>
              <h1 class="header__title">{{ campaign.name }}</h1>
              <div class="meta">
                <span class="meta__item">
                  <CampaignStatusBadge :status="campaign.status" />
                </span>
                <span class="meta__sep" />
                <span class="meta__item">
                  <i class="ph ph-clock" />
                  {{
                    campaign.sent_at
                      ? fmtDateTime(campaign.sent_at)
                      : campaign.scheduled_at
                        ? `Scheduled ${fmtDateTime(campaign.scheduled_at)}`
                        : 'Not sent yet'
                  }}
                </span>
                <span class="meta__sep" />
                <span class="meta__item">
                  <i class="ph ph-users" /> {{ fmtNum(stats?.recipients ?? 0) }}
                  recipients
                </span>
                <span class="meta__sep" />
                <span class="meta__item">
                  <i class="ph ph-list-bullets" />
                  {{ campaign.listName ?? 'No list' }}
                </span>
              </div>
            </div>
            <div class="header__actions">
              <button
                v-if="isScheduled"
                type="button"
                class="btn-ghost-danger"
                @click="showCancel = true"
              >
                <i class="ph ph-x-circle" /> Cancel
              </button>
              <NuxtLink
                v-if="canEdit"
                :to="`/campaigns/${id}/edit`"
                class="btn-secondary"
              >
                <i class="ph ph-pencil-simple" /> Edit
              </NuxtLink>
              <button
                type="button"
                class="btn-secondary"
                title="Export is coming in a later release (4.4)"
                disabled
              >
                <i class="ph ph-arrow-square-out" /> Export
              </button>
            </div>
          </div>

          <!-- live send progress (polls while sending) -->
          <div v-if="isSending && sendProgress" class="sendbar">
            <div class="sendbar__head">
              <span class="sendbar__title">
                <span class="sendbar__spinner" />
                Sending campaign…
              </span>
              <span class="sendbar__count">
                {{ fmtNum(sendProgress.sent) }} /
                {{ fmtNum(sendProgress.total) }} sent
              </span>
            </div>
            <div
              class="sendbar__track"
              role="progressbar"
              :aria-valuenow="sendProgress.pct"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                class="sendbar__fill"
                :style="{ width: sendProgress.pct + '%' }"
              />
            </div>
            <div class="sendbar__meta">
              <span>{{ sendProgress.pct }}% complete</span>
              <span v-if="sendProgress.queued" class="sendbar__dot">
                {{ fmtNum(sendProgress.queued) }} queued
              </span>
              <span v-if="sendProgress.failed" class="sendbar__failed">
                {{ fmtNum(sendProgress.failed) }} failed
              </span>
            </div>
          </div>

          <!-- cards + chart -->
          <div class="grid">
            <div class="statcol">
              <div v-for="c in cards" :key="c.key" class="statcard">
                <div class="statcard__top">
                  <span class="statcard__label">{{ c.label }}</span>
                  <span class="statcard__icon" :class="`icon--${c.tone}`">
                    <i class="ph" :class="c.icon" />
                  </span>
                </div>
                <div class="statcard__row">
                  <span class="statcard__value">{{ c.value }}</span>
                  <span class="statcard__pill" :class="`pill--${c.tone}`">{{
                    c.pill
                  }}</span>
                </div>
              </div>
            </div>

            <div class="panel chartcard">
              <div class="panel__head">
                <h3 class="panel__title">Engagement over time</h3>
                <div class="chart-legend">
                  <span class="cl"
                    ><span class="cl__line cl__line--open" />Opens</span
                  >
                  <span class="cl"
                    ><span class="cl__line cl__line--click" />Clicks</span
                  >
                </div>
              </div>
              <div class="chartbody">
                <ClientOnly>
                  <EngagementLineChart
                    v-if="hasEngagement"
                    :labels="chartLabels"
                    :opens="chartOpens"
                    :clicks="chartClicks"
                  />
                  <template #fallback><div class="chart-ph" /></template>
                </ClientOnly>
                <div v-if="!hasEngagement" class="chart-empty">
                  No engagement recorded yet.
                </div>
              </div>
            </div>
          </div>

          <!-- A/B test result (task 3.3) -->
          <div v-if="stats?.abTest" class="panel abpanel">
            <div class="panel__padhead">
              <h3 class="panel__title">A/B test — subject line</h3>
              <span class="panel__meta">Winner by open rate</span>
            </div>
            <div class="abgrid">
              <div
                v-for="v in stats.abTest.variants"
                :key="v.label"
                class="abcard"
                :class="{ 'abcard--win': v.winner }"
              >
                <div class="abcard__head">
                  <span class="abcard__label">Variant {{ v.label }}</span>
                  <span v-if="v.winner" class="abcard__win">
                    <i class="ph ph-trophy" /> Winner
                  </span>
                </div>
                <div class="abcard__subject">{{ v.subject || '—' }}</div>
                <div class="abcard__metrics">
                  <div class="abmetric abmetric--primary">
                    <span class="abmetric__val">{{
                      v.openRate !== null ? v.openRate + '%' : '—'
                    }}</span>
                    <span class="abmetric__lbl">Open rate</span>
                  </div>
                  <div class="abmetric">
                    <span class="abmetric__val">{{
                      v.clickRate !== null ? v.clickRate + '%' : '—'
                    }}</span>
                    <span class="abmetric__lbl">Click rate</span>
                  </div>
                  <div class="abmetric">
                    <span class="abmetric__val">{{ fmtNum(v.recipients) }}</span>
                    <span class="abmetric__lbl">Recipients</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- top clicked links -->
          <div class="panel tablepanel">
            <div class="panel__padhead">
              <h3 class="panel__title">Top clicked links</h3>
            </div>
            <div class="lrow lhead">
              <span>URL</span>
              <span class="r">Total clicks</span>
              <span class="r">Unique clicks</span>
            </div>
            <div v-for="l in topLinks" :key="l.url" class="lrow">
              <span class="lurl">
                <i class="ph ph-link-simple" />
                <a :href="l.url" target="_blank" rel="noopener" class="lurl__a">{{
                  l.url
                }}</a>
              </span>
              <span class="r lstrong">{{ fmtNum(l.total) }}</span>
              <span class="r lmuted">{{ fmtNum(l.unique) }}</span>
            </div>
            <div v-if="!topLinks.length" class="tableempty">
              No link clicks recorded yet.
            </div>
          </div>

          <!-- individual send results -->
          <div class="panel tablepanel">
            <div class="panel__padhead">
              <h3 class="panel__title">Individual send results</h3>
              <span class="panel__meta"
                >{{ fmtNum(activityTotal) }} recipients</span
              >
            </div>
            <div class="arow ahead">
              <span>Recipient</span>
              <span>Status</span>
              <span class="r">Date / time</span>
            </div>
            <div v-for="a in activity" :key="a.sendId" class="arow">
              <span class="aemail">{{ a.email }}</span>
              <span>
                <span
                  class="abadge"
                  :style="{
                    background: actMeta(a.status).bg,
                    color: actMeta(a.status).fg,
                    border: `1px solid ${actMeta(a.status).bd}`,
                  }"
                  >{{ actMeta(a.status).label }}</span
                >
              </span>
              <span class="r atime">{{ fmtActivityTime(a.at) }}</span>
            </div>
            <div v-if="!activity.length" class="tableempty">
              No recipients yet.
            </div>
            <div v-if="activityTotal > activityLimit" class="apager">
              <span class="apager__label"
                >Page {{ activityPage }} of {{ activityPages }}</span
              >
              <div class="apager__nav">
                <button
                  type="button"
                  class="pager"
                  :disabled="activityPage <= 1"
                  @click="activityPage--"
                >
                  <i class="ph ph-caret-left" /> Prev
                </button>
                <button
                  type="button"
                  class="pager"
                  :disabled="activityPage >= activityPages"
                  @click="activityPage++"
                >
                  Next <i class="ph ph-caret-right" />
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <ConfirmDeleteModal
      :open="showCancel"
      title="Cancel scheduled send?"
      body="This campaign will not be sent at its scheduled time. You can't reschedule a cancelled campaign."
      confirm-label="Cancel send"
      :loading="cancelling"
      @cancel="showCancel = false"
      @confirm="confirmCancel"
    />
  </div>
</template>

<style scoped>
.page {
  display: contents;
}

/* scroll + content */
.scroll {
  flex: 1;
  overflow-y: auto;
}
.content {
  max-width: 1240px;
  margin: 0 auto;
  padding: 28px 32px 64px;
}

/* header */
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.crumb {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--gray-500);
  margin-bottom: 8px;
}
.crumb__link {
  color: var(--gray-500);
  text-decoration: none;
}
.crumb__link:hover {
  color: var(--primary-600);
}
.crumb .ph {
  font-size: 11px;
  color: var(--gray-300);
}
.crumb__cur {
  color: var(--gray-700);
}
.header__title {
  margin: 0 0 10px;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 28px;
  color: var(--gray-800);
}
.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13.5px;
  color: var(--gray-500);
}
.meta__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.meta__item .ph {
  font-size: 15px;
  color: var(--gray-400);
}
.meta__sep {
  width: 1px;
  height: 14px;
  background: var(--gray-200);
}
.header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  background: #fff;
  color: var(--gray-700);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
}
.btn-secondary:hover:not(:disabled) {
  background: var(--gray-100);
}
.btn-secondary:disabled {
  color: var(--gray-400);
  cursor: not-allowed;
}
.btn-secondary .ph {
  font-size: 16px;
}
.btn-ghost-danger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid var(--danger-100);
  border-radius: 8px;
  background: #fff;
  color: var(--danger-600);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.btn-ghost-danger:hover {
  background: var(--danger-100);
  border-color: var(--danger-600);
}
.btn-ghost-danger .ph {
  font-size: 16px;
}

/* live send progress bar */
.sendbar {
  background: #fff;
  border: 1px solid var(--primary-200);
  border-radius: 10px;
  padding: 18px 22px;
  margin-bottom: 20px;
}
.sendbar__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sendbar__title {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 15px;
  color: var(--gray-800);
}
.sendbar__spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--primary-200);
  border-top-color: var(--primary-600);
  animation: sendbar-spin 0.7s linear infinite;
}
@keyframes sendbar-spin {
  to {
    transform: rotate(360deg);
  }
}
.sendbar__count {
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-800);
  font-variant-numeric: tabular-nums;
}
.sendbar__track {
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--gray-100);
  overflow: hidden;
}
.sendbar__fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--primary-600);
  transition: width 0.4s ease;
}
.sendbar__meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--gray-500);
  font-variant-numeric: tabular-nums;
}
.sendbar__dot::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gray-300);
  margin-right: 6px;
  vertical-align: middle;
}
.sendbar__failed {
  color: var(--danger-600);
}

/* cards + chart grid */
.grid {
  display: grid;
  grid-template-columns: minmax(280px, 320px) 1fr;
  gap: 20px;
  margin-bottom: 20px;
}
.statcol {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.statcard {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 10px;
  padding: 18px 20px;
}
.statcard__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.statcard__label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--gray-500);
}
.statcard__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.statcard__icon .ph {
  font-size: 17px;
}
.icon--good,
.icon--teal {
  background: var(--primary-50);
  color: var(--primary-600);
}
.icon--muted {
  background: var(--gray-100);
  color: var(--gray-500);
}
.statcard__row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 12px;
}
.statcard__value {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 30px;
  line-height: 1;
  color: var(--gray-900);
  font-variant-numeric: tabular-nums;
}
.statcard__pill {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--radius-full);
}
.pill--good {
  color: var(--success-600);
  background: var(--success-100);
}
.pill--teal {
  color: var(--primary-800);
  background: var(--primary-100);
}
.pill--muted {
  color: var(--gray-500);
  background: var(--gray-100);
}

/* panels */
.panel {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 10px;
}
.chartcard {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
}
.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.panel__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 18px;
  color: var(--gray-800);
}
.chart-legend {
  display: flex;
  align-items: center;
  gap: 18px;
  font-size: 13px;
  color: var(--gray-600);
}
.cl {
  display: flex;
  align-items: center;
  gap: 7px;
}
.cl__line {
  width: 12px;
  height: 3px;
  border-radius: 2px;
}
.cl__line--open {
  background: #0f5247;
}
.cl__line--click {
  background: var(--primary-200);
}
.chartbody {
  flex: 1;
  min-height: 320px;
  position: relative;
  display: flex;
}
.chart-ph {
  flex: 1;
  min-height: 320px;
}
.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13.5px;
  color: var(--gray-400);
}

/* tables */
.tablepanel {
  overflow: hidden;
  margin-bottom: 20px;
}
.panel__padhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 14px;
}
.panel__meta {
  font-size: 13px;
  color: var(--gray-500);
}

/* A/B test result (task 3.3) */
.abpanel {
  margin-bottom: 20px;
}
.abgrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  padding: 4px 22px 22px;
}
.abcard {
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg, 10px);
  padding: 16px;
  background: var(--gray-50);
}
.abcard--win {
  border-color: var(--primary-600);
  background: var(--primary-100);
}
.abcard__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.abcard__label {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
  color: var(--gray-800);
}
.abcard__win {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-800);
  background: #fff;
  border: 1px solid var(--primary-600);
  border-radius: var(--radius-full, 9999px);
  padding: 2px 8px;
}
.abcard__subject {
  font-size: 13px;
  color: var(--gray-700);
  line-height: 1.4;
  margin-bottom: 14px;
  min-height: 36px;
}
.abcard__metrics {
  display: flex;
  gap: 16px;
}
.abmetric {
  display: flex;
  flex-direction: column;
}
.abmetric__val {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 18px;
  color: var(--gray-800);
}
.abmetric--primary .abmetric__val {
  color: var(--primary-700, var(--primary-800));
}
.abmetric__lbl {
  font-size: 11px;
  color: var(--gray-500);
  margin-top: 2px;
}

.lrow,
.arow {
  display: grid;
  align-items: center;
  padding: 0 22px;
}
.lrow {
  grid-template-columns: 1fr 150px 150px;
  height: 50px;
  border-bottom: 1px solid var(--gray-100);
  font-size: 13.5px;
}
.arow {
  grid-template-columns: 1fr 140px 160px;
  height: 50px;
  border-bottom: 1px solid var(--gray-100);
  font-size: 13.5px;
}
.lhead,
.ahead {
  height: 38px;
  background: var(--gray-50);
  border-top: 1px solid var(--gray-200);
  border-bottom: 1px solid var(--gray-200);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--gray-500);
}
.r {
  text-align: right;
}
.lurl {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.lurl .ph {
  font-size: 15px;
  color: var(--gray-400);
  flex: none;
}
.lurl__a {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--primary-600);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lurl__a:hover {
  text-decoration: underline;
}
.lstrong {
  font-weight: 500;
  color: var(--gray-800);
  font-variant-numeric: tabular-nums;
}
.lmuted {
  color: var(--gray-600);
  font-variant-numeric: tabular-nums;
}
.aemail {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--gray-700);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 12px;
}
.abadge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
.atime {
  color: var(--gray-500);
  font-size: 13px;
}
.tableempty {
  padding: 40px 22px;
  text-align: center;
  font-size: 13.5px;
  color: var(--gray-500);
}
.apager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 22px;
}
.apager__label {
  font-size: 13px;
  color: var(--gray-500);
}
.apager__nav {
  display: flex;
  gap: 6px;
}
.pager {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--gray-200);
  border-radius: 6px;
  background: #fff;
  color: var(--gray-700);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.pager:hover:not(:disabled) {
  background: var(--gray-100);
}
.pager:disabled {
  color: var(--gray-400);
  cursor: not-allowed;
}
.pager .ph {
  font-size: 13px;
}

/* not found */
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
}
.empty__link {
  color: var(--primary-600);
  text-decoration: none;
  font-weight: 500;
}

@media (max-width: 920px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
