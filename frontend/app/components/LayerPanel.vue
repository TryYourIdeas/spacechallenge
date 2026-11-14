<script setup lang="ts">
import type { LayerMeta } from '~/types/layers'
import type { LayerState } from '~/composables/useLayers'

defineProps<{
  metas: LayerMeta[]
  states: Record<string, LayerState>
  visible: Set<string>
}>()
const emit = defineEmits<{ toggle: [id: string]; retry: [id: string] }>()
</script>

<template>
  <fieldset class="layers">
    <legend>Layers</legend>
    <p v-if="!metas.length" class="muted">No layers available.</p>
    <ul>
      <li v-for="m in metas" :key="m.id">
        <label>
          <input type="checkbox" :checked="visible.has(m.id)" @change="emit('toggle', m.id)">
          <span class="swatch" :class="`pt-${m.shape}`" :style="{ '--pt': m.color }" aria-hidden="true" />
          <span class="name">{{ m.label }}</span>
        </label>
        <span class="status" role="status">
          <template v-if="states[m.id]?.status === 'ready'">
            {{ (states[m.id] as any).layer.rows.length }} points<template v-if="(states[m.id] as any).layer.skipped">
              , {{ (states[m.id] as any).layer.skipped }} skipped (invalid coordinates)</template>
          </template>
          <template v-else-if="states[m.id]?.status === 'error'">
            <span class="error">Failed to load: {{ (states[m.id] as any).message }}</span>
            <button type="button" @click="emit('retry', m.id)">Retry</button>
          </template>
          <template v-else>Loading…</template>
        </span>
        <p v-if="m.description" class="muted desc">{{ m.description }}</p>
      </li>
    </ul>
  </fieldset>
</template>

<style scoped>
.layers { border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); margin: 0; padding: 0.75rem 1rem 1rem; }
legend { font-weight: 600; padding: 0 0.25rem; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
label { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; min-height: 32px; }
input { width: 18px; height: 18px; accent-color: var(--color-accent-arctic-cyan); }
.swatch { display: inline-block; width: 14px; height: 14px; background: var(--pt); }
.swatch.pt-circle { border-radius: 50%; }
.swatch.pt-square { border-radius: 2px; }
.swatch.pt-diamond { transform: rotate(45deg) scale(0.8); }
.swatch.pt-triangle { background: none; width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 14px solid var(--pt); }
.status { display: block; margin-left: 2.1rem; font-size: 0.8125rem; color: var(--color-text-secondary); }
.desc { margin: 0 0 0 2.1rem; font-size: 0.8125rem; }
.muted { color: var(--color-text-secondary); }
.error { color: var(--color-danger); margin-right: 0.5rem; }
button { background: var(--color-surface-raised); color: var(--color-text-primary); border: 1px solid var(--color-accent-royal-purple); border-radius: 6px; padding: 0.25rem 0.75rem; min-height: 32px; cursor: pointer; font: inherit; }
button:hover { border-color: var(--color-accent-arctic-cyan); }
</style>
