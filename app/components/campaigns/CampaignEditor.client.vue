<script setup lang="ts">
// Client-only (.client.vue) wrapper around Unlayer's vue-email-editor. The
// editor loads a remote embed script and touches `window`, so it must never
// render during SSR.
import { EmailEditor } from 'vue-email-editor'

/** Minimal surface of the underlying Unlayer instance we use. */
interface Unlayer {
  loadDesign: (design: object) => void
  exportHtml: (cb: (data: { html: string; design: object }) => void) => void
  addEventListener: (event: string, cb: (data: unknown) => void) => void
  registerCallback: (
    type: 'image',
    cb: (
      file: { attachments: File[] },
      done: (res: { progress: number; url: string }) => void,
    ) => void,
  ) => void
}

const props = defineProps<{
  /** Unlayer design JSON to load once the editor is ready. */
  initialDesign?: object | null
}>()

// Force Unlayer into email mode. Without this the editor defaults to a web
// layout and exportHtml() emits a flexbox/div document (`.u-row{display:flex}`,
// `flex:0 0 33%`, `100vh`) that looks perfect in the browser preview but
// collapses in real email clients (Outlook has no flex support; Gmail/Yandex
// strip or ignore it). Email mode makes exportHtml() produce table-based,
// inline-styled, Outlook-safe HTML.
const editorOptions = { displayMode: 'email' as const }

const emit = defineEmits<{ ready: []; change: [] }>()

const editorRef = ref<{ editor: Unlayer } | null>(null)
let initialised = false

function init() {
  if (initialised) return
  const unlayer = editorRef.value?.editor
  if (!unlayer) return
  initialised = true

  // Route the editor's "upload image" action through our Supabase-backed API.
  unlayer.registerCallback('image', async (file, done) => {
    try {
      const form = new FormData()
      form.append('file', file.attachments[0]!)
      const { url } = await $fetch<{ url: string }>('/api/uploads/image', {
        method: 'POST',
        body: form,
      })
      done({ progress: 100, url })
    } catch {
      done({ progress: 100, url: '' })
    }
  })

  if (props.initialDesign) unlayer.loadDesign(props.initialDesign)

  // Surface user edits so the builder can autosave.
  unlayer.addEventListener('design:updated', () => emit('change'))

  emit('ready')
}

/** Load a design (e.g. when applying a template after the editor is ready). */
function loadDesign(design: object) {
  editorRef.value?.editor.loadDesign(design)
}

/** Resolve with the current exported HTML + design JSON. */
function exportHtml(): Promise<{ html: string; design: object }> {
  return new Promise((resolve, reject) => {
    const unlayer = editorRef.value?.editor
    if (!unlayer) {
      reject(new Error('Editor not ready'))
      return
    }
    unlayer.exportHtml((data) => resolve({ html: data.html, design: data.design }))
  })
}

defineExpose({ loadDesign, exportHtml })
</script>

<template>
  <EmailEditor
    ref="editorRef"
    class="editor"
    :min-height="'100%'"
    :options="editorOptions"
    @ready="init"
    @load="init"
  />
</template>

<style scoped>
.editor {
  width: 100%;
  height: 100%;
}
/* Unlayer renders an iframe; make it fill the host. */
.editor :deep(iframe) {
  border: none !important;
}
</style>
