<script setup lang="ts">
// Client-only engagement chart: Opens (solid) + Clicks (dashed) over time.
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
} from 'chart.js'
import type { ChartOptions } from 'chart.js'

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
)

const props = defineProps<{
  labels: string[]
  opens: number[]
  clicks: number[]
}>()

const chartData = computed(() => ({
  labels: props.labels,
  datasets: [
    {
      label: 'Opens',
      data: props.opens,
      borderColor: '#0f5247',
      backgroundColor: 'rgba(15,82,71,0.05)',
      fill: true,
      tension: 0,
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: '#0f5247',
    },
    {
      label: 'Clicks',
      data: props.clicks,
      borderColor: '#94d5c8',
      borderDash: [2, 6],
      fill: false,
      tension: 0,
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: '#94d5c8',
    },
  ],
}))

const options: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#28241e',
      padding: 10,
      cornerRadius: 8,
      callbacks: {
        label: (item) =>
          `${item.dataset.label}: ${(item.parsed.y ?? 0).toLocaleString('en-US')}`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: {
        color: '#a09990',
        font: { size: 11 },
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 8,
      },
    },
    y: {
      beginAtZero: true,
      border: { display: false },
      grid: { color: '#f0eeeb' },
      ticks: {
        color: '#a09990',
        font: { size: 11 },
        maxTicksLimit: 4,
        callback: (v) => {
          const n = Number(v)
          return n >= 1000 ? `${n / 1000}k` : `${n}`
        },
      },
    },
  },
}
</script>

<template>
  <div class="linewrap">
    <Line :data="chartData" :options="options" />
  </div>
</template>

<style scoped>
.linewrap {
  width: 100%;
  height: 100%;
  min-height: 320px;
}
</style>
