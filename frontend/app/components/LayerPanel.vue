<script setup lang="ts">
import type { DataFile, LayerMeta, ServerTask } from '~/types/layers'
import type { LayerState } from '~/composables/useLayers'

defineProps<{
  metas: LayerMeta[]
  states: Record<string, LayerState>
  visible: Set<string>
  tasks: ServerTask[]
  apiError: string
  eventsOnline: boolean
  files: DataFile[]
  filesState: 'idle' | 'loading' | 'ready' | 'error'
  filesError: string
  importError: string
}>()
const emit = defineEmits<{
  toggle: [id: string]; retry: [id: string]; remove: [id: string]
  'load-files': []; 'start-import': [name: string]
}>()

const picking = ref(false)
const confirming = ref<string | null>(null)
const importBtn = ref<HTMLButtonElement>()

async function remove(id: string) {
  confirming.value = null
  emit('remove', id)
  await nextTick()
  importBtn.value?.focus() // the removed layer's controls are gone; keep keyboard focus in the panel
}

function togglePicker() {
  picking.value = !picking.value
  if (picking.value) emit('load-files')
}
function choose(name: string) {
  picking.value = false
  emit('start-import', name)
}

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const nf = new Intl.NumberFormat('en-US')

function taskText(t: ServerTask): string {
  switch (t.status) {
    case 'queued': return 'Queued…'
    case 'processing':
      return t.progressTotal === null
        ? `Scanning file… ${nf.format(t.progressDone)} rows read`
        : `Importing ${nf.format(t.progressDone)} of ${nf.format(t.progressTotal)} points`
    case 'done': return `Done: ${nf.format(t.importedRows ?? 0)} points${t.skippedRows ? `, ${nf.format(t.skippedRows)} skipped` : ''}`
    default: return `Failed${t.error ? `: ${t.error}` : ''}`
  }
}
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
            {{ ((states[m.id] as any).layer.remote?.rowCount ?? (states[m.id] as any).layer.rows.length).toLocaleString('en-US') }} points<template v-if="(states[m.id] as any).layer.skipped">
              , {{ (states[m.id] as any).layer.skipped }} skipped (invalid coordinates)</template>
          </template>
          <template v-else-if="states[m.id]?.status === 'error'">
            <span class="error">Failed to load: {{ (states[m.id] as any).message }}</span>
            <button type="button" @click="emit('retry', m.id)">Retry</button>
          </template>
          <template v-else>Loading…</template>
        </span>
        <p v-if="m.description" class="muted desc">{{ m.description }}</p>
        <div class="actions">
          <template v-if="confirming === m.id">
            <span class="warn" role="alert">Delete {{ m.label }} permanently?</span>
            <button type="button" class="danger" @click="remove(m.id)">Delete</button>
            <button type="button" @click="confirming = null">Cancel</button>
          </template>
          <button v-else type="button" :aria-label="`Remove layer ${m.label}`" @click="m.imported ? (confirming = m.id) : remove(m.id)">Remove</button>
        </div>
      </li>
    </ul>
    <div class="import">
      <button ref="importBtn" type="button" :aria-expanded="picking" aria-controls="file-picker" @click="togglePicker">
        Import CSV…
      </button>
      <p class="muted hint">Choose a file from the server's data directory.</p>
      <div v-if="picking" id="file-picker" role="group" aria-label="CSV files in the data directory" class="picker">
        <p v-if="filesState === 'loading'" role="status" class="muted">Loading files…</p>
        <p v-else-if="filesState === 'error'" role="alert" class="error">{{ filesError }}</p>
        <p v-else-if="!files.length" class="muted">No CSV files found in the data directory.</p>
        <ul v-else>
          <li v-for="f in files" :key="f.name">
            <button type="button" class="file" @click="choose(f.name)">
              <span class="fname">{{ f.name }}</span><span class="muted">{{ size(f.size) }}</span>
            </button>
          </li>
        </ul>
      </div>
      <p v-if="importError" role="alert" class="error">{{ importError }}</p>
      <p v-if="apiError" role="alert" class="error">{{ apiError }}</p>
      <p v-if="!eventsOnline && tasks.some(t => t.status === 'queued' || t.status === 'processing')" role="status" class="muted hint">
        Live progress is reconnecting…
      </p>
      <ul v-if="tasks.length" class="jobs" aria-label="Import tasks">
        <li v-for="t in tasks" :key="t.id">
          <span class="fname">{{ t.sourceName }}</span>
          <progress
            v-if="t.status === 'processing' && t.progressTotal !== null"
            :value="t.progressDone" :max="t.progressTotal" :aria-label="`Import progress for ${t.sourceName}`"
          />
          <progress v-else-if="t.status === 'processing' || t.status === 'queued'" :aria-label="`Import progress for ${t.sourceName}`" />
          <span class="status" :class="{ error: t.status === 'failed' }">{{ taskText(t) }}</span>
        </li>
      </ul>
      <p class="sr-only" role="status" aria-live="polite">
        <template v-for="t in tasks.slice(0, 3)" :key="t.id">
          <template v-if="t.status === 'done' || t.status === 'failed'">{{ t.sourceName }}: {{ taskText(t) }}. </template>
        </template>
      </p>
    </div>
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
.import { margin-top: 1rem; display: grid; gap: 0.4rem; justify-items: start; }
.hint { margin: 0; font-size: 0.8125rem; }
.actions { margin: 0.25rem 0 0 2.1rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.warn { font-size: 0.8125rem; color: var(--color-danger); }
.danger { border-color: var(--color-danger); }
.jobs { margin-top: 0.5rem; gap: 0.6rem; width: 100%; }
.picker { width: 100%; max-height: 14rem; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 6px; padding: 0.5rem; background: var(--color-bg-deep-space); }
.picker ul { gap: 0.25rem; }
.file { width: 100%; display: flex; justify-content: space-between; gap: 0.75rem; text-align: left; }
progress { width: 100%; height: 8px; accent-color: var(--color-accent-arctic-cyan); }
.jobs .status { margin-left: 0; }
.fname { overflow-wrap: anywhere; font-size: 0.875rem; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
button:hover { border-color: var(--color-accent-arctic-cyan); }
</style>
