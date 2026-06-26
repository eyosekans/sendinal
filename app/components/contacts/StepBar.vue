<script setup lang="ts">
/**
 * Wizard progress indicator. `active` is 1-based; pass 6 (one past the last
 * step) to render every step as complete (used by the Results state).
 */
const props = defineProps<{ active: number }>()

const LABELS = ['Upload', 'Map columns', 'Configure', 'Review', 'Import']

const steps = computed(() =>
  LABELS.map((label, i) => {
    const n = i + 1
    const state = n < props.active ? 'done' : n === props.active ? 'active' : 'future'
    return { n, label, state, isLast: n === LABELS.length, lineDone: n < props.active }
  }),
)
</script>

<template>
  <div class="stepbar">
    <div
      v-for="s in steps"
      :key="s.n"
      class="item"
      :class="{ 'item--last': s.isLast }"
    >
      <div class="col">
        <div class="circle" :class="`circle--${s.state}`">
          <svg
            v-if="s.state === 'done'"
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M3.5 8.5l3 3 6-7"
              stroke="#fff"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span v-else>{{ s.n }}</span>
        </div>
        <div class="label" :class="`label--${s.state}`">{{ s.label }}</div>
      </div>
      <div
        v-if="!s.isLast"
        class="line"
        :class="{ 'line--done': s.lineDone }"
      />
    </div>
  </div>
</template>

<style scoped>
.stepbar {
  display: flex;
  align-items: flex-start;
  width: 100%;
}
.item {
  display: flex;
  align-items: flex-start;
  flex: 1 1 auto;
}
.item--last {
  flex: 0 0 auto;
}
.col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 84px;
  flex: 0 0 auto;
}
.circle {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  flex: 0 0 auto;
}
.circle--done {
  background: var(--primary-600);
  color: #fff;
}
.circle--active {
  background: var(--primary-600);
  color: #fff;
  box-shadow: 0 0 0 4px var(--primary-50);
}
.circle--future {
  background: #fff;
  border: 1.5px solid var(--gray-300);
  color: var(--gray-400);
}
.label {
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  text-align: center;
  white-space: nowrap;
}
.label--done {
  color: var(--primary-800);
}
.label--active {
  color: var(--primary-600);
}
.label--future {
  color: var(--gray-400);
}
.line {
  flex: 1 1 auto;
  height: 2px;
  background: var(--gray-200);
  margin-top: 14px;
  border-radius: 1px;
}
.line--done {
  background: var(--primary-200);
}
</style>
