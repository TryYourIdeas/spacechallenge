<script setup lang="ts">
import type { GlobalFilter, Layer, LayerMeta, LayerFilter } from '~/types/layers'
import type { LayerState } from '~/composables/useLayers'
import {
  APOLLO_MISSIONS,
  CONTINENTS,
  countGlobalFilters,
  countLayerFilters,
  countriesForContinent,
  defaultLayerFilter,
  detectLayerCapabilities,
  distinctCategoryOptions,
  fieldRangeBounds,
  filterLayerRows,
  hasActiveFilters,
  LUNAR_GROUP_LABELS,
  LUNAR_GROUPS,
  SIMILARITY_PRESETS,
} from '~/utils/filters'

const props = defineProps<{
  metas: LayerMeta[]
  states: Record<string, LayerState>
  visible: Set<string>
  apiError: string
  globalFilter: GlobalFilter
  layerFilters: Record<string, LayerFilter>
  remoteCounts: Record<string, number>
  pickingOrigin: boolean
  hasSelectedPoint: boolean
}>()

const emit = defineEmits<{
  toggle: [id: string]
  retry: [id: string]
  remove: [id: string]
  'update:globalFilter': [filter: GlobalFilter]
  'update:layerFilter': [id: string, filter: LayerFilter]
  'reset-all-filters': []
  'use-selected-origin': []
  'use-map-center': []
  'toggle-pick-origin': []
  'fit-filtered': []
}>()

const confirming = ref<string | null>(null)
const expandedLayer = ref<string | null>(null)
const selectedOxideField = ref<Record<string, string>>({})
const selectedExtraField = ref<Record<string, string>>({})
const statusBox = ref<HTMLElement>()

const availableCountries = computed(() => countriesForContinent(props.globalFilter.continent))
const globalActiveCount = computed(() => countGlobalFilters(props.globalFilter))
const anyFilterActive = computed(() =>
  globalActiveCount.value > 0 || Object.values(props.layerFilters).some(f => countLayerFilters(f) > 0),
)

function updateGlobal(patch: Partial<GlobalFilter>) {
  const next: GlobalFilter = { ...props.globalFilter, ...patch }
  if (patch.continent !== undefined && next.country) {
    const valid = countriesForContinent(next.continent).some(c => c.id === next.country)
    if (!valid) next.country = ''
  }
  emit('update:globalFilter', next)
}

function onDistanceInput(raw: string) {
  const trimmed = raw.trim()
  if (trimmed === '') {
    updateGlobal({ distanceKm: null })
    return
  }
  const n = Number(trimmed)
  if (Number.isFinite(n) && n > 0) updateGlobal({ distanceKm: Math.min(20000, Math.round(n)) })
}

function layerFilterFor(id: string): LayerFilter {
  return props.layerFilters[id] ?? defaultLayerFilter()
}

function patchLayerFilter(id: string, patch: Partial<LayerFilter>) {
  const cur = layerFilterFor(id)
  emit('update:layerFilter', id, { ...cur, ...patch })
}

function resetLayerFilter(id: string) {
  emit('update:layerFilter', id, defaultLayerFilter())
}

function toggleLayerFilterPanel(id: string) {
  expandedLayer.value = expandedLayer.value === id ? null : id
}

function toggleMineral(layerId: string, mineral: string) {
  if (!mineral) return
  const cur = layerFilterFor(layerId)
  const exists = cur.minerals.includes(mineral)
  const minerals = exists ? cur.minerals.filter(m => m !== mineral) : [...cur.minerals, mineral]
  patchLayerFilter(layerId, { minerals })
}

function togglePreset(layerId: string, presetId: string) {
  const cur = layerFilterFor(layerId)
  patchLayerFilter(layerId, { similarityPreset: cur.similarityPreset === presetId ? '' : presetId })
}

function updateSimilarityRange(layerId: string, bound: 'min' | 'max', raw: string) {
  const cur = layerFilterFor(layerId)
  const val = raw.trim() === '' ? null : Number(raw)
  const num = val !== null && Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : null
  patchLayerFilter(layerId, {
    similarityRange: { ...cur.similarityRange, [bound]: num },
  })
}

function activeOxideKey(layer: Layer): string {
  const chosen = selectedOxideField.value[layer.id]
  if (chosen && layer.fields.some(f => f.key === chosen)) return chosen
  const caps = detectLayerCapabilities(layer)
  return caps.oxideFields[0]?.key ?? caps.numericFields[0]?.key ?? ''
}

function updateFieldRange(layerId: string, fieldKey: string, bound: 'min' | 'max', raw: string) {
  if (!fieldKey) return
  const cur = layerFilterFor(layerId)
  const prev = cur.ranges[fieldKey] ?? { min: null, max: null }
  const val = raw.trim() === '' ? null : Number(raw)
  const num = val !== null && Number.isFinite(val) ? val : null
  patchLayerFilter(layerId, {
    ranges: { ...cur.ranges, [fieldKey]: { ...prev, [bound]: num } },
  })
}

function updateCategoryFilter(layerId: string, fieldKey: string, value: string) {
  if (!fieldKey) return
  const cur = layerFilterFor(layerId)
  patchLayerFilter(layerId, {
    categories: { ...cur.categories, [fieldKey]: value },
  })
}

function readyLayer(id: string): Layer | undefined {
  const s = props.states[id]
  return s?.status === 'ready' ? s.layer : undefined
}

function totalPointCount(layer: Layer): number {
  return layer.remote?.rowCount ?? layer.rows.length
}

function filteredPointCount(layer: Layer): number | null {
  const f = props.layerFilters[layer.id]
  if (!hasActiveFilters(props.globalFilter, f)) return null
  if (layer.remote) {
    return props.remoteCounts[layer.id] ?? null
  }
  return filterLayerRows(layer, props.globalFilter, f).length
}

async function remove(id: string) {
  confirming.value = null
  emit('remove', id)
  await nextTick()
  statusBox.value?.focus()
}

</script>

<template>
  <div class="panel-stack">
    <!-- ==================== 1A. GLOBAL FILTERS ==================== -->
    <fieldset class="global-filters" :class="{ active: globalActiveCount > 0 }">
      <legend>
        <span>🌍 Global Filters</span>
        <span v-if="globalActiveCount > 0" class="badge">{{ globalActiveCount }} active</span>
      </legend>

      <div class="gf-header-actions">
        <button v-if="anyFilterActive" type="button" class="link-btn" @click="emit('reset-all-filters')">
          Clear all
        </button>
        <button v-if="anyFilterActive" type="button" class="link-btn" @click="emit('fit-filtered')">
          ⊡ Fit view
        </button>
      </div>

      <div class="gf-grid">
        <div class="gf-field">
          <label for="gf-continent">Continent</label>
          <select
            id="gf-continent"
            :value="globalFilter.continent"
            @change="updateGlobal({ continent: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">All continents</option>
            <option v-for="c in CONTINENTS" :key="c.id" :value="c.id">{{ c.label }}</option>
          </select>
        </div>

        <div class="gf-field">
          <label for="gf-country">Country</label>
          <select
            id="gf-country"
            :value="globalFilter.country"
            @change="updateGlobal({ country: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">All countries</option>
            <option v-for="c in availableCountries" :key="c.id" :value="c.id">{{ c.label }}</option>
          </select>
        </div>
      </div>

      <div class="gf-distance">
        <div class="gf-distance-head">
          <label for="gf-dist-num">Max distance (Radius in km)</label>
          <span v-if="globalFilter.originLat !== null && globalFilter.originLon !== null" class="origin-tag">
            Origin: {{ globalFilter.originLabel || `${globalFilter.originLat.toFixed(2)}°, ${globalFilter.originLon.toFixed(2)}°` }}
          </span>
          <span v-else class="muted-xs">Pick an origin below</span>
        </div>

        <div class="gf-distance-controls">
          <input
            type="range"
            min="10"
            max="5000"
            step="10"
            aria-label="Maximum distance slider in km"
            :value="globalFilter.distanceKm ?? 500"
            @input="onDistanceInput(($event.target as HTMLInputElement).value)"
          >
          <div class="num-unit">
            <input
              id="gf-dist-num"
              type="number"
              min="10"
              max="20000"
              step="10"
              placeholder="Off"
              :value="globalFilter.distanceKm ?? ''"
              @input="onDistanceInput(($event.target as HTMLInputElement).value)"
            >
            <span>km</span>
          </div>
          <button
            v-if="globalFilter.distanceKm !== null"
            type="button"
            class="mini-btn"
            aria-label="Disable distance filter"
            @click="updateGlobal({ distanceKm: null, originLat: null, originLon: null, originLabel: '' })"
          >
            ×
          </button>
        </div>

        <div class="gf-origin-row">
          <button
            type="button"
            class="pill-btn"
            :disabled="!hasSelectedPoint"
            @click="emit('use-selected-origin')"
          >
            ● Selected point
          </button>
          <button
            type="button"
            class="pill-btn"
            :class="{ active: pickingOrigin }"
            :aria-pressed="pickingOrigin"
            @click="emit('toggle-pick-origin')"
          >
            ⊕ {{ pickingOrigin ? 'Click on map…' : 'Pick on map' }}
          </button>
          <button
            type="button"
            class="pill-btn"
            @click="emit('use-map-center')"
          >
            ⌖ Map center
          </button>
          <label class="autofit-check">
            <input
              type="checkbox"
              :checked="globalFilter.autoFit"
              @change="updateGlobal({ autoFit: ($event.target as HTMLInputElement).checked })"
            >
            <span>Auto-fit</span>
          </label>
        </div>
      </div>
    </fieldset>

    <!-- ==================== 1B & 1C. LAYERS & PER-LAYER FILTERS ==================== -->
    <fieldset class="layers">
      <legend>Layers</legend>
      <p v-if="!metas.length" class="muted">No layers available.</p>
      <ul>
        <li v-for="m in metas" :key="m.id" class="layer-item" :class="{ expanded: expandedLayer === m.id }">
          <div class="layer-head">
            <label class="layer-toggle">
              <input type="checkbox" :checked="visible.has(m.id)" @change="emit('toggle', m.id)">
              <span class="swatch" :class="`pt-${m.shape}`" :style="{ '--pt': m.color }" aria-hidden="true" />
              <span class="name">{{ m.label }}</span>
            </label>
          </div>

          <span class="status" role="status">
            <template v-if="readyLayer(m.id)">
              <template v-if="filteredPointCount(readyLayer(m.id)!) !== null">
                <strong class="filtered-count">{{ filteredPointCount(readyLayer(m.id)!)!.toLocaleString('en-US') }}</strong>
                / {{ totalPointCount(readyLayer(m.id)!).toLocaleString('en-US') }} points
              </template>
              <template v-else>
                {{ totalPointCount(readyLayer(m.id)!).toLocaleString('en-US') }} points
              </template>
              <template v-if="readyLayer(m.id)!.skipped">
                , {{ readyLayer(m.id)!.skipped }} skipped (invalid coordinates)
              </template>
            </template>
            <template v-else-if="states[m.id]?.status === 'error'">
              <span class="error">Failed to load: {{ (states[m.id] as any).message }}</span>
              <button type="button" @click="emit('retry', m.id)">Retry</button>
            </template>
            <template v-else>Loading…</template>
          </span>

          <p v-if="m.description" class="muted desc">{{ m.description }}</p>

          <div class="actions">
            <button
              v-if="readyLayer(m.id)"
              type="button"
              class="filter-toggle-btn"
              :class="{ active: countLayerFilters(layerFilters[m.id]) > 0 }"
              :aria-expanded="expandedLayer === m.id"
              @click="toggleLayerFilterPanel(m.id)"
            >
              Filters<template v-if="countLayerFilters(layerFilters[m.id]) > 0"> ({{ countLayerFilters(layerFilters[m.id]) }})</template>
              {{ expandedLayer === m.id ? '▲' : '▾' }}
            </button>

            <template v-if="confirming === m.id">
              <span class="warn" role="alert">Delete {{ m.label }} permanently?</span>
              <button type="button" class="danger" @click="remove(m.id)">Delete</button>
              <button type="button" @click="confirming = null">Cancel</button>
            </template>
            <button v-else type="button" :aria-label="`Remove layer ${m.label}`" @click="m.imported ? (confirming = m.id) : remove(m.id)">Remove</button>
          </div>

          <!-- PER-LAYER FILTER SUB-PANEL -->
          <div v-if="expandedLayer === m.id && readyLayer(m.id)" class="layer-filter-box" role="region" :aria-label="`Filters for ${m.label}`">
            <div class="lf-combiner">
              <span class="lf-label-inline">Combine:</span>
              <div class="seg-group" role="group" aria-label="Rule combination mode">
                <button
                  type="button"
                  class="seg-btn"
                  :class="{ active: layerFilterFor(m.id).mode === 'and' }"
                  @click="patchLayerFilter(m.id, { mode: 'and' })"
                >
                  All (AND)
                </button>
                <button
                  type="button"
                  class="seg-btn"
                  :class="{ active: layerFilterFor(m.id).mode === 'or' }"
                  @click="patchLayerFilter(m.id, { mode: 'or' })"
                >
                  Any (OR)
                </button>
              </div>
              <button
                v-if="countLayerFilters(layerFilters[m.id]) > 0"
                type="button"
                class="reset-link"
                @click="resetLayerFilter(m.id)"
              >
                Reset
              </button>
            </div>

            <!-- 1C. Lunar Similarity Presets -->
            <div
              v-if="detectLayerCapabilities(readyLayer(m.id)!).similarityField || detectLayerCapabilities(readyLayer(m.id)!).brazilField"
              class="lf-section"
            >
              <span class="lf-title">⚡ Lunar Similarity Presets</span>
              <div class="preset-chips">
                <button
                  v-for="p in SIMILARITY_PRESETS"
                  :key="p.id"
                  type="button"
                  class="chip-btn"
                  :class="{ active: layerFilterFor(m.id).similarityPreset === p.id }"
                  :aria-pressed="layerFilterFor(m.id).similarityPreset === p.id"
                  @click="togglePreset(m.id, p.id)"
                >
                  {{ layerFilterFor(m.id).similarityPreset === p.id ? '✓ ' : '' }}{{ p.label }}
                </button>
              </div>
            </div>

            <!-- 1B. Mineral / Rock / Classification -->
            <div v-if="detectLayerCapabilities(readyLayer(m.id)!).mineralField" class="lf-section">
              <label :for="`min-${m.id}`" class="lf-title">
                🪨 Mineral / Rock Type ({{ detectLayerCapabilities(readyLayer(m.id)!).mineralField!.label }})
              </label>
              <select
                :id="`min-${m.id}`"
                value=""
                @change="toggleMineral(m.id, ($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
              >
                <option value="">Select mineral / rock…</option>
                <option
                  v-for="opt in detectLayerCapabilities(readyLayer(m.id)!).mineralOptions"
                  :key="opt"
                  :value="opt"
                >
                  {{ layerFilterFor(m.id).minerals.includes(opt) ? '✓ ' : '' }}{{ opt }}
                </option>
              </select>
              <div v-if="layerFilterFor(m.id).minerals.length" class="active-tags">
                <button
                  v-for="min in layerFilterFor(m.id).minerals"
                  :key="min"
                  type="button"
                  class="tag-chip"
                  @click="toggleMineral(m.id, min)"
                >
                  {{ min }} ×
                </button>
              </div>
            </div>

            <!-- 1C. Lunar Group & Apollo Mission -->
            <div
              v-if="detectLayerCapabilities(readyLayer(m.id)!).lunarGroupField || detectLayerCapabilities(readyLayer(m.id)!).apolloMissionField"
              class="lf-grid-2"
            >
              <div v-if="detectLayerCapabilities(readyLayer(m.id)!).lunarGroupField" class="lf-section">
                <label :for="`lg-${m.id}`" class="lf-sub">Lunar Group</label>
                <select
                  :id="`lg-${m.id}`"
                  :value="layerFilterFor(m.id).lunarGroup"
                  @change="patchLayerFilter(m.id, { lunarGroup: ($event.target as HTMLSelectElement).value })"
                >
                  <option value="">All groups</option>
                  <option v-for="g in LUNAR_GROUPS" :key="g" :value="g">{{ LUNAR_GROUP_LABELS[g] ?? g }}</option>
                </select>
              </div>
              <div v-if="detectLayerCapabilities(readyLayer(m.id)!).apolloMissionField" class="lf-section">
                <label :for="`ap-${m.id}`" class="lf-sub">Analog Lunar Mission</label>
                <select
                  :id="`ap-${m.id}`"
                  :value="layerFilterFor(m.id).apolloMission"
                  @change="patchLayerFilter(m.id, { apolloMission: ($event.target as HTMLSelectElement).value })"
                >
                  <option value="">All (Apollo)</option>
                  <option v-for="a in APOLLO_MISSIONS" :key="a" :value="a">{{ a }}</option>
                </select>
              </div>
            </div>

            <!-- 1C & 2. Similarity Range (Slider + Min/Max) -->
            <div v-if="detectLayerCapabilities(readyLayer(m.id)!).similarityField" class="lf-section">
              <span class="lf-title">
                📊 Similarity ({{ detectLayerCapabilities(readyLayer(m.id)!).similarityField!.label }})
              </span>
              <div class="range-row">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  aria-label="Minimum similarity"
                  :value="layerFilterFor(m.id).similarityRange.min ?? 0"
                  @input="updateSimilarityRange(m.id, 'min', ($event.target as HTMLInputElement).value)"
                >
                <div class="minmax-inputs">
                  <label>
                    <span>Min</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="0"
                      :value="layerFilterFor(m.id).similarityRange.min ?? ''"
                      @input="updateSimilarityRange(m.id, 'min', ($event.target as HTMLInputElement).value)"
                    >
                  </label>
                  <label>
                    <span>Max</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="100"
                      :value="layerFilterFor(m.id).similarityRange.max ?? ''"
                      @input="updateSimilarityRange(m.id, 'max', ($event.target as HTMLInputElement).value)"
                    >
                  </label>
                </div>
              </div>
            </div>

            <!-- 1B & 2. Mineral Oxides / Numeric Fields (Slider + Min/Max) -->
            <div v-if="detectLayerCapabilities(readyLayer(m.id)!).numericFields.length" class="lf-section">
              <div class="oxide-header">
                <label :for="`num-fld-${m.id}`" class="lf-title">🧪 Oxide / Numeric Field</label>
                <select
                  :id="`num-fld-${m.id}`"
                  :value="activeOxideKey(readyLayer(m.id)!)"
                  @change="selectedOxideField[m.id] = ($event.target as HTMLSelectElement).value"
                >
                  <option
                    v-for="nfld in detectLayerCapabilities(readyLayer(m.id)!).numericFields"
                    :key="nfld.key"
                    :value="nfld.key"
                  >
                    {{ nfld.label }}{{ nfld.unit ? ` (${nfld.unit})` : '' }}
                  </option>
                </select>
              </div>

              <!-- Oxide quick-pills when layer has geochemical composition -->
              <div v-if="detectLayerCapabilities(readyLayer(m.id)!).oxideFields.length" class="oxide-pills">
                <button
                  v-for="ox in detectLayerCapabilities(readyLayer(m.id)!).oxideFields"
                  :key="ox.key"
                  type="button"
                  class="ox-pill"
                  :class="{
                    active: activeOxideKey(readyLayer(m.id)!) === ox.key,
                    filtered: (layerFilterFor(m.id).ranges[ox.key]?.min !== null && layerFilterFor(m.id).ranges[ox.key]?.min !== undefined) ||
                      (layerFilterFor(m.id).ranges[ox.key]?.max !== null && layerFilterFor(m.id).ranges[ox.key]?.max !== undefined),
                  }"
                  @click="selectedOxideField[m.id] = ox.key"
                >
                  {{ ox.label }}
                </button>
              </div>

              <template v-if="activeOxideKey(readyLayer(m.id)!)">
                <div
                  v-for="activeFld in readyLayer(m.id)!.fields.filter(f => f.key === activeOxideKey(readyLayer(m.id)!))"
                  :key="activeFld.key"
                  class="range-row"
                >
                  <input
                    type="range"
                    :min="fieldRangeBounds(readyLayer(m.id)!, activeFld).min"
                    :max="fieldRangeBounds(readyLayer(m.id)!, activeFld).max"
                    :step="fieldRangeBounds(readyLayer(m.id)!, activeFld).step"
                    :aria-label="`Minimum value for ${activeFld.label}`"
                    :value="layerFilterFor(m.id).ranges[activeFld.key]?.min ?? fieldRangeBounds(readyLayer(m.id)!, activeFld).min"
                    @input="updateFieldRange(m.id, activeFld.key, 'min', ($event.target as HTMLInputElement).value)"
                  >
                  <div class="minmax-inputs">
                    <label>
                      <span>Min</span>
                      <input
                        type="number"
                        :step="fieldRangeBounds(readyLayer(m.id)!, activeFld).step"
                        :placeholder="String(fieldRangeBounds(readyLayer(m.id)!, activeFld).min)"
                        :value="layerFilterFor(m.id).ranges[activeFld.key]?.min ?? ''"
                        @input="updateFieldRange(m.id, activeFld.key, 'min', ($event.target as HTMLInputElement).value)"
                      >
                    </label>
                    <label>
                      <span>Max</span>
                      <input
                        type="number"
                        :step="fieldRangeBounds(readyLayer(m.id)!, activeFld).step"
                        :placeholder="String(fieldRangeBounds(readyLayer(m.id)!, activeFld).max)"
                        :value="layerFilterFor(m.id).ranges[activeFld.key]?.max ?? ''"
                        @input="updateFieldRange(m.id, activeFld.key, 'max', ($event.target as HTMLInputElement).value)"
                      >
                    </label>
                  </div>
                </div>
              </template>
            </div>

            <!-- Additional Categorical / Text Column Filter -->
            <div v-if="detectLayerCapabilities(readyLayer(m.id)!).categoricalFields.length" class="lf-section">
              <div class="oxide-header">
                <label :for="`cat-fld-${m.id}`" class="lf-sub">Filter another column</label>
                <select
                  :id="`cat-fld-${m.id}`"
                  :value="selectedExtraField[m.id] ?? detectLayerCapabilities(readyLayer(m.id)!).categoricalFields[0]?.key ?? ''"
                  @change="selectedExtraField[m.id] = ($event.target as HTMLSelectElement).value"
                >
                  <option
                    v-for="cf in detectLayerCapabilities(readyLayer(m.id)!).categoricalFields"
                    :key="cf.key"
                    :value="cf.key"
                  >
                    {{ cf.label }}
                  </option>
                </select>
              </div>
              <template
                v-for="catFld in detectLayerCapabilities(readyLayer(m.id)!).categoricalFields.filter(
                  f => f.key === (selectedExtraField[m.id] ?? detectLayerCapabilities(readyLayer(m.id)!).categoricalFields[0]?.key),
                )"
                :key="catFld.key"
              >
                <select
                  v-if="distinctCategoryOptions(readyLayer(m.id)!, catFld).length > 0"
                  :aria-label="`Value for ${catFld.label}`"
                  :value="layerFilterFor(m.id).categories[catFld.key] ?? ''"
                  @change="updateCategoryFilter(m.id, catFld.key, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">All ({{ catFld.label }})</option>
                  <option v-for="opt in distinctCategoryOptions(readyLayer(m.id)!, catFld)" :key="opt" :value="opt">
                    {{ opt }}
                  </option>
                </select>
                <input
                  v-else
                  type="text"
                  class="text-filter-input"
                  :placeholder="`Filter by ${catFld.label}…`"
                  :value="layerFilterFor(m.id).categories[catFld.key] ?? ''"
                  @input="updateCategoryFilter(m.id, catFld.key, ($event.target as HTMLInputElement).value)"
                >
              </template>
            </div>

            <!-- Item 2: Hide missing / sentinel (-999) values -->
            <label class="missing-check">
              <input
                type="checkbox"
                :checked="layerFilterFor(m.id).hideMissing"
                @change="patchLayerFilter(m.id, { hideMissing: ($event.target as HTMLInputElement).checked })"
              >
              <span>Hide records with missing values (null / -999)</span>
            </label>
          </div>
        </li>
      </ul>

      <div ref="statusBox" class="import" tabindex="-1">
        <p v-if="apiError" role="alert" class="error">{{ apiError }}</p>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.panel-stack { display: grid; gap: 0.85rem; }
.global-filters, .layers { border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); margin: 0; padding: 0.75rem 0.9rem 0.95rem; }
.global-filters.active { border-color: var(--color-accent-arctic-cyan); }
legend { font-weight: 600; padding: 0 0.3rem; display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.9375rem; }
.badge { font-size: 0.75rem; padding: 0.1rem 0.45rem; border-radius: 999px; background: var(--color-surface-raised); border: 1px solid var(--color-accent-arctic-cyan); color: var(--color-accent-arctic-cyan); }
.gf-header-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-bottom: 0.4rem; }
.link-btn { background: transparent; border: 1px solid var(--color-border); color: var(--color-accent-arctic-cyan); font-size: 0.75rem; padding: 0.15rem 0.5rem; min-height: 26px; border-radius: 5px; cursor: pointer; }
.gf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.gf-field { display: grid; gap: 0.2rem; min-width: 0; }
.gf-field label, .gf-distance-head label, .lf-sub { font-size: 0.75rem; color: var(--color-text-secondary); }
select, .text-filter-input {
  width: 100%; background: var(--color-bg-deep-space); color: var(--color-text-primary);
  border: 1px solid var(--color-border); border-radius: 6px; padding: 0.35rem 0.5rem;
  font: inherit; font-size: 0.8125rem; min-height: 32px;
}
select:focus-visible, .text-filter-input:focus-visible { border-color: var(--color-accent-arctic-cyan); }
.gf-distance { margin-top: 0.65rem; display: grid; gap: 0.4rem; }
.gf-distance-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; }
.origin-tag { font-family: var(--font-mono); font-size: 0.72rem; color: var(--color-accent-arctic-cyan); }
.muted-xs { font-size: 0.72rem; color: var(--color-text-secondary); }
.gf-distance-controls { display: flex; align-items: center; gap: 0.5rem; }
.gf-distance-controls input[type="range"], .range-row input[type="range"] { flex: 1; accent-color: var(--color-accent-arctic-cyan); }
.num-unit { display: flex; align-items: center; gap: 0.25rem; background: var(--color-bg-deep-space); border: 1px solid var(--color-border); border-radius: 6px; padding: 0.15rem 0.4rem; }
.num-unit input { width: 4.2rem; background: transparent; border: 0; color: var(--color-text-primary); font-family: var(--font-mono); font-size: 0.8125rem; }
.num-unit span { font-size: 0.75rem; color: var(--color-text-secondary); font-family: var(--font-mono); }
.mini-btn { padding: 0.1rem 0.45rem; min-height: 28px; }
.gf-origin-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
.pill-btn { font-size: 0.75rem; padding: 0.2rem 0.55rem; min-height: 28px; border-color: var(--color-border); }
.pill-btn.active { border-color: var(--color-accent-arctic-cyan); color: var(--color-accent-arctic-cyan); }
.pill-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.autofit-check, .missing-check { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; color: var(--color-text-secondary); cursor: pointer; min-height: 26px; }
.autofit-check input, .missing-check input { width: 14px; height: 14px; accent-color: var(--color-accent-arctic-cyan); }

ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
.layer-item { border: 1px solid transparent; border-radius: 8px; padding: 0.35rem; background: rgb(18 26 48 / 45%); }
.layer-item.expanded { border-color: var(--color-accent-arctic-cyan); background: var(--color-surface-raised); }
.layer-toggle { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; min-height: 30px; }
.layer-toggle input { width: 18px; height: 18px; accent-color: var(--color-accent-arctic-cyan); }
.swatch { display: inline-block; width: 14px; height: 14px; background: var(--pt); flex-shrink: 0; }
.swatch.pt-circle { border-radius: 50%; }
.swatch.pt-square { border-radius: 2px; }
.swatch.pt-diamond { transform: rotate(45deg) scale(0.8); }
.swatch.pt-triangle { background: none; width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 14px solid var(--pt); }
.status { display: block; margin-left: 2.1rem; font-size: 0.8125rem; color: var(--color-text-secondary); }
.filtered-count { color: var(--color-accent-arctic-cyan); font-family: var(--font-mono); }
.desc { margin: 0 0 0 2.1rem; font-size: 0.8125rem; }
.muted { color: var(--color-text-secondary); }
.error { color: var(--color-danger); margin-right: 0.5rem; }
button { background: var(--color-surface-raised); color: var(--color-text-primary); border: 1px solid var(--color-accent-royal-purple); border-radius: 6px; padding: 0.25rem 0.65rem; min-height: 30px; cursor: pointer; font: inherit; font-size: 0.8125rem; }
button:hover:not(:disabled) { border-color: var(--color-accent-arctic-cyan); }
.filter-toggle-btn.active { border-color: var(--color-accent-arctic-cyan); color: var(--color-accent-arctic-cyan); font-weight: 600; }

.layer-filter-box { margin-top: 0.6rem; padding: 0.65rem; border-radius: 6px; background: var(--color-bg-deep-space); border: 1px solid var(--color-border); display: grid; gap: 0.65rem; }
.lf-combiner { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.lf-label-inline { font-size: 0.72rem; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.seg-group { display: inline-flex; gap: 0.25rem; }
.seg-btn { font-size: 0.72rem; padding: 0.15rem 0.5rem; min-height: 24px; border-color: var(--color-border); }
.seg-btn.active { border-color: var(--color-accent-arctic-cyan); color: var(--color-accent-arctic-cyan); font-weight: 600; }
.reset-link { margin-left: auto; background: transparent; border-color: var(--color-danger); font-size: 0.72rem; padding: 0.1rem 0.45rem; min-height: 24px; }
.lf-section { display: grid; gap: 0.35rem; }
.lf-title { font-size: 0.78rem; font-weight: 600; color: var(--color-text-primary); }
.lf-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.preset-chips, .active-tags, .oxide-pills { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.chip-btn { font-size: 0.72rem; padding: 0.15rem 0.55rem; min-height: 24px; border-radius: 999px; background: var(--color-surface); }
.chip-btn.active { border-color: var(--color-accent-arctic-cyan); color: var(--color-accent-arctic-cyan); font-weight: 600; }
.tag-chip { font-size: 0.72rem; padding: 0.1rem 0.45rem; min-height: 22px; border-radius: 4px; border-color: var(--color-accent-arctic-cyan); color: var(--color-accent-arctic-cyan); }
.oxide-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.oxide-header select { width: auto; max-width: 11rem; }
.ox-pill { font-family: var(--font-mono); font-size: 0.72rem; padding: 0.1rem 0.4rem; min-height: 22px; border-color: var(--color-border); }
.ox-pill.active { border-color: var(--color-accent-arctic-cyan); color: var(--color-accent-arctic-cyan); font-weight: 700; }
.ox-pill.filtered { background: rgb(0 229 255 / 14%); }
.range-row { display: grid; gap: 0.35rem; }
.minmax-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
.minmax-inputs label { display: flex; align-items: center; gap: 0.3rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 5px; padding: 0.15rem 0.4rem; font-size: 0.72rem; color: var(--color-text-secondary); }
.minmax-inputs input { width: 100%; background: transparent; border: 0; color: var(--color-text-primary); font-family: var(--font-mono); font-size: 0.78rem; min-width: 0; }

.import { margin-top: 1rem; display: grid; gap: 0.4rem; justify-items: start; }
.hint { margin: 0; font-size: 0.8125rem; }
.actions { margin: 0.25rem 0 0 2.1rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
.warn { font-size: 0.8125rem; color: var(--color-danger); }
.danger { border-color: var(--color-danger); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
