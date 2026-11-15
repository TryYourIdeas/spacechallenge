<script setup lang="ts">
import type { GlobalFilter, Layer, LayerFilter, SelectedPoint } from '~/types/layers'
import { defaultGlobalFilter, filtersDiffer, matchesGlobalFilter, matchesLayerFilter } from '~/utils/filters'

const { indexState, indexError, metas, states, visible, toggle, reload, retryLayer, apiError, fetchClusters, fetchPoints, fetchPoint } = useLayers()
const selected = shallowRef<SelectedPoint | null>(null)
const form = ref<{ focus: () => void }>()
const mapView = ref<{ fitFiltered: () => void }>()

// `draft*` is what the panel edits; `globalFilter`/`layerFilters` are the APPLIED filters that
// drive the map, the queries and the counts. "Apply filters" copies draft to applied.
const draftGlobal = ref<GlobalFilter>(defaultGlobalFilter())
const draftLayers = ref<Record<string, LayerFilter>>({})
const globalFilter = ref<GlobalFilter>(defaultGlobalFilter())
const layerFilters = ref<Record<string, LayerFilter>>({})
const dirty = computed(() => filtersDiffer(
  { global: draftGlobal.value, layers: draftLayers.value },
  { global: globalFilter.value, layers: layerFilters.value },
))
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const remoteCounts = ref<Record<string, number>>({})

const readyLayers = computed<Layer[]>(() =>
  metas.value.flatMap((m) => {
    const s = states.value[m.id]
    return s?.status === 'ready' ? [s.layer] : []
  }),
)

function updateGlobalFilter(next: GlobalFilter) {
  draftGlobal.value = next
  // Auto-fit is a map preference, not a filter: it takes effect immediately.
  if (next.autoFit !== globalFilter.value.autoFit) globalFilter.value = { ...globalFilter.value, autoFit: next.autoFit }
}

function updateLayerFilter(id: string, filter: LayerFilter) {
  draftLayers.value = { ...draftLayers.value, [id]: filter }
}

function applyFilters() {
  globalFilter.value = clone(draftGlobal.value)
  layerFilters.value = clone(draftLayers.value)
  checkSelectionAgainstFilters()
}

/** Clearing is applied at once: there is nothing left to review. */
function resetAllFilters() {
  draftGlobal.value = defaultGlobalFilter()
  draftLayers.value = {}
  applyFilters()
}

function checkSelectionAgainstFilters() {
  const s = selected.value
  if (!s || s.status === 'loading') return
  const layerState = states.value[s.layer.id]
  if (layerState?.status !== 'ready') return
  const l = layerState.layer
  if (
    !matchesGlobalFilter(s.row, l.fields, globalFilter.value) ||
    !matchesLayerFilter(s.row, l, layerFilters.value[l.id])
  ) {
    clearSelection()
  }
}

// Drop the selection if its layer gets hidden, so the form never shows a point the map hides.
watch(visible, (v) => {
  if (selected.value && !v.has(selected.value.layer.id)) clearSelection()
})

// Points of server layers arrive without their field values; fetch them once selected.
let detail: AbortController | undefined

async function loadDetail(point: SelectedPoint) {
  detail?.abort()
  const ctl = (detail = new AbortController())
  selected.value = { ...point, status: 'loading' }
  try {
    const row = await fetchPoint(point.layer.id, point.row.id, ctl.signal)
    if (ctl.signal.aborted) return
    selected.value = { layer: point.layer, fields: point.fields, row }
  } catch (e) {
    if (ctl.signal.aborted) return
    selected.value = { ...point, status: 'error', error: e instanceof Error ? e.message : 'Request failed' }
  }
}

function clearSelection() {
  detail?.abort()
  selected.value = null
}
onBeforeUnmount(() => detail?.abort())

async function onSelect(point: SelectedPoint, viaKeyboard: boolean) {
  if ((point.layer as Layer).remote) void loadDetail(point)
  else { detail?.abort(); selected.value = point }

  if (viaKeyboard) {
    await nextTick()
    form.value?.focus()
  }
}
</script>

<template>
  <div class="shell">
    <a v-if="selected" class="skip" href="#point-heading">Skip to point details</a>
    <aside class="side">
      <header>
        <h1>Layer Explorer</h1>
        <p>Toggle layers, filter by region, cross-layer proximity, mineral or similarity, and inspect points.</p>
      </header>

      <p v-if="indexState === 'loading'" role="status" class="note">Loading layers…</p>
      <div v-else-if="indexState === 'error'" role="alert" class="note err">
        <p>Could not load layers: {{ indexError }}</p>
        <button type="button" @click="reload">Retry</button>
      </div>
      <LayerPanel
        v-else
        :metas="metas" :states="states" :visible="visible"
        :api-error="apiError"
        :global-filter="draftGlobal" :layer-filters="draftLayers"
        :applied-global-filter="globalFilter" :applied-layer-filters="layerFilters" :dirty="dirty"
        :remote-counts="remoteCounts"
        @toggle="toggle" @retry="retryLayer"
        @apply="applyFilters"
        @update:global-filter="updateGlobalFilter"
        @update:layer-filter="updateLayerFilter"
        @reset-all-filters="resetAllFilters"
        @fit-filtered="mapView?.fitFiltered()"
      />
    </aside>

    <main class="main">
      <ClientOnly>
        <MapView
          ref="mapView"
          :layers="readyLayers" :visible="visible" :selected="selected"
          :global-filter="globalFilter" :layer-filters="layerFilters"
          :fetch-clusters="fetchClusters" :fetch-points="fetchPoints"
          @select="onSelect" @remote-counts="remoteCounts = $event"
        />
      </ClientOnly>
      <PointForm ref="form" :point="selected" @close="clearSelection" @retry="selected && loadDetail(selected)" />
    </main>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: minmax(320px, 410px) 1fr; height: 100%; }
.side { overflow-y: auto; padding: 1rem; display: grid; gap: 1rem; align-content: start; border-right: 1px solid var(--color-border); background: var(--color-bg-deep-space); }
h1 { margin: 0; font-size: 1.5rem; background: linear-gradient(90deg, var(--color-accent-arctic-cyan), #b79cff); -webkit-background-clip: text; background-clip: text; color: transparent; }
header p { margin: 0.25rem 0 0; color: var(--color-text-secondary); font-size: 0.875rem; }
.main { min-height: 0; position: relative; }
.note { margin: 0; color: var(--color-text-secondary); }
.err { color: var(--color-danger); }
.err button { background: var(--color-surface-raised); color: var(--color-text-primary); border: 1px solid var(--color-accent-royal-purple); border-radius: 6px; padding: 0.4rem 1rem; min-height: 40px; cursor: pointer; font: inherit; }
.skip { position: absolute; left: -999px; top: 0; z-index: 2000; background: var(--color-accent-arctic-cyan); color: #000; padding: 0.5rem 1rem; }
.skip:focus { left: 0; }
@media (max-width: 800px) {
  .shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: 55vh auto; height: auto; min-height: 100%; }
  .main { order: -1; }
  .side { border-right: 0; border-top: 1px solid var(--color-border); overflow: visible; }
}
</style>
