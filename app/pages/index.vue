<script setup lang="ts">
import type { CampaignListItem, DashboardStats } from '~/types/campaign'
import CampaignStatusBadge from '~/components/campaigns/CampaignStatusBadge.vue'
import SendsBarChart from '~/components/dashboard/SendsBarChart.client.vue'
import HealthDonut from '~/components/dashboard/HealthDonut.client.vue'

useHead({ title: 'Dashboard — Sendinal' })

const { data: stats } = await useFetch<DashboardStats>('/api/dashboard/stats')
const { data: recentRes } = await useFetch('/api/campaigns', {
  query: { limit: 5, sort: 'createdAt', dir: 'desc' },
  default: () => ({ data: [] as CampaignListItem[], total: 0, page: 1, limit: 5 }),
})
const recent = computed(
  () => (recentRes.value?.data ?? []) as CampaignListItem[],
)

/* ---------- formatting ---------- */
const compactFmt = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
function compact(n: number) {
  return compactFmt.format(n).replace('K', 'k').replace('M', 'm')
}
function fmtNum(n: number) {
  return n.toLocaleString('en-US')
}
function fmtPct(v: number | null) {
  return v == null ? '—' : `${v.toFixed(1)}%`
}
function fmtPct2(v: number | null) {
  return v == null ? '—' : `${v.toFixed(2)}%`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
function recentDate(c: CampaignListItem) {
  if (c.status === 'sending') return 'Now'
  if (c.sent_at) return fmtDate(c.sent_at)
  if (c.status === 'scheduled' && c.scheduled_at) return fmtDate(c.scheduled_at)
  return '—'
}

/* ---------- metric cards ---------- */
interface Trend {
  value: number
  positive: boolean
}
function trend(v: number | null): Trend | null {
  if (v == null || v === 0) return null
  return { value: Math.abs(v), positive: v > 0 }
}

const cards = computed(() => {
  const s = stats.value
  return [
    {
      key: 'sent',
      label: 'Total Sent',
      value: s ? compact(s.totalSent) : '—',
      icon: 'ph-paper-plane-tilt',
      iconBg: '#e3f0fd',
      iconFg: '#1a5fa8',
      trend: trend(s?.totalSentTrend ?? null),
      sub: 'vs last month',
    },
    {
      key: 'open',
      label: 'Avg. Open Rate',
      value: s ? fmtPct(s.avgOpenRate) : '—',
      icon: 'ph-eye',
      iconBg: '#c8ebe4',
      iconFg: '#1a7a6e',
      trend: null,
      sub: s ? `across ${fmtNum(s.sentCampaigns)} sent campaigns` : '',
    },
    {
      key: 'click',
      label: 'Avg. Click Rate',
      value: s ? fmtPct(s.avgClickRate) : '—',
      icon: 'ph-cursor-click',
      iconBg: '#fbe4d8',
      iconFg: '#b15a2a',
      trend: null,
      sub: s ? `across ${fmtNum(s.sentCampaigns)} sent campaigns` : '',
    },
    {
      key: 'contacts',
      label: 'Active Contacts',
      value: s ? fmtNum(s.activeContacts) : '—',
      icon: 'ph-users',
      iconBg: '#f0eeeb',
      iconFg: '#534d46',
      trend: trend(s?.activeContactsTrend ?? null),
      sub: 'vs last month',
    },
  ]
})

/* ---------- chart data ---------- */
const chartLabels = computed(
  () => stats.value?.sendsOverTime.map((d) => d.date) ?? [],
)
const chartValues = computed(
  () => stats.value?.sendsOverTime.map((d) => d.count) ?? [],
)
const totalDelivered30d = computed(() =>
  chartValues.value.reduce((a, b) => a + b, 0),
)
const axisLabels = computed(() => {
  const days = stats.value?.sendsOverTime ?? []
  if (!days.length) return { start: '', mid: '', end: '' }
  return {
    start: fmtDate(days[0]!.date),
    mid: fmtDate(days[Math.floor(days.length / 2)]!.date),
    end: fmtDate(days[days.length - 1]!.date),
  }
})

const health = computed(() => stats.value?.health)

/* ---------- SES reputation (task 4.1) ---------- */
const rep = computed(() => stats.value?.reputation)
const repAlert = computed(() => {
  const r = rep.value
  if (!r) return null
  const issues: string[] = []
  if (r.bounceExceeded)
    issues.push(
      `bounce rate ${r.bounceRate?.toFixed(2)}% (limit ${r.bounceThreshold}%)`,
    )
  if (r.complaintExceeded)
    issues.push(
      `complaint rate ${r.complaintRate?.toFixed(2)}% (limit ${r.complaintThreshold}%)`,
    )
  return issues.length ? issues : null
})

const { search, placeholder } = useTopbar()
search.value = ''
placeholder.value = 'Search campaigns, contacts…'
</script>

<template>
  <div class="page">
    <!-- scroll area -->
    <div class="scroll">
      <div class="content">
        <!-- header -->
        <div class="header">
          <h1 class="header__title">Dashboard</h1>
          <p class="header__sub">Overview of your marketing performance.</p>
        </div>

        <!-- SES reputation alert (task 4.1) -->
        <div v-if="repAlert" class="alert" role="alert">
          <i class="ph ph-warning-octagon alert__icon" />
          <div class="alert__body">
            <p class="alert__title">Deliverability at risk</p>
            <p class="alert__text">
              Your 7-day {{ repAlert.join(' and ') }}
              {{ repAlert.length > 1 ? 'exceed' : 'exceeds' }} the SES
              threshold. Any sending campaign is paused automatically until your
              rates recover.
            </p>
          </div>
        </div>

        <!-- metric cards -->
        <div class="cards">
          <div v-for="c in cards" :key="c.key" class="card">
            <div class="card__top">
              <span class="card__label">{{ c.label }}</span>
              <span
                class="card__icon"
                :style="{ background: c.iconBg, color: c.iconFg }"
              >
                <i class="ph" :class="c.icon" />
              </span>
            </div>
            <div class="card__value">{{ c.value }}</div>
            <div class="card__foot">
              <span
                v-if="c.trend"
                class="card__trend"
                :class="c.trend.positive ? 'up' : 'down'"
              >
                {{ c.trend.positive ? '↑' : '↓' }} {{ c.trend.value }}%
              </span>
              <span class="card__sub">{{ c.sub }}</span>
            </div>
          </div>
        </div>

        <!-- charts -->
        <div class="charts">
          <div class="panel">
            <div class="panel__head">
              <h2 class="panel__title">Sends Over Time</h2>
              <span class="panel__pill">Last 30 days</span>
            </div>
            <div class="panel__caption">
              Total
              <span class="strong">{{ fmtNum(totalDelivered30d) }}</span>
              emails delivered this period
            </div>
            <ClientOnly>
              <SendsBarChart :labels="chartLabels" :values="chartValues" />
              <template #fallback><div class="chart-ph" /></template>
            </ClientOnly>
            <div class="axis">
              <span>{{ axisLabels.start }}</span>
              <span>{{ axisLabels.mid }}</span>
              <span>{{ axisLabels.end }}</span>
            </div>
          </div>

          <div class="panel">
            <h2 class="panel__title">Campaign Health</h2>
            <ClientOnly>
              <HealthDonut :deliverability="health?.deliverability ?? null" />
              <template #fallback><div class="donut-ph" /></template>
            </ClientOnly>
            <div class="legend">
              <div class="legend__row">
                <span class="legend__dot" style="background: #1a7a46" />
                <span class="legend__label">Delivered</span>
                <span class="legend__val">{{
                  compact(health?.delivered ?? 0)
                }}</span>
              </div>
              <div class="legend__row">
                <span class="legend__dot" style="background: #984a14" />
                <span class="legend__label">Bounced</span>
                <span class="legend__val">{{
                  compact(health?.bounced ?? 0)
                }}</span>
              </div>
              <div class="legend__row">
                <span class="legend__dot" style="background: #c0272d" />
                <span class="legend__label">Spam Reports</span>
                <span class="legend__val">{{
                  compact(health?.complained ?? 0)
                }}</span>
              </div>
            </div>

            <!-- SES reputation readings (task 4.1) -->
            <div class="rep">
              <div
                class="rep__row"
                :class="{ 'rep__row--bad': rep?.bounceExceeded }"
              >
                <span class="rep__label">Bounce rate</span>
                <span class="rep__val">{{
                  fmtPct2(rep?.bounceRate ?? null)
                }}</span>
              </div>
              <div
                class="rep__row"
                :class="{ 'rep__row--bad': rep?.complaintExceeded }"
              >
                <span class="rep__label">Complaint rate</span>
                <span class="rep__val">{{
                  fmtPct2(rep?.complaintRate ?? null)
                }}</span>
              </div>
              <div class="rep__note">
                Last {{ rep?.windowDays ?? 7 }} days · SES limits
                {{ rep?.bounceThreshold ?? 2 }}% /
                {{ rep?.complaintThreshold ?? 0.1 }}%
              </div>
            </div>
          </div>
        </div>

        <!-- recent campaigns -->
        <div class="recent">
          <div class="recent__head">
            <h2 class="panel__title">Recent Campaigns</h2>
            <NuxtLink to="/campaigns" class="recent__viewall"
              >View all →</NuxtLink
            >
          </div>
          <div class="recent__theadrow">
            <span>Campaign Name</span>
            <span>Status</span>
            <span>Date</span>
            <span class="r">Open Rate</span>
            <span class="r">Click Rate</span>
          </div>
          <NuxtLink
            v-for="c in recent"
            :key="c.id"
            :to="`/campaigns/${c.id}`"
            class="recent__row"
          >
            <span class="recent__name">{{ c.name }}</span>
            <span><CampaignStatusBadge :status="c.status" /></span>
            <span class="recent__date">{{ recentDate(c) }}</span>
            <span class="recent__rate r">{{ fmtPct(c.openRate) }}</span>
            <span class="recent__rate r">{{ fmtPct(c.clickRate) }}</span>
          </NuxtLink>
          <div v-if="!recent.length" class="recent__empty">
            No campaigns yet.
            <NuxtLink to="/campaigns/new" class="recent__link"
              >Create your first campaign</NuxtLink
            >.
          </div>
        </div>
      </div>
    </div>
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
  padding: 32px 28px 48px;
}

/* header */
.header {
  margin-bottom: 24px;
}
.header__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 28px;
  letter-spacing: -0.5px;
  color: var(--gray-900);
}
.header__sub {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--gray-500);
}

/* SES reputation alert */
.alert {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: var(--danger-100);
  border: 1px solid #f3b9b9;
  border-radius: 12px;
  padding: 14px 18px;
  margin-bottom: 20px;
}
.alert__icon {
  font-size: 20px;
  color: var(--danger-600);
  margin-top: 1px;
}
.alert__title {
  margin: 0 0 2px;
  font-size: 14px;
  font-weight: 600;
  color: var(--danger-600);
}
.alert__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #8f2a2e;
}

/* reputation readings (Campaign Health panel) */
.rep {
  border-top: 1px solid var(--gray-100);
  margin-top: 14px;
  padding-top: 14px;
}
.rep__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 8px;
}
.rep__label {
  color: var(--gray-600);
}
.rep__val {
  font-weight: 500;
  color: var(--gray-800);
  font-variant-numeric: tabular-nums;
}
.rep__row--bad .rep__val {
  color: var(--danger-600);
}
.rep__note {
  font-size: 11px;
  color: var(--gray-400);
  margin-top: 2px;
}

/* metric cards */
.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}
.card {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 12px;
  padding: 18px 20px;
}
.card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.card__label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  color: var(--gray-500);
  text-transform: uppercase;
}
.card__icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card__icon .ph {
  font-size: 16px;
}
.card__value {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 30px;
  letter-spacing: -0.5px;
  color: var(--gray-900);
  margin: 10px 0 8px;
  font-variant-numeric: tabular-nums;
}
.card__foot {
  font-size: 13px;
  color: var(--gray-500);
  display: flex;
  align-items: center;
  gap: 6px;
}
.card__trend {
  font-weight: 500;
}
.card__trend.up {
  color: var(--success-600);
}
.card__trend.down {
  color: var(--danger-600);
}

/* charts */
.charts {
  display: grid;
  grid-template-columns: 1.7fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}
.panel {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 12px;
  padding: 22px 24px;
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
.panel__pill {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 11px;
  border: 1px solid var(--gray-200);
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--gray-600);
}
.panel__caption {
  font-size: 13px;
  color: var(--gray-500);
  margin-bottom: 18px;
}
.panel__caption .strong {
  color: var(--gray-800);
  font-weight: 500;
}
.chart-ph,
.donut-ph {
  height: 180px;
}
.donut-ph {
  width: 148px;
  height: 148px;
  margin: 6px auto 0;
  border-radius: var(--radius-full);
  background: var(--gray-100);
}
.axis {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  font-size: 11px;
  color: var(--gray-400);
}
.legend {
  display: flex;
  flex-direction: column;
  gap: 11px;
  border-top: 1px solid var(--gray-100);
  margin-top: 18px;
  padding-top: 14px;
}
.legend__row {
  display: flex;
  align-items: center;
  font-size: 13px;
}
.legend__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  margin-right: 9px;
}
.legend__label {
  color: var(--gray-600);
}
.legend__val {
  margin-left: auto;
  font-weight: 500;
  color: var(--gray-800);
  font-variant-numeric: tabular-nums;
}

/* recent campaigns */
.recent {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 12px;
  overflow: hidden;
}
.recent__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 16px;
}
.recent__viewall {
  font-size: 13px;
  font-weight: 500;
  color: var(--primary-600);
  text-decoration: none;
  padding: 4px 6px;
  border-radius: 5px;
}
.recent__viewall:hover {
  background: var(--primary-50);
}
.recent__theadrow,
.recent__row {
  display: grid;
  grid-template-columns: 1fr 130px 110px 110px 110px;
  align-items: center;
  padding: 0 22px;
}
.recent__theadrow {
  height: 38px;
  background: var(--gray-50);
  border-top: 1px solid var(--gray-200);
  border-bottom: 1px solid var(--gray-200);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  color: var(--gray-500);
  text-transform: uppercase;
}
.recent__row {
  height: 54px;
  border-bottom: 1px solid var(--gray-100);
  text-decoration: none;
  transition: background-color 80ms ease;
}
.recent__row:hover {
  background: var(--gray-50);
}
.recent__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-800);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 12px;
}
.recent__date {
  font-size: 13px;
  color: var(--gray-500);
}
.recent__rate {
  font-size: 13.5px;
  color: var(--gray-700);
  font-variant-numeric: tabular-nums;
}
.r {
  text-align: right;
}
.recent__empty {
  padding: 40px 22px;
  text-align: center;
  font-size: 13.5px;
  color: var(--gray-500);
}
.recent__link {
  color: var(--primary-600);
  text-decoration: none;
  font-weight: 500;
}
.recent__link:hover {
  text-decoration: underline;
}

@media (max-width: 1000px) {
  .cards {
    grid-template-columns: repeat(2, 1fr);
  }
  .charts {
    grid-template-columns: 1fr;
  }
}
</style>
