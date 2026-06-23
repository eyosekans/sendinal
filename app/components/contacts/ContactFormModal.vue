<script setup lang="ts">
import type { Contact } from '~/types/contact'
import type { ContactStatus } from '#shared/schemas'

const props = defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  contact: Contact | null
}>()
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
const loading = ref(false)
const error = ref('')

// Reset the form each time the modal opens.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    if (props.mode === 'edit' && props.contact) {
      form.email = props.contact.email
      form.firstName = props.contact.first_name ?? ''
      form.lastName = props.contact.last_name ?? ''
      form.status = props.contact.status
    } else {
      form.email = ''
      form.firstName = ''
      form.lastName = ''
      form.status = 'active'
    }
  },
)

const title = computed(() =>
  props.mode === 'edit' ? 'Edit contact' : 'Add contact',
)

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
}
.modal {
  width: 480px;
  max-width: calc(100vw - 48px);
  background: #fff;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-elevated);
  animation: dc-modalin 180ms ease-out;
  overflow: hidden;
}
.modal__header {
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
.error {
  margin: 0;
  font-size: 13px;
  color: var(--danger-600);
}

.modal__footer {
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
