<script setup lang="ts">
import type { Layer, SelectedPoint } from '~/types/layers'

const { indexState, indexError, metas, states, visible, toggle, reload, retryLayer, tasks, apiError, eventsOnline, files, filesState, filesError, importError, loadFiles, startImport, removeLayer } = useLayers()
const selected = shallowRef<SelectedPoint | null>(null)
const form = ref<{ focus: () => void }>()

const readyLayers = computed<Layer[]>(() =>
  metas.value.flatMap((m) => {
    const s = states.value[m.id]
    return s?.status === 'ready' ? [s.layer] : []
  }),
)

// Drop the selection if its layer gets hidden, so the form never shows a point the map hides.
watch(visible, (v) => {
  if (selected.value && !v.has(selected.value.layer.id)) selected.value = null
})

async function onSelect(point: SelectedPoint, viaKeyboard: boolean) {
  selected.value = point
  if (viaKeyboard) {
    await nextTick()
    form.value?.focus()
  }
}
</script>

<template>
  <div class="shell">
    <a class="skip" href="#point-heading">Skip to point details</a>
    <aside class="side">
      <header>
        <h1>Layer Explorer</h1>
        <p>Toggle layers, then select a point to inspect its data.</p>
      </header>

      <p v-if="indexState === 'loading'" role="status" class="note">Loading layers…</p>
      <div v-else-if="indexState === 'error'" role="alert" class="note err">
        <p>Could not load layers: {{ indexError }}</p>
        <button type="button" @click="reload">Retry</button>
      </div>
      <LayerPanel
        v-else
        :metas="metas" :states="states" :visible="visible"
        :tasks="tasks" :api-error="apiError" :events-online="eventsOnline"
        :files="files" :files-state="filesState" :files-error="filesError" :import-error="importError"
        @toggle="toggle" @retry="retryLayer" @remove="removeLayer"
        @load-files="loadFiles" @start-import="startImport"
      />

      <PointForm ref="form" :point="selected" @close="selected = null" />
    </aside>

    <main class="main">
      <ClientOnly>
        <MapView :layers="readyLayers" :visible="visible" :selected="selected" @select="onSelect" />
      </ClientOnly>
    </main>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: minmax(300px, 380px) 1fr; height: 100%; }
.side { overflow-y: auto; padding: 1rem; display: grid; gap: 1rem; align-content: start; border-right: 1px solid var(--color-border); background: var(--color-bg-deep-space); }
h1 { margin: 0; font-size: 1.5rem; background: linear-gradient(90deg, var(--color-accent-arctic-cyan), #b79cff); -webkit-background-clip: text; background-clip: text; color: transparent; }
header p { margin: 0.25rem 0 0; color: var(--color-text-secondary); font-size: 0.875rem; }
.main { min-height: 0; }
.note { margin: 0; color: var(--color-text-secondary); }
.err { color: var(--color-danger); }
.err button { background: var(--color-surface-raised); color: var(--color-text-primary); border: 1px solid var(--color-accent-royal-purple); border-radius: 6px; padding: 0.4rem 1rem; min-height: 40px; cursor: pointer; font: inherit; }
.skip { position: absolute; left: -999px; top: 0; z-index: 2000; background: var(--color-accent-arctic-cyan); color: #000; padding: 0.5rem 1rem; }
.skip:focus { left: 0; }
@media (max-width: 800px) {
  .shell { grid-template-columns: 1fr; grid-template-rows: 55vh auto; height: auto; min-height: 100%; }
  .main { order: -1; }
  .side { border-right: 0; border-top: 1px solid var(--color-border); overflow: visible; }
}
</style>
