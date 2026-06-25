<script setup lang="ts">
// Client-only: chart.js touches <canvas>, so it must not render during SSR.
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from 'chart.js'
import type { ChartOptions } from 'chart.js'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip)

const props = defineProps<{ labels: string[]; values: number[] }>()

// Highlight the tallest bar in the brand accent, the rest in the tint.
const maxIdx = computed(() => {
  let mi = 0
  props.values.forEach((v, i) => {
    if (v > (props.values[mi] ?? 0)) mi = i
  })
  return mi
})

const chartData = computed(() => ({
  labels: props.labels,
  datasets: [
    {
      data: props.values,
      backgroundColor: props.values.map((_, i) =>
        i === maxIdx.value ? '#1a7a6e' : '#c8ebe4',
      ),
      hoverBackgroundColor: '#1a7a6e',
      borderRadius: 5,
      borderSkipped: false as const,
      barPercentage: 0.78,
      categoryPercentage: 0.9,
    },
  ],
}))

const options: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#28241e',
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
      callbacks: {
        label: (item) =>
          `${(item.parsed.y ?? 0).toLocaleString('en-US')} delivered`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { display: false },
      border: { display: false },
    },
    y: {
      display: false,
      beginAtZero: true,
      grid: { display: false },
    },
  },
}
</script>

<template>
  <div class="chartwrap">
    <Bar :data="chartData" :options="options" />
  </div>
</template>

<style scoped>
.chartwrap {
  height: 180px;
}
</style>
