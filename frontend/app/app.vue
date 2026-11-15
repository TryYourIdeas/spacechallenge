<script setup lang="ts">
import type { GlobalFilter, Layer, LayerFilter, SelectedPoint } from '~/types/layers'
import { defaultGlobalFilter, matchesGlobalFilter, matchesLayerFilter, regionCenter } from '~/utils/filters'

const { indexState, indexError, metas, states, visible, toggle, reload, retryLayer, tasks, apiError, eventsOnline, files, filesState, filesError, importError, loadFiles, startImport, removeLayer, fetchClusters, fetchPoints, fetchPoint } = useLayers()
const selected = shallowRef<SelectedPoint | null>(null)
const form = ref<{ focus: () => void }>()
const mapView = ref<{ fitFiltered: () => void; getMapCenter: () => { lat: number; lon: number } | null }>()

const globalFilter = ref<GlobalFilter>(defaultGlobalFilter())
const layerFilters = ref<Record<string, LayerFilter>>({})
const remoteCounts = ref<Record<string, number>>({})
const pickingOrigin = ref(false)

const readyLayers = computed<Layer[]>(() =>
  metas.value.flatMap((m) => {
    const s = states.value[m.id]
    return s?.status === 'ready' ? [s.layer] : []
  }),
)

function updateGlobalFilter(next: GlobalFilter) {
  const prev = globalFilter.value
  const regionChanged = next.continent !== prev.continent || next.country !== prev.country

  if (regionChanged) {
    const rc = regionCenter(next.continent, next.country)
    if (rc && (next.distanceKm !== null || next.originLat !== null)) {
      next = { ...next, originLat: rc.lat, originLon: rc.lon, originLabel: rc.label }
    } else if (!rc && next.originLabel.endsWith(' Center')) {
      if (next.distanceKm !== null) {
        const mc = mapView.value?.getMapCenter() ?? { lat: 20, lon: 0 }
        next = { ...next, originLat: mc.lat, originLon: mc.lon, originLabel: 'Map Center' }
      } else {
        next = { ...next, originLat: null, originLon: null, originLabel: '' }
      }
    }
  }

  if (next.distanceKm !== null && next.distanceKm > 0 && (next.originLat === null || next.originLon === null)) {
    const rc = regionCenter(next.continent, next.country)
    if (
      selected.value &&
      matchesGlobalFilter(selected.value.row, selected.value.fields, { ...next, distanceKm: null })
    ) {
      next = {
        ...next,
        originLat: selected.value.row.latitude,
        originLon: selected.value.row.longitude,
        originLabel: String(selected.value.row.name ?? selected.value.row.id),
      }
    } else if (rc) {
      next = {
        ...next,
        originLat: rc.lat,
        originLon: rc.lon,
        originLabel: rc.label,
      }
    } else {
      const mc = mapView.value?.getMapCenter() ?? { lat: 20, lon: 0 }
      next = {
        ...next,
        originLat: mc.lat,
        originLon: mc.lon,
        originLabel: 'Map Center',
      }
    }
  }
  globalFilter.value = next
  checkSelectionAgainstFilters()
}

function updateLayerFilter(id: string, filter: LayerFilter) {
  layerFilters.value = { ...layerFilters.value, [id]: filter }
  checkSelectionAgainstFilters()
}

function resetAllFilters() {
  globalFilter.value = defaultGlobalFilter()
  layerFilters.value = {}
  pickingOrigin.value = false
}

function useSelectedOrigin() {
  if (!selected.value) return
  pickingOrigin.value = false
  globalFilter.value = {
    ...globalFilter.value,
    originLat: selected.value.row.latitude,
    originLon: selected.value.row.longitude,
    originLabel: String(selected.value.row.name ?? selected.value.row.id),
    distanceKm: globalFilter.value.distanceKm ?? 500,
  }
}

function useMapCenter() {
  pickingOrigin.value = false
  const mc = mapView.value?.getMapCenter() ?? { lat: 20, lon: 0 }
  globalFilter.value = {
    ...globalFilter.value,
    originLat: mc.lat,
    originLon: mc.lon,
    originLabel: 'Map Center',
    distanceKm: globalFilter.value.distanceKm ?? 500,
  }
}

function onPickOrigin(lat: number, lon: number) {
  pickingOrigin.value = false
  globalFilter.value = {
    ...globalFilter.value,
    originLat: lat,
    originLon: lon,
    originLabel: `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
    distanceKm: globalFilter.value.distanceKm ?? 500,
  }
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
    <a class="skip" href="#point-heading">Skip to point details</a>
    <aside class="side">
      <header>
        <h1>Layer Explorer</h1>
        <p>Toggle layers, filter by region, distance, mineral or similarity, and inspect points.</p>
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
        :global-filter="globalFilter" :layer-filters="layerFilters" :remote-counts="remoteCounts"
        :picking-origin="pickingOrigin" :has-selected-point="!!selected"
        @toggle="toggle" @retry="retryLayer" @remove="removeLayer"
        @load-files="loadFiles" @start-import="startImport"
        @update:global-filter="updateGlobalFilter"
        @update:layer-filter="updateLayerFilter"
        @reset-all-filters="resetAllFilters"
        @use-selected-origin="useSelectedOrigin"
        @use-map-center="useMapCenter"
        @toggle-pick-origin="pickingOrigin = !pickingOrigin"
        @fit-filtered="mapView?.fitFiltered()"
      />

      <PointForm ref="form" :point="selected" @close="clearSelection" @retry="selected && loadDetail(selected)" />
    </aside>

    <main class="main">
      <ClientOnly>
        <MapView
          ref="mapView"
          :layers="readyLayers" :visible="visible" :selected="selected"
          :global-filter="globalFilter" :layer-filters="layerFilters" :picking-origin="pickingOrigin"
          :fetch-clusters="fetchClusters" :fetch-points="fetchPoints"
          @select="onSelect" @pick-origin="onPickOrigin" @remote-counts="remoteCounts = $event"
        />
      </ClientOnly>
    </main>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: minmax(320px, 410px) 1fr; height: 100%; }
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
