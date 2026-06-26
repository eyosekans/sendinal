<script setup lang="ts">
import type { CampaignListItem } from '~/types/campaign'
import type { CampaignStatus } from '#shared/schemas'
import CampaignStatusBadge from '~/components/campaigns/CampaignStatusBadge.vue'
import ConfirmDeleteModal from '~/components/ConfirmDeleteModal.vue'

useHead({ title: 'Campaigns — Sendinal' })

// Shared layout top bar drives the search query.
const { search: searchInput, placeholder } = useTopbar()
searchInput.value = ''
placeholder.value = 'Search campaigns…'

/* ---------- query state ---------- */
const LIMIT = 25
const page = ref(1)
const debouncedSearch = ref('')
const statusFilter = ref<'all' | CampaignStatus>('all')
const statusOpen = ref(false)
const sortKey = ref<
  'name' | 'status' | 'recipients' | 'open' | 'click' | 'sentDate'
>('sentDate')
const sortDir = ref<'asc' | 'desc'>('desc')

const SERVER_SORT = new Set(['name', 'status', 'sentDate'])

const listQuery = computed(() => ({
  page: page.value,
  limit: LIMIT,
  ...(debouncedSearch.value ? { search: debouncedSearch.value } : {}),
  ...(statusFilter.value !== 'all' ? { status: statusFilter.value } : {}),
  // Derived-column sorts are applied client-side; ask the server for newest-first.
  sort: SERVER_SORT.has(sortKey.value) ? sortKey.value : 'createdAt',
  dir: SERVER_SORT.has(sortKey.value) ? sortDir.value : 'desc',
}))

const {
  data: list,
  pending,
  refresh,
} = await useFetch('/api/campaigns', {
  query: listQuery,
  default: () => ({
    data: [] as CampaignListItem[],
    total: 0,
    page: 1,
    limit: LIMIT,
  }),
})

const campaigns = computed(() => (list.value?.data ?? []) as CampaignListItem[])
const total = computed(() => list.value?.total ?? 0)

// Client-side sort for derived columns (server already sorts the rest).
const displayed = computed(() => {
  if (SERVER_SORT.has(sortKey.value)) return campaigns.value
  const field =
    sortKey.value === 'recipients'
      ? 'recipients'
      : sortKey.value === 'open'
        ? 'openRate'
        : 'clickRate'
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...campaigns.value].sort((a, b) => {
    const av = a[field] ?? -1
    const bv = b[field] ?? -1
    return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
  })
})

/* ---------- search (debounced) ---------- */
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (v) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedSearch.value = v.trim()
    page.value = 1
    clearSelection()
  }, 300)
})

/* ---------- status filter dropdown ---------- */
const STATUS_OPTIONS: {
  key: 'all' | CampaignStatus
  label: string
  dot: string | null
}[] = [
  { key: 'all', label: 'All statuses', dot: null },
  { key: 'draft', label: 'Draft', dot: '#a09990' },
  { key: 'scheduled', label: 'Scheduled', dot: '#cc8a0a' },
  { key: 'sending', label: 'Sending', dot: '#1a5fa8' },
  { key: 'sent', label: 'Sent', dot: '#1a7a46' },
  { key: 'failed', label: 'Failed', dot: '#c0272d' },
  { key: 'cancelled', label: 'Cancelled', dot: '#787068' },
]
const statusBtnLabel = computed(
  () =>
    STATUS_OPTIONS.find((o) => o.key === statusFilter.value)?.label ??
    'All statuses',
)
function pickStatus(key: 'all' | CampaignStatus) {
  statusFilter.value = key
  statusOpen.value = false
  page.value = 1
  clearSelection()
}
const hasFilters = computed(
  () => debouncedSearch.value !== '' || statusFilter.value !== 'all',
)
function clearFilters() {
  searchInput.value = ''
  debouncedSearch.value = ''
  statusFilter.value = 'all'
  page.value = 1
  clearSelection()
}

/* ---------- sorting ---------- */
function sortBy(key: typeof sortKey.value) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}
function sortIcon(key: string) {
  if (sortKey.value !== key) return 'ph-arrows-down-up'
  return sortDir.value === 'asc' ? 'ph-arrow-up' : 'ph-arrow-down'
}

/* ---------- selection ---------- */
const selectedIds = ref<string[]>([])
const isSelected = (id: string) => selectedIds.value.includes(id)
function toggleRow(id: string) {
  selectedIds.value = isSelected(id)
    ? selectedIds.value.filter((x) => x !== id)
    : [...selectedIds.value, id]
}
const allChecked = computed(
  () =>
    displayed.value.length > 0 &&
    displayed.value.every((c) => isSelected(c.id)),
)
function toggleAll() {
  const ids = displayed.value.map((c) => c.id)
  if (allChecked.value) {
    const set = new Set(ids)
    selectedIds.value = selectedIds.value.filter((id) => !set.has(id))
  } else {
    selectedIds.value = [...new Set([...selectedIds.value, ...ids])]
  }
}
const selectedCount = computed(() => selectedIds.value.length)
function clearSelection() {
  selectedIds.value = []
}

/* ---------- pagination ---------- */
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / LIMIT)))
const canPrev = computed(() => page.value > 1)
const canNext = computed(() => page.value < pageCount.value)
const footerText = computed(
  () => `Showing ${displayed.value.length} of ${total.value} campaigns`,
)

/* ---------- display helpers ---------- */
const ROW_META: Record<
  CampaignStatus,
  { icon: string; bg: string; fg: string; border: string }
> = {
  draft: {
    icon: 'ph-pencil-simple-line',
    bg: '#f0eeeb',
    fg: '#534d46',
    border: '#e2ded9',
  },
  scheduled: {
    icon: 'ph-clock',
    bg: '#fef3d0',
    fg: '#92620a',
    border: '#f2d68a',
  },
  sending: {
    icon: 'ph-paper-plane-tilt',
    bg: '#e3f0fd',
    fg: '#1a5fa8',
    border: '#aed0f5',
  },
  sent: {
    icon: 'ph-check-circle',
    bg: '#dcf3e8',
    fg: '#1a7a46',
    border: '#7dd3aa',
  },
  failed: {
    icon: 'ph-warning-circle',
    bg: '#fde8e8',
    fg: '#c0272d',
    border: '#f3b9b9',
  },
  cancelled: {
    icon: 'ph-prohibit',
    bg: '#f0eeeb',
    fg: '#787068',
    border: '#e2ded9',
  },
}
function fmtNum(n: number) {
  return n.toLocaleString('en-US')
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })
}
function sentDateCell(c: CampaignListItem) {
  if (c.status === 'sending') return 'Sending…'
  if (c.sent_at) return fmtDate(c.sent_at)
  if (c.status === 'scheduled' && c.scheduled_at) return fmtDate(c.scheduled_at)
  return '—'
}

/* ---------- scheduled countdown (client-only to avoid SSR drift) ---------- */
const mounted = ref(false)
const nowTick = ref(Date.now())
let cdTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  mounted.value = true
  cdTimer = setInterval(() => (nowTick.value = Date.now()), 60000)
})
onBeforeUnmount(() => clearInterval(cdTimer))
function scheduledCountdown(iso: string) {
  const diff = new Date(iso).getTime() - nowTick.value
  if (diff <= 0) return 'due now'
  const m = Math.floor(diff / 60000)
  if (m < 60) return `in ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `in ${h}h`
  return `in ${Math.floor(h / 24)}d`
}
function rateBar(rate: number, kind: 'open' | 'click') {
  return Math.min(100, rate * (kind === 'open' ? 1.6 : 8))
}
function rateStrong(rate: number, kind: 'open' | 'click') {
  return kind === 'open' ? rate >= 45 : rate >= 6
}

function newCampaign() {
  navigateTo('/campaigns/new')
}

/* ---------- delete ---------- */
const deleteTarget = ref<{
  type: 'single' | 'bulk'
  id?: string
  name?: string
} | null>(null)
const deleting = ref(false)
function askDeleteSingle(c: CampaignListItem) {
  deleteTarget.value = { type: 'single', id: c.id, name: c.name }
}
function askDeleteBulk() {
  deleteTarget.value = { type: 'bulk' }
}
function cancelDelete() {
  if (!deleting.value) deleteTarget.value = null
}
const deleteTitle = computed(() => {
  const t = deleteTarget.value
  if (!t) return ''
  return t.type === 'single'
    ? 'Delete campaign?'
    : `Delete ${selectedCount.value} campaigns?`
})
const deleteBody = computed(() => {
  const t = deleteTarget.value
  if (!t) return ''
  if (t.type === 'single') {
    return `"${t.name}" and all of its analytics will be permanently deleted. This action cannot be undone.`
  }
  return `${selectedCount.value} campaigns and all of their analytics will be permanently deleted. This action cannot be undone.`
})
const deleteConfirmLabel = computed(() => {
  const t = deleteTarget.value
  if (!t) return 'Delete'
  return t.type === 'single'
    ? 'Delete campaign'
    : `Delete ${selectedCount.value} campaigns`
})
async function confirmDelete() {
  const t = deleteTarget.value
  if (!t) return
  deleting.value = true
  try {
    const ids = t.type === 'single' && t.id ? [t.id] : [...selectedIds.value]
    for (const id of ids) {
      await $fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
    }
    deleteTarget.value = null
    clearSelection()
    await refresh()
    if (campaigns.value.length === 0 && page.value > 1) page.value--
  } finally {
    deleting.value = false
  }
}

const isEmpty = computed(() => !pending.value && displayed.value.length === 0)
</script>

<template>
  <div class="page">
    <!-- scroll area -->
    <div class="scroll">
      <div class="content">
        <!-- page header -->
        <div class="header">
          <div>
            <h1 class="header__title">Campaigns</h1>
            <div class="header__sub">{{ total }} campaigns</div>
          </div>
          <button type="button" class="btn-primary" @click="newCampaign">
            <i class="ph ph-plus" /> New Campaign
          </button>
        </div>

        <!-- filter row -->
        <div class="filters">
          <div class="filter-search">
            <i class="ph ph-magnifying-glass filter-search__icon" />
            <input
              v-model="searchInput"
              class="filter-search__input"
              placeholder="Filter by name…"
            />
          </div>

          <div class="status-dd">
            <button
              type="button"
              class="status-btn"
              :class="{ 'status-btn--active': statusFilter !== 'all' }"
              @click="statusOpen = !statusOpen"
            >
              <i class="ph ph-circle-half" />
              {{ statusBtnLabel }}
              <i class="ph ph-caret-down status-btn__caret" />
            </button>
            <div v-if="statusOpen" class="status-menu">
              <button
                v-for="opt in STATUS_OPTIONS"
                :key="opt.key"
                type="button"
                class="status-opt"
                :class="{ 'status-opt--active': statusFilter === opt.key }"
                @click="pickStatus(opt.key)"
              >
                <span class="status-opt__left">
                  <span
                    class="status-opt__dot"
                    :style="{
                      background: opt.dot ?? 'transparent',
                      visibility: opt.dot ? 'visible' : 'hidden',
                    }"
                  />
                  {{ opt.label }}
                </span>
                <i
                  v-if="statusFilter === opt.key"
                  class="ph ph-check status-opt__check"
                />
              </button>
            </div>
          </div>

          <button
            v-if="hasFilters"
            type="button"
            class="clear-btn"
            @click="clearFilters"
          >
            <i class="ph ph-x" /> Clear
          </button>
        </div>

        <!-- bulk selection bar -->
        <div v-if="selectedCount > 0" class="selbar">
          <span class="selbar__count">{{ selectedCount }} selected</span>
          <div class="selbar__div" />
          <button
            type="button"
            class="selbar__btn selbar__btn--danger"
            @click="askDeleteBulk"
          >
            <i class="ph ph-trash" /> Delete
          </button>
          <button
            type="button"
            class="selbar__btn selbar__clear"
            @click="clearSelection"
          >
            Clear
          </button>
        </div>

        <!-- table -->
        <div class="table" :class="{ 'table--loading': pending }">
          <!-- header -->
          <div class="trow thead">
            <div class="cell-check" @click="toggleAll">
              <div class="check" :class="{ 'check--on': allChecked }">
                <i v-if="allChecked" class="ph ph-check" />
              </div>
            </div>
            <button type="button" class="th-sort" @click="sortBy('name')">
              Campaign
              <i
                class="ph th-sort__i"
                :class="[
                  sortIcon('name'),
                  { 'th-sort__i--active': sortKey === 'name' },
                ]"
              />
            </button>
            <button type="button" class="th-sort" @click="sortBy('status')">
              Status
              <i
                class="ph th-sort__i"
                :class="[
                  sortIcon('status'),
                  { 'th-sort__i--active': sortKey === 'status' },
                ]"
              />
            </button>
            <button type="button" class="th-sort" @click="sortBy('recipients')">
              Recipients
              <i
                class="ph th-sort__i"
                :class="[
                  sortIcon('recipients'),
                  { 'th-sort__i--active': sortKey === 'recipients' },
                ]"
              />
            </button>
            <button type="button" class="th-sort" @click="sortBy('open')">
              Open Rate
              <i
                class="ph th-sort__i"
                :class="[
                  sortIcon('open'),
                  { 'th-sort__i--active': sortKey === 'open' },
                ]"
              />
            </button>
            <button type="button" class="th-sort" @click="sortBy('click')">
              Click Rate
              <i
                class="ph th-sort__i"
                :class="[
                  sortIcon('click'),
                  { 'th-sort__i--active': sortKey === 'click' },
                ]"
              />
            </button>
            <button type="button" class="th-sort" @click="sortBy('sentDate')">
              Sent Date
              <i
                class="ph th-sort__i"
                :class="[
                  sortIcon('sentDate'),
                  { 'th-sort__i--active': sortKey === 'sentDate' },
                ]"
              />
            </button>
            <div />
          </div>

          <!-- body -->
          <div
            v-for="c in displayed"
            :key="c.id"
            class="trow tbody"
            :class="{ 'trow--selected': isSelected(c.id) }"
          >
            <div class="cell-check" @click="toggleRow(c.id)">
              <div class="check" :class="{ 'check--on': isSelected(c.id) }">
                <i v-if="isSelected(c.id)" class="ph ph-check" />
              </div>
            </div>
            <div class="cell-campaign">
              <div
                class="cicon"
                :style="{
                  background: ROW_META[c.status].bg,
                  border: `1px solid ${ROW_META[c.status].border}`,
                }"
              >
                <i
                  class="ph"
                  :class="ROW_META[c.status].icon"
                  :style="{ color: ROW_META[c.status].fg }"
                />
              </div>
              <div class="cell-campaign__text">
                <div class="cell-campaign__name">{{ c.name }}</div>
                <div class="cell-campaign__subject">{{ c.subject }}</div>
              </div>
            </div>
            <div><CampaignStatusBadge :status="c.status" /></div>
            <div class="cell-num">
              {{ c.recipients ? fmtNum(c.recipients) : '—' }}
            </div>
            <div>
              <span v-if="c.openRate === null" class="cell-dash">—</span>
              <div v-else class="rate">
                <span
                  class="rate__val"
                  :class="{
                    'rate__val--strong': rateStrong(c.openRate, 'open'),
                  }"
                >
                  {{ c.openRate.toFixed(1) }}%
                </span>
                <div class="rate__track">
                  <div
                    class="rate__fill"
                    :style="{
                      width: rateBar(c.openRate, 'open') + '%',
                      background: '#1a7a6e',
                    }"
                  />
                </div>
              </div>
            </div>
            <div>
              <span v-if="c.clickRate === null" class="cell-dash">—</span>
              <div v-else class="rate">
                <span
                  class="rate__val"
                  :class="{
                    'rate__val--strong': rateStrong(c.clickRate, 'click'),
                  }"
                >
                  {{ c.clickRate.toFixed(1) }}%
                </span>
                <div class="rate__track">
                  <div
                    class="rate__fill"
                    :style="{
                      width: rateBar(c.clickRate, 'click') + '%',
                      background: '#cc8a0a',
                    }"
                  />
                </div>
              </div>
            </div>
            <div class="cell-muted">
              <template v-if="c.status === 'scheduled' && c.scheduled_at">
                {{ fmtDate(c.scheduled_at) }}
                <span v-if="mounted" class="countdown">{{
                  scheduledCountdown(c.scheduled_at)
                }}</span>
              </template>
              <template v-else>{{ sentDateCell(c) }}</template>
            </div>
            <div class="cell-actions">
              <NuxtLink
                :to="`/campaigns/${c.id}`"
                class="icon-act"
                aria-label="View stats"
              >
                <i class="ph ph-chart-bar" />
              </NuxtLink>
              <button
                type="button"
                class="icon-act icon-act--danger"
                aria-label="Delete"
                @click="askDeleteSingle(c)"
              >
                <i class="ph ph-trash" />
              </button>
            </div>
          </div>

          <!-- empty -->
          <div v-if="isEmpty" class="empty">
            <div class="empty__icon"><i class="ph ph-magnifying-glass" /></div>
            <div class="empty__title">No campaigns match your filters</div>
            <div class="empty__desc">
              Try a different status or clear your search to see all campaigns.
            </div>
          </div>

          <!-- footer -->
          <div v-if="!isEmpty" class="tfoot">
            <span class="tfoot__text">{{ footerText }}</span>
            <div class="tfoot__nav">
              <button
                type="button"
                class="pager"
                :disabled="!canPrev"
                @click="page--"
              >
                <i class="ph ph-caret-left" /> Previous
              </button>
              <button
                type="button"
                class="pager"
                :disabled="!canNext"
                @click="page++"
              >
                Next <i class="ph ph-caret-right" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDeleteModal
      :open="!!deleteTarget"
      :title="deleteTitle"
      :body="deleteBody"
      :confirm-label="deleteConfirmLabel"
      :loading="deleting"
      @cancel="cancelDelete"
      @confirm="confirmDelete"
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
  padding: 28px;
}
.content {
  max-width: 1240px;
  margin: 0 auto;
}

/* header */
.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.header__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 28px;
  line-height: 1.2;
  color: var(--gray-800);
}
.header__sub {
  font-size: 13px;
  color: var(--gray-500);
  margin-top: 6px;
}
.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--primary-600);
  color: #fff;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  flex: none;
  transition: background-color 100ms ease;
}
.btn-primary:hover {
  background: var(--primary-800);
}
.btn-primary .ph {
  font-size: 16px;
}

/* filter row */
.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.filter-search {
  position: relative;
  flex: 1;
  min-width: 240px;
  max-width: 340px;
}
.filter-search__icon {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 15px;
  color: var(--gray-400);
}
.filter-search__input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 32px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: #fff;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--gray-800);
  outline: none;
}
.filter-search__input::placeholder {
  color: var(--gray-400);
}
.filter-search__input:focus {
  border-color: var(--primary-600);
  outline: 2px solid var(--primary-100);
}

.status-dd {
  position: relative;
}
.status-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: #fff;
  color: var(--gray-700);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.status-btn .ph {
  font-size: 15px;
  color: var(--gray-500);
}
.status-btn__caret {
  font-size: 13px !important;
  color: var(--gray-400) !important;
}
.status-btn--active {
  border-color: var(--primary-200);
  background: var(--primary-50);
}
.status-menu {
  position: absolute;
  top: 42px;
  left: 0;
  z-index: 20;
  width: 200px;
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  box-shadow: var(--shadow-elevated);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.status-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--gray-600);
  cursor: pointer;
}
.status-opt:hover {
  background: var(--gray-50);
}
.status-opt--active {
  background: var(--primary-50);
  color: var(--primary-800);
  font-weight: 500;
}
.status-opt__left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-opt__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex: none;
}
.status-opt__check {
  font-size: 14px;
  color: var(--primary-600);
}
.clear-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--gray-500);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.clear-btn:hover {
  background: var(--gray-100);
  color: var(--gray-800);
}
.clear-btn .ph {
  font-size: 14px;
}

/* selection bar */
.selbar {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 48px;
  padding: 0 16px;
  margin-bottom: 16px;
  background: var(--primary-50);
  border: 1px solid var(--primary-200);
  border-radius: 8px;
}
.selbar__count {
  font-size: 14px;
  font-weight: 500;
  color: var(--primary-800);
}
.selbar__div {
  width: 1px;
  height: 20px;
  background: var(--primary-200);
}
.selbar__btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--primary-800);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.selbar__btn .ph {
  font-size: 16px;
}
.selbar__btn--danger {
  color: var(--danger-600);
}
.selbar__btn--danger:hover {
  background: var(--danger-100);
}
.selbar__clear {
  margin-left: auto;
  color: var(--gray-600);
  font-weight: 400;
}
.selbar__clear:hover {
  background: var(--primary-100);
}

/* table */
.table {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: opacity 120ms ease;
}
.table--loading {
  opacity: 0.6;
}
.trow {
  display: grid;
  grid-template-columns: 44px 2.6fr 1.3fr 1.2fr 1fr 1fr 1.2fr 80px;
  align-items: center;
  padding: 0 16px;
}
.thead {
  height: 42px;
  background: var(--gray-50);
  border-bottom: 1px solid var(--gray-200);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--gray-500);
}
.th-sort {
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: var(--gray-500);
  cursor: pointer;
  user-select: none;
}
.th-sort__i {
  font-size: 12px;
  color: var(--gray-300);
}
.th-sort__i--active {
  color: var(--primary-600);
}
.tbody {
  height: 60px;
  border-bottom: 1px solid var(--gray-100);
  background: #fff;
  transition: background-color 80ms ease;
}
.tbody:last-of-type {
  border-bottom: none;
}
.tbody:hover {
  background: var(--gray-50);
}
.trow--selected,
.trow--selected:hover {
  background: var(--primary-50);
}

.cell-check {
  cursor: pointer;
}
.check {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--gray-300);
  background: #fff;
  transition:
    background-color 80ms ease,
    border-color 80ms ease;
}
.check--on {
  border-color: var(--primary-600);
  background: var(--primary-600);
}
.check .ph {
  font-size: 12px;
  color: #fff;
}

.cell-campaign {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.cicon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cicon .ph {
  font-size: 17px;
}
.cell-campaign__text {
  min-width: 0;
}
.cell-campaign__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-800);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-campaign__subject {
  font-size: 12px;
  color: var(--gray-400);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-num {
  font-size: 14px;
  color: var(--gray-800);
  font-variant-numeric: tabular-nums;
}
.cell-muted {
  font-size: 13px;
  color: var(--gray-500);
}
.countdown {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  background: var(--warning-100);
  color: var(--warning-600);
  font-size: 11px;
  font-weight: 500;
}
.cell-dash {
  font-size: 13px;
  color: var(--gray-300);
}
.rate {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rate__val {
  font-size: 14px;
  color: var(--gray-800);
  font-variant-numeric: tabular-nums;
  min-width: 44px;
}
.rate__val--strong {
  font-weight: 500;
}
.rate__track {
  width: 44px;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--gray-100);
  overflow: hidden;
}
.rate__fill {
  height: 100%;
  border-radius: var(--radius-full);
}
.cell-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  opacity: 0;
  transition: opacity 120ms ease;
}
.tbody:hover .cell-actions,
.trow--selected .cell-actions {
  opacity: 1;
}
.icon-act {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--gray-500);
  cursor: pointer;
}
.icon-act:hover {
  background: var(--gray-100);
  color: var(--gray-800);
}
.icon-act--danger:hover {
  background: var(--danger-100);
  color: var(--danger-600);
}
.icon-act .ph {
  font-size: 16px;
}

/* empty */
.empty {
  padding: 64px 32px;
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

/* footer */
.tfoot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 16px;
  border-top: 1px solid var(--gray-200);
  background: var(--gray-50);
}
.tfoot__text {
  font-size: 13px;
  color: var(--gray-500);
}
.tfoot__nav {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pager {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
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
  font-size: 14px;
}
</style>
