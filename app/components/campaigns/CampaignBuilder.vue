<script setup lang="ts">
import type { CampaignDetail } from '~/types/campaign'
import CampaignEditor from '~/components/campaigns/CampaignEditor.client.vue'
import {
  SEGMENT_PROFILE_FIELDS,
  SEGMENT_OPERATORS,
  SEGMENT_OPERATOR_LABELS,
  SEGMENT_VALUE_OPERATORS,
  segmentRulesSchema,
  abVariantsSchema,
  contactStatusSchema,
  type SegmentOperator,
  type AttributeField,
} from '#shared/schemas'

/**
 * Full-screen campaign builder (task 2.1). Top bar + left settings panel +
 * embedded Unlayer editor. Autosaves the draft (create-then-update), saves/loads
 * reusable templates, previews the exported HTML, and dispatches via the
 * existing send endpoint.
 *
 * A/B testing (3.3), scheduling (2.2) and preview text (no column yet) from the
 * mockup are intentionally deferred to their phases.
 */
const props = defineProps<{
  campaignId?: string | null
  templateId?: string | null
}>()

interface ListItem {
  id: string
  name: string
  contactCount: number
  attribute_schema?: AttributeField[]
}
interface TemplateRow {
  id: string
  name: string
  subject: string
}

const campaignId = ref<string | null>(props.campaignId ?? null)

/* ---------- initial data (SSR) ---------- */
const { data: lists } = await useFetch<ListItem[]>('/api/lists', {
  default: () => [],
})

const existing = props.campaignId
  ? (
      await useFetch<CampaignDetail>(`/api/campaigns/${props.campaignId}`)
    ).data.value
  : null

const seedTemplate =
  !props.campaignId && props.templateId
    ? (await useFetch<{ design: object; subject: string }>(
        `/api/templates/${props.templateId}`,
      )).data.value
    : null

/* ---------- editable state ---------- */
const name = ref(existing?.name ?? 'Untitled campaign')
const subject = ref(existing?.subject ?? seedTemplate?.subject ?? '')
const fromName = ref(existing?.from_name ?? '')
const fromEmail = ref(existing?.from_email ?? '')
const listId = ref<string | null>(existing?.list_id ?? null)

const initialDesign = (existing?.design ??
  seedTemplate?.design ??
  null) as object | null

const status = ref(existing?.status ?? 'draft')
const locked = computed(
  () => status.value !== 'draft' && status.value !== 'scheduled',
)

/* ---------- segment builder (task 3.2) ---------- */
// One editable row in the panel. `field` is a profile column, or 'custom' with
// a typed `attributes.<customKey>`. `value` is always held as a string in the
// UI and coerced by the shared evaluator.
interface RuleRow {
  field: string
  customKey: string
  operator: SegmentOperator
  value: string
}
const statusOptions = contactStatusSchema.options

// The selected list's custom-attribute definitions (task 3.1 list schema).
const attributeFields = computed<AttributeField[]>(() => {
  const l = lists.value?.find((x) => x.id === listId.value)
  return Array.isArray(l?.attribute_schema) ? l.attribute_schema : []
})
function schemaKeysFor(lid: string | null): Set<string> {
  const l = lists.value?.find((x) => x.id === lid)
  const sch = Array.isArray(l?.attribute_schema) ? l.attribute_schema : []
  return new Set(sch.map((f) => `attributes.${f.key}`))
}

function rowsFromStored(raw: unknown): RuleRow[] {
  const parsed = segmentRulesSchema.safeParse(raw ?? {})
  const stored = parsed.success ? parsed.data.rules : []
  const known = schemaKeysFor(existing?.list_id ?? null)
  return stored.map((r) => {
    const isAttr = r.field.startsWith('attributes.')
    // Attributes the list defines resolve to a dropdown option; unknown keys
    // fall back to a free-text "Custom attribute…" row.
    const useCustom = isAttr && !known.has(r.field)
    return {
      field: useCustom ? 'custom' : r.field,
      customKey: useCustom ? r.field.slice('attributes.'.length) : '',
      operator: r.operator,
      value: r.value === undefined ? '' : String(r.value),
    }
  })
}
const rules = ref<RuleRow[]>(rowsFromStored(existing?.segment_rules))

// Field dropdown: profile fields, then the list's defined attributes (by label),
// then any attribute a rule already references but the list doesn't define, then
// the free-text custom option.
const fieldOptions = computed(() => {
  const opts: { value: string; label: string }[] = SEGMENT_PROFILE_FIELDS.map(
    (f) => ({ value: f.value, label: f.label }),
  )
  const seen = new Set<string>()
  for (const f of attributeFields.value) {
    const v = `attributes.${f.key}`
    opts.push({ value: v, label: f.label })
    seen.add(v)
  }
  for (const r of rules.value) {
    if (r.field.startsWith('attributes.') && !seen.has(r.field)) {
      seen.add(r.field)
      opts.push({ value: r.field, label: r.field.slice('attributes.'.length) })
    }
  }
  opts.push({ value: 'custom', label: 'Custom attribute…' })
  return opts
})

// The attribute definition behind a row's field — drives the value input type.
function attrFieldOf(field: string): AttributeField | null {
  if (!field.startsWith('attributes.')) return null
  const key = field.slice('attributes.'.length)
  return attributeFields.value.find((f) => f.key === key) ?? null
}

function needsValue(op: SegmentOperator) {
  return SEGMENT_VALUE_OPERATORS.includes(op)
}
function addRule() {
  if (locked.value) return
  rules.value.push({
    field: 'email',
    customKey: '',
    operator: 'contains',
    value: '',
  })
}
function removeRule(i: number) {
  if (locked.value) return
  rules.value.splice(i, 1)
}

// Resolve UI rows into valid stored rules (drop incomplete ones so autosave and
// preview never send a half-typed condition the schema would reject).
const cleanRules = computed(() =>
  rules.value
    .map((r) => ({
      field:
        r.field === 'custom'
          ? `attributes.${r.customKey.trim().replace(/[^A-Za-z0-9_-]/g, '')}`
          : r.field,
      operator: r.operator,
      value: r.value,
    }))
    .filter((r) => {
      if (r.field === 'attributes.') return false
      return needsValue(r.operator) ? r.value.trim() !== '' : true
    })
    .map((r) =>
      needsValue(r.operator)
        ? { field: r.field, operator: r.operator, value: r.value.trim() }
        : { field: r.field, operator: r.operator },
    ),
)

/* ---------- segment preview count ---------- */
const previewCount = ref<number | null>(null)
const previewTotal = ref<number | null>(null)
const previewLoading = ref(false)
let previewTimer: ReturnType<typeof setTimeout> | undefined
async function runPreview() {
  if (!listId.value) {
    previewCount.value = null
    previewTotal.value = null
    return
  }
  previewLoading.value = true
  try {
    const res = await $fetch<{ count: number; total: number }>(
      '/api/segments/preview',
      {
        method: 'POST',
        body: {
          listId: listId.value,
          rules: { match: 'all', rules: cleanRules.value },
        },
      },
    )
    previewCount.value = res.count
    previewTotal.value = res.total
  } catch {
    previewCount.value = null
    previewTotal.value = null
  } finally {
    previewLoading.value = false
  }
}
function schedulePreview() {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(runPreview, 400)
}

/* ---------- A/B test (task 3.3, subject-only) ---------- */
const existingAb = (() => {
  const p = abVariantsSchema.safeParse(existing?.ab_variants ?? [])
  return p.success ? p.data[0] : undefined
})()
const abOn = ref(!!existingAb)
const variantBSubject = ref(existingAb?.subject ?? '')
const variantBWeight = ref(existingAb?.weight ?? 50)
// Stored payload: variant B only (A is the campaign's own subject). Empty when
// the toggle is off or B has no subject yet, so it won't fail schema validation.
const abVariantsPayload = computed(() =>
  abOn.value && variantBSubject.value.trim()
    ? [{ subject: variantBSubject.value.trim(), weight: variantBWeight.value }]
    : [],
)

/* ---------- editor ---------- */
const editor = ref<InstanceType<typeof CampaignEditor> | null>(null)
const editorReady = ref(false)
let readyAt = 0
function onEditorReady() {
  editorReady.value = true
  readyAt = Date.now()
}

/* ---------- save status ---------- */
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
const saveState = ref<SaveState>(existing ? 'saved' : 'idle')
const lastSavedAt = ref<number | null>(
  existing?.updated_at ? new Date(existing.updated_at).getTime() : null,
)

/* ---------- editable name (static text → input on edit) ---------- */
const editingName = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)
function startEditName() {
  if (locked.value) return
  editingName.value = true
  nextTick(() => nameInput.value?.focus())
}

/* ---------- relative "last saved" label ---------- */
const mounted = ref(false)
const nowTick = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  mounted.value = true
  tickTimer = setInterval(() => (nowTick.value = Date.now()), 15000)
})
onBeforeUnmount(() => clearInterval(tickTimer))
const relativeSaved = computed(() => {
  if (!lastSavedAt.value) return ''
  const s = Math.max(0, Math.floor((nowTick.value - lastSavedAt.value) / 1000))
  if (s < 45) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
})

let saveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSave() {
  if (locked.value) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(doSave, 800)
}

async function exportContent(): Promise<{ html: string; design: object }> {
  if (editorReady.value && editor.value) {
    try {
      return await editor.value.exportHtml()
    } catch {
      /* fall through to existing content */
    }
  }
  return { html: existing?.html ?? '', design: initialDesign ?? {} }
}

async function doSave() {
  if (locked.value) return
  saveState.value = 'saving'
  try {
    const { html, design } = await exportContent()
    // Omit empty optional fields so they pass schema validation (email()/min)
    // and let the server fill from_name/from_email defaults on create.
    const payload = {
      name: name.value.trim() || 'Untitled campaign',
      subject: subject.value,
      html,
      design,
      ...(fromName.value.trim() ? { fromName: fromName.value.trim() } : {}),
      ...(fromEmail.value.trim() ? { fromEmail: fromEmail.value.trim() } : {}),
      ...(listId.value ? { listId: listId.value } : {}),
      segmentRules: { match: 'all' as const, rules: cleanRules.value },
      abVariants: abVariantsPayload.value,
    }

    if (!campaignId.value) {
      const created = await $fetch<{
        id: string
        from_name: string
        from_email: string
      }>('/api/campaigns', { method: 'POST', body: payload })
      campaignId.value = created.id
      // Surface the server-defaulted sender so the fields aren't blank.
      if (!fromName.value) fromName.value = created.from_name
      if (!fromEmail.value) fromEmail.value = created.from_email
      // Reflect the real id in the URL so a reload resumes editing.
      if (import.meta.client) {
        window.history.replaceState({}, '', `/campaigns/${created.id}/edit`)
      }
    } else {
      await $fetch(`/api/campaigns/${campaignId.value}`, {
        method: 'PATCH',
        body: payload,
      })
    }
    saveState.value = 'saved'
    lastSavedAt.value = Date.now()
  } catch (err) {
    saveState.value = 'error'
    toast('error', 'Could not save', errMsg(err))
  }
}

// Editor edits → autosave. Ignore the burst right after the initial load.
function onEditorChange() {
  if (Date.now() - readyAt < 1500) return
  scheduleSave()
}

// Field edits → autosave.
watch([name, subject, fromName, fromEmail, listId], scheduleSave)
// Segment edits → autosave; list/segment changes → re-estimate recipients.
watch(rules, scheduleSave, { deep: true })
watch([listId, cleanRules], schedulePreview, { deep: true })
onMounted(runPreview)
// A/B edits → autosave.
watch([abOn, variantBSubject, variantBWeight], scheduleSave)

/* ---------- target list dropdown ---------- */
const listOpen = ref(false)
const currentList = computed(() =>
  lists.value?.find((l) => l.id === listId.value),
)
const listLabel = computed(() =>
  currentList.value
    ? `${currentList.value.name} (${currentList.value.contactCount.toLocaleString('en-US')})`
    : 'Select a list',
)
function pickList(id: string) {
  listId.value = id
  listOpen.value = false
}

/* ---------- schedule ---------- */
function localParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}
const initSched = localParts(existing?.scheduled_at ?? null)
const scheduleOn = ref(existing?.status === 'scheduled')
const scheduleDate = ref(initSched.date)
const scheduleTime = ref(initSched.time)
const scheduling = ref(false)

async function scheduleCampaign() {
  if (locked.value) return
  if (!scheduleDate.value || !scheduleTime.value) {
    toast('error', 'Pick a date and time')
    return
  }
  const when = new Date(`${scheduleDate.value}T${scheduleTime.value}`)
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    toast('error', 'Schedule time must be in the future')
    return
  }
  // Persist the latest content, then schedule.
  clearTimeout(saveTimer)
  await doSave()
  if (!campaignId.value) return
  if (!listId.value) {
    toast('error', 'Pick a recipient list first')
    return
  }
  scheduling.value = true
  try {
    await $fetch(`/api/campaigns/${campaignId.value}/schedule`, {
      method: 'POST',
      body: { scheduledAt: when.toISOString() },
    })
    toast('success', 'Campaign scheduled')
    await navigateTo(`/campaigns/${campaignId.value}`)
  } catch (err) {
    toast('error', 'Could not schedule', errMsg(err))
  } finally {
    scheduling.value = false
  }
}

/* ---------- templates ---------- */
const showTemplateSave = ref(false)
const templateName = ref('')
const savingTemplate = ref(false)
function openTemplateSave() {
  templateName.value = name.value
  showTemplateSave.value = true
}
async function confirmSaveTemplate() {
  if (!templateName.value.trim()) return
  savingTemplate.value = true
  try {
    const { html, design } = await exportContent()
    await $fetch('/api/templates', {
      method: 'POST',
      body: {
        name: templateName.value.trim(),
        subject: subject.value || name.value,
        html: html || '<p></p>',
        design,
      },
    })
    showTemplateSave.value = false
    toast('success', 'Template saved', templateName.value.trim())
  } catch (err) {
    toast('error', 'Could not save template', errMsg(err))
  } finally {
    savingTemplate.value = false
  }
}

const showTemplateLoad = ref(false)
const templates = ref<TemplateRow[]>([])
const templatesLoading = ref(false)
async function openTemplateLoad() {
  showTemplateLoad.value = true
  templatesLoading.value = true
  try {
    const res = await $fetch<{ data: TemplateRow[] }>('/api/templates')
    templates.value = res.data
  } catch (err) {
    toast('error', 'Could not load templates', errMsg(err))
  } finally {
    templatesLoading.value = false
  }
}
async function applyTemplate(id: string) {
  try {
    const tpl = await $fetch<{ design: object; subject: string }>(
      `/api/templates/${id}`,
    )
    editor.value?.loadDesign(tpl.design)
    if (!subject.value) subject.value = tpl.subject
    showTemplateLoad.value = false
    toast('success', 'Template applied')
    scheduleSave()
  } catch (err) {
    toast('error', 'Could not apply template', errMsg(err))
  }
}

/* ---------- preview ---------- */
const showPreview = ref(false)
const previewHtml = ref('')
async function openPreview() {
  const { html } = await exportContent()
  previewHtml.value = html
  showPreview.value = true
}

/* ---------- send ---------- */
const sending = ref(false)
async function send() {
  if (locked.value) return
  // Make sure the latest content is persisted before dispatch.
  clearTimeout(saveTimer)
  await doSave()
  if (!campaignId.value) return
  if (!listId.value) {
    toast('error', 'Pick a recipient list first')
    return
  }
  sending.value = true
  try {
    await $fetch(`/api/campaigns/${campaignId.value}/send`, { method: 'POST' })
    toast('success', 'Campaign is sending')
    await navigateTo(`/campaigns/${campaignId.value}`)
  } catch (err) {
    toast('error', 'Could not send', errMsg(err))
  } finally {
    sending.value = false
  }
}

/* ---------- toast ---------- */
interface Toast {
  id: number
  variant: 'success' | 'error' | 'info'
  title: string
  desc?: string
}
const toasts = ref<Toast[]>([])
let toastId = 0
function toast(variant: Toast['variant'], title: string, desc?: string) {
  const id = ++toastId
  toasts.value.push({ id, variant, title, desc })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 4000)
}
function errMsg(err: unknown): string {
  const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
  return e?.data?.statusMessage ?? e?.statusMessage ?? 'Please try again.'
}

const TOAST_ICON = {
  success: 'ph-check-circle',
  error: 'ph-x-circle',
  info: 'ph-info',
}
const TOAST_COLOR = {
  success: 'var(--success-600)',
  error: 'var(--danger-600)',
  info: 'var(--primary-600)',
}
</script>

<template>
  <div class="builder">
    <!-- ===================== TOP BAR ===================== -->
    <div class="topbar">
      <div class="topbar__left">
        <div
          class="backbtn"
          title="Back to campaigns"
          @click="navigateTo('/campaigns')"
        >
          <i class="ph ph-arrow-left" />
        </div>
        <div class="topbar__divider" />
        <div class="namecol">
          <div class="namerow">
            <input
              v-if="editingName"
              ref="nameInput"
              v-model="name"
              spellcheck="false"
              class="nameinput"
              @blur="editingName = false"
              @keyup.enter="editingName = false"
            />
            <template v-else>
              <span class="nametext" @click="startEditName">{{ name }}</span>
              <i
                v-if="!locked"
                class="ph ph-pencil-simple nameedit"
                title="Rename"
                @click="startEditName"
              />
            </template>
          </div>
          <div class="statusrow">
            <template v-if="locked">
              <i class="ph ph-lock-simple" style="color: var(--gray-500)" />
              <span class="status-muted">{{ status }} · read only</span>
            </template>
            <template v-else-if="saveState === 'saving'">
              <i class="ph ph-circle-notch spin" style="color: var(--gray-500)" />
              <span class="status-muted">Saving…</span>
            </template>
            <template v-else-if="saveState === 'error'">
              <i class="ph ph-warning-circle" style="color: var(--danger-600)" />
              <span style="color: var(--danger-600)">Save failed</span>
            </template>
            <template v-else-if="saveState === 'saved'">
              <i class="ph ph-check-circle" style="color: var(--success-600)" />
              <span class="status-saved">Changes auto-saved</span>
              <template v-if="mounted && relativeSaved">
                <span class="status-dot">·</span>
                <span class="status-dim">Last saved {{ relativeSaved }}</span>
              </template>
            </template>
            <template v-else>
              <span class="status-dim">Not saved yet</span>
            </template>
          </div>
        </div>
      </div>
      <div class="topbar__right">
        <button type="button" class="btn-secondary" @click="openTemplateLoad">
          <i class="ph ph-layout" /> Load template
        </button>
        <button type="button" class="btn-secondary" @click="openTemplateSave">
          <i class="ph ph-floppy-disk" /> Save as template
        </button>
        <button type="button" class="btn-secondary" @click="openPreview">
          <i class="ph ph-eye" /> Preview
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="locked || sending || scheduling"
          @click="scheduleOn ? scheduleCampaign() : send()"
        >
          <i
            class="ph-fill"
            :class="scheduleOn ? 'ph-clock' : 'ph-paper-plane-tilt'"
          />
          {{
            scheduleOn
              ? scheduling
                ? 'Scheduling…'
                : 'Schedule Campaign'
              : sending
                ? 'Sending…'
                : 'Send Campaign'
          }}
        </button>
      </div>
    </div>

    <!-- ===================== BODY ===================== -->
    <div class="body">
      <!-- ============ LEFT SETTINGS PANEL ============ -->
      <div class="panel">
        <div class="panel__scroll">
          <div class="section-label">Campaign Details</div>

          <div class="field">
            <label class="field__label">
              Subject Line{{ abOn ? ' — Variant A' : '' }}
            </label>
            <input
              v-model="subject"
              placeholder="Something exciting is here…"
              class="input"
              :disabled="locked"
            />
          </div>

          <!-- A/B test (task 3.3, subject-only) -->
          <div
            class="toggle-row"
            :class="{ 'toggle-row--on': abOn, 'toggle-row--disabled': locked }"
            @click="!locked && (abOn = !abOn)"
          >
            <div>
              <div class="toggle-row__title">A/B Test Subject</div>
              <div class="toggle-row__sub">
                Split recipients between two subject lines
              </div>
            </div>
            <div class="switch" :class="{ 'switch--on': abOn }">
              <div class="switch__knob" />
            </div>
          </div>

          <div v-if="abOn" class="ab-fields">
            <div class="field">
              <label class="field__label">Subject — Variant B</label>
              <input
                v-model="variantBSubject"
                placeholder="An alternate subject…"
                class="input"
                :disabled="locked"
              />
            </div>
            <div class="field">
              <label class="field__label">
                Split — A {{ 100 - variantBWeight }}% · B {{ variantBWeight }}%
              </label>
              <input
                v-model.number="variantBWeight"
                type="range"
                min="1"
                max="99"
                step="1"
                class="ab-range"
                :disabled="locked"
              />
            </div>
          </div>

          <div class="divider" />

          <div class="section-label">Sender</div>

          <div class="field">
            <label class="field__label">From Name</label>
            <input v-model="fromName" class="input" :disabled="locked" />
          </div>
          <div class="field">
            <label class="field__label">From Email</label>
            <input
              v-model="fromEmail"
              class="input input--mono"
              :disabled="locked"
            />
          </div>

          <div class="divider" />

          <div class="section-label">Recipients</div>

          <div class="field field--rel">
            <label class="field__label">Target List</label>
            <div
              class="select"
              :class="{ 'select--disabled': locked }"
              @click="!locked && (listOpen = !listOpen)"
            >
              <span class="select__val">
                <i
                  class="ph ph-users-three"
                  style="color: var(--primary-400)"
                />
                {{ listLabel }}
              </span>
              <i class="ph ph-caret-down" style="color: var(--gray-500)" />
            </div>
            <div v-if="listOpen" class="select__menu">
              <div
                v-if="!lists?.length"
                class="select__empty"
              >
                No lists yet — create one on the Lists page.
              </div>
              <div
                v-for="l in lists"
                :key="l.id"
                class="select__opt"
                @click="pickList(l.id)"
              >
                <span class="select__opt-text">
                  <span class="select__opt-name">{{ l.name }}</span>
                  <span class="select__opt-sub"
                    >{{ l.contactCount.toLocaleString('en-US') }} contacts</span
                  >
                </span>
                <i
                  v-if="listId === l.id"
                  class="ph ph-check"
                  style="color: var(--primary-600)"
                />
              </div>
            </div>
          </div>

          <!-- Segment builder (task 3.2) -->
          <div class="field">
            <label class="field__label">Segment (optional)</label>

            <p v-if="!rules.length" class="seg-hint">
              Sends to the whole list. Add a condition to narrow it down.
            </p>

            <div
              v-for="(row, i) in rules"
              :key="i"
              class="seg-rule"
              :class="{ 'seg-rule--locked': locked }"
            >
              <select
                v-model="row.field"
                class="seg-input"
                :disabled="locked"
              >
                <option
                  v-for="o in fieldOptions"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>

              <input
                v-if="row.field === 'custom'"
                v-model="row.customKey"
                class="seg-input"
                placeholder="attribute key (e.g. company)"
                :disabled="locked"
              />

              <div class="seg-rule__row">
                <select
                  v-model="row.operator"
                  class="seg-input"
                  :disabled="locked"
                >
                  <option v-for="op in SEGMENT_OPERATORS" :key="op" :value="op">
                    {{ SEGMENT_OPERATOR_LABELS[op] }}
                  </option>
                </select>

                <template v-if="needsValue(row.operator)">
                  <select
                    v-if="row.field === 'status'"
                    v-model="row.value"
                    class="seg-input"
                    :disabled="locked"
                  >
                    <option value="">Select…</option>
                    <option v-for="s in statusOptions" :key="s" :value="s">
                      {{ s }}
                    </option>
                  </select>
                  <select
                    v-else-if="attrFieldOf(row.field)?.type === 'select'"
                    v-model="row.value"
                    class="seg-input"
                    :disabled="locked"
                  >
                    <option value="">Select…</option>
                    <option
                      v-for="o in attrFieldOf(row.field)?.options ?? []"
                      :key="o"
                      :value="o"
                    >
                      {{ o }}
                    </option>
                  </select>
                  <select
                    v-else-if="attrFieldOf(row.field)?.type === 'boolean'"
                    v-model="row.value"
                    class="seg-input"
                    :disabled="locked"
                  >
                    <option value="">Select…</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                  <input
                    v-else-if="attrFieldOf(row.field)?.type === 'number'"
                    v-model="row.value"
                    type="number"
                    class="seg-input"
                    placeholder="value"
                    :disabled="locked"
                  />
                  <input
                    v-else-if="attrFieldOf(row.field)?.type === 'date'"
                    v-model="row.value"
                    type="date"
                    class="seg-input"
                    :disabled="locked"
                  />
                  <input
                    v-else
                    v-model="row.value"
                    class="seg-input"
                    placeholder="value"
                    :disabled="locked"
                  />
                </template>

                <button
                  type="button"
                  class="seg-del"
                  :disabled="locked"
                  title="Remove condition"
                  @click="removeRule(i)"
                >
                  <i class="ph ph-x" />
                </button>
              </div>
            </div>

            <button
              type="button"
              class="seg-add"
              :disabled="locked"
              @click="addRule"
            >
              <i class="ph ph-plus" /> Add condition
            </button>

            <div v-if="listId" class="seg-preview">
              <i class="ph ph-users-three" />
              <span v-if="previewLoading" class="seg-preview__muted"
                >Estimating…</span
              >
              <span v-else-if="previewCount !== null">
                <strong>{{ previewCount.toLocaleString('en-US') }}</strong>
                of {{ (previewTotal ?? 0).toLocaleString('en-US') }} recipients
              </span>
              <span v-else class="seg-preview__muted">—</span>
            </div>
          </div>

          <div
            class="toggle-row"
            :class="{
              'toggle-row--on': scheduleOn,
              'toggle-row--disabled': locked,
            }"
            @click="!locked && (scheduleOn = !scheduleOn)"
          >
            <div>
              <div class="toggle-row__title">Schedule Delivery</div>
              <div class="toggle-row__sub">Pick a future date &amp; time</div>
            </div>
            <div class="switch" :class="{ 'switch--on': scheduleOn }">
              <div class="switch__knob" />
            </div>
          </div>

          <div v-if="scheduleOn" class="sched-fields">
            <div class="sched-fields__date">
              <label class="field__label">Date</label>
              <input
                v-model="scheduleDate"
                type="date"
                class="input"
                :disabled="locked"
              />
            </div>
            <div class="sched-fields__time">
              <label class="field__label">Time</label>
              <input
                v-model="scheduleTime"
                type="time"
                class="input"
                :disabled="locked"
              />
            </div>
          </div>
        </div>

        <div class="panel__footer">
          <button type="button" class="help-btn">
            <i class="ph ph-question" /> Need help with campaigns?
          </button>
        </div>
      </div>

      <!-- ============ EDITOR ============ -->
      <div class="canvas">
        <CampaignEditor
          ref="editor"
          :initial-design="initialDesign"
          @ready="onEditorReady"
          @change="onEditorChange"
        />
        <div v-if="!editorReady" class="canvas__loading">
          <i class="ph ph-circle-notch spin" />
          <span>Loading editor…</span>
        </div>
      </div>
    </div>

    <!-- ===================== TEMPLATE SAVE MODAL ===================== -->
    <div v-if="showTemplateSave" class="overlay" @click.self="showTemplateSave = false">
      <div class="modal modal--sm">
        <div class="modal__head">
          <h2 class="modal__title">Save as template</h2>
          <button type="button" class="iconbtn" @click="showTemplateSave = false">
            <i class="ph ph-x" />
          </button>
        </div>
        <div class="modal__body">
          <div class="field">
            <label class="field__label">Template name</label>
            <input
              v-model="templateName"
              class="input"
              placeholder="e.g. Monthly newsletter"
              @keyup.enter="confirmSaveTemplate"
            />
            <div class="field__help">
              Saves the current design so you can reuse it in future campaigns.
            </div>
          </div>
        </div>
        <div class="modal__foot">
          <button type="button" class="btn-secondary" @click="showTemplateSave = false">
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary"
            :disabled="!templateName.trim() || savingTemplate"
            @click="confirmSaveTemplate"
          >
            {{ savingTemplate ? 'Saving…' : 'Save template' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ===================== TEMPLATE LOAD MODAL ===================== -->
    <div v-if="showTemplateLoad" class="overlay" @click.self="showTemplateLoad = false">
      <div class="modal modal--md">
        <div class="modal__head">
          <h2 class="modal__title">Load a template</h2>
          <button type="button" class="iconbtn" @click="showTemplateLoad = false">
            <i class="ph ph-x" />
          </button>
        </div>
        <div class="modal__body modal__body--list">
          <div v-if="templatesLoading" class="tpl-empty">Loading…</div>
          <div v-else-if="!templates.length" class="tpl-empty">
            No templates yet. Save your current design as a template to reuse it.
          </div>
          <button
            v-for="t in templates"
            :key="t.id"
            type="button"
            class="tpl-row"
            @click="applyTemplate(t.id)"
          >
            <span class="tpl-row__icon"><i class="ph ph-layout" /></span>
            <span class="tpl-row__text">
              <span class="tpl-row__name">{{ t.name }}</span>
              <span class="tpl-row__sub">{{ t.subject }}</span>
            </span>
            <i class="ph ph-arrow-right tpl-row__go" />
          </button>
        </div>
      </div>
    </div>

    <!-- ===================== PREVIEW MODAL ===================== -->
    <div v-if="showPreview" class="overlay" @click.self="showPreview = false">
      <div class="modal modal--lg modal--preview">
        <div class="modal__head">
          <h2 class="modal__title">Preview</h2>
          <button type="button" class="iconbtn" @click="showPreview = false">
            <i class="ph ph-x" />
          </button>
        </div>
        <div class="modal__body modal__body--preview">
          <iframe class="preview-frame" :srcdoc="previewHtml" title="Email preview" />
        </div>
      </div>
    </div>

    <!-- ===================== TOASTS ===================== -->
    <div class="toasts">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :style="{ borderLeftColor: TOAST_COLOR[t.variant] }"
      >
        <i
          class="ph toast__icon"
          :class="TOAST_ICON[t.variant]"
          :style="{ color: TOAST_COLOR[t.variant] }"
        />
        <div class="toast__text">
          <div class="toast__title">{{ t.title }}</div>
          <div v-if="t.desc" class="toast__desc">{{ t.desc }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.builder {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fff;
  overflow: hidden;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- top bar ---------- */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  flex-shrink: 0;
  padding: 0 20px;
  border-bottom: 1px solid var(--gray-200);
  background: #fff;
  z-index: 30;
}
.topbar__left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.topbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.iconbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  color: var(--gray-600);
  cursor: pointer;
  flex-shrink: 0;
}
.iconbtn:hover {
  background: var(--gray-100);
  color: var(--gray-800);
}
.iconbtn .ph {
  font-size: 20px;
}
.backbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 100ms ease;
}
.backbtn:hover {
  background: var(--gray-100);
}
.backbtn .ph {
  font-size: 20px;
  color: var(--gray-600);
}
.topbar__divider {
  width: 1px;
  height: 28px;
  background: var(--gray-200);
  flex-shrink: 0;
}
.namecol {
  min-width: 0;
}
.namerow {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
}
.nametext {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 18px;
  color: var(--gray-800);
  cursor: text;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nameedit {
  font-size: 15px;
  color: var(--gray-400);
  cursor: pointer;
  flex-shrink: 0;
}
.nameedit:hover {
  color: var(--primary-600);
}
.nameinput {
  border: 1px solid var(--gray-200);
  background: #fff;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 18px;
  color: var(--gray-800);
  padding: 3px 8px;
  border-radius: var(--radius-md);
  width: 300px;
  outline: none;
}
.nameinput:focus {
  border-color: var(--primary-600);
  outline: 2px solid var(--primary-100);
}
.statusrow {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 1px;
  font-size: 12px;
}
.statusrow .ph {
  font-size: 14px;
}
.status-saved {
  color: var(--success-600);
}
.status-muted {
  color: var(--gray-500);
}
.status-dim {
  color: var(--gray-400);
}
.status-dot {
  color: var(--gray-300);
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 18px;
  background: var(--primary-600);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 100ms ease;
}
.btn-primary:hover:not(:disabled) {
  background: var(--primary-800);
}
.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn-primary .ph {
  font-size: 15px;
}
.btn-secondary {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 14px;
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  color: var(--gray-700);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 100ms ease,
    border-color 100ms ease;
}
.btn-secondary:hover {
  background: var(--gray-50);
  border-color: var(--gray-300);
}
.btn-secondary .ph {
  font-size: 16px;
}

/* ---------- body ---------- */
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ---------- left panel ---------- */
.panel {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--gray-200);
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panel__scroll {
  padding: 24px 20px 12px;
  flex: 1;
  overflow-y: auto;
}
.section-label {
  font-weight: 500;
  font-size: 11px;
  letter-spacing: 0.5px;
  color: var(--gray-500);
  text-transform: uppercase;
  margin-bottom: 18px;
}
.field {
  margin-bottom: 18px;
}
.field--rel {
  position: relative;
}
.field__label {
  display: block;
  font-weight: 500;
  font-size: 13px;
  color: var(--gray-700);
  margin-bottom: 8px;
}
.field__help {
  font-size: 13px;
  color: var(--gray-500);
  margin-top: 7px;
}
.input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--gray-800);
  background: #fff;
  outline: none;
}
.input:focus {
  border-color: var(--primary-600);
  outline: 2px solid var(--primary-100);
}
.input:disabled {
  background: var(--gray-50);
  color: var(--gray-400);
  cursor: not-allowed;
}
.input--mono {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--gray-600);
}
.divider {
  height: 1px;
  background: var(--gray-100);
  margin: 22px 0;
}

/* A/B test (task 3.3) */
.ab-fields {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: var(--gray-50);
}
.ab-fields .field:last-child {
  margin-bottom: 0;
}
.ab-range {
  width: 100%;
  accent-color: var(--primary-600);
  cursor: pointer;
}
.ab-range:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* segment builder (task 3.2) */
.seg-hint {
  font-size: 13px;
  color: var(--gray-500);
  margin: 0 0 10px;
  line-height: 1.45;
}
.seg-rule {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  margin-bottom: 8px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: var(--gray-50);
}
.seg-rule--locked {
  opacity: 0.7;
}
.seg-rule__row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.seg-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--gray-800);
  background: #fff;
  outline: none;
}
.seg-input:focus {
  border-color: var(--primary-600);
  outline: 2px solid var(--primary-100);
}
.seg-input:disabled {
  background: var(--gray-50);
  color: var(--gray-400);
  cursor: not-allowed;
}
.seg-del {
  flex: none;
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
.seg-del:hover:not(:disabled) {
  background: var(--gray-100);
  color: var(--danger-600);
}
.seg-del:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.seg-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px dashed var(--gray-300, var(--gray-200));
  border-radius: var(--radius-md);
  background: #fff;
  color: var(--primary-700, var(--primary-600));
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.seg-add:hover:not(:disabled) {
  background: var(--primary-100);
}
.seg-add:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.seg-preview {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  padding: 9px 11px;
  border-radius: var(--radius-md);
  background: var(--primary-100);
  color: var(--primary-800);
  font-size: 13px;
}
.seg-preview strong {
  font-weight: 600;
}
.seg-preview__muted {
  color: var(--gray-500);
}

.select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: #fff;
  cursor: pointer;
}
.select:hover {
  border-color: var(--gray-300);
}
.select--disabled {
  background: var(--gray-50);
  cursor: not-allowed;
}
.select__val {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--gray-800);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.select__menu {
  position: absolute;
  top: 72px;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-elevated);
  padding: 6px;
  z-index: 40;
  max-height: 280px;
  overflow-y: auto;
}
.select__opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
}
.select__opt:hover {
  background: var(--gray-50);
}
.select__opt-text {
  display: flex;
  flex-direction: column;
}
.select__opt-name {
  font-size: 14px;
  color: var(--gray-800);
}
.select__opt-sub {
  font-size: 12px;
  color: var(--gray-500);
}
.select__empty {
  padding: 12px 10px;
  font-size: 13px;
  color: var(--gray-500);
}

/* schedule toggle */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding: 12px 14px;
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}
.toggle-row:hover {
  border-color: var(--gray-300);
}
.toggle-row--on {
  background: var(--primary-50);
  border-color: var(--primary-200);
}
.toggle-row--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.toggle-row__title {
  font-weight: 500;
  font-size: 14px;
  color: var(--gray-800);
}
.toggle-row__sub {
  font-size: 13px;
  color: var(--gray-500);
  margin-top: 1px;
}
.switch {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  background: var(--gray-300);
  transition: background-color 150ms ease;
}
.switch--on {
  background: var(--primary-600);
}
.switch__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: var(--radius-full);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 150ms ease;
}
.switch--on .switch__knob {
  transform: translateX(18px);
}
.sched-fields {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.sched-fields__date {
  flex: 1;
}
.sched-fields__time {
  width: 116px;
}

.panel__footer {
  border-top: 1px solid var(--gray-100);
  padding: 16px 20px;
}
.help-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  border: none;
  background: transparent;
  color: var(--gray-600);
  font-family: var(--font-body);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
}
.help-btn:hover {
  color: var(--primary-600);
}
.help-btn .ph {
  font-size: 18px;
}

/* ---------- editor canvas ---------- */
.canvas {
  flex: 1;
  min-width: 0;
  position: relative;
  background: var(--gray-50);
}
.canvas__loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--gray-500);
  font-size: 14px;
  pointer-events: none;
}
.canvas__loading .ph {
  font-size: 28px;
}

/* ---------- modals ---------- */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(24, 21, 15, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
  animation: fade 180ms ease-out;
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
.modal {
  background: #fff;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-elevated);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal--sm {
  width: 480px;
}
.modal--md {
  width: 640px;
}
.modal--lg {
  width: 800px;
}
.modal--preview {
  height: 86vh;
}
.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--gray-100);
}
.modal__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 18px;
  color: var(--gray-800);
}
.modal__body {
  padding: 24px;
  overflow-y: auto;
}
.modal__body--list {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.modal__body--preview {
  padding: 0;
  flex: 1;
  background: var(--gray-100);
}
.modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--gray-100);
}

.preview-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}

.tpl-empty {
  padding: 40px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--gray-500);
}
.tpl-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  width: 100%;
}
.tpl-row:hover {
  background: var(--gray-50);
}
.tpl-row__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: var(--primary-50);
  color: var(--primary-600);
}
.tpl-row__icon .ph {
  font-size: 18px;
}
.tpl-row__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.tpl-row__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-800);
}
.tpl-row__sub {
  font-size: 12px;
  color: var(--gray-500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tpl-row__go {
  font-size: 16px;
  color: var(--gray-400);
}

/* ---------- toasts ---------- */
.toasts {
  position: fixed;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 80;
}
.toast {
  width: 360px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-elevated);
  padding: 12px 16px;
  border-left: 3px solid var(--primary-600);
  background: #fff;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  animation: toastin 200ms ease-out;
}
@keyframes toastin {
  from {
    opacity: 0;
    transform: translateX(16px);
  }
}
.toast__icon {
  font-size: 18px;
  margin-top: 1px;
}
.toast__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-800);
}
.toast__desc {
  font-size: 13px;
  color: var(--gray-600);
  margin-top: 2px;
}
</style>
