<script setup lang="ts">
defineProps<{
  open: boolean
  title: string
  body: string
  confirmLabel: string
  loading?: boolean
}>()
const emit = defineEmits<{ cancel: []; confirm: [] }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click="emit('cancel')">
      <div class="modal" @click.stop>
        <div class="modal__header">
          <div class="modal__icon">
            <i class="ph ph-warning" />
          </div>
          <h2 class="modal__title">{{ title }}</h2>
        </div>
        <div class="modal__body">
          <p class="modal__text">{{ body }}</p>
        </div>
        <div class="modal__footer">
          <button
            type="button"
            class="btn-secondary"
            :disabled="loading"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-danger"
            :disabled="loading"
            @click="emit('confirm')"
          >
            <i v-if="loading" class="ph ph-circle-notch spin" />
            <i v-else class="ph ph-trash" />
            {{ confirmLabel }}
          </button>
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
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--gray-100);
}
.modal__icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--danger-100);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.modal__icon .ph {
  font-size: 18px;
  color: var(--danger-600);
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
}
.modal__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--gray-600);
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
.btn-danger {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--danger-100);
  border-radius: var(--radius-md);
  background: var(--danger-600);
  color: #fff;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.btn-danger:hover {
  background: #a31f24;
}
.btn-danger:disabled,
.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-danger .ph {
  font-size: 16px;
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
