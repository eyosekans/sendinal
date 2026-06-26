<script setup lang="ts">
import type { Contact } from '~/types/contact'
import type { AttributeField } from '~/types/list'
import type { ContactStatus } from '#shared/schemas'

const props = withDefaults(
  defineProps<{
    open: boolean
    mode: 'create' | 'edit'
    contact: Contact | null
    /** Attribute fields to render in create mode (from the selected list). */
    schemaFields?: AttributeField[]
  }>(),
  { schemaFields: () => [] },
)
const emit = defineEmits<{ close: []; saved: [] }>()

const STATUS_OPTIONS: ContactStatus[] = [
  'active',
  'unsubscribed',
  'bounced',
  'complained',
]

const form = reactive({
  email: '',
  firstName: '',
  lastName: '',
  status: 'active' as ContactStatus,
})

/** Custom-attribute state. `fields` are schema-defined; `extras` are ad-hoc
 *  key/value pairs (existing keys not in the schema, plus user-added ones). */
const fields = ref<AttributeField[]>([])
const attrValues = ref<Record<string, string | boolean>>({})
const extras = ref<{ key: string; value: string }[]>([])
const schemaLoading = ref(false)

const loading = ref(false)
const error = ref('')

function resetAttrs() {
  attrValues.value = {}
  extras.value = []
}

/** Seed attrValues + extras from a contact's stored attributes given the schema. */
function seedFromContact(attrs: Record<string, unknown>, schema: AttributeField[]) {
  resetAttrs()
  const known = new Set(schema.map((f) => f.key))
  for (const f of schema) {
    const v = attrs[f.key]
    if (f.type === 'boolean')
      attrValues.value[f.key] = v === true || v === 'true'
    else attrValues.value[f.key] = v === undefined || v === null ? '' : String(v)
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (known.has(k)) continue
    extras.value.push({ key: k, value: v === null || v === undefined ? '' : String(v) })
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    error.value = ''
    if (props.mode === 'edit' && props.contact) {
      form.email = props.contact.email
      form.firstName = props.contact.first_name ?? ''
      form.lastName = props.contact.last_name ?? ''
      form.status = props.contact.status
      const attrs = (props.contact.attributes ?? {}) as Record<string, unknown>
      // Seed immediately from any keys already present, then refine with the
      // union schema across the contact's lists.
      fields.value = []
      seedFromContact(attrs, [])
      schemaLoading.value = true
      try {
        const res = await $fetch<{ fields: AttributeField[] }>(
          `/api/contacts/${props.contact.id}/attribute-schema`,
        )
        fields.value = res.fields
        seedFromContact(attrs, res.fields)
      } catch {
        // Non-fatal: fall back to ad-hoc fields for whatever keys exist.
        fields.value = []
      } finally {
        schemaLoading.value = false
      }
    } else {
      form.email = ''
      form.firstName = ''
      form.lastName = ''
      form.status = 'active'
      fields.value = props.schemaFields
      resetAttrs()
      for (const f of props.schemaFields) {
        attrValues.value[f.key] = f.type === 'boolean' ? false : ''
      }
    }
  },
)

const title = computed(() =>
  props.mode === 'edit' ? 'Edit contact' : 'Add contact',
)

function addExtra() {
  extras.value.push({ key: '', value: '' })
}
function removeExtra(i: number) {
  extras.value.splice(i, 1)
}

function buildAttributes(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields.value) {
    const v = attrValues.value[f.key]
    if (f.type === 'boolean') {
      if (v === true) out[f.key] = true
    } else if (f.type === 'number') {
      const s = String(v ?? '').trim()
      if (s !== '') {
        const n = Number(s)
        out[f.key] = Number.isFinite(n) ? n : s
      }
    } else {
      const s = String(v ?? '').trim()
      if (s !== '') out[f.key] = s
    }
  }
  for (const { key, value } of extras.value) {
    const k = key.trim()
    const val = value.trim()
    if (k && val) out[k] = val
  }
  return out
}

async function submit() {
  error.value = ''
  const email = form.email.trim()
  if (!email) {
    error.value = 'Email is required.'
    return
  }

  const payload = {
    email,
    firstName: form.firstName.trim() || undefined,
    lastName: form.lastName.trim() || undefined,
    attributes: buildAttributes(),
    ...(props.mode === 'edit' ? { status: form.status } : {}),
  }

  loading.value = true
  try {
    if (props.mode === 'edit' && props.contact) {
      await $fetch(`/api/contacts/${props.contact.id}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      await $fetch('/api/contacts', { method: 'POST', body: payload })
    }
    emit('saved')
  } catch (e: unknown) {
    const err = e as {
      data?: { statusMessage?: string }
      statusMessage?: string
    }
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
              <label class="field__label" for="cf-email">Email</label>
              <input
                id="cf-email"
                v-model="form.email"
                type="email"
                class="input input--mono"
                placeholder="name@example.com"
                autocomplete="off"
              />
            </div>

            <div class="field-row">
              <div class="field">
                <label class="field__label" for="cf-first">First name</label>
                <input
                  id="cf-first"
                  v-model="form.firstName"
                  type="text"
                  class="input"
                  placeholder="Eleanor"
                />
              </div>
              <div class="field">
                <label class="field__label" for="cf-last">Last name</label>
                <input
                  id="cf-last"
                  v-model="form.lastName"
                  type="text"
                  class="input"
                  placeholder="Knox"
                />
              </div>
            </div>

            <div v-if="mode === 'edit'" class="field">
              <label class="field__label" for="cf-status">Status</label>
              <select id="cf-status" v-model="form.status" class="input">
                <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">
                  {{ s.charAt(0).toUpperCase() + s.slice(1) }}
                </option>
              </select>
            </div>

            <!-- Custom attributes -->
            <div
              v-if="fields.length || extras.length || mode === 'edit'"
              class="attrs"
            >
              <div class="attrs__title">Custom attributes</div>

              <div
                v-for="f in fields"
                :key="f.key"
                class="field"
              >
                <label class="field__label">{{ f.label }}</label>
                <select
                  v-if="f.type === 'select'"
                  v-model="attrValues[f.key]"
                  class="input"
                >
                  <option value="">—</option>
                  <option v-for="o in f.options ?? []" :key="o" :value="o">
                    {{ o }}
                  </option>
                </select>
                <label v-else-if="f.type === 'boolean'" class="toggle">
                  <input v-model="attrValues[f.key]" type="checkbox" />
                  <span>{{ attrValues[f.key] ? 'Yes' : 'No' }}</span>
                </label>
                <input
                  v-else
                  v-model="attrValues[f.key]"
                  :type="f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'"
                  class="input"
                  :placeholder="f.label"
                />
              </div>

              <!-- Ad-hoc attributes -->
              <div v-for="(ex, i) in extras" :key="`ex-${i}`" class="extra-row">
                <input
                  v-model="ex.key"
                  type="text"
                  class="input input--sm input--mono"
                  placeholder="key"
                />
                <input
                  v-model="ex.value"
                  type="text"
                  class="input input--sm"
                  placeholder="value"
                />
                <button
                  type="button"
                  class="extra-remove"
                  aria-label="Remove field"
                  @click="removeExtra(i)"
                >
                  <i class="ph ph-x" />
                </button>
              </div>

              <button type="button" class="attr-add" @click="addExtra">
                <i class="ph ph-plus" /> Add custom field
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
              {{ mode === 'edit' ? 'Save changes' : 'Add contact' }}
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
  width: 480px;
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
  flex: 1;
  min-width: 0;
}
.field-row {
  display: flex;
  gap: 16px;
}
.field__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-700);
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
.input--mono {
  font-family: var(--font-mono);
  font-size: 13px;
}
.input--sm {
  height: 34px;
  font-size: 13px;
}
.input::placeholder {
  color: var(--gray-400);
}
.input:focus {
  border-color: var(--primary-600);
  outline: 2px solid var(--primary-100);
  outline-offset: 0;
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
  gap: 14px;
}
.attrs__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-700);
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--gray-700);
  cursor: pointer;
}
.toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary-600);
  cursor: pointer;
}
.extra-row {
  display: grid;
  grid-template-columns: 1fr 1.3fr 32px;
  gap: 8px;
  align-items: center;
}
.extra-remove {
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
.extra-remove:hover {
  background: var(--danger-100);
  border-color: var(--danger-100);
  color: var(--danger-600);
}
.extra-remove .ph {
  font-size: 14px;
}
.attr-add {
  display: flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  height: 32px;
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
  font-size: 14px;
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
