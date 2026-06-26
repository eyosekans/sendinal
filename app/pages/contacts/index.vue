<script setup lang="ts">
import type { Contact } from '~/types/contact'
import type { List } from '~/types/list'
import type { ContactStatus } from '#shared/schemas'
import ContactStatusBadge from '~/components/contacts/ContactStatusBadge.vue'
import ContactFormModal from '~/components/contacts/ContactFormModal.vue'
import ListsPanel from '~/components/contacts/ListsPanel.vue'
import ListFormModal from '~/components/contacts/ListFormModal.vue'
import ImportWizardModal from '~/components/contacts/ImportWizardModal.vue'
import ConfirmDeleteModal from '~/components/ConfirmDeleteModal.vue'

useHead({ title: 'Contacts — Sendinal' })

// Shared layout top bar drives the search query.
const { search: searchInput, placeholder } = useTopbar()
searchInput.value = ''
placeholder.value = 'Search contacts by name or email…'

/* ---------- query state ---------- */
const LIMIT = 25
const page = ref(1)
const debouncedSearch = ref('')
const tab = ref<'all' | ContactStatus>('all')
const selectedListId = ref<string | null>(null)

const listQuery = computed(() => ({
  page: page.value,
  limit: LIMIT,
  ...(debouncedSearch.value ? { search: debouncedSearch.value } : {}),
  ...(tab.value !== 'all' ? { status: tab.value } : {}),
  ...(selectedListId.value ? { listId: selectedListId.value } : {}),
}))

const {
  data: list,
  pending,
  refresh,
} = await useFetch('/api/contacts', {
  query: listQuery,
  default: () => ({ data: [] as Contact[], total: 0, page: 1, limit: LIMIT }),
})
const { data: stats, refresh: refreshStats } = await useFetch(
  '/api/contacts/stats',
  {
    default: () => ({
      all: 0,
      active: 0,
      unsubscribed: 0,
      bounced: 0,
      complained: 0,
    }),
  },
)
const { data: listsRaw, refresh: refreshLists } = await useFetch('/api/lists', {
  default: () => [] as List[],
})

const contacts = computed(() => (list.value?.data ?? []) as Contact[])
const total = computed(() => list.value?.total ?? 0)
const lists = computed(() => (listsRaw.value ?? []) as List[])
const selectedList = computed(
  () => lists.value.find((l) => l.id === selectedListId.value) ?? null,
)
const headerTitle = computed(() => selectedList.value?.name ?? 'All Contacts')

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

/* ---------- list selection ---------- */
function selectList(id: string | null) {
  if (selectedListId.value === id) return
  selectedListId.value = id
  page.value = 1
  clearSelection()
}

/* ---------- tabs ---------- */
const TABS: { key: 'all' | ContactStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'unsubscribed', label: 'Unsubscribed' },
  { key: 'bounced', label: 'Bounced' },
  { key: 'complained', label: 'Complained' },
]
function tabCount(key: 'all' | ContactStatus) {
  return stats.value?.[key] ?? 0
}
function setTab(key: 'all' | ContactStatus) {
  if (tab.value === key) return
  tab.value = key
  page.value = 1
  clearSelection()
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
    contacts.value.length > 0 && contacts.value.every((c) => isSelected(c.id)),
)
function toggleAll() {
  const ids = contacts.value.map((c) => c.id)
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
function prevPage() {
  if (canPrev.value) page.value--
}
function nextPage() {
  if (canNext.value) page.value++
}
const footerText = computed(
  () => `Showing ${contacts.value.length} of ${total.value} contacts`,
)

/* ---------- display helpers ---------- */
const PALETTE = [
  { bg: '#c8ebe4', fg: '#0f5247' },
  { bg: '#fef3d0', fg: '#92620a' },
  { bg: '#fde8e8', fg: '#c0272d' },
  { bg: '#e3f0fd', fg: '#1a5fa8' },
  { bg: '#fdf0e8', fg: '#984a14' },
]
function displayName(c: Contact) {
  const n = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
  return n || c.email
}
function initials(c: Contact) {
  if (c.first_name || c.last_name) {
    return ((c.first_name?.[0] ?? '') + (c.last_name?.[0] ?? '')).toUpperCase()
  }
  return c.email.slice(0, 2).toUpperCase()
}
function palette(c: Contact) {
  let h = 0
  for (const ch of c.id) h = (h + ch.charCodeAt(0)) % PALETTE.length
  return PALETTE[h]!
}
function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })
}

/* ---------- contact create / edit modal ---------- */
const formOpen = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const formContact = ref<Contact | null>(null)
const createSchemaFields = computed(() => selectedList.value?.attribute_schema ?? [])
function openCreate() {
  formMode.value = 'create'
  formContact.value = null
  formOpen.value = true
}
function openEdit(c: Contact) {
  formMode.value = 'edit'
  formContact.value = c
  formOpen.value = true
}
async function onSaved() {
  formOpen.value = false
  await Promise.all([refresh(), refreshStats(), refreshLists()])
}

/* ---------- list create / edit modal ---------- */
const listFormOpen = ref(false)
const listFormMode = ref<'create' | 'edit'>('create')
const listFormTarget = ref<List | null>(null)
function openCreateList() {
  listFormMode.value = 'create'
  listFormTarget.value = null
  listFormOpen.value = true
}
function openEditList(l: List) {
  listFormMode.value = 'edit'
  listFormTarget.value = l
  listFormOpen.value = true
}
async function onListSaved() {
  listFormOpen.value = false
  await refreshLists()
}

/* ---------- list delete ---------- */
const listDeleteTarget = ref<List | null>(null)
const deletingList = ref(false)
function askDeleteList(l: List) {
  listDeleteTarget.value = l
}
async function confirmDeleteList() {
  const l = listDeleteTarget.value
  if (!l) return
  deletingList.value = true
  try {
    await $fetch(`/api/lists/${l.id}`, { method: 'DELETE' })
    if (selectedListId.value === l.id) selectList(null)
    listDeleteTarget.value = null
    await refreshLists()
  } finally {
    deletingList.value = false
  }
}

/* ---------- CSV import wizard ---------- */
const importOpen = ref(false)
// The wizard emits `imported` when the run completes but keeps itself open on its
// Results step — refresh data in the background without closing.
async function onImported() {
  await Promise.all([refresh(), refreshStats(), refreshLists()])
}

/* ---------- contact delete modal ---------- */
const deleteTarget = ref<{
  type: 'single' | 'bulk'
  id?: string
  name?: string
} | null>(null)
const deleting = ref(false)
function askDeleteSingle(c: Contact) {
  deleteTarget.value = { type: 'single', id: c.id, name: displayName(c) }
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
    ? 'Delete contact?'
    : `Delete ${selectedCount.value} contacts?`
})
const deleteBody = computed(() => {
  const t = deleteTarget.value
  if (!t) return ''
  if (t.type === 'single') {
    return `${t.name} will be removed from your contacts and will no longer receive any campaigns. You can re-add them later by email.`
  }
  return `${selectedCount.value} contacts will be removed from your contacts and will no longer receive any campaigns. You can re-add them later by email.`
})
const deleteConfirmLabel = computed(() => {
  const t = deleteTarget.value
  if (!t) return 'Delete'
  return t.type === 'single'
    ? 'Delete contact'
    : `Delete ${selectedCount.value} contacts`
})
async function confirmDelete() {
  const t = deleteTarget.value
  if (!t) return
  deleting.value = true
  try {
    const ids = t.type === 'single' && t.id ? [t.id] : [...selectedIds.value]
    for (const id of ids) {
      await $fetch(`/api/contacts/${id}`, { method: 'DELETE' })
    }
    deleteTarget.value = null
    clearSelection()
    await Promise.all([refresh(), refreshStats(), refreshLists()])
    if (contacts.value.length === 0 && page.value > 1) page.value--
  } finally {
    deleting.value = false
  }
}

const isEmpty = computed(() => !pending.value && contacts.value.length === 0)
</script>

<template>
  <div class="page">
    <!-- lists panel + main column -->
    <div class="body">
      <ListsPanel
        :lists="lists"
        :selected-list-id="selectedListId"
        :total-count="tabCount('all')"
        @select="selectList"
        @create="openCreateList"
        @edit="openEditList"
        @remove="askDeleteList"
      />

      <div class="main-col">
        <div class="scroll">
          <div class="content">
            <!-- page header -->
            <div class="header">
              <div>
                <div class="header__crumb">Contacts</div>
                <h1 class="header__title">{{ headerTitle }}</h1>
                <div class="header__sub">
                  {{ selectedList ? selectedList.contactCount : total }} contacts
                </div>
              </div>
              <div class="header__actions">
                <button
                  type="button"
                  class="btn-secondary"
                  @click="importOpen = true"
                >
                  <i class="ph ph-download-simple" /> Import CSV
                </button>
                <button type="button" class="btn-primary" @click="openCreate">
                  <i class="ph ph-user-plus" /> Add Contact
                </button>
              </div>
            </div>

            <!-- status tabs -->
            <div class="tabs">
              <button
                v-for="t in TABS"
                :key="t.key"
                type="button"
                class="tab"
                :class="{ 'tab--active': tab === t.key }"
                @click="setTab(t.key)"
              >
                {{ t.label }}
                <span
                  class="tab__count"
                  :class="{ 'tab__count--active': tab === t.key }"
                >
                  {{ tabCount(t.key) }}
                </span>
              </button>
            </div>

            <!-- selection bar -->
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
                <div>Contact</div>
                <div>Email</div>
                <div>Status</div>
                <div>Last Opened</div>
                <div>Date Added</div>
                <div class="ta-right">Actions</div>
              </div>

              <!-- body -->
              <div
                v-for="c in contacts"
                :key="c.id"
                class="trow tbody"
                :class="{ 'trow--selected': isSelected(c.id) }"
              >
                <div class="cell-check" @click="toggleRow(c.id)">
                  <div class="check" :class="{ 'check--on': isSelected(c.id) }">
                    <i v-if="isSelected(c.id)" class="ph ph-check" />
                  </div>
                </div>
                <div class="cell-contact">
                  <div
                    class="avatar"
                    :style="{ background: palette(c).bg, color: palette(c).fg }"
                  >
                    {{ initials(c) }}
                  </div>
                  <span class="cell-name">{{ displayName(c) }}</span>
                </div>
                <div class="cell-email">{{ c.email }}</div>
                <div><ContactStatusBadge :status="c.status" /></div>
                <div class="cell-muted">—</div>
                <div class="cell-muted">{{ formatDate(c.created_at) }}</div>
                <div class="cell-actions">
                  <button
                    type="button"
                    class="icon-act"
                    aria-label="Edit"
                    @click="openEdit(c)"
                  >
                    <i class="ph ph-pencil-simple" />
                  </button>
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
                <div class="empty__icon">
                  <i class="ph ph-magnifying-glass" />
                </div>
                <div class="empty__title">No contacts match your filters</div>
                <div class="empty__desc">
                  Try a different status tab or clear your search to see everyone
                  in your contacts.
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
                    @click="prevPage"
                  >
                    <i class="ph ph-caret-left" /> Previous
                  </button>
                  <button
                    type="button"
                    class="pager"
                    :disabled="!canNext"
                    @click="nextPage"
                  >
                    Next <i class="ph ph-caret-right" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ContactFormModal
      :open="formOpen"
      :mode="formMode"
      :contact="formContact"
      :schema-fields="createSchemaFields"
      @close="formOpen = false"
      @saved="onSaved"
    />
    <ListFormModal
      :open="listFormOpen"
      :mode="listFormMode"
      :list="listFormTarget"
      @close="listFormOpen = false"
      @saved="onListSaved"
    />
    <ImportWizardModal
      :open="importOpen"
      :lists="lists"
      :default-list-id="selectedListId"
      @close="importOpen = false"
      @imported="onImported"
      @view-contacts="importOpen = false"
    />
    <ConfirmDeleteModal
      :open="!!deleteTarget"
      :title="deleteTitle"
      :body="deleteBody"
      :confirm-label="deleteConfirmLabel"
      :loading="deleting"
      @cancel="cancelDelete"
      @confirm="confirmDelete"
    />
    <ConfirmDeleteModal
      :open="!!listDeleteTarget"
      title="Delete list?"
      :body="`The list “${listDeleteTarget?.name}” will be deleted. Its contacts are kept — only the list and its memberships are removed.`"
      confirm-label="Delete list"
      :loading="deletingList"
      @cancel="listDeleteTarget = null"
      @confirm="confirmDeleteList"
    />
  </div>
</template>

<style scoped>
/* Single root for the template; lays out as if its children (topbar + body)
   were direct flex children of the layout's <main>. */
.page {
  display: contents;
}

/* body: lists panel + main column */
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.main-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* scroll + content */
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 28px;
}
.content {
  max-width: 1180px;
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
.header__crumb {
  font-size: 13px;
  color: var(--gray-500);
  margin-bottom: 6px;
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
.header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}
.btn-secondary {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: #fff;
  color: var(--gray-700);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 100ms ease;
}
.btn-secondary:hover {
  background: var(--gray-50);
}
.btn-secondary .ph {
  font-size: 16px;
}
.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
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

/* tabs */
.tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  background: var(--gray-100);
  border-radius: 8px;
  width: fit-content;
  margin-bottom: 20px;
}
.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: var(--gray-500);
  transition: background-color 100ms ease;
}
.tab--active {
  background: #fff;
  color: var(--primary-800);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.tab__count {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: var(--gray-200);
  color: var(--gray-500);
}
.tab__count--active {
  background: var(--primary-50);
  color: var(--primary-600);
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
.selbar__btn:hover {
  background: var(--primary-100);
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
  grid-template-columns: 44px 2.2fr 2.4fr 1.3fr 1.2fr 1.2fr 92px;
  align-items: center;
  padding: 0 16px;
}
.thead {
  height: 40px;
  background: var(--gray-50);
  border-bottom: 1px solid var(--gray-200);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--gray-500);
}
.tbody {
  height: 56px;
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
.ta-right {
  text-align: right;
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

.cell-contact {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 12px;
}
.cell-name {
  font-size: 14px;
  color: var(--gray-800);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-email {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--gray-600);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-muted {
  font-size: 13px;
  color: var(--gray-500);
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
