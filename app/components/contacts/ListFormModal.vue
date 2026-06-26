<script setup lang="ts">
import type { List, AttributeField } from '~/types/list'
import type { AttributeFieldType } from '#shared/schemas'

const props = defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  list: List | null
}>()
const emit = defineEmits<{ close: []; saved: [] }>()

/** Editor row — `options` kept as a raw comma string for select fields. */
type FieldRow = {
  key: string
  label: string
  type: AttributeFieldType
  optionsText: string
  keyTouched: boolean
}

const TYPE_OPTIONS: { value: AttributeFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Dropdown' },
]

const form = reactive({ name: '', description: '' })
const fields = ref<FieldRow[]>([])
const loading = ref(false)
const error = ref('')

/** Derive a snake_case key from a label. */
function slugify(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'f_$1')
    .slice(0, 40)
}

function blankRow(): FieldRow {
  return { key: '', label: '', type: 'text', optionsText: '', keyTouched: false }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    if (props.mode === 'edit' && props.list) {
      form.name = props.list.name
      form.description = props.list.description ?? ''
      fields.value = (props.list.attribute_schema ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        optionsText: (f.options ?? []).join(', '),
        keyTouched: true,
      }))
    } else {
      form.name = ''
      form.description = ''
      fields.value = []
    }
  },
)

const title = computed(() =>
  props.mode === 'edit' ? 'Edit list' : 'Create list',
)

function onLabelInput(row: FieldRow) {
  if (!row.keyTouched) row.key = slugify(row.label)
}
function addField() {
  fields.value.push(blankRow())
}
function removeField(i: number) {
  fields.value.splice(i, 1)
}

function buildSchema(): AttributeField[] {
  return fields.value.map((r) => {
    const field: AttributeField = {
      key: r.key.trim(),
      label: r.label.trim(),
      type: r.type,
    }
    if (r.type === 'select') {
      field.options = r.optionsText
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    }
    return field
  })
}

async function submit() {
  error.value = ''
  if (!form.name.trim()) {
    error.value = 'List name is required.'
    return
  }
  // Lightweight client checks before the server's zod validation.
  for (const r of fields.value) {
    if (!r.label.trim() || !r.key.trim()) {
      error.value = 'Each attribute needs a label and a key.'
      return
    }
    if (r.type === 'select' && !r.optionsText.trim()) {
      error.value = `"${r.label}" is a dropdown — add at least one option.`
      return
    }
  }

  const payload = {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    attributeSchema: buildSchema(),
  }

  loading.value = true
  try {
    if (props.mode === 'edit' && props.list) {
      await $fetch(`/api/lists/${props.list.id}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      await $fetch('/api/lists', { method: 'POST', body: payload })
    }
    emit('saved')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click="emit('close')">
      <div class="modal" @click.stop>
        <div class="modal__header">
          <h2 class="modal__title">{{ title }}</h2>
          <button
            type="button"
            class="icon-ghost"
            aria-label="Close"
            @click="emit('close')"
          >
            <i class="ph ph-x" />
          </button>
        </div>

        <form @submit.prevent="submit">
          <div class="modal__body">
            <div class="field">
              <label class="field__label" for="lf-name">List name</label>
              <input
                id="lf-name"
                v-model="form.name"
                type="text"
                class="input"
                placeholder="e.g. Product Updates"
              />
            </div>

            <div class="field">
              <label class="field__label" for="lf-desc">Description</label>
              <textarea
                id="lf-desc"
                v-model="form.description"
                class="input textarea"
                rows="2"
                placeholder="Optional — what this list is for"
              />
            </div>

            <div class="attrs">
              <div class="attrs__head">
                <div>
                  <div class="attrs__title">Custom attributes</div>
                  <div class="attrs__hint">
                    Define the extra fields contacts in this list carry. They
                    appear in the contact form and CSV import.
                  </div>
                </div>
              </div>

              <div v-if="fields.length" class="attr-list">
                <div v-for="(row, i) in fields" :key="i" class="attr-row">
                  <div class="attr-grid">
                    <div class="field">
                      <label class="field__label field__label--sm">Label</label>
                      <input
                        v-model="row.label"
                        type="text"
                        class="input input--sm"
                        placeholder="Company"
                        @input="onLabelInput(row)"
                      />
                    </div>
                    <div class="field">
                      <label class="field__label field__label--sm">Key</label>
                      <input
                        v-model="row.key"
                        type="text"
                        class="input input--sm input--mono"
                        placeholder="company"
                        @input="row.keyTouched = true"
                      />
                    </div>
                    <div class="field field--type">
                      <label class="field__label field__label--sm">Type</label>
                      <select v-model="row.type" class="input input--sm">
                        <option
                          v-for="t in TYPE_OPTIONS"
                          :key="t.value"
                          :value="t.value"
                        >
                          {{ t.label }}
                        </option>
                      </select>
                    </div>
                    <button
                      type="button"
                      class="attr-remove"
                      aria-label="Remove attribute"
                      @click="removeField(i)"
                    >
                      <i class="ph ph-trash" />
                    </button>
                  </div>
                  <div v-if="row.type === 'select'" class="field attr-options">
                    <label class="field__label field__label--sm">
                      Options (comma-separated)
                    </label>
                    <input
                      v-model="row.optionsText"
                      type="text"
                      class="input input--sm"
                      placeholder="Free, Pro, Enterprise"
                    />
                  </div>
                </div>
              </div>

              <button type="button" class="attr-add" @click="addField">
                <i class="ph ph-plus" /> Add attribute
              </button>
            </div>

            <p v-if="error" class="error">{{ error }}</p>
          </div>

          <div class="modal__footer">
            <button
              type="button"
              class="btn-secondary"
              :disabled="loading"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button type="submit" class="btn-primary" :disabled="loading">
              <i v-if="loading" class="ph ph-circle-notch spin" />
              {{ mode === 'edit' ? 'Save changes' : 'Create list' }}
            </button>
          </div>
        </form>
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
  animation: dc-overlayin 120ms ease;
  padding: 24px;
}
.modal {
  width: 560px;
  max-width: 100%;
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-elevated);
  animation: dc-modalin 180ms ease-out;
  overflow: hidden;
}
.modal__header {
  flex: none;
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
.icon-ghost {
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
.icon-ghost:hover {
  background: var(--gray-100);
  color: var(--gray-800);
}
.icon-ghost .ph {
  font-size: 18px;
}

.modal__body {
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.field__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-700);
}
.field__label--sm {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--gray-500);
}
.input {
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: #fff;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--gray-800);
  outline: none;
  width: 100%;
}
.textarea {
  height: auto;
  padding: 8px 12px;
  resize: vertical;
  line-height: 1.5;
}
.input--sm {
  height: 34px;
  font-size: 13px;
}
.input--mono {
  font-family: var(--font-mono);
  font-size: 12px;
}
.input::placeholder {
  color: var(--gray-400);
}
.input:focus {
  border-color: var(--primary-600);
  outline: 2px solid var(--primary-100);
}
select.input {
  appearance: none;
  cursor: pointer;
}

.attrs {
  border-top: 1px solid var(--gray-100);
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.attrs__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-700);
}
.attrs__hint {
  font-size: 12px;
  color: var(--gray-500);
  line-height: 1.5;
  margin-top: 2px;
}
.attr-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.attr-row {
  padding: 12px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: var(--gray-50);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.attr-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.9fr 32px;
  gap: 10px;
  align-items: end;
}
.field--type {
  min-width: 0;
}
.attr-remove {
  width: 32px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: #fff;
  color: var(--gray-500);
  cursor: pointer;
}
.attr-remove:hover {
  background: var(--danger-100);
  border-color: var(--danger-100);
  color: var(--danger-600);
}
.attr-remove .ph {
  font-size: 15px;
}
.attr-options {
  margin-top: 0;
}
.attr-add {
  display: flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  height: 34px;
  padding: 0 12px;
  border: 1px dashed var(--gray-300);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--gray-600);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.attr-add:hover {
  border-color: var(--primary-600);
  color: var(--primary-600);
}
.attr-add .ph {
  font-size: 15px;
}

.error {
  margin: 0;
  font-size: 13px;
  color: var(--danger-600);
}

.modal__footer {
  flex: none;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--gray-100);
}
.btn-secondary {
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
}
.btn-secondary:hover {
  background: var(--gray-50);
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
}
.btn-primary:hover {
  background: var(--primary-800);
}
.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
