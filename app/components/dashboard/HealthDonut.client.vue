<script setup lang="ts">
// Client-only deliverability gauge (chart.js doughnut + center label).
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import type { ChartOptions, Plugin } from 'chart.js'

ChartJS.register(ArcElement, Tooltip)

const props = defineProps<{ deliverability: number | null }>()
const pct = computed(() => props.deliverability ?? 0)

const chartData = computed(() => ({
  labels: ['Delivered', 'Undelivered'],
  datasets: [
    {
      data: [pct.value, 100 - pct.value],
      backgroundColor: ['#1a7a46', '#e2ded9'],
      borderWidth: 0,
    },
  ],
}))

// Draws the big "%" + caption in the donut hole.
const centerText: Plugin<'doughnut'> = {
  id: 'centerText',
  afterDraw(chart) {
    const {
      ctx,
      chartArea: { left, right, top, bottom },
    } = chart
    const cx = (left + right) / 2
    const cy = (top + bottom) / 2
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#18150f'
    ctx.font = '500 28px "DM Sans", system-ui, sans-serif'
    ctx.fillText(
      props.deliverability == null ? '—' : `${pct.value.toFixed(0)}%`,
      cx,
      cy - 8,
    )
    ctx.fillStyle = '#787068'
    ctx.font = '400 11px Inter, system-ui, sans-serif'
    ctx.fillText('Deliverability', cx, cy + 14)
    ctx.restore()
  },
}

const options: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '70%',
  animation: { duration: 300 },
  plugins: {
    legend: { display: false },
    tooltip: { enabled: false },
  },
}
</script>

<template>
  <div class="donutwrap">
    <Doughnut :data="chartData" :options="options" :plugins="[centerText]" />
  </div>
</template>

<style scoped>
.donutwrap {
  width: 148px;
  height: 148px;
  margin: 0 auto;
}
</style>
