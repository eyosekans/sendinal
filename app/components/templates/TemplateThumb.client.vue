<script setup lang="ts">
/**
 * Renders a template's real HTML as a scaled-down thumbnail (task 3.4). The
 * email is drawn at its natural 600px width inside a sandboxed iframe, then the
 * iframe element is scaled to the card width so the top of the email shows.
 * `.client` only (uses ResizeObserver + iframe); `pointer-events:none` keeps the
 * card hover/overlay working over it.
 */
const props = defineProps<{ html: string }>()

const BASE_W = 600
const root = ref<HTMLElement | null>(null)
const scale = ref(0.42)
const frameH = ref(720)

function measure() {
  const el = root.value
  if (!el) return
  const w = el.clientWidth
  const h = el.clientHeight
  if (w > 0) {
    scale.value = w / BASE_W
    frameH.value = h / scale.value
  }
}

let ro: ResizeObserver | null = null
onMounted(() => {
  measure()
  ro = new ResizeObserver(measure)
  if (root.value) ro.observe(root.value)
})
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <div ref="root" class="tt">
    <iframe
      :srcdoc="props.html"
      sandbox=""
      scrolling="no"
      tabindex="-1"
      aria-hidden="true"
      class="tt__frame"
      :style="{
        width: BASE_W + 'px',
        height: frameH + 'px',
        transform: `scale(${scale})`,
      }"
    />
  </div>
</template>

<style scoped>
.tt {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #fff;
}
.tt__frame {
  position: absolute;
  top: 0;
  left: 0;
  border: 0;
  transform-origin: top left;
  pointer-events: none;
}
</style>
