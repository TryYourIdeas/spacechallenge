import type { Layer, LayerMeta } from '~/types/layers'
import { parseLayer, parseLayerIndex } from '~/utils/layers'

export type LayerState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; layer: Layer }

/**
 * Loads the layer index and each layer's table. The only place that knows where
 * data comes from: today static JSON in /data; swap `fetchJson` for API calls
 * once the API service exposes these tables.
 */
export function useLayers() {
  const baseURL = useRuntimeConfig().app.baseURL.replace(/\/$/, '')
  const dataBase = `${baseURL}/data/`

  const indexState = ref<'loading' | 'error' | 'ready'>('loading')
  const indexError = ref('')
  const metas = shallowRef<LayerMeta[]>([])
  const states = shallowRef<Record<string, LayerState>>({})
  const visible = ref<Set<string>>(new Set())
  let controller: AbortController | undefined

  async function fetchJson(path: string, signal: AbortSignal): Promise<unknown> {
    const res = await fetch(dataBase + path, { signal })
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return res.json()
  }

  function setState(id: string, state: LayerState) {
    states.value = { ...states.value, [id]: state }
  }

  async function loadLayer(meta: LayerMeta, signal: AbortSignal) {
    setState(meta.id, { status: 'loading' })
    try {
      const layer = parseLayer(meta, await fetchJson(meta.source, signal))
      if (signal.aborted) return
      setState(meta.id, { status: 'ready', layer })
    } catch (e) {
      if (signal.aborted) return
      setState(meta.id, { status: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
    }
  }

  async function load() {
    controller?.abort()
    controller = new AbortController()
    const { signal } = controller
    indexState.value = 'loading'
    try {
      const list = parseLayerIndex(await fetchJson('layers.json', signal))
      if (signal.aborted) return
      metas.value = list
      visible.value = new Set(list.map(m => m.id))
      indexState.value = 'ready'
      await Promise.all(list.map(m => loadLayer(m, signal)))
    } catch (e) {
      if (signal.aborted) return
      indexError.value = e instanceof Error ? e.message : 'Unknown error'
      indexState.value = 'error'
    }
  }

  function retryLayer(id: string) {
    const meta = metas.value.find(m => m.id === id)
    if (meta && controller) void loadLayer(meta, controller.signal)
  }

  function toggle(id: string) {
    const next = new Set(visible.value)
    if (!next.delete(id)) next.add(id)
    visible.value = next
  }

  onMounted(load)
  onBeforeUnmount(() => controller?.abort())

  return { indexState, indexError, metas, states, visible, toggle, reload: load, retryLayer }
}
