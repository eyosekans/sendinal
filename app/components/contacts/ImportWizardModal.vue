<script setup lang="ts">
import Papa from 'papaparse'
import StepBar from './StepBar.vue'
import type { List, AttributeField } from '~/types/list'
import type { DuplicateStrategy } from '#shared/schemas'
import { EMAIL_RE } from '#shared/schemas'

const props = defineProps<{
  open: boolean
  lists: List[]
  defaultListId: string | null
}>()
const emit = defineEmits<{
  close: []
  imported: []
  viewContacts: []
}>()

type Row = Record<string, string>
/** Per-column mapping target. */
type Target = 'ignore' | 'email' | 'firstName' | 'lastName' | string // attr:<key> | custom

/* ---------- wizard state ---------- */
const step = ref(1)

const fileName = ref('')
const fileSize = ref(0)
const columns = ref<string[]>([])
const rows = ref<Row[]>([])
const parseError = ref('')
const dragOver = ref(false)

const mapping = ref<Record<string, Target>>({})
const autoMapping = ref<Record<string, Target>>({})
const customKey = ref<Record<string, string>>({})

const targetListId = ref<string | null>(null)
const duplicateStrategy = ref<DuplicateStrategy>('update')
const invalidStrategy = ref<'skip' | 'flag'>('skip')

const existingEmails = ref<Set<string>>(new Set())
const reviewLoading = ref(false)
const reviewFilter = ref<'all' | 'new' | 'update' | 'warning' | 'error'>('all')

const importing = ref(false)
const processed = ref(0)
const importTotal = ref(0)
const importError = ref('')
const result = ref({ imported: 0, updated: 0, skipped: 0, failed: 0 })

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

function reset() {
  step.value = 1
  fileName.value = ''
  fileSize.value = 0
  columns.value = []
  rows.value = []
  mapping.value = {}
  autoMapping.value = {}
  customKey.value = {}
  targetListId.value = props.defaultListId
  duplicateStrategy.value = 'update'
  invalidStrategy.value = 'skip'
  existingEmails.value = new Set()
  reviewFilter.value = 'all'
  importing.value = false
  processed.value = 0
  importTotal.value = 0
  importError.value = ''
  parseError.value = ''
  dragOver.value = false
}

/* ---------- attribute fields (union across all lists) ---------- */
const attrFields = computed<AttributeField[]>(() => {
  const m = new Map<string, AttributeField>()
  for (const l of props.lists) {
    for (const f of l.attribute_schema ?? []) if (!m.has(f.key)) m.set(f.key, f)
  }
  return [...m.values()]
})
const attrType = computed<Record<string, AttributeField['type']>>(() =>
  Object.fromEntries(attrFields.value.map((f) => [f.key, f.type])),
)

/* ---------- step 1: file parse ---------- */
function guessMapping(col: string): Target {
  const c = col.trim().toLowerCase()
  if (/^e-?mail$/.test(c) || c.includes('email')) return 'email'
  if (/(first.?name|^first$|fname|given)/.test(c)) return 'firstName'
  if (/(last.?name|^last$|lname|surname|family)/.test(c)) return 'lastName'
  const match = attrFields.value.find(
    (f) => f.key.toLowerCase() === c || f.label.toLowerCase() === c,
  )
  if (match) return `attr:${match.key}`
  return 'ignore'
}

function onFile(file: File | undefined) {
  if (!file) return
  parseError.value = ''
  fileName.value = file.name
  fileSize.value = file.size
  Papa.parse<Row>(file, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    complete: (res) => {
      const cols = (res.meta.fields ?? []).filter(Boolean)
      if (cols.length === 0) {
        parseError.value = 'No columns found — make sure the CSV has a header row.'
        return
      }
      columns.value = cols
      rows.value = res.data as Row[]
      const auto: Record<string, Target> = {}
      let emailTaken = false
      for (const c of cols) {
        let g = guessMapping(c)
        if (g === 'email') {
          if (emailTaken) g = 'ignore'
          else emailTaken = true
        }
        auto[c] = g
      }
      autoMapping.value = { ...auto }
      mapping.value = { ...auto }
    },
    error: (err) => {
      parseError.value = err.message || 'Could not parse the CSV file.'
    },
  })
}
function onInputChange(e: Event) {
  onFile((e.target as HTMLInputElement).files?.[0])
}
function onDrop(e: DragEvent) {
  dragOver.value = false
  onFile(e.dataTransfer?.files?.[0])
}
function clearFile() {
  fileName.value = ''
  fileSize.value = 0
  columns.value = []
  rows.value = []
  mapping.value = {}
  autoMapping.value = {}
}

const hasFile = computed(() => columns.value.length > 0)
const previewRows = computed(() => rows.value.slice(0, 3))
function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/* ---------- step 2: mapping ---------- */
const SINGLE_USE = (t: Target) =>
  t === 'email' || t === 'firstName' || t === 'lastName' || t.startsWith('attr:')

function fieldOptions(col: string) {
  const current = mapping.value[col]
  const usedByOthers = new Set(
    columns.value
      .filter((c) => c !== col)
      .map((c) => mapping.value[c])
      .filter((t): t is Target => !!t && SINGLE_USE(t)),
  )
  const opts: { value: Target; label: string }[] = []
  const add = (value: Target, label: string) => {
    if (!usedByOthers.has(value) || current === value) opts.push({ value, label })
  }
  add('email', 'Email (required)')
  add('firstName', 'First Name')
  add('lastName', 'Last Name')
  for (const f of attrFields.value) add(`attr:${f.key}`, f.label)
  opts.push({ value: 'custom', label: 'Custom attribute…' })
  opts.push({ value: 'ignore', label: "Don't import" })
  return opts
}

function colSample(col: string) {
  return rows.value[0]?.[col] || '—'
}
function colStatus(col: string): 'auto' | 'mapped' | 'skipped' {
  const m = mapping.value[col]
  if (m === 'ignore') return 'skipped'
  if (autoMapping.value[col] === m) return 'auto'
  return 'mapped'
}

const emailColumn = computed(
  () => columns.value.find((c) => mapping.value[c] === 'email') ?? null,
)
const emailMapped = computed(() => !!emailColumn.value)
const mappedCount = computed(
  () => columns.value.filter((c) => mapping.value[c] !== 'ignore').length,
)
const autoMatchedCount = computed(
  () => Object.values(autoMapping.value).filter((t) => t !== 'ignore').length,
)

/* ---------- row → contact + categorisation ---------- */
type Category = 'new' | 'update' | 'warning' | 'error' | 'skipped'
type Entry = {
  index: number
  email: string
  name: string
  firstName?: string
  lastName?: string
  attributes: Record<string, unknown>
  emailUnverified: boolean
  importable: boolean
  category: Category
  issue: string
}

function coerce(raw: string, type: AttributeField['type'] | undefined): unknown {
  if (type === 'number') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : raw
  }
  if (type === 'boolean') return /^(true|yes|y|1)$/i.test(raw)
  return raw
}

const entries = computed<Entry[]>(() => {
  const out: Entry[] = []
  const emailCol = emailColumn.value
  rows.value.forEach((r, i) => {
    const email = emailCol ? (r[emailCol] ?? '').trim().toLowerCase() : ''
    let first: string | undefined
    let last: string | undefined
    const attributes: Record<string, unknown> = {}
    for (const col of columns.value) {
      const t = mapping.value[col]
      const raw = (r[col] ?? '').trim()
      if (!raw || t === 'ignore' || t === 'email') continue
      if (t === 'firstName') first = raw
      else if (t === 'lastName') last = raw
      else if (typeof t === 'string' && t.startsWith('attr:')) {
        const key = t.slice(5)
        attributes[key] = coerce(raw, attrType.value[key])
      } else if (t === 'custom') {
        const key = (customKey.value[col] ?? '').trim()
        if (key) attributes[key] = raw
      }
    }
    const name = [first, last].filter(Boolean).join(' ').trim()

    let category: Category
    let issue = ''
    let importable = true
    let emailUnverified = false
    const valid = EMAIL_RE.test(email)
    if (!email) {
      category = 'error'
      issue = 'Missing email address'
      importable = false
    } else if (!valid) {
      if (invalidStrategy.value === 'flag') {
        category = 'warning'
        issue = 'Invalid email — flagged'
        emailUnverified = true
      } else {
        category = 'error'
        issue = 'Invalid email format'
        importable = false
      }
    } else {
      const exists = existingEmails.value.has(email)
      if (exists && duplicateStrategy.value === 'skip') {
        category = 'skipped'
        issue = 'Duplicate — skipped'
        importable = false
      } else if (exists) {
        category = 'update'
        issue = 'Existing contact'
      } else {
        category = 'new'
        issue = ''
      }
    }

    out.push({
      index: i + 1,
      email,
      name,
      firstName: first,
      lastName: last,
      attributes,
      emailUnverified,
      importable,
      category,
      issue,
    })
  })
  return out
})

const counts = computed(() => {
  const c = { new: 0, update: 0, warning: 0, error: 0, skipped: 0 }
  for (const e of entries.value) c[e.category]++
  return c
})
const sendable = computed(() => entries.value.filter((e) => e.importable))
const reviewTotal = computed(
  () => counts.value.new + counts.value.update + counts.value.warning + counts.value.error,
)
const allClean = computed(
  () => counts.value.error === 0 && counts.value.warning === 0,
)

const filteredEntries = computed(() => {
  const f = reviewFilter.value
  const list =
    f === 'all'
      ? entries.value.filter((e) => e.category !== 'skipped')
      : entries.value.filter((e) => e.category === f)
  return list.slice(0, 100)
})

/* ---------- navigation ---------- */
function back() {
  if (step.value > 1) step.value--
}
function toMap() {
  step.value = 2
}
function toConfigure() {
  step.value = 3
}
async function toReview() {
  reviewLoading.value = true
  try {
    const emails = [
      ...new Set(
        entries.value
          .map((e) => e.email)
          .filter((e) => e.length > 0),
      ),
    ]
    if (emails.length) {
      const r = await $fetch<{ existing: string[] }>(
        '/api/contacts/import-check',
        { method: 'POST', body: { emails } },
      )
      existingEmails.value = new Set(r.existing)
    } else {
      existingEmails.value = new Set()
    }
    reviewFilter.value = 'all'
    step.value = 4
  } catch (e: unknown) {
    parseError.value =
      (e as { statusMessage?: string })?.statusMessage || 'Could not check existing contacts.'
  } finally {
    reviewLoading.value = false
  }
}

/* ---------- step 5: chunked import ---------- */
const CHUNK = 200
async function runImport() {
  importError.value = ''
  const toSend = sendable.value
  if (toSend.length === 0) {
    importError.value = 'There are no valid rows to import.'
    return
  }
  step.value = 5
  importing.value = true
  processed.value = 0
  importTotal.value = toSend.length
  const acc = { imported: 0, updated: 0, failed: 0 }
  try {
    for (let i = 0; i < toSend.length; i += CHUNK) {
      const batch = toSend.slice(i, i + CHUNK).map((e) => ({
        email: e.email,
        ...(e.firstName ? { firstName: e.firstName } : {}),
        ...(e.lastName ? { lastName: e.lastName } : {}),
        attributes: e.attributes,
        emailUnverified: e.emailUnverified,
      }))
      const r = await $fetch<{
        imported: number
        updated: number
        skipped: number
        failed: number
      }>('/api/contacts/import', {
        method: 'POST',
        body: {
          ...(targetListId.value ? { listId: targetListId.value } : {}),
          duplicateStrategy: duplicateStrategy.value,
          contacts: batch,
        },
      })
      acc.imported += r.imported
      acc.updated += r.updated
      acc.failed += r.failed
      processed.value = Math.min(toSend.length, i + CHUNK)
    }
    result.value = {
      imported: acc.imported,
      updated: acc.updated,
      skipped: counts.value.skipped,
      failed: acc.failed + counts.value.error,
    }
    emit('imported')
    step.value = 6
  } catch (e: unknown) {
    importError.value =
      (e as { data?: { statusMessage?: string }; statusMessage?: string })?.data
        ?.statusMessage ||
      (e as { statusMessage?: string })?.statusMessage ||
      'Import failed. Please try again.'
  } finally {
    importing.value = false
  }
}

const progressPct = computed(() =>
  importTotal.value ? Math.round((processed.value / importTotal.value) * 100) : 0,
)
const ARC = 2 * Math.PI * 52
const dashOffset = computed(() => ARC * (1 - progressPct.value / 100))

const targetListName = computed(
  () => props.lists.find((l) => l.id === targetListId.value)?.name ?? null,
)

const headerTitle = computed(() =>
  step.value === 5 ? 'Importing contacts' : 'Import contacts',
)

function close() {
  emit('close')
}
function importAnother() {
  reset()
}
function viewContacts() {
  emit('viewContacts')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop is intentionally NOT click-to-dismiss. -->
    <div v-if="open" class="overlay">
      <div class="modal">
        <!-- header -->
        <div class="hd">
          <h3 class="hd__title">{{ headerTitle }}</h3>
          <button type="button" class="x" aria-label="Close" @click="close">
            <i class="ph ph-x" />
          </button>
        </div>

        <!-- step bar -->
        <div class="bar">
          <StepBar :active="step" />
        </div>

        <!-- body -->
        <div class="body">
          <!-- ============ STEP 1 — UPLOAD ============ -->
          <template v-if="step === 1">
            <div
              v-if="!hasFile"
              class="dropzone"
              :class="{ 'dropzone--over': dragOver }"
              @dragover.prevent="dragOver = true"
              @dragleave.prevent="dragOver = false"
              @drop.prevent="onDrop"
            >
              <i class="ph ph-cloud-arrow-up dz__icon" />
              <div class="dz__title">Drag and drop your CSV here</div>
              <div class="dz__sub">
                or
                <label class="dz__browse">
                  browse your files
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    class="dz__input"
                    @change="onInputChange"
                  />
                </label>
              </div>
              <div class="dz__hint">
                CSV up to 10 MB · first row must be column headers
              </div>
              <p v-if="parseError" class="error">{{ parseError }}</p>
            </div>

            <template v-else>
              <div class="filecard">
                <div class="filecard__icon"><i class="ph ph-file-csv" /></div>
                <div class="filecard__meta">
                  <div class="filecard__name">{{ fileName }}</div>
                  <div class="filecard__sub">
                    {{ rows.length }} rows · {{ columns.length }} columns ·
                    {{ fmtSize(fileSize) }}
                  </div>
                </div>
                <span class="chip chip--ok">
                  <i class="ph ph-check" /> Valid
                </span>
                <button
                  type="button"
                  class="filecard__x"
                  aria-label="Remove file"
                  @click="clearFile"
                >
                  <i class="ph ph-x" />
                </button>
              </div>

              <div class="sub-label">Preview · first 3 rows</div>
              <div class="preview">
                <div class="preview__scroll">
                  <table class="ptable">
                    <thead>
                      <tr>
                        <th v-for="c in columns" :key="c">{{ c }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(r, i) in previewRows" :key="i">
                        <td v-for="c in columns" :key="c">{{ r[c] }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div class="muted-line">
                Showing {{ previewRows.length }} of {{ rows.length }} rows ·
                scroll to see all {{ columns.length }} columns
              </div>
            </template>
          </template>

          <!-- ============ STEP 2 — MAP COLUMNS ============ -->
          <template v-else-if="step === 2">
            <div class="map-head">
              <div>
                <div class="map-head__title">Map your columns</div>
                <div class="map-head__sub">
                  We auto-matched {{ autoMatchedCount }} of {{ columns.length }}
                  columns. Review each pairing before continuing.
                </div>
              </div>
              <span class="chip chip--soft">
                <i class="ph ph-sparkle" /> {{ autoMatchedCount }} auto-matched
              </span>
            </div>

            <div v-if="!emailMapped" class="banner banner--danger">
              <i class="ph ph-warning" />
              <span>
                <strong>Map the Email field to continue.</strong> Every contact
                needs an email address.
              </span>
            </div>

            <div class="maptable">
              <div class="maprow maprow--head">
                <div>CSV column &amp; sample</div>
                <div></div>
                <div>Field</div>
                <div class="ta-right">Status</div>
              </div>
              <div
                v-for="col in columns"
                :key="col"
                class="maprow"
                :class="{ 'maprow--skip': mapping[col] === 'ignore' }"
              >
                <div class="mapcol">
                  <div class="mapcol__name">{{ col }}</div>
                  <div class="mapcol__sample">{{ colSample(col) }}</div>
                </div>
                <div class="maparrow"><i class="ph ph-arrow-right" /></div>
                <div class="mapfield">
                  <select
                    v-model="mapping[col]"
                    class="select"
                    :class="{ 'select--err': mapping[col] === 'email' && false }"
                  >
                    <option
                      v-for="o in fieldOptions(col)"
                      :key="o.value"
                      :value="o.value"
                    >
                      {{ o.label }}
                    </option>
                  </select>
                  <input
                    v-if="mapping[col] === 'custom'"
                    v-model="customKey[col]"
                    type="text"
                    class="select select--mono mapfield__key"
                    placeholder="attribute_key"
                  />
                </div>
                <div class="mapstat">
                  <span v-if="colStatus(col) === 'auto'" class="stat stat--auto">
                    <i class="ph ph-sparkle" /> Auto
                  </span>
                  <span
                    v-else-if="colStatus(col) === 'mapped'"
                    class="stat stat--mapped"
                  >
                    <i class="ph ph-check" /> Mapped
                  </span>
                  <span v-else class="stat stat--skip">Skipped</span>
                </div>
              </div>
            </div>
            <div class="hint-line">
              <i class="ph ph-info" />
              Each field maps once — fields already in use are hidden from other
              menus.
            </div>
          </template>

          <!-- ============ STEP 3 — CONFIGURE ============ -->
          <template v-else-if="step === 3">
            <div class="cfg">
              <div class="cfg__label">Add contacts to list</div>
              <select v-model="targetListId" class="select select--lg">
                <option :value="null">No list (contacts only)</option>
                <option v-for="l in lists" :key="l.id" :value="l.id">
                  {{ l.name }} · {{ l.contactCount }} contacts
                </option>
              </select>
              <div class="cfg__hint">
                Imported contacts are added to this list.
              </div>
            </div>

            <div class="cfg">
              <div class="cfg__label">If a contact already exists</div>
              <label
                class="radio"
                :class="{ 'radio--on': duplicateStrategy === 'update' }"
              >
                <input
                  v-model="duplicateStrategy"
                  type="radio"
                  value="update"
                  class="radio__input"
                />
                <span class="radio__dot" />
                <span>
                  <span class="radio__title">Update existing contacts</span>
                  <span class="radio__desc">
                    Overwrite existing fields with values from this file.
                  </span>
                </span>
              </label>
              <label
                class="radio"
                :class="{ 'radio--on': duplicateStrategy === 'skip' }"
              >
                <input
                  v-model="duplicateStrategy"
                  type="radio"
                  value="skip"
                  class="radio__input"
                />
                <span class="radio__dot" />
                <span>
                  <span class="radio__title">Skip duplicates</span>
                  <span class="radio__desc">
                    Keep the existing contact unchanged. Matching rows are
                    ignored.
                  </span>
                </span>
              </label>
            </div>

            <div class="cfg">
              <div class="cfg__label">If an email address is invalid</div>
              <label
                class="radio"
                :class="{ 'radio--on': invalidStrategy === 'skip' }"
              >
                <input
                  v-model="invalidStrategy"
                  type="radio"
                  value="skip"
                  class="radio__input"
                />
                <span class="radio__dot" />
                <span>
                  <span class="radio__title">Skip invalid rows</span>
                  <span class="radio__desc">
                    Rows with malformed email addresses won't be imported.
                  </span>
                </span>
              </label>
              <label
                class="radio"
                :class="{ 'radio--on': invalidStrategy === 'flag' }"
              >
                <input
                  v-model="invalidStrategy"
                  type="radio"
                  value="flag"
                  class="radio__input"
                />
                <span class="radio__dot" />
                <span>
                  <span class="radio__title">Import anyway and flag</span>
                  <span class="radio__desc">
                    Add them but mark as unverified (excluded from sending) to
                    review later.
                  </span>
                </span>
              </label>
            </div>
          </template>

          <!-- ============ STEP 4 — REVIEW ============ -->
          <template v-else-if="step === 4">
            <div class="cards">
              <div class="card card--import">
                <div class="card__num">{{ counts.new }}</div>
                <div class="card__lbl">Will import</div>
              </div>
              <div class="card card--update">
                <div class="card__num">{{ counts.update }}</div>
                <div class="card__lbl">Will update</div>
              </div>
              <div
                class="card"
                :class="counts.warning ? 'card--warn' : 'card--mute'"
              >
                <div class="card__num">{{ counts.warning }}</div>
                <div class="card__lbl">Warnings</div>
              </div>
              <div
                class="card"
                :class="counts.error ? 'card--err' : 'card--mute'"
              >
                <div class="card__num">{{ counts.error }}</div>
                <div class="card__lbl">Errors</div>
              </div>
            </div>

            <div v-if="allClean" class="banner banner--ok">
              <i class="ph ph-check-circle" />
              <span>
                <strong>Everything looks good</strong> —
                {{ counts.new + counts.update }} contacts ready to import.
              </span>
            </div>

            <div class="rtabs">
              <button
                v-for="t in [
                  { k: 'all', label: `All ${reviewTotal}` },
                  { k: 'new', label: `New ${counts.new}` },
                  { k: 'update', label: `Updates ${counts.update}` },
                  { k: 'warning', label: `Warnings ${counts.warning}` },
                  { k: 'error', label: `Errors ${counts.error}` },
                ]"
                :key="t.k"
                type="button"
                class="rtab"
                :class="{ 'rtab--on': reviewFilter === t.k }"
                @click="reviewFilter = t.k as typeof reviewFilter"
              >
                {{ t.label }}
              </button>
            </div>

            <div class="rtable">
              <div class="rrow rrow--head">
                <div>Status</div>
                <div>Contact</div>
                <div>Issue</div>
              </div>
              <div
                v-for="e in filteredEntries"
                :key="e.index"
                class="rrow"
                :class="{
                  'rrow--err': e.category === 'error',
                  'rrow--warn': e.category === 'warning',
                }"
              >
                <div>
                  <span class="rbadge" :class="`rbadge--${e.category}`">
                    <span class="rbadge__dot" />
                    {{
                      e.category === 'new'
                        ? 'New'
                        : e.category === 'update'
                          ? 'Update'
                          : e.category === 'warning'
                            ? 'Warning'
                            : 'Error'
                    }}
                  </span>
                </div>
                <div class="rcontact">
                  <span v-if="e.email" class="rcontact__email">{{
                    e.email
                  }}</span>
                  <span v-else class="rcontact__row"
                    >Row {{ e.index }} · {{ e.name || '—' }}</span
                  >
                </div>
                <div class="rissue">{{ e.issue || '—' }}</div>
              </div>
              <div v-if="filteredEntries.length === 0" class="rempty">
                No rows in this view.
              </div>
            </div>
            <div class="muted-line">
              <template v-if="counts.skipped">
                {{ counts.skipped }} duplicate(s) will be skipped.
              </template>
              <template v-if="entries.length > 100">
                Showing the first 100 of {{ reviewTotal }} rows.
              </template>
            </div>
          </template>

          <!-- ============ STEP 5 — IMPORTING ============ -->
          <template v-else-if="step === 5">
            <div class="importing">
              <div class="ring">
                <svg width="140" height="140" viewBox="0 0 140 140">
                  <circle
                    cx="70"
                    cy="70"
                    r="52"
                    fill="none"
                    stroke="var(--gray-100)"
                    stroke-width="10"
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r="52"
                    fill="none"
                    stroke="var(--primary-600)"
                    stroke-width="10"
                    stroke-linecap="round"
                    :stroke-dasharray="ARC"
                    :stroke-dashoffset="dashOffset"
                    transform="rotate(-90 70 70)"
                    style="transition: stroke-dashoffset 300ms ease"
                  />
                </svg>
                <div class="ring__pct">{{ progressPct }}%</div>
              </div>
              <div class="importing__title">
                Importing {{ processed }} of {{ importTotal }}
              </div>
              <div class="importing__status">
                <span class="pulse" />
                <span>Writing contacts…</span>
              </div>
              <p v-if="importError" class="error">{{ importError }}</p>
              <div v-else class="importing__note">
                This usually takes under a minute.
              </div>
            </div>
            <div class="safe">
              <i class="ph ph-info" />
              <span
                >You can close this window — the import keeps running.</span
              >
            </div>
          </template>

          <!-- ============ STEP 6 — RESULTS ============ -->
          <template v-else-if="step === 6">
            <div class="results">
              <div
                class="results__icon"
                :class="result.failed ? 'results__icon--warn' : 'results__icon--ok'"
              >
                <i
                  :class="
                    result.failed ? 'ph ph-warning' : 'ph ph-check-circle'
                  "
                />
              </div>
              <div class="results__title">
                {{ result.failed ? 'Import finished with some issues' : 'Import complete' }}
              </div>
              <div class="results__sub">
                {{ result.imported + result.updated }} of
                {{ result.imported + result.updated + result.skipped + result.failed }}
                contacts were processed.
              </div>

              <div class="cards cards--results">
                <div class="card card--mute">
                  <div class="card__num card__num--ok">{{ result.imported }}</div>
                  <div class="card__lbl">Imported</div>
                </div>
                <div class="card card--mute">
                  <div class="card__num card__num--info">
                    {{ result.updated }}
                  </div>
                  <div class="card__lbl">Updated</div>
                </div>
                <div class="card card--mute">
                  <div class="card__num">{{ result.skipped }}</div>
                  <div class="card__lbl">Skipped</div>
                </div>
                <div class="card card--mute">
                  <div class="card__num">{{ result.failed }}</div>
                  <div class="card__lbl">Failed</div>
                </div>
              </div>

              <div v-if="targetListName" class="results__list">
                <i class="ph ph-check" />
                Added to <strong>{{ targetListName }}</strong
                >.
              </div>
            </div>
          </template>
        </div>

        <!-- footer -->
        <div class="ft">
          <!-- step 1 -->
          <template v-if="step === 1">
            <div class="ft__side" />
            <div class="ft__step">Step 1 of 5</div>
            <div class="ft__side ft__side--end">
              <button
                type="button"
                class="btn btn--primary"
                :disabled="!hasFile"
                @click="toMap"
              >
                Continue
              </button>
            </div>
          </template>

          <!-- step 2 -->
          <template v-else-if="step === 2">
            <div class="ft__side">
              <button type="button" class="btn btn--ghost" @click="back">
                ← Back
              </button>
            </div>
            <div class="ft__step">Step 2 of 5</div>
            <div class="ft__side ft__side--end">
              <span v-if="!emailMapped" class="ft__warn">
                Map Email to continue
              </span>
              <span v-else class="ft__muted"
                >{{ mappedCount }} of {{ columns.length }} mapped</span
              >
              <button
                type="button"
                class="btn btn--primary"
                :disabled="!emailMapped"
                @click="toConfigure"
              >
                Continue
              </button>
            </div>
          </template>

          <!-- step 3 -->
          <template v-else-if="step === 3">
            <div class="ft__side">
              <button type="button" class="btn btn--ghost" @click="back">
                ← Back
              </button>
            </div>
            <div class="ft__step">Step 3 of 5</div>
            <div class="ft__side ft__side--end">
              <button
                type="button"
                class="btn btn--primary"
                :disabled="reviewLoading"
                @click="toReview"
              >
                <i v-if="reviewLoading" class="ph ph-circle-notch spin" />
                Review import
              </button>
            </div>
          </template>

          <!-- step 4 -->
          <template v-else-if="step === 4">
            <div class="ft__side">
              <button type="button" class="btn btn--ghost" @click="back">
                ← Back
              </button>
            </div>
            <div class="ft__step">Step 4 of 5</div>
            <div class="ft__side ft__side--end">
              <button
                type="button"
                class="btn btn--primary"
                :disabled="sendable.length === 0"
                @click="runImport"
              >
                Import {{ sendable.length }} contacts
              </button>
            </div>
          </template>

          <!-- step 5 -->
          <template v-else-if="step === 5">
            <div class="ft__side" />
            <div class="ft__step">Step 5 of 5</div>
            <div class="ft__side ft__side--end">
              <button type="button" class="btn btn--secondary" @click="close">
                Close &amp; run in background
              </button>
            </div>
          </template>

          <!-- step 6 -->
          <template v-else-if="step === 6">
            <div class="ft__side" />
            <div class="ft__step" />
            <div class="ft__side ft__side--end ft__results">
              <button type="button" class="btn btn--secondary" @click="importAnother">
                Import another file
              </button>
              <button type="button" class="btn btn--primary" @click="viewContacts">
                View contacts
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(24, 21, 15, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 24px;
  animation: dc-overlayin 120ms ease;
}
.modal {
  width: 720px;
  max-width: 100%;
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-elevated);
  overflow: hidden;
  animation: dc-modalin 180ms ease-out;
  font-family: var(--font-body);
}

/* header */
.hd {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--gray-100);
}
.hd__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 18px;
  color: var(--gray-800);
}
.x {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gray-500);
  cursor: pointer;
}
.x:hover {
  background: var(--gray-100);
  color: var(--gray-800);
}
.x .ph {
  font-size: 18px;
}

.bar {
  flex: none;
  padding: 22px 24px 6px;
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 24px 24px;
}

/* dropzone */
.dropzone {
  border: 1.5px dashed var(--gray-300);
  border-radius: var(--radius-lg);
  background: var(--gray-50);
  padding: 44px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
}
.dropzone--over {
  border-color: var(--primary-600);
  background: var(--primary-50);
}
.dz__icon {
  font-size: 42px;
  color: var(--primary-400);
  margin-bottom: 8px;
}
.dz__title {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 16px;
  color: var(--gray-800);
}
.dz__sub {
  font-size: 13.5px;
  color: var(--gray-500);
}
.dz__browse {
  color: var(--primary-600);
  font-weight: 500;
  cursor: pointer;
}
.dz__browse:hover {
  text-decoration: underline;
}
.dz__input {
  display: none;
}
.dz__hint {
  font-size: 12.5px;
  color: var(--gray-400);
  margin-top: 12px;
}

/* file card */
.filecard {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--primary-50);
  border: 1px solid var(--primary-200);
  border-radius: 8px;
}
.filecard__icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid var(--primary-100);
  border-radius: var(--radius-md);
  flex: none;
}
.filecard__icon .ph {
  font-size: 18px;
  color: var(--primary-600);
}
.filecard__meta {
  flex: 1;
  min-width: 0;
}
.filecard__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-800);
}
.filecard__sub {
  font-size: 13px;
  color: var(--primary-600);
  margin-top: 1px;
}
.filecard__x {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gray-400);
  cursor: pointer;
}
.filecard__x:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--gray-700);
}

/* chips */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.4px;
  padding: 4px 9px;
  border-radius: var(--radius-full);
  white-space: nowrap;
}
.chip--ok {
  background: var(--success-100);
  color: var(--success-600);
  text-transform: uppercase;
}
.chip--soft {
  background: var(--primary-50);
  color: var(--primary-600);
  letter-spacing: 0;
}
.chip .ph {
  font-size: 12px;
}

.sub-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--gray-500);
  margin: 20px 0 8px;
}
.muted-line {
  font-size: 13px;
  color: var(--gray-500);
  margin-top: 10px;
}

/* preview table */
.preview {
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  overflow: hidden;
}
.preview__scroll {
  overflow-x: auto;
}
.ptable {
  border-collapse: collapse;
  width: 100%;
  min-width: 760px;
  font-size: 12px;
}
.ptable th {
  text-align: left;
  font-weight: 500;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--gray-500);
  font-size: 10.5px;
  padding: 9px 12px;
  background: var(--gray-50);
  border-bottom: 1px solid var(--gray-200);
  white-space: nowrap;
}
.ptable td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--gray-100);
  color: var(--gray-700);
  white-space: nowrap;
}
.ptable tbody tr:last-child td {
  border-bottom: none;
}

/* map step */
.map-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}
.map-head > div:first-child {
  flex: 1;
}
.map-head__title {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 16px;
  color: var(--gray-800);
}
.map-head__sub {
  font-size: 13px;
  color: var(--gray-500);
  margin-top: 2px;
}

.banner {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 15px;
  border-radius: 8px;
  font-size: 13.5px;
  margin-bottom: 16px;
}
.banner .ph {
  font-size: 19px;
  flex: none;
}
.banner--danger {
  background: var(--danger-100);
  border: 1px solid #f5a3a3;
  color: #8f2025;
}
.banner--danger .ph {
  color: var(--danger-600);
}
.banner--ok {
  background: var(--success-100);
  border: 1px solid #7dd3aa;
  color: var(--primary-800);
}
.banner--ok .ph {
  color: var(--success-600);
}

.maptable {
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  overflow: hidden;
}
.maprow {
  display: grid;
  grid-template-columns: 1fr 32px 232px 96px;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--gray-100);
}
.maprow:last-child {
  border-bottom: none;
}
.maprow--head {
  background: var(--gray-50);
  border-bottom: 1px solid var(--gray-200);
  padding: 9px 16px;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--gray-500);
}
.maprow--skip {
  background: #fbfaf9;
}
.mapcol {
  min-width: 0;
}
.mapcol__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-800);
}
.mapcol__sample {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--gray-500);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.maparrow {
  display: flex;
  justify-content: center;
  color: var(--gray-300);
}
.maparrow .ph {
  font-size: 16px;
}
.mapfield {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mapstat {
  display: flex;
  justify-content: flex-end;
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.stat .ph {
  font-size: 12px;
}
.stat--auto {
  background: var(--primary-50);
  color: var(--primary-600);
  padding: 3px 9px;
  border-radius: var(--radius-full);
}
.stat--mapped {
  color: var(--success-600);
}
.stat--skip {
  color: var(--gray-400);
}
.hint-line {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--gray-500);
}
.hint-line .ph {
  font-size: 14px;
  color: var(--gray-400);
}

/* select */
.select {
  height: 36px;
  width: 100%;
  padding: 0 11px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: #fff;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--gray-800);
  outline: none;
  appearance: none;
  cursor: pointer;
}
.select:focus {
  border-color: var(--primary-600);
  outline: 2px solid var(--primary-100);
}
.select--err {
  border: 1.5px solid var(--danger-600);
}
.select--lg {
  height: 40px;
  font-size: 14px;
}
.select--mono {
  font-family: var(--font-mono);
  font-size: 12px;
  cursor: text;
}
.mapfield__key {
  cursor: text;
}

/* configure */
.cfg {
  margin-bottom: 24px;
}
.cfg:last-child {
  margin-bottom: 0;
}
.cfg__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-700);
  margin-bottom: 10px;
}
.cfg__hint {
  font-size: 13px;
  color: var(--gray-500);
  margin-top: 7px;
}
.radio {
  display: flex;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 10px;
}
.radio:last-child {
  margin-bottom: 0;
}
.radio--on {
  border: 1.5px solid var(--primary-600);
  background: var(--primary-50);
}
.radio__input {
  display: none;
}
.radio__dot {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  border: 1.5px solid var(--gray-300);
  margin-top: 1px;
  position: relative;
}
.radio--on .radio__dot {
  border-color: var(--primary-600);
}
.radio--on .radio__dot::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: var(--radius-full);
  background: var(--primary-600);
}
.radio__title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-800);
}
.radio--on .radio__title {
  color: var(--primary-800);
}
.radio__desc {
  display: block;
  font-size: 13px;
  color: var(--gray-500);
  margin-top: 2px;
  line-height: 1.5;
}

/* review cards */
.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}
.cards--results {
  margin: 22px 0 18px;
}
.card {
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  padding: 12px 14px;
  background: var(--gray-50);
}
.card--import {
  border-color: var(--primary-200);
  background: var(--primary-50);
}
.card--update {
  border-color: #93c4f7;
  background: var(--info-100);
}
.card--warn {
  border-color: #f5d87a;
  background: var(--warning-100);
}
.card--err {
  border-color: #f5a3a3;
  background: var(--danger-100);
}
.card--mute {
  background: var(--gray-50);
}
.card__num {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 500;
  color: var(--gray-500);
  line-height: 1;
}
.card--import .card__num {
  color: var(--primary-800);
}
.card--update .card__num {
  color: var(--info-600);
}
.card--warn .card__num {
  color: var(--warning-600);
}
.card--err .card__num {
  color: var(--danger-600);
}
.card__num--ok {
  color: var(--primary-800);
}
.card__num--info {
  color: var(--info-600);
}
.card__lbl {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--gray-500);
  margin-top: 5px;
}

/* review tabs */
.rtabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.rtab {
  border: none;
  background: transparent;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--gray-600);
  padding: 5px 12px;
  border-radius: var(--radius-full);
  cursor: pointer;
}
.rtab:hover {
  background: var(--gray-100);
}
.rtab--on {
  background: var(--primary-100);
  color: var(--primary-800);
  font-weight: 500;
}

/* review table */
.rtable {
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  overflow: hidden;
}
.rrow {
  display: grid;
  grid-template-columns: 100px 1fr 168px;
  align-items: center;
  padding: 11px 14px;
  border-bottom: 1px solid var(--gray-100);
}
.rrow:last-child {
  border-bottom: none;
}
.rrow--head {
  background: var(--gray-50);
  border-bottom: 1px solid var(--gray-200);
  padding: 9px 14px;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--gray-500);
}
.rrow--err {
  background: #fffafa;
}
.rrow--warn {
  background: #fffdf5;
}
.rbadge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 9px;
  border-radius: var(--radius-full);
}
.rbadge__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
}
.rbadge--new {
  background: var(--success-100);
  color: var(--success-600);
}
.rbadge--new .rbadge__dot {
  background: var(--success-600);
}
.rbadge--update {
  background: var(--info-100);
  color: var(--info-600);
}
.rbadge--update .rbadge__dot {
  background: var(--info-600);
}
.rbadge--warning {
  background: var(--warning-100);
  color: var(--warning-600);
}
.rbadge--warning .rbadge__dot {
  background: var(--warning-600);
}
.rbadge--error {
  background: var(--danger-100);
  color: var(--danger-600);
}
.rbadge--error .rbadge__dot {
  background: var(--danger-600);
}
.rcontact {
  min-width: 0;
}
.rcontact__email {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--gray-700);
}
.rcontact__row {
  font-size: 13px;
  color: var(--gray-700);
}
.rissue {
  font-size: 12.5px;
  color: var(--gray-500);
}
.rrow--err .rissue {
  color: var(--danger-600);
}
.rempty {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--gray-400);
}

/* importing */
.importing {
  padding: 16px 0 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.ring {
  position: relative;
  width: 140px;
  height: 140px;
}
.ring__pct {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 500;
  color: var(--gray-800);
}
.importing__title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 500;
  color: var(--gray-800);
  margin-top: 22px;
}
.importing__status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 14px;
  color: var(--gray-500);
}
.pulse {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--primary-600);
  animation: calmpulse 1.6s ease-in-out infinite;
}
@keyframes calmpulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}
.importing__note {
  font-size: 13px;
  color: var(--gray-400);
  margin-top: 22px;
}
.safe {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 16px;
  background: var(--gray-50);
  border: 1px solid var(--gray-100);
  border-radius: 8px;
  margin-top: 16px;
  font-size: 13px;
  color: var(--gray-600);
}
.safe .ph {
  font-size: 17px;
  color: var(--gray-500);
  flex: none;
}

/* results */
.results {
  text-align: center;
  padding: 4px 0;
}
.results__icon {
  width: 62px;
  height: 62px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}
.results__icon .ph {
  font-size: 34px;
}
.results__icon--ok {
  background: var(--success-100);
  color: var(--success-600);
}
.results__icon--warn {
  background: var(--warning-100);
  color: var(--warning-600);
}
.results__title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 500;
  color: var(--gray-800);
}
.results__sub {
  font-size: 14px;
  color: var(--gray-500);
  margin-top: 6px;
}
.results__list {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--gray-700);
  background: var(--gray-50);
  border: 1px solid var(--gray-200);
  padding: 9px 14px;
  border-radius: 8px;
}
.results__list .ph {
  font-size: 15px;
  color: var(--success-600);
}

/* footer */
.ft {
  flex: none;
  display: flex;
  align-items: center;
  padding: 16px 24px;
  border-top: 1px solid var(--gray-100);
}
.ft__side {
  flex: 1;
  display: flex;
  align-items: center;
}
.ft__side--end {
  justify-content: flex-end;
  gap: 12px;
}
.ft__results {
  gap: 10px;
}
.ft__step {
  font-size: 13px;
  color: var(--gray-500);
}
.ft__muted {
  font-size: 12.5px;
  color: var(--gray-500);
}
.ft__warn {
  font-size: 12.5px;
  color: var(--danger-600);
}
.btn {
  height: 38px;
  padding: 0 18px;
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
}
.btn--primary {
  background: var(--primary-600);
  color: #fff;
}
.btn--primary:hover {
  background: var(--primary-800);
}
.btn--primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn--secondary {
  background: #fff;
  color: var(--gray-700);
  border: 1px solid var(--gray-200);
}
.btn--secondary:hover {
  background: var(--gray-50);
}
.btn--ghost {
  background: transparent;
  color: var(--gray-600);
  padding: 0 14px;
}
.btn--ghost:hover {
  background: var(--gray-100);
}
.error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--danger-600);
}
.spin {
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
