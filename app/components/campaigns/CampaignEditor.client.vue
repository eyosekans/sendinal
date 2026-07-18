<script setup lang="ts">
// Client-only (.client.vue) wrapper around Unlayer's vue-email-editor. The
// editor loads a remote embed script and touches `window`, so it must never
// render during SSR.
import { EmailEditor } from 'vue-email-editor'
import {
  UNSUBSCRIBE_PLACEHOLDER,
  designHasUnsubscribe,
  ensureUnsubscribeRow,
} from '#shared/unsubscribe'

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
// `specialLinks` offers the per-recipient unsubscribe link in the link picker,
// so users can re-insert it anywhere after editing the footer text. The embed
// runtime documents an array here, but the published TS type wants a keyed
// map — cast to keep the documented runtime shape.
const editorOptions = {
  displayMode: 'email' as const,
  specialLinks: [
    { name: 'Unsubscribe', href: UNSUBSCRIBE_PLACEHOLDER, target: '_self' },
  ] as unknown as Record<string, { name: string; href: string; target?: string }>,
}

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

  // Every design must carry the mandatory unsubscribe block (compliance). A
  // blank editor also starts from a design holding just that row.
  unlayer.loadDesign(
    ensureUnsubscribeRow(props.initialDesign ?? { body: { rows: [] } }).design,
  )

  // Surface user edits so the builder can autosave.
  unlayer.addEventListener('design:updated', () => emit('change'))

  emit('ready')
}

/** Load a design (e.g. when applying a template after the editor is ready).
 *  The mandatory unsubscribe block is appended if the design lacks one. */
function loadDesign(design: object) {
  editorRef.value?.editor.loadDesign(ensureUnsubscribeRow(design).design)
}

function rawExport(unlayer: Unlayer): Promise<{ html: string; design: object }> {
  return new Promise((resolve) => {
    unlayer.exportHtml((data) => resolve({ html: data.html, design: data.design }))
  })
}

/** Resolve with the current exported HTML + design JSON. Safety net: if the
 *  unsubscribe block somehow went missing, re-add it and export again. */
async function exportHtml(): Promise<{ html: string; design: object }> {
  const unlayer = editorRef.value?.editor
  if (!unlayer) throw new Error('Editor not ready')

  const first = await rawExport(unlayer)
  if (designHasUnsubscribe(first.design)) return first

  unlayer.loadDesign(ensureUnsubscribeRow(first.design).design)
  return rawExport(unlayer)
}

defineExpose({ loadDesign, exportHtml })
</script>

<template>
  <!-- editor-id pins the container id: without it the library mints a new
       counter-based id per instance, and a remount while embed.js is still
       loading makes createEditor look up a stale id, throw, and leave the
       editor stuck on "Loading editor…". -->
  <EmailEditor
    ref="editorRef"
    editor-id="campaign-editor"
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
