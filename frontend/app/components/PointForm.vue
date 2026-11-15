<script setup lang="ts">
import type { SelectedPoint } from '~/types/layers'
import { formatValue } from '~/utils/layers'

const props = defineProps<{ point: SelectedPoint | null }>()
const emit = defineEmits<{ close: []; retry: [] }>()

const heading = ref<HTMLElement>()
defineExpose({ focus: () => heading.value?.focus() })

const title = computed(() => String(props.point?.row.name ?? props.point?.row.id ?? ''))
const uid = useId()
</script>

<template>
  <aside
    v-if="point" class="dialog" role="dialog" aria-modal="false" aria-labelledby="point-heading"
    @keydown.esc.stop="emit('close')"
  >
    <header class="head">
      <h2 id="point-heading" ref="heading" tabindex="-1">Point details</h2>
      <button type="button" class="x" aria-label="Close point details" @click="emit('close')">
        <span aria-hidden="true">&times;</span>
      </button>
    </header>

    <form :key="`${point.layer.id}/${point.row.id}`" aria-live="polite" @submit.prevent>
      <p class="layer">
        <span class="chip" :style="{ '--pt': point.layer.color }" aria-hidden="true" />
        {{ point.layer.label }}
      </p>
      <p class="title">{{ title }}</p>

      <p v-if="point.status === 'loading'" role="status" class="muted loading">Loading point data…</p>
      <div v-else-if="point.status === 'error'" role="alert" class="problem">
        <p>Could not load this point: {{ point.error }}</p>
        <button type="button" @click="emit('retry')">Retry</button>
      </div>

      <div v-for="f in (point.status ? [] : point.fields)" :key="f.key" class="field">
        <label :for="`${uid}-${f.key}`">{{ f.label }}</label>
        <input :id="`${uid}-${f.key}`" :value="formatValue(f, point.row[f.key])" readonly>
      </div>

      <div class="coords">
        <div class="field">
          <label :for="`${uid}-lat`">Latitude</label>
          <input :id="`${uid}-lat`" :value="point.row.latitude.toFixed(5)" readonly>
        </div>
        <div class="field">
          <label :for="`${uid}-lon`">Longitude</label>
          <input :id="`${uid}-lon`" :value="point.row.longitude.toFixed(5)" readonly>
        </div>
      </div>

      <button type="button" @click="emit('close')">Close</button>
    </form>
  </aside>
</template>

<style scoped>
.dialog { position: absolute; top: 1rem; right: 1rem; bottom: 1rem; z-index: 1100; width: min(360px, calc(100% - 2rem)); overflow-y: auto; border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); padding: 1rem; box-shadow: 0 8px 32px rgb(0 0 0 / 0.5); }
.head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.75rem; }
h2 { margin: 0; font-size: 1.0625rem; }
.x { min-width: 40px; padding: 0; font-size: 1.5rem; line-height: 1; }
h2:focus-visible { border-radius: 4px; }
.muted { color: var(--color-text-secondary); margin: 0; }
.loading { margin-bottom: 0.75rem; }
.problem { color: var(--color-danger); margin-bottom: 0.75rem; }
.problem p { margin: 0 0 0.5rem; }
.layer { margin: 0; color: var(--color-text-secondary); font-size: 0.8125rem; display: flex; align-items: center; gap: 0.5rem; }
.chip { width: 10px; height: 10px; border-radius: 50%; background: var(--pt); }
.title { margin: 0.25rem 0 1rem; font-size: 1.25rem; font-weight: 600; overflow-wrap: anywhere; }
.field { display: grid; gap: 0.25rem; margin-bottom: 0.75rem; min-width: 0; }
label { font-size: 0.8125rem; color: var(--color-text-secondary); }
input { width: 100%; background: var(--color-bg-deep-space); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: 6px; padding: 0.5rem 0.65rem; font: inherit; min-height: 40px; }
input:focus-visible { border-color: var(--color-accent-arctic-cyan); }
.coords { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.coords input { font-family: var(--font-mono); }
button { background: var(--color-surface-raised); color: var(--color-text-primary); border: 1px solid var(--color-accent-royal-purple); border-radius: 6px; padding: 0.5rem 1rem; min-height: 40px; cursor: pointer; font: inherit; }
button:hover { border-color: var(--color-accent-arctic-cyan); }
@media (max-width: 800px) { .dialog { top: auto; max-height: 70%; left: 1rem; width: auto; } }
</style>
