<script setup lang="ts">
/**
 * Template Library (task 3.4 — built from the Claude Design handoff
 * `design-system-template-library-screen`).
 *
 * Lists saved templates with search, category filter, sort and grid/list views.
 * Per template: preview (real HTML in an iframe), duplicate, rename, delete,
 * categorise, and "Use in new campaign" (→ the builder seeded from it).
 * Creation routes to the campaign builder ("Save as template"); Import HTML and
 * the layout chooser from the mock are out of scope (no standalone editor).
 */
import { TEMPLATE_CATEGORIES, type TemplateCategory } from '#shared/schemas'
import TemplateThumb from '~/components/templates/TemplateThumb.client.vue'

interface TemplateRow {
  id: string
  name: string
  subject: string
  category: TemplateCategory | null
  html: string
  created_at: string
  updated_at: string
}

useHead({ title: 'Templates — Sendinal' })

// Shared layout top bar drives the search query.
const { search, placeholder } = useTopbar()
search.value = ''
placeholder.value = 'Search templates…'

const { data: raw, refresh } = await useFetch<{ data: TemplateRow[] }>(
  '/api/templates',
  { query: { limit: 100 }, default: () => ({ data: [] }) },
)
const templates = computed(() => raw.value?.data ?? [])

/* ---------- view state ---------- */
const category = ref<'All' | TemplateCategory>('All')
const sort = ref<'Last edited' | 'Name A–Z'>('Last edited')
const view = ref<'grid' | 'list'>('grid')
const sortMenuOpen = ref(false)
const openMenuId = ref<string | null>(null)
const hoveredId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renameDraft = ref('')
const confirmDeleteId = ref<string | null>(null)
const busy = ref(false)

const categories = ['All', ...TEMPLATE_CATEGORIES] as const

const CAT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Newsletter: { bg: '#edf7f5', text: '#0f5247', dot: '#2fa898' },
  Promotion: { bg: '#fef3d0', text: '#92620a', dot: '#d99a1a' },
  Announcement: { bg: '#fdf0e8', text: '#984a14', dot: '#c2762e' },
  Transactional: { bg: '#e3f0fd', text: '#1a5fa8', dot: '#3b82d4' },
  Seasonal: { bg: '#f0ecf9', text: '#5b3a9e', dot: '#8a6bc7' },
}
function catColor(cat: string | null) {
  return (
    (cat && CAT_COLORS[cat]) || { bg: '#f0eeeb', text: '#534d46', dot: '#a09990' }
  )
}
function catLabel(cat: string | null) {
  return cat ?? 'Uncategorized'
}

/* ---------- relative "edited" (client-only to avoid hydration drift) ---- */
const mounted = ref(false)
onMounted(() => (mounted.value = true))
function relTime(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  const u = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'} ago`
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return u(m, 'minute')
  const h = Math.floor(m / 60)
  if (h < 24) return u(h, 'hour')
  const d = Math.floor(h / 24)
  if (d < 7) return u(d, 'day')
  const w = Math.floor(d / 7)
  if (w < 5) return u(w, 'week')
  const mo = Math.floor(d / 30)
  if (mo < 12) return u(mo, 'month')
  return u(Math.floor(d / 365), 'year')
}
function editedLabel(iso: string) {
  return mounted.value ? `Edited ${relTime(iso)}` : 'Edited recently'
}

/* ---------- filter + sort ---------- */
const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = templates.value.filter((t) => {
    const okCat = category.value === 'All' || t.category === category.value
    const okQ = !q || t.name.toLowerCase().includes(q)
    return okCat && okQ
  })
  list =
    sort.value === 'Name A–Z'
      ? [...list].sort((a, b) => a.name.localeCompare(b.name))
      : [...list].sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
  return list
})
const total = computed(() => templates.value.length)
const filtering = computed(
  () => search.value.trim() !== '' || category.value !== 'All',
)
const subtitle = computed(() =>
  filtering.value
    ? `${visible.value.length} of ${total.value} templates`
    : `${total.value} template${total.value === 1 ? '' : 's'} available`,
)

/* ---------- menus ---------- */
function toggleSort() {
  sortMenuOpen.value = !sortMenuOpen.value
  openMenuId.value = null
}
function chooseSort(v: typeof sort.value) {
  sort.value = v
  sortMenuOpen.value = false
}
function toggleMenu(id: string) {
  openMenuId.value = openMenuId.value === id ? null : id
  sortMenuOpen.value = false
}
function closeMenus() {
  openMenuId.value = null
  sortMenuOpen.value = false
}
const anyMenuOpen = computed(() => !!openMenuId.value || sortMenuOpen.value)
function clearFilters() {
  search.value = ''
  category.value = 'All'
}

/* ---------- toasts ---------- */
interface Toast {
  id: number
  variant: 'success' | 'error' | 'info'
  title: string
  desc?: string
}
const toasts = ref<Toast[]>([])
let toastSeq = 0
const TOAST_META: Record<Toast['variant'], { color: string; icon: string }> = {
  success: { color: '#1a7a46', icon: 'ph-check-circle' },
  error: { color: '#c0272d', icon: 'ph-x-circle' },
  info: { color: '#1a7a6e', icon: 'ph-info' },
}
function toast(variant: Toast['variant'], title: string, desc?: string) {
  const id = ++toastSeq
  toasts.value = [...toasts.value, { id, variant, title, desc }].slice(-3)
  setTimeout(() => dismissToast(id), 4000)
}
function dismissToast(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}
function errMsg(e: unknown): string {
  return (e as { data?: { message?: string } })?.data?.message ?? 'Please retry'
}

/* ---------- actions ---------- */
async function duplicate(t: TemplateRow) {
  openMenuId.value = null
  if (busy.value) return
  busy.value = true
  try {
    await $fetch(`/api/templates/${t.id}/duplicate`, { method: 'POST' })
    await refresh()
    toast('success', 'Template duplicated', `“${t.name}” copied`)
  } catch (e) {
    toast('error', 'Could not duplicate', errMsg(e))
  } finally {
    busy.value = false
  }
}

function startRename(t: TemplateRow) {
  renamingId.value = t.id
  renameDraft.value = t.name
  openMenuId.value = null
}
function onRenameKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitRename()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    renamingId.value = null
  }
}
async function commitRename() {
  const id = renamingId.value
  const name = renameDraft.value.trim()
  const current = templates.value.find((t) => t.id === id)
  renamingId.value = null
  if (!id || !name || !current || name === current.name) return
  try {
    await $fetch(`/api/templates/${id}`, { method: 'PATCH', body: { name } })
    await refresh()
    if (preview.value?.id === id) preview.value = { ...preview.value, name }
    toast('success', 'Template renamed')
  } catch (e) {
    toast('error', 'Could not rename', errMsg(e))
  }
}

function startDelete(id: string) {
  confirmDeleteId.value = id
  openMenuId.value = null
}
async function confirmDelete(t: TemplateRow) {
  confirmDeleteId.value = null
  try {
    await $fetch(`/api/templates/${t.id}`, { method: 'DELETE' })
    if (preview.value?.id === t.id) closePreview()
    await refresh()
    toast('success', 'Template deleted', `“${t.name}” removed`)
  } catch (e) {
    toast('error', 'Could not delete', errMsg(e))
  }
}

async function changeCategory(id: string, cat: TemplateCategory) {
  try {
    await $fetch(`/api/templates/${id}`, {
      method: 'PATCH',
      body: { category: cat },
    })
    await refresh()
    if (preview.value?.id === id) preview.value = { ...preview.value, category: cat }
    toast('success', 'Category updated')
  } catch (e) {
    toast('error', 'Could not update', errMsg(e))
  }
}

function useInCampaign(id: string) {
  navigateTo(`/campaigns/new?template=${id}`)
}
function newTemplate() {
  navigateTo('/campaigns/new')
}

/* ---------- preview modal ---------- */
interface PreviewVM extends TemplateRow {
  html: string
}
const preview = ref<PreviewVM | null>(null)
const previewLoading = ref(false)
const previewRenaming = ref(false)

async function openPreview(t: TemplateRow) {
  openMenuId.value = null
  hoveredId.value = null
  previewRenaming.value = false
  previewLoading.value = true
  preview.value = { ...t, html: '' }
  try {
    const full = await $fetch<TemplateRow & { html: string }>(
      `/api/templates/${t.id}`,
    )
    if (preview.value?.id === t.id) preview.value = { ...preview.value, ...full }
  } catch (e) {
    toast('error', 'Could not load template', errMsg(e))
  } finally {
    previewLoading.value = false
  }
}
function closePreview() {
  preview.value = null
  previewRenaming.value = false
}
function startPreviewRename() {
  if (!preview.value) return
  previewRenaming.value = true
  renamingId.value = preview.value.id
  renameDraft.value = preview.value.name
}
function onPreviewRenameKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    previewRenaming.value = false
    commitRename()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    previewRenaming.value = false
    renamingId.value = null
  }
}

/* ---------- keyboard ---------- */
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (preview.value) return closePreview()
  if (anyMenuOpen.value) return closeMenus()
  if (confirmDeleteId.value) confirmDeleteId.value = null
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="page">
    <div class="scroll">
      <div class="wrap">
        <!-- page header -->
        <div class="phead">
          <div>
            <h1 class="phead__title">Template Library</h1>
            <p class="phead__sub">{{ subtitle }}</p>
          </div>
          <button type="button" class="btn-primary" @click="newTemplate">
            <i class="ph ph-plus" /> New template
          </button>
        </div>

        <!-- toolbar -->
        <div class="toolbar">
          <div class="toolbar__left">
            <div class="tsearch">
              <i class="ph ph-magnifying-glass tsearch__icon" />
              <input
                v-model="search"
                class="tsearch__input"
                placeholder="Search templates…"
                aria-label="Search templates"
              />
              <button
                v-if="search.trim()"
                type="button"
                class="tsearch__clear"
                aria-label="Clear search"
                @click="search = ''"
              >
                <i class="ph ph-x" />
              </button>
            </div>
            <div class="pills">
              <button
                v-for="c in categories"
                :key="c"
                type="button"
                class="pill"
                :class="{ 'pill--active': category === c }"
                @click="category = c"
              >
                {{ c }}
              </button>
            </div>
          </div>

          <div class="toolbar__right">
            <div class="sortwrap">
              <button type="button" class="sortbtn" @click="toggleSort">
                <i class="ph ph-arrows-down-up" />
                <span class="sortbtn__pre">Sort:</span>{{ sort }}
                <i class="ph ph-caret-down sortbtn__caret" />
              </button>
              <div v-if="sortMenuOpen" class="menu sortmenu">
                <button
                  v-for="o in ['Last edited', 'Name A–Z']"
                  :key="o"
                  type="button"
                  class="menu__item"
                  @click="chooseSort(o as 'Last edited' | 'Name A–Z')"
                >
                  {{ o }}
                  <i v-if="sort === o" class="ph ph-check menu__check" />
                </button>
              </div>
            </div>
            <div class="seg">
              <button
                type="button"
                class="seg__btn"
                :class="{ 'seg__btn--on': view === 'grid' }"
                aria-label="Grid view"
                @click="view = 'grid'"
              >
                <i class="ph ph-squares-four" />
              </button>
              <button
                type="button"
                class="seg__btn"
                :class="{ 'seg__btn--on': view === 'list' }"
                aria-label="List view"
                @click="view = 'list'"
              >
                <i class="ph ph-rows" />
              </button>
            </div>
          </div>
        </div>

        <!-- content -->
        <div class="content">
          <!-- empty -->
          <div v-if="visible.length === 0" class="empty">
            <div class="empty__icon"><i class="ph ph-magnifying-glass" /></div>
            <h2 class="empty__title">
              {{
                search.trim()
                  ? `No templates matching “${search.trim()}”`
                  : `No ${category} templates yet`
              }}
            </h2>
            <p class="empty__sub">
              {{
                search.trim()
                  ? 'Try a different name or clear the filter.'
                  : 'Switch categories or create a new template to fill this space.'
              }}
            </p>
            <button
              v-if="filtering"
              type="button"
              class="btn-secondary"
              @click="clearFilters"
            >
              Clear filters
            </button>
          </div>

          <!-- GRID -->
          <div v-else-if="view === 'grid'" class="grid">
            <div
              v-for="t in visible"
              :key="t.id"
              class="card"
              :class="{ 'card--hover': hoveredId === t.id }"
              @mouseenter="hoveredId = t.id"
              @mouseleave="hoveredId === t.id && (hoveredId = null)"
            >
              <!-- thumbnail -->
              <div
                class="thumb"
                :style="{ background: catColor(t.category).bg }"
              >
                <ClientOnly>
                  <TemplateThumb :html="t.html" />
                </ClientOnly>
                <div
                  class="thumb__overlay"
                  :style="{
                    opacity: hoveredId === t.id ? 1 : 0,
                    pointerEvents: hoveredId === t.id ? 'auto' : 'none',
                  }"
                >
                  <button
                    type="button"
                    class="ov-btn ov-btn--ghost"
                    @click="openPreview(t)"
                  >
                    <i class="ph ph-eye" /> Preview
                  </button>
                  <button
                    type="button"
                    class="ov-btn ov-btn--solid"
                    @click="useInCampaign(t.id)"
                  >
                    <i class="ph ph-paper-plane-tilt" /> Use
                  </button>
                </div>
              </div>

              <!-- body -->
              <div class="card__body">
                <div class="card__top">
                  <input
                    v-if="renamingId === t.id"
                    v-model="renameDraft"
                    class="rename"
                    @keydown="onRenameKey"
                    @blur="commitRename"
                  />
                  <span v-else class="card__name" :title="t.name">{{
                    t.name
                  }}</span>
                  <div class="menuwrap">
                    <button
                      type="button"
                      class="iconbtn"
                      aria-label="More actions"
                      @click.stop="toggleMenu(t.id)"
                    >
                      <i class="ph ph-dots-three-vertical" />
                    </button>
                    <div v-if="openMenuId === t.id" class="menu cardmenu">
                      <button
                        type="button"
                        class="menu__item"
                        @click="duplicate(t)"
                      >
                        <i class="ph ph-copy" /> Duplicate
                      </button>
                      <button
                        type="button"
                        class="menu__item"
                        @click="startRename(t)"
                      >
                        <i class="ph ph-cursor-text" /> Rename
                      </button>
                      <button
                        type="button"
                        class="menu__item"
                        @click="useInCampaign(t.id)"
                      >
                        <i class="ph ph-paper-plane-tilt" /> Use in new campaign
                      </button>
                      <div class="menu__sep" />
                      <button
                        type="button"
                        class="menu__item menu__item--danger"
                        @click="startDelete(t.id)"
                      >
                        <i class="ph ph-trash" /> Delete
                      </button>
                    </div>
                  </div>
                </div>

                <template v-if="confirmDeleteId !== t.id">
                  <div class="card__meta">
                    <span
                      class="cat"
                      :style="{
                        background: catColor(t.category).bg,
                        color: catColor(t.category).text,
                      }"
                    >
                      <span
                        class="cat__dot"
                        :style="{ background: catColor(t.category).dot }"
                      />{{ catLabel(t.category) }}
                    </span>
                    <span class="card__edited">· {{ editedLabel(t.updated_at) }}</span>
                  </div>
                  <div class="card__subject" :title="t.subject">
                    {{ t.subject }}
                  </div>
                </template>

                <div v-else class="delbox">
                  <div class="delbox__title">Delete “{{ t.name }}”?</div>
                  <div class="delbox__sub">This cannot be undone.</div>
                  <div class="delbox__actions">
                    <button
                      type="button"
                      class="btn-secondary btn-sm"
                      @click="confirmDeleteId = null"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      class="btn-danger btn-sm"
                      @click="confirmDelete(t)"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- LIST -->
          <div v-else class="listpanel">
            <div class="lhead">
              <div />
              <div>Name</div>
              <div>Category</div>
              <div>Last edited</div>
              <div class="lhead__actions">Actions</div>
            </div>
            <div
              v-for="t in visible"
              :key="t.id"
              class="lrow"
              :class="{ 'lrow--hover': hoveredId === t.id }"
              @mouseenter="hoveredId = t.id"
              @mouseleave="hoveredId === t.id && (hoveredId = null)"
            >
              <div
                class="lthumb"
                :style="{ background: catColor(t.category).bg }"
              >
                <ClientOnly>
                  <TemplateThumb :html="t.html" />
                </ClientOnly>
              </div>
              <div class="lname-cell">
                <input
                  v-if="renamingId === t.id"
                  v-model="renameDraft"
                  class="rename"
                  @keydown="onRenameKey"
                  @blur="commitRename"
                />
                <span v-else class="lname" :title="t.name">{{ t.name }}</span>
              </div>
              <div>
                <span
                  class="cat"
                  :style="{
                    background: catColor(t.category).bg,
                    color: catColor(t.category).text,
                  }"
                >
                  <span
                    class="cat__dot"
                    :style="{ background: catColor(t.category).dot }"
                  />{{ catLabel(t.category) }}
                </span>
              </div>
              <div class="lmuted">{{ editedLabel(t.updated_at) }}</div>
              <div
                class="lactions"
                :style="{
                  opacity: hoveredId === t.id || openMenuId === t.id ? 1 : 0,
                }"
              >
                <button
                  type="button"
                  class="iconbtn"
                  aria-label="Preview"
                  @click="openPreview(t)"
                >
                  <i class="ph ph-eye" />
                </button>
                <div class="menuwrap">
                  <button
                    type="button"
                    class="iconbtn"
                    aria-label="More actions"
                    @click.stop="toggleMenu(t.id)"
                  >
                    <i class="ph ph-dots-three-vertical" />
                  </button>
                  <div v-if="openMenuId === t.id" class="menu cardmenu">
                    <button type="button" class="menu__item" @click="duplicate(t)">
                      <i class="ph ph-copy" /> Duplicate
                    </button>
                    <button
                      type="button"
                      class="menu__item"
                      @click="startRename(t)"
                    >
                      <i class="ph ph-cursor-text" /> Rename
                    </button>
                    <button
                      type="button"
                      class="menu__item"
                      @click="useInCampaign(t.id)"
                    >
                      <i class="ph ph-paper-plane-tilt" /> Use in new campaign
                    </button>
                    <div class="menu__sep" />
                    <button
                      type="button"
                      class="menu__item menu__item--danger"
                      @click="startDelete(t.id)"
                    >
                      <i class="ph ph-trash" /> Delete
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="confirmDeleteId === t.id" class="lrow-del">
                <span
                  >Delete “{{ t.name }}”?
                  <span class="lrow-del__sub">This cannot be undone.</span></span
                >
                <div class="delbox__actions">
                  <button
                    type="button"
                    class="btn-secondary btn-sm"
                    @click="confirmDeleteId = null"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn-danger btn-sm"
                    @click="confirmDelete(t)"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- menu backdrop -->
    <div v-if="anyMenuOpen" class="backdrop" @click="closeMenus" />

    <!-- PREVIEW MODAL -->
    <div v-if="preview" class="modal" @click="closePreview">
      <div class="modal__panel" @click.stop>
        <div class="modal__head">
          <button type="button" class="modal__back" @click="closePreview">
            <i class="ph ph-arrow-left" /> Back to templates
          </button>
          <span class="modal__name">{{ preview.name }}</span>
          <button
            type="button"
            class="iconbtn"
            aria-label="Close"
            @click="closePreview"
          >
            <i class="ph ph-x" />
          </button>
        </div>

        <div class="modal__body">
          <!-- meta sidebar -->
          <div class="meta">
            <div class="meta__group">
              <span class="meta__label">Template name</span>
              <input
                v-if="previewRenaming"
                v-model="renameDraft"
                class="meta__nameinput"
                @keydown="onPreviewRenameKey"
                @blur="(previewRenaming = false), commitRename()"
              />
              <button
                v-else
                type="button"
                class="meta__name"
                title="Click to rename"
                @click="startPreviewRename"
              >
                {{ preview.name }}
              </button>
            </div>

            <div class="meta__group">
              <span class="meta__label">Category</span>
              <div class="catopts">
                <button
                  v-for="c in TEMPLATE_CATEGORIES"
                  :key="c"
                  type="button"
                  class="catopt"
                  :class="{ 'catopt--on': preview.category === c }"
                  :style="
                    preview.category === c
                      ? {
                          background: catColor(c).bg,
                          color: catColor(c).text,
                          borderColor: catColor(c).dot,
                        }
                      : {}
                  "
                  @click="changeCategory(preview.id, c)"
                >
                  <span
                    class="cat__dot"
                    :style="{ background: catColor(c).dot }"
                  />{{ c }}
                </button>
              </div>
            </div>

            <div class="meta__group">
              <span class="meta__label">Last edited</span>
              <span class="meta__val">{{ editedLabel(preview.updated_at) }}</span>
            </div>

            <div class="meta__actions">
              <button
                type="button"
                class="btn-primary meta__primary"
                @click="useInCampaign(preview.id)"
              >
                <i class="ph ph-paper-plane-tilt" /> Use in campaign
              </button>
              <button
                type="button"
                class="btn-secondary"
                @click="duplicate(preview)"
              >
                <i class="ph ph-copy" /> Duplicate
              </button>
            </div>

            <div class="meta__danger">
              <button
                type="button"
                class="meta__delete"
                @click="startDelete(preview.id)"
              >
                <i class="ph ph-trash" /> Delete template
              </button>
              <div v-if="confirmDeleteId === preview.id" class="delbox">
                <div class="delbox__sub">
                  Delete this template permanently? This cannot be undone.
                </div>
                <div class="delbox__actions">
                  <button
                    type="button"
                    class="btn-secondary btn-sm"
                    @click="confirmDeleteId = null"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn-danger btn-sm"
                    @click="confirmDelete(preview)"
                  >
                    Delete template
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- rendered email -->
          <div class="render">
            <div class="render__frame">
              <div class="render__bar">
                <span class="render__sublabel">Subject</span>
                <span class="render__subject">{{ preview.subject }}</span>
              </div>
              <div class="render__viewport">
                <div v-if="previewLoading" class="render__loading">
                  Loading preview…
                </div>
                <iframe
                  v-else
                  :srcdoc="preview.html"
                  sandbox=""
                  class="render__iframe"
                  title="Template preview"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- toasts -->
    <div class="toasts">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :style="{ borderLeftColor: TOAST_META[t.variant].color }"
      >
        <i
          class="ph toast__icon"
          :class="TOAST_META[t.variant].icon"
          :style="{ color: TOAST_META[t.variant].color }"
        />
        <div class="toast__body">
          <span class="toast__title">{{ t.title }}</span>
          <span v-if="t.desc" class="toast__desc">{{ t.desc }}</span>
        </div>
        <button
          type="button"
          class="toast__x"
          aria-label="Dismiss"
          @click="dismissToast(t.id)"
        >
          <i class="ph ph-x" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: contents;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
}
.wrap {
  max-width: 1400px;
  margin: 0 auto;
}

/* page header */
.phead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}
.phead__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--gray-800);
}
.phead__sub {
  margin: 5px 0 0;
  font-size: 13px;
  color: var(--gray-500);
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  background: var(--primary-600);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(9, 47, 41, 0.25);
  transition: background-color 100ms ease;
}
.btn-primary:hover {
  background: var(--primary-800);
}
.btn-primary .ph {
  font-size: 16px;
}
.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 15px;
  background: #fff;
  color: var(--gray-700);
  border: 1px solid var(--gray-200);
  border-radius: 6px;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn-secondary:hover {
  background: var(--gray-50);
  border-color: #c9c4bd;
}
.btn-secondary .ph {
  font-size: 15px;
  color: var(--gray-500);
}
.btn-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--danger-600);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-family: var(--font-body);
  font-weight: 500;
  cursor: pointer;
}
.btn-danger:hover {
  background: #a31f24;
}
.btn-sm {
  height: 30px;
  padding: 0 12px;
  font-size: 12.5px;
}

/* toolbar */
.toolbar {
  margin-top: 24px;
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.toolbar__left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.toolbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tsearch {
  position: relative;
  width: 248px;
  max-width: 100%;
}
.tsearch__icon {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 16px;
  color: #a09990;
  pointer-events: none;
}
.tsearch__input {
  width: 100%;
  height: 36px;
  padding: 0 30px 0 34px;
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 6px;
  font-size: 14px;
  color: var(--gray-800);
  outline: none;
}
.tsearch__input:focus {
  border-color: var(--primary-600);
  outline: 2px solid var(--primary-100);
}
.tsearch__clear {
  position: absolute;
  right: 7px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 5px;
  color: var(--gray-500);
  cursor: pointer;
  font-size: 13px;
}
.tsearch__clear:hover {
  background: var(--gray-100);
}
.pills {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.pill {
  height: 34px;
  padding: 0 15px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  background: #fff;
  color: var(--gray-700);
  border: 1px solid var(--gray-200);
  cursor: pointer;
  transition: background-color 100ms ease, border-color 100ms ease;
}
.pill:hover {
  background: var(--gray-50);
  border-color: #c9c4bd;
}
.pill--active,
.pill--active:hover {
  background: var(--primary-600);
  color: #fff;
  border-color: var(--primary-600);
}
.sortwrap {
  position: relative;
}
.sortbtn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 6px;
  color: var(--gray-700);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.sortbtn:hover {
  background: var(--gray-50);
  border-color: #c9c4bd;
}
.sortbtn .ph {
  font-size: 15px;
  color: var(--gray-500);
}
.sortbtn__pre {
  color: var(--gray-500);
  font-weight: 400;
}
.sortbtn__caret {
  font-size: 12px !important;
}
.seg {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--gray-100);
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  padding: 3px;
}
.seg__btn {
  width: 32px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--gray-500);
  cursor: pointer;
}
.seg__btn .ph {
  font-size: 18px;
}
.seg__btn--on {
  background: #fff;
  color: var(--primary-600);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* dropdown menus */
.menu {
  position: absolute;
  z-index: 50;
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 5px;
}
.sortmenu {
  top: 42px;
  right: 0;
  min-width: 172px;
}
.cardmenu {
  top: 32px;
  right: 0;
  min-width: 196px;
}
.menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 8px 9px;
  font-size: 13px;
  color: var(--gray-700);
  cursor: pointer;
}
.menu__item:hover {
  background: var(--gray-100);
}
.menu__item .ph {
  font-size: 16px;
  color: var(--gray-500);
}
.menu__item--danger {
  color: var(--danger-600);
}
.menu__item--danger .ph {
  color: var(--danger-600);
}
.menu__item--danger:hover {
  background: #fde8e8;
}
.menu__check {
  margin-left: auto;
  font-size: 14px !important;
  color: var(--primary-600) !important;
}
.menu__sep {
  height: 1px;
  background: var(--gray-100);
  margin: 5px 6px;
}

/* content */
.content {
  margin-top: 24px;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}
.card {
  position: relative;
  flex: 1 1 244px;
  max-width: 372px;
  min-width: 0;
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07), 0 1px 2px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transition: border-color 100ms ease, box-shadow 150ms ease;
}
.card--hover {
  border-color: var(--primary-600);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.09), 0 1px 3px rgba(0, 0, 0, 0.06);
}

/* thumbnail */
.thumb {
  position: relative;
  width: 100%;
  height: 300px;
  border-bottom: 1px solid var(--gray-200);
  overflow: hidden;
  border-radius: 9px 9px 0 0;
}
.thumb__overlay {
  position: absolute;
  inset: 0;
  background: rgba(24, 21, 15, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: opacity 150ms ease;
}
.ov-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.ov-btn .ph {
  font-size: 15px;
}
.ov-btn--ghost {
  background: transparent;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.6);
}
.ov-btn--ghost:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: #fff;
}
.ov-btn--solid {
  background: #fff;
  color: var(--primary-800);
  border: 1px solid #fff;
}
.ov-btn--solid:hover {
  background: #edf7f5;
}

/* card body */
.card__body {
  padding: 13px 14px 15px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.card__name {
  flex: 1;
  min-width: 0;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--gray-800);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rename {
  flex: 1;
  min-width: 0;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 500;
  color: var(--gray-800);
  border: 1px solid var(--primary-600);
  border-radius: 6px;
  padding: 3px 7px;
  outline: none;
}
.menuwrap {
  position: relative;
  flex-shrink: 0;
}
.iconbtn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--gray-500);
  cursor: pointer;
}
.iconbtn:hover {
  background: var(--gray-100);
  color: var(--gray-800);
}
.iconbtn .ph {
  font-size: 18px;
}
.card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 9999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.4px;
}
.cat__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.card__edited {
  font-size: 12.5px;
  color: var(--gray-500);
}
.card__subject {
  font-size: 12.5px;
  color: var(--gray-500);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* inline delete */
.delbox {
  background: #fffafa;
  border: 1px solid #fde8e8;
  border-radius: 8px;
  padding: 11px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.delbox__title {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-800);
}
.delbox__sub {
  font-size: 12px;
  color: var(--gray-500);
  line-height: 1.5;
}
.delbox__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* list view */
.listpanel {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.lhead,
.lrow {
  display: grid;
  grid-template-columns: 56px 1fr 168px 150px 92px;
  align-items: center;
}
.lhead {
  height: 40px;
  padding: 0 16px;
  background: var(--gray-50);
  border-bottom: 1px solid var(--gray-200);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--gray-500);
  border-radius: 10px 10px 0 0;
}
.lhead__actions {
  text-align: right;
}
.lrow {
  min-height: 56px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--gray-100);
  transition: background-color 80ms ease;
}
.lrow--hover {
  background: var(--gray-50);
}
.lthumb {
  position: relative;
  width: 38px;
  height: 50px;
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid var(--gray-200);
}
.lname-cell {
  min-width: 0;
  padding-right: 14px;
}
.lname {
  display: block;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-800);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lmuted {
  font-size: 13px;
  color: var(--gray-500);
}
.lactions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  transition: opacity 120ms ease;
}
.lrow-del {
  grid-column: 1 / -1;
  margin-top: 8px;
  background: #fffafa;
  border: 1px solid #fde8e8;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-800);
}
.lrow-del__sub {
  font-family: var(--font-body);
  font-weight: 400;
  color: var(--gray-500);
}

/* empty */
.empty {
  max-width: 440px;
  margin: 64px auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty__icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: var(--gray-100);
  border: 1px solid var(--gray-200);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}
.empty__icon .ph {
  font-size: 28px;
  color: #c9c4bd;
}
.empty__title {
  margin: 0 0 12px;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 500;
  color: var(--gray-800);
}
.empty__sub {
  margin: 0 0 24px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--gray-500);
}

/* backdrop */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

/* preview modal */
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(24, 21, 15, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3vh 3vw;
}
.modal__panel {
  width: 100%;
  max-width: 1240px;
  height: 94vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal__head {
  height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px 0 16px;
  border-bottom: 1px solid var(--gray-200);
}
.modal__back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px 0 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--gray-600);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.modal__back:hover {
  background: var(--gray-100);
  color: var(--gray-800);
}
.modal__back .ph {
  font-size: 17px;
}
.modal__name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 500;
  color: var(--gray-800);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 50%;
}
.modal__body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.meta {
  width: 312px;
  flex-shrink: 0;
  border-right: 1px solid var(--gray-200);
  overflow-y: auto;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.meta__group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.meta__label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #a09990;
}
.meta__name {
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 4px 8px;
  margin: 0 -8px;
  font-family: var(--font-display);
  font-size: 21px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--gray-800);
  cursor: pointer;
}
.meta__name:hover {
  background: var(--gray-50);
  border-color: var(--gray-200);
}
.meta__nameinput {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 500;
  color: var(--gray-800);
  border: 1px solid var(--primary-600);
  border-radius: 6px;
  padding: 4px 8px;
  outline: none;
}
.catopts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.catopt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: #fff;
  color: var(--gray-500);
  border: 1px solid var(--gray-200);
  cursor: pointer;
}
.catopt:hover {
  background: var(--gray-50);
  border-color: #c9c4bd;
}
.meta__val {
  font-size: 13.5px;
  color: var(--gray-600);
}
.meta__actions {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.meta__primary {
  width: 100%;
  height: 38px;
}
.meta__actions .btn-secondary {
  justify-content: center;
}
.meta__danger {
  margin-top: auto;
  border-top: 1px solid var(--gray-100);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.meta__delete {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 13px;
  background: #fff;
  color: var(--danger-600);
  border: 1px solid #fde8e8;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  align-self: flex-start;
}
.meta__delete:hover {
  background: #fde8e8;
  border-color: var(--danger-600);
}
.meta__delete .ph {
  font-size: 15px;
}

/* email render */
.render {
  flex: 1;
  min-width: 0;
  background: var(--gray-100);
  overflow-y: auto;
  padding: 28px;
}
.render__frame {
  max-width: 640px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.render__bar {
  padding: 14px 18px;
  border-bottom: 1px solid var(--gray-100);
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.render__sublabel {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #a09990;
  width: 54px;
  flex-shrink: 0;
  padding-top: 2px;
}
.render__subject {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-800);
}
.render__viewport {
  flex: 1;
  min-height: 480px;
  display: flex;
}
.render__iframe {
  width: 100%;
  border: none;
  background: #fff;
}
.render__loading {
  margin: auto;
  font-size: 13px;
  color: var(--gray-500);
}

/* toasts */
.toasts {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 360px;
  max-width: calc(100vw - 40px);
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  background: #fff;
  border-radius: 10px;
  border-left: 3px solid var(--gray-500);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 12px 14px;
  display: flex;
  align-items: flex-start;
  gap: 11px;
}
.toast__icon {
  font-size: 19px;
  flex-shrink: 0;
  margin-top: 1px;
}
.toast__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.toast__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-800);
}
.toast__desc {
  font-size: 12.5px;
  color: var(--gray-500);
  line-height: 1.45;
}
.toast__x {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: #a09990;
  flex-shrink: 0;
  cursor: pointer;
  font-size: 13px;
}
.toast__x:hover {
  background: var(--gray-100);
  color: var(--gray-600);
}
</style>
