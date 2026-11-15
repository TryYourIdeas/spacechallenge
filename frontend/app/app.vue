<script setup lang="ts">
import type { GlobalFilter, Layer, LayerFilter, RadiusCircle, SelectedPoint } from '~/types/layers'
import { defaultGlobalFilter, matchesGlobalFilter, matchesLayerFilter, regionCenter } from '~/utils/filters'

const { indexState, indexError, metas, states, visible, toggle, reload, retryLayer, tasks, apiError, eventsOnline, files, filesState, filesError, importError, loadFiles, startImport, removeLayer, fetchClusters, fetchPoints, fetchPoint } = useLayers()
const selected = shallowRef<SelectedPoint | null>(null)
const form = ref<{ focus: () => void }>()
const mapView = ref<{
  fitFiltered: () => void
  getMapCenter: () => { lat: number; lon: number } | null
  getVisibleLayerPoints: (layerId: string) => Array<{ id: string; lat: number; lon: number; label: string }>
}>()

const globalFilter = ref<GlobalFilter>(defaultGlobalFilter())
const layerFilters = ref<Record<string, LayerFilter>>({})
const remoteCounts = ref<Record<string, number>>({})
const pickingOrigin = ref(false)
const addingCircle = ref(false)
const activeCircleId = ref<string | null>(null)
const circlesFromLayerId = ref<string | null>(null)
const suppressAutoFit = ref(false)
let circleSeq = 0
const nextCircleId = () => `circle-${++circleSeq}`

const readyLayers = computed<Layer[]>(() =>
  metas.value.flatMap((m) => {
    const s = states.value[m.id]
    return s?.status === 'ready' ? [s.layer] : []
  }),
)

function syncPrimaryToCircle(g: GlobalFilter, c: RadiusCircle | undefined): GlobalFilter {
  if (!c) {
    return { ...g, distanceKm: null, originLat: null, originLon: null, originLabel: '' }
  }
  return { ...g, distanceKm: c.km, originLat: c.lat, originLon: c.lon, originLabel: c.label }
}

function upsertActiveCircle(g: GlobalFilter, lat: number, lon: number, label: string, km: number, asNew = false): GlobalFilter {
  const existing = [...g.circles]
  if (asNew || existing.length === 0) {
    const id = nextCircleId()
    const created: RadiusCircle = { id, lat, lon, km, label }
    activeCircleId.value = id
    return syncPrimaryToCircle({ ...g, circles: [...existing, created] }, created)
  }
  const targetId = activeCircleId.value && existing.some(c => c.id === activeCircleId.value)
    ? activeCircleId.value
    : existing[existing.length - 1]!.id
  const updated = existing.map(c => (c.id === targetId ? { ...c, lat, lon, label, km } : c))
  const active = updated.find(c => c.id === targetId)!
  activeCircleId.value = targetId
  return syncPrimaryToCircle({ ...g, circles: updated }, active)
}

function updateGlobalFilter(next: GlobalFilter) {
  suppressAutoFit.value = false
  if (next.circles.length === 0) circlesFromLayerId.value = null
  const prev = globalFilter.value
  const regionChanged = next.continent !== prev.continent || next.country !== prev.country
  const syncEnabled = next.syncRegionCircle !== false
  const syncJustEnabled = syncEnabled && prev.syncRegionCircle === false

  if ((regionChanged && syncEnabled) || syncJustEnabled) {
    const rc = regionCenter(next.continent, next.country)
    if (rc && (next.distanceKm !== null || next.originLat !== null || next.circles.length > 0)) {
      next = upsertActiveCircle(next, rc.lat, rc.lon, rc.label, next.distanceKm ?? 500)
    } else if (!rc && next.originLabel.endsWith(' Center')) {
      if (next.distanceKm !== null) {
        const mc = mapView.value?.getMapCenter() ?? { lat: 20, lon: 0 }
        next = upsertActiveCircle(next, mc.lat, mc.lon, 'Map Center', next.distanceKm)
      } else {
        activeCircleId.value = null
        next = syncPrimaryToCircle({ ...next, circles: [] }, undefined)
      }
    }
  }

  if (next.distanceKm !== null && next.distanceKm > 0) {
    if (next.originLat === null || next.originLon === null) {
      const rc = regionCenter(next.continent, next.country)
      if (
        selected.value &&
        matchesGlobalFilter(selected.value.row, selected.value.fields, { ...next, distanceKm: null, circles: [] })
      ) {
        next = upsertActiveCircle(
          next,
          selected.value.row.latitude,
          selected.value.row.longitude,
          String(selected.value.row.name ?? selected.value.row.id),
          next.distanceKm,
        )
      } else if (rc) {
        next = upsertActiveCircle(next, rc.lat, rc.lon, rc.label, next.distanceKm)
      } else {
        const mc = mapView.value?.getMapCenter() ?? { lat: 20, lon: 0 }
        next = upsertActiveCircle(next, mc.lat, mc.lon, 'Map Center', next.distanceKm)
      }
    } else if (next.circles.length > 0 && next.distanceKm !== prev.distanceKm) {
      if (circlesFromLayerId.value) {
        const km = next.distanceKm
        const updated = next.circles.map(c => ({ ...c, km }))
        const active = updated.find(c => c.id === activeCircleId.value) ?? updated[updated.length - 1]
        next = syncPrimaryToCircle({ ...next, circles: updated }, active)
      } else {
        next = upsertActiveCircle(next, next.originLat, next.originLon, next.originLabel, next.distanceKm)
      }
    } else if (next.circles.length === 0) {
      next = upsertActiveCircle(next, next.originLat, next.originLon, next.originLabel || 'Origin', next.distanceKm)
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
  suppressAutoFit.value = false
  circlesFromLayerId.value = null
  globalFilter.value = defaultGlobalFilter()
  layerFilters.value = {}
  pickingOrigin.value = false
  addingCircle.value = false
  activeCircleId.value = null
}

function useSelectedOrigin() {
  if (!selected.value) return
  suppressAutoFit.value = false
  circlesFromLayerId.value = null
  const asNew = addingCircle.value
  pickingOrigin.value = false
  addingCircle.value = false
  globalFilter.value = upsertActiveCircle(
    globalFilter.value,
    selected.value.row.latitude,
    selected.value.row.longitude,
    String(selected.value.row.name ?? selected.value.row.id),
    globalFilter.value.distanceKm ?? 500,
    asNew,
  )
  checkSelectionAgainstFilters()
}

function useMapCenter() {
  suppressAutoFit.value = false
  circlesFromLayerId.value = null
  const asNew = addingCircle.value
  pickingOrigin.value = false
  addingCircle.value = false
  const mc = mapView.value?.getMapCenter() ?? { lat: 20, lon: 0 }
  globalFilter.value = upsertActiveCircle(
    globalFilter.value,
    mc.lat,
    mc.lon,
    'Map Center',
    globalFilter.value.distanceKm ?? 500,
    asNew,
  )
  checkSelectionAgainstFilters()
}

function onPickOrigin(lat: number, lon: number) {
  suppressAutoFit.value = false
  circlesFromLayerId.value = null
  const asNew = addingCircle.value
  pickingOrigin.value = false
  addingCircle.value = false
  globalFilter.value = upsertActiveCircle(
    globalFilter.value,
    lat,
    lon,
    `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
    globalFilter.value.distanceKm ?? 500,
    asNew,
  )
  checkSelectionAgainstFilters()
}

function selectCircle(id: string) {
  const target = globalFilter.value.circles.find(c => c.id === id)
  if (!target) return
  activeCircleId.value = id
  globalFilter.value = syncPrimaryToCircle(globalFilter.value, target)
}

function removeCircle(id: string) {
  const remaining = globalFilter.value.circles.filter(c => c.id !== id)
  const nextActive = remaining.find(c => c.id === activeCircleId.value) ?? remaining[remaining.length - 1]
  activeCircleId.value = nextActive?.id ?? null
  globalFilter.value = syncPrimaryToCircle({ ...globalFilter.value, circles: remaining }, nextActive)
  checkSelectionAgainstFilters()
}

function togglePickOrigin(asNew = false) {
  if (pickingOrigin.value && addingCircle.value === asNew) {
    pickingOrigin.value = false
    addingCircle.value = false
  } else {
    addingCircle.value = asNew
    pickingOrigin.value = true
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
  if (circlesFromLayerId.value) {
    circlesFromLayerId.value = null
    activeCircleId.value = null
    suppressAutoFit.value = true
    globalFilter.value = syncPrimaryToCircle({ ...globalFilter.value, circles: [] }, undefined)
  }
}
onBeforeUnmount(() => detail?.abort())

function applyLayerRadiusCircles(layer: Layer, clickedRow: { id: string; latitude: number; longitude: number; name?: string }) {
  const km = globalFilter.value.distanceKm ?? 500
  let sources: Array<{ id: string; lat: number; lon: number; label: string }> = []

  if (!layer.remote && layer.rows.length > 0) {
    sources = layer.rows.slice(0, 200).map(r => ({
      id: r.id,
      lat: r.latitude,
      lon: r.longitude,
      label: String(r.name ?? r.id),
    }))
  } else {
    sources = mapView.value?.getVisibleLayerPoints(layer.id) ?? []
    if (!sources.some(s => s.id === clickedRow.id)) {
      sources.unshift({
        id: clickedRow.id,
        lat: clickedRow.latitude,
        lon: clickedRow.longitude,
        label: String(clickedRow.name ?? clickedRow.id),
      })
    }
  }

  if (sources.length === 0) return
  const circles: RadiusCircle[] = sources.map(s => ({
    id: `layer-${layer.id}-${s.id}`,
    lat: s.lat,
    lon: s.lon,
    km,
    label: s.label,
  }))
  const clickedId = `layer-${layer.id}-${clickedRow.id}`
  const active = circles.find(c => c.id === clickedId) ?? circles[0]!
  circlesFromLayerId.value = layer.id
  activeCircleId.value = active.id
  suppressAutoFit.value = true
  globalFilter.value = syncPrimaryToCircle({ ...globalFilter.value, circles }, active)
}

async function onSelect(point: SelectedPoint, viaKeyboard: boolean) {
  if ((point.layer as Layer).remote) void loadDetail(point)
  else { detail?.abort(); selected.value = point }

  const layerState = states.value[point.layer.id]
  if (layerState?.status === 'ready') {
    applyLayerRadiusCircles(layerState.layer, point.row)
  }

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
        :picking-origin="pickingOrigin" :adding-circle="addingCircle" :active-circle-id="activeCircleId"
        :has-selected-point="!!selected"
        @toggle="toggle" @retry="retryLayer" @remove="removeLayer"
        @load-files="loadFiles" @start-import="startImport"
        @update:global-filter="updateGlobalFilter"
        @update:layer-filter="updateLayerFilter"
        @reset-all-filters="resetAllFilters"
        @use-selected-origin="useSelectedOrigin"
        @use-map-center="useMapCenter"
        @toggle-pick-origin="togglePickOrigin"
        @select-circle="selectCircle"
        @remove-circle="removeCircle"
        @fit-filtered="mapView?.fitFiltered()"
      />

      <PointForm ref="form" :point="selected" @close="clearSelection" @retry="selected && loadDetail(selected)" />
    </aside>

    <main class="main">
      <ClientOnly>
        <MapView
          ref="mapView"
          :layers="readyLayers" :visible="visible" :selected="selected"
          :global-filter="globalFilter" :layer-filters="layerFilters" :picking-origin="pickingOrigin" :adding-circle="addingCircle" :active-circle-id="activeCircleId" :suppress-auto-fit="suppressAutoFit"
          :fetch-clusters="fetchClusters" :fetch-points="fetchPoints"
          @select="onSelect" @pick-origin="onPickOrigin" @select-circle="selectCircle" @remote-counts="remoteCounts = $event"
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
