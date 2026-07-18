<script setup lang="ts">
import { PAGE_SIZES } from '~/composables/useListControls'

const props = defineProps<{
  /** Total rows across all pages (after filters). */
  total: number
  /** Rows shown on the current page. */
  shown: number
  /** Noun for the "Showing X of Y …" text (e.g. "contacts"). */
  noun: string
}>()

const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })

const pageCount = computed(() =>
  Math.max(1, Math.ceil(props.total / pageSize.value)),
)
const canPrev = computed(() => page.value > 1)
const canNext = computed(() => page.value < pageCount.value)

// v-model (not :value/@change) so SSR marks the right <option> as selected —
// a bare value binding on <select> doesn't survive server rendering.
const sizeProxy = computed({
  get: () => pageSize.value,
  set: (v: number) => {
    pageSize.value = Number(v)
  },
})
</script>

<template>
  <div class="tfoot">
    <span class="tfoot__text">Showing {{ shown }} of {{ total }} {{ noun }}</span>
    <div class="tfoot__nav">
      <select v-model="sizeProxy" class="tfoot__size" aria-label="Rows per page">
        <option v-for="s in PAGE_SIZES" :key="s" :value="s">
          {{ s }} / page
        </option>
      </select>
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
</template>

<style scoped>
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
  gap: 8px;
  align-items: center;
}
.tfoot__size {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: #fff;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--gray-600);
  outline: none;
  cursor: pointer;
}
.tfoot__size:focus {
  border-color: var(--primary-600);
  outline: 2px solid var(--primary-100);
  outline-offset: 0;
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
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-700);
  cursor: pointer;
}
.pager:hover:not(:disabled) {
  background: var(--gray-100);
}
.pager:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pager .ph {
  font-size: 13px;
}
</style>
