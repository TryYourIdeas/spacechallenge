<script setup lang="ts">
import L from 'leaflet'
import type { ClusterItem, ClusterResponse, GlobalFilter, LatLngBoundsTuple, Layer, LayerFilter, LayerRow, PointSummary, SelectedPoint } from '~/types/layers'
import {
  buildServerFilterPayload,
  CONTINENTS,
  COUNTRIES,
  countGlobalFilters,
  countLayerFilters,
  filterLayerRows,
  hasActiveFilters,
  type ServerFilterPayload,
} from '~/utils/filters'
import { clusterSize, viewportBbox } from '~/utils/viewport'

const props = defineProps<{
  layers: Layer[]
  visible: Set<string>
  selected: SelectedPoint | null
  globalFilter: GlobalFilter
  layerFilters: Record<string, LayerFilter>
  pickingOrigin: boolean
  /** Grid-clustered points of a server layer in a viewport. */
  fetchClusters: (id: string, bbox: string, zoom: number, signal: AbortSignal, filter?: ServerFilterPayload | null) => Promise<ClusterResponse>
  /** Individual points in a small box, for clusters that cannot be split by zooming. */
  fetchPoints: (id: string, bbox: string, signal: AbortSignal, filter?: ServerFilterPayload | null) => Promise<{ points: PointSummary[]; truncated: boolean }>
}>()
const emit = defineEmits<{
  select: [point: SelectedPoint, viaKeyboard: boolean]
  'pick-origin': [lat: number, lon: number]
  'remote-counts': [counts: Record<string, number>]
}>()

const MAX_ZOOM = 19
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

const el = ref<HTMLElement>()
let map: L.Map | undefined
let radiusCircle: L.Circle | undefined
const groups = new Map<string, L.LayerGroup>()
const markers = new Map<string, { marker: L.Marker; layer: Layer }>()
const remoteKeys = new Map<string, string[]>()
const remoteFilteredBounds = new Map<string, LatLngBoundsTuple | null>()
const remoteCounts = reactive<Record<string, number>>({})
const key = (layerId: string, rowId: string) => `${layerId}\u0000${rowId}`

// Viewport loading state for server layers, announced to assistive technology.
const view = reactive({ loading: false, error: '', truncated: false })
let pendingFilterFit = false

const anyFilterActive = computed(() =>
  countGlobalFilters(props.globalFilter) > 0 ||
  Object.values(props.layerFilters).some(f => countLayerFilters(f) > 0),
)

const visibleFilteredSummary = computed(() => {
  if (!anyFilterActive.value) return ''
  let total = 0
  for (const l of props.layers) {
    if (!props.visible.has(l.id)) continue
    if (l.remote) total += remoteCounts[l.id] ?? 0
    else total += filterLayerRows(l, props.globalFilter, props.layerFilters[l.id]).length
  }
  const parts: string[] = [`${total.toLocaleString('en-US')} filtered points`]
  if (props.globalFilter.country) {
    const c = COUNTRIES.find(x => x.id === props.globalFilter.country)
    if (c) parts.push(c.label)
  } else if (props.globalFilter.continent) {
    const c = CONTINENTS.find(x => x.id === props.globalFilter.continent)
    if (c) parts.push(c.label)
  }
  if (props.globalFilter.distanceKm && props.globalFilter.originLat !== null) {
    parts.push(`Radius ≤ ${props.globalFilter.distanceKm} km`)
  }
  return parts.join(' • ')
})

function icon(layer: Layer, active: boolean) {
  return L.divIcon({
    className: 'pt-wrap',
    html: `<span class="pt pt-${layer.shape}${active ? ' pt-active' : ''}" style="--pt:${layer.color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function clusterIcon(layer: Layer, count: number) {
  const size = clusterSize(count)
  const span = document.createElement('span')
  span.className = 'cl'
  span.style.cssText = `--pt:${layer.color};width:${size}px;height:${size}px`
  span.textContent = compact.format(count)
  return L.divIcon({ className: 'cl-wrap', html: span, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

function selectPoint(layer: Layer, row: LayerRow, event: unknown) {
  const viaKeyboard = (event as { originalEvent?: Event } | undefined)?.originalEvent instanceof KeyboardEvent
  emit('select', { layer, fields: layer.fields, row }, viaKeyboard)
}

/** Static layers: every filtered row is a marker. */
function build(layer: Layer) {
  for (const [k, v] of markers) {
    if (v.layer.id === layer.id) markers.delete(k)
  }
  groups.get(layer.id)?.clearLayers()
  const group = groups.get(layer.id) ?? L.layerGroup()
  groups.set(layer.id, group)
  const rows = filterLayerRows(layer, props.globalFilter, props.layerFilters[layer.id])
  for (const row of rows) {
    const label = `${layer.label}: ${row.name ?? row.id}`
    const marker = L.marker([row.latitude, row.longitude], {
      icon: icon(layer, false), title: label, alt: label, keyboard: true, riseOnHover: true,
    })
    marker.on('click', e => selectPoint(layer, row, e))
    markers.set(key(layer.id, row.id), { marker, layer })
    group.addLayer(marker)
  }
}

function rebuildStaticLayers() {
  for (const layer of props.layers) {
    if (!layer.remote) build(layer)
  }
  highlight()
}

function syncRadiusOverlay() {
  if (!map) return
  radiusCircle?.remove()
  radiusCircle = undefined
  const { distanceKm, originLat, originLon } = props.globalFilter
  if (distanceKm !== null && distanceKm > 0 && originLat !== null && originLon !== null) {
    radiusCircle = L.circle([originLat, originLon], {
      radius: distanceKm * 1000,
      color: '#00e5ff',
      weight: 2,
      dashArray: '6 4',
      fillColor: '#00e5ff',
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(map)
  }
}

function sync() {
  if (!map) return
  const ids = new Set(props.layers.map(l => l.id))
  for (const [id, group] of groups) {
    if (!ids.has(id)) {
      group.remove(); groups.delete(id)
      for (const k of remoteKeys.get(id) ?? []) markers.delete(k)
      remoteKeys.delete(id)
      remoteFilteredBounds.delete(id)
    }
  }
  for (const layer of props.layers) {
    if (!groups.has(layer.id)) {
      if (layer.remote) groups.set(layer.id, L.layerGroup())
      else build(layer)
    }
    const group = groups.get(layer.id)!
    if (props.visible.has(layer.id)) group.addTo(map)
    else group.remove()
  }
}

// ---- Server layers: only the viewport's grid cells are loaded ----
function renderClusters(layer: Layer, res: ClusterResponse) {
  const group = groups.get(layer.id)
  if (!group) return
  for (const k of remoteKeys.get(layer.id) ?? []) markers.delete(k)
  group.clearLayers()
  const keys: string[] = []
  for (const item of res.items) {
    if (item.count === 1 && item.id) {
      const row = { id: item.id, latitude: item.latitude, longitude: item.longitude, ...(item.name ? { name: item.name } : {}) } as LayerRow
      const label = `${layer.label}: ${item.name ?? item.id}`
      const marker = L.marker([item.latitude, item.longitude], {
        icon: icon(layer, false), title: label, alt: label, keyboard: true, riseOnHover: true,
      })
      marker.on('click', e => selectPoint(layer, row, e))
      markers.set(key(layer.id, item.id), { marker, layer })
      keys.push(key(layer.id, item.id))
      group.addLayer(marker)
    } else {
      const label = `${layer.label}: cluster of ${item.count.toLocaleString('en-US')} points. Press Enter to zoom in.`
      const marker = L.marker([item.latitude, item.longitude], {
        icon: clusterIcon(layer, item.count), title: label, alt: label, keyboard: true,
      })
      marker.on('click', e => openCluster(layer, item, e))
      group.addLayer(marker)
    }
  }
  remoteKeys.set(layer.id, keys)
}

/** Zoom into a cluster; when zooming cannot separate its points (shared coordinates), list them. */
function openCluster(layer: Layer, item: ClusterItem, event: unknown) {
  if (!map) return
  const bounds = L.latLngBounds(item.bounds)
  const target = Math.min(map.getBoundsZoom(bounds, false, L.point(40, 40)), MAX_ZOOM)
  if (target > map.getZoom()) { map.fitBounds(bounds, { padding: [40, 40], maxZoom: MAX_ZOOM }); return }
  void listCluster(layer, item, bounds, event)
}

async function listCluster(layer: Layer, item: ClusterItem, bounds: L.LatLngBounds, event: unknown) {
  if (!map) return
  const box = document.createElement('div')
  box.className = 'cl-list'
  const popup = L.popup({ maxWidth: 280 }).setLatLng([item.latitude, item.longitude]).setContent(box).openOn(map)
  const note = (text: string, role?: string) => {
    box.replaceChildren(Object.assign(document.createElement('p'), { textContent: text }))
    if (role) box.firstElementChild!.setAttribute('role', role)
  }
  note('Loading points…', 'status')
  try {
    const filterPayload = buildServerFilterPayload(layer, props.globalFilter, props.layerFilters[layer.id])
    const { points, truncated } = await props.fetchPoints(
      layer.id, viewportBbox({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }),
      new AbortController().signal, filterPayload)
    const heading = Object.assign(document.createElement('p'), {
      textContent: `${item.count.toLocaleString('en-US')} points share this location`,
    })
    const list = document.createElement('ul')
    for (const p of points) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = p.name ?? p.id
      b.addEventListener('click', (e) => {
        const row = { id: p.id, latitude: p.latitude, longitude: p.longitude, ...(p.name ? { name: p.name } : {}) } as LayerRow
        emit('select', { layer, fields: layer.fields, row }, e.detail === 0)
        popup.close()
      })
      const li = document.createElement('li')
      li.append(b)
      list.append(li)
    }
    box.replaceChildren(heading, list)
    if (truncated) box.append(Object.assign(document.createElement('p'), { textContent: `Showing the first ${points.length}.` }))
    ;(list.querySelector('button') as HTMLElement | null)?.focus()
  } catch {
    note('Could not load these points.', 'alert')
  }
  void event
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined
let refreshCtl: AbortController | undefined

function scheduleRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => void refreshRemote(), 150)
}

async function refreshRemote() {
  if (!map) return
  refreshCtl?.abort()
  const targets = props.layers.filter(l => l.remote && l.remote.rowCount > 0 && props.visible.has(l.id))
  if (!targets.length) {
    view.loading = false; view.error = ''; view.truncated = false
    if (pendingFilterFit) { pendingFilterFit = false; fitFiltered() }
    return
  }
  const ctl = (refreshCtl = new AbortController())
  const b = map.getBounds()
  const bbox = viewportBbox({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() })
  const zoom = Math.round(map.getZoom())
  view.loading = true
  let error = ''
  let truncated = false
  await Promise.all(targets.map(async (layer) => {
    try {
      const payload = buildServerFilterPayload(layer, props.globalFilter, props.layerFilters[layer.id])
      const res = await props.fetchClusters(layer.id, bbox, zoom, ctl.signal, payload)
      if (ctl.signal.aborted) return
      renderClusters(layer, res)
      if (res.filteredCount !== undefined) {
        remoteCounts[layer.id] = res.filteredCount
        remoteFilteredBounds.set(layer.id, res.filteredBounds ?? null)
      } else {
        delete remoteCounts[layer.id]
        remoteFilteredBounds.delete(layer.id)
      }
      truncated ||= res.truncated
      highlight()
    } catch (e) {
      if (!ctl.signal.aborted) error = `${layer.label}: ${e instanceof Error ? e.message : 'request failed'}`
    }
  }))
  if (ctl.signal.aborted) return // a newer request owns the status now
  emit('remote-counts', { ...remoteCounts })
  view.loading = false
  view.error = error
  view.truncated = truncated
  if (pendingFilterFit) {
    pendingFilterFit = false
    fitFiltered()
  }
}

function fit() {
  if (!map) return
  const pts: L.LatLngTuple[] = []
  for (const l of props.layers) {
    if (!props.visible.has(l.id)) continue
    for (const r of filterLayerRows(l, props.globalFilter, props.layerFilters[l.id])) {
      pts.push([r.latitude, r.longitude])
    }
    if (l.remote?.bounds) pts.push(l.remote.bounds[0], l.remote.bounds[1])
  }
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 5 })
}

function fitFiltered() {
  if (!map) return
  if (radiusCircle) {
    map.fitBounds(radiusCircle.getBounds(), { padding: [40, 40], maxZoom: 8 })
    return
  }
  const pts: L.LatLngTuple[] = []
  for (const l of props.layers) {
    if (!props.visible.has(l.id)) continue
    if (!l.remote) {
      for (const r of filterLayerRows(l, props.globalFilter, props.layerFilters[l.id])) {
        pts.push([r.latitude, r.longitude])
      }
    } else if (hasActiveFilters(props.globalFilter, props.layerFilters[l.id])) {
      const fb = remoteFilteredBounds.get(l.id)
      if (fb) pts.push(fb[0], fb[1])
    } else if (l.remote.bounds) {
      pts.push(l.remote.bounds[0], l.remote.bounds[1])
    }
  }
  if (pts.length === 0) {
    if (props.globalFilter.country) {
      const c = COUNTRIES.find(x => x.id === props.globalFilter.country)
      if (c && c.boxes[0]) pts.push([c.boxes[0].south, c.boxes[0].west], [c.boxes[0].north, c.boxes[0].east])
    } else if (props.globalFilter.continent) {
      const c = CONTINENTS.find(x => x.id === props.globalFilter.continent)
      if (c && c.boxes[0]) pts.push([c.boxes[0].south, c.boxes[0].west], [c.boxes[0].north, c.boxes[0].east])
    }
  }
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 7 })
}

function getMapCenter(): { lat: number; lon: number } | null {
  if (!map) return null
  const c = map.getCenter()
  return { lat: c.lat, lon: c.lng }
}

defineExpose({ fitFiltered, getMapCenter })

let lastActive: { marker: L.Marker; layer: Layer } | undefined
function highlight() {
  lastActive?.marker.setIcon(icon(lastActive.layer, false))
  lastActive = undefined
  const s = props.selected
  const entry = s && markers.get(key(s.layer.id, s.row.id))
  if (!entry) return
  entry.marker.setIcon(icon(entry.layer, true))
  lastActive = entry
}

onMounted(() => {
  map = L.map(el.value!, { worldCopyJump: true, minZoom: 2, maxZoom: MAX_ZOOM, zoomControl: true }).setView([20, 0], 2)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: MAX_ZOOM, className: 'basemap-dark',
  }).addTo(map)
  map.on('moveend', scheduleRefresh)
  map.on('click', (e: L.LeafletMouseEvent) => {
    if (props.pickingOrigin) {
      emit('pick-origin', e.latlng.lat, e.latlng.lng)
    }
  })
  sync(); syncRadiusOverlay(); fit(); scheduleRefresh()
})
onBeforeUnmount(() => {
  clearTimeout(refreshTimer)
  refreshCtl?.abort()
  map?.remove()
  map = undefined
})

// Rebuild markers only when the set of loaded layers changes, not on every toggle.
watch(() => props.layers, () => { sync(); fit(); highlight(); scheduleRefresh() })
watch(() => props.visible, () => { sync(); fit(); scheduleRefresh() })
watch(() => props.selected, highlight)
watch(
  [() => props.globalFilter, () => props.layerFilters],
  () => {
    rebuildStaticLayers()
    syncRadiusOverlay()
    if (props.globalFilter.autoFit) pendingFilterFit = true
    scheduleRefresh()
  },
  { deep: true },
)
</script>

<template>
  <div class="map-wrap" :class="{ 'picking-origin': pickingOrigin }">
    <div ref="el" class="map" role="region" aria-label="Map of layer points. Markers are keyboard focusable; press Enter to open a point or zoom into a cluster." />
    <div class="map-status" aria-live="polite">
      <p v-if="pickingOrigin" class="chipnote active-filter">
        ⊕ Click anywhere on the map to set the radius origin in km.
      </p>
      <p v-else-if="view.loading" class="chipnote">Loading points in view…</p>
      <p v-else-if="view.error" class="chipnote err" role="alert">
        Could not load points. {{ view.error }}
        <button type="button" @click="scheduleRefresh">Retry</button>
      </p>
      <p v-else-if="view.truncated" class="chipnote">Too many points to show here. Zoom in to see more.</p>
      <p v-else-if="visibleFilteredSummary" class="chipnote active-filter">
        <span>{{ visibleFilteredSummary }}</span>
        <button type="button" @click="fitFiltered">⊡ Fit view</button>
      </p>
    </div>
  </div>
</template>

<style>
.map-wrap { position: relative; width: 100%; height: 100%; min-height: 320px; }
.map-wrap.picking-origin .leaflet-container { cursor: crosshair; }
.map { width: 100%; height: 100%; min-height: 320px; background: var(--color-bg-deep-space); }
.map-status { position: absolute; left: 50%; top: 0.75rem; transform: translateX(-50%); z-index: 1000; max-width: calc(100% - 6rem); }
.chipnote { margin: 0; padding: 0.4rem 0.85rem; border-radius: 999px; background: var(--color-surface-raised); border: 1px solid var(--color-border); color: var(--color-text-primary); font-size: 0.8125rem; display: inline-flex; align-items: center; gap: 0.5rem; }
.chipnote.active-filter { border-color: var(--color-accent-arctic-cyan); }
.chipnote.err { border-color: var(--color-danger); color: var(--color-danger); }
.chipnote button { margin-left: 0.25rem; background: transparent; color: var(--color-accent-arctic-cyan); border: 1px solid var(--color-accent-arctic-cyan); border-radius: 999px; padding: 0.15rem 0.65rem; min-height: 26px; cursor: pointer; font: inherit; font-size: 0.75rem; font-weight: 600; }
.cl-wrap { background: none; border: 0; }
.cl-wrap:focus-visible { outline: none; }
.cl { display: grid; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--pt) 30%, var(--color-bg-deep-space)); border: 3px solid var(--pt); color: var(--color-text-primary); font: 600 0.8125rem var(--font-sans); box-shadow: 0 0 0 2px rgb(5 7 13 / 70%); }
.cl-wrap:focus-visible .cl { box-shadow: var(--focus-ring); }
.cl-list { font-family: var(--font-sans); color: #111; }
.cl-list p { margin: 0 0 0.4rem; }
.cl-list ul { margin: 0; padding: 0; list-style: none; max-height: 12rem; overflow-y: auto; }
.cl-list button { width: 100%; text-align: left; margin: 0 0 0.25rem; padding: 0.4rem 0.6rem; min-height: 36px; border: 1px solid #7851a9; border-radius: 6px; background: #fff; color: #111; font: inherit; cursor: pointer; }
.cl-list button:focus-visible { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #005f6b; }
.leaflet-container { font-family: var(--font-sans); background: var(--color-bg-deep-space); }
.leaflet-control-attribution { background: rgb(5 7 13 / 80%) !important; color: var(--color-text-secondary) !important; }
.leaflet-control-attribution a { color: var(--color-accent-arctic-cyan) !important; }
.basemap-dark { filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9) saturate(0.6); }
.pt-wrap { background: none; border: 0; }
.pt-wrap:focus-visible { outline: none; }
.pt-wrap:focus-visible .pt { box-shadow: var(--focus-ring); }
.pt { display: block; width: 18px; height: 18px; margin: 2px; background: var(--pt); border: 2px solid #fff; transition: transform 0.15s; }
.pt-circle { border-radius: 50%; }
.pt-square { border-radius: 2px; }
.pt-diamond { transform: rotate(45deg) scale(0.85); }
.pt-triangle { background: none; border: 0; width: 0; height: 0; margin: 1px 2px; border-left: 9px solid transparent; border-right: 9px solid transparent; border-bottom: 18px solid var(--pt); filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff); }
.pt-active { transform: scale(1.35); box-shadow: 0 0 0 3px var(--color-accent-arctic-cyan); }
.pt-diamond.pt-active { transform: rotate(45deg) scale(1.2); }
.pt-triangle.pt-active { box-shadow: none; transform: scale(1.35); filter: drop-shadow(0 0 3px var(--color-accent-arctic-cyan)) drop-shadow(0 0 1px #fff); }
</style>
