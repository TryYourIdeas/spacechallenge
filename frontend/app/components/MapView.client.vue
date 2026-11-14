<script setup lang="ts">
import L from 'leaflet'
import type { Layer, SelectedPoint } from '~/types/layers'

const props = defineProps<{
  layers: Layer[]
  visible: Set<string>
  selected: SelectedPoint | null
}>()
const emit = defineEmits<{ select: [point: SelectedPoint, viaKeyboard: boolean] }>()

const el = ref<HTMLElement>()
let map: L.Map | undefined
const groups = new Map<string, L.LayerGroup>()
const markers = new Map<string, { marker: L.Marker; layer: Layer }>()
const key = (layerId: string, rowId: string) => `${layerId}\u0000${rowId}`

function icon(layer: Layer, active: boolean) {
  return L.divIcon({
    className: 'pt-wrap',
    html: `<span class="pt pt-${layer.shape}${active ? ' pt-active' : ''}" style="--pt:${layer.color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function build(layer: Layer) {
  groups.get(layer.id)?.clearLayers()
  const group = groups.get(layer.id) ?? L.layerGroup()
  groups.set(layer.id, group)
  for (const row of layer.rows) {
    const label = `${layer.label}: ${row.name ?? row.id}`
    const marker = L.marker([row.latitude, row.longitude], {
      icon: icon(layer, false), title: label, alt: label, keyboard: true, riseOnHover: true,
    })
    marker.on('click', (e) => {
      const viaKeyboard = (e as unknown as { originalEvent?: Event }).originalEvent instanceof KeyboardEvent
      emit('select', { layer, fields: layer.fields, row }, viaKeyboard)
    })
    markers.set(key(layer.id, row.id), { marker, layer })
    group.addLayer(marker)
  }
}

function sync() {
  if (!map) return
  const ids = new Set(props.layers.map(l => l.id))
  for (const [id, group] of groups) {
    if (!ids.has(id)) { group.remove(); groups.delete(id) }
  }
  for (const layer of props.layers) {
    if (!groups.has(layer.id)) build(layer)
    const group = groups.get(layer.id)!
    if (props.visible.has(layer.id)) group.addTo(map)
    else group.remove()
  }
}

function fit() {
  if (!map) return
  const pts: L.LatLngTuple[] = props.layers
    .filter(l => props.visible.has(l.id))
    .flatMap(l => l.rows.map(r => [r.latitude, r.longitude] as L.LatLngTuple))
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 5 })
}

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
  map = L.map(el.value!, { worldCopyJump: true, minZoom: 2, zoomControl: true }).setView([20, 0], 2)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19, className: 'basemap-dark',
  }).addTo(map)
  sync(); fit()
})
onBeforeUnmount(() => { map?.remove(); map = undefined })

// Rebuild markers only when the set of loaded layers changes, not on every toggle.
watch(() => props.layers, () => { sync(); fit(); highlight() })
watch(() => props.visible, () => { sync(); fit() })
watch(() => props.selected, highlight)
</script>

<template>
  <div ref="el" class="map" role="region" aria-label="Map of layer points. Markers are keyboard focusable; press Enter to open a point." />
</template>

<style>
.map { width: 100%; height: 100%; min-height: 320px; background: var(--color-bg-deep-space); }
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
