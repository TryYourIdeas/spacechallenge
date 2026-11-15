import type { ClusterResponse, DataFile, Layer, LayerMeta, LayerRow, PointSummary, ServerTask } from '~/types/layers'
import type { ServerFilterPayload } from '~/utils/filters'
import { parseClusterResponse, parseLayer, parseLayerIndex, parsePointList, parsePointRow, parseRemoteLayer } from '~/utils/layers'

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
      const kept = metas.value.filter(m => m.imported)
      metas.value = [...list, ...kept]
      visible.value = new Set([...list, ...kept].map(m => m.id).filter(id => !kept.some(k => k.id === id) || visible.value.has(id)))
      indexState.value = 'ready'
      if (!events) connectEvents()
      await Promise.all([...list.map(m => loadLayer(m, signal)), syncServerLayers(signal)])
    } catch (e) {
      if (signal.aborted) return
      indexError.value = e instanceof Error ? e.message : 'Unknown error'
      indexState.value = 'error'
    }
  }

  function retryLayer(id: string) {
    const meta = metas.value.find(m => m.id === id)
    if (!meta || !controller) return
    if (meta.imported) {
      setState(id, { status: 'loading' })
      loadServerLayer(meta, controller.signal).catch((e) => {
        setState(id, { status: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
      })
    } else void loadLayer(meta, controller.signal)
  }

  function toggle(id: string) {
    const next = new Set(visible.value)
    if (!next.delete(id)) next.add(id)
    visible.value = next
  }

  // ---- Layers stored on the server (CSV files imported from the data directory) ----
  const tasks = ref<ServerTask[]>([])
  const apiError = ref('')
  const eventsOnline = ref(false)
  const files = ref<DataFile[]>([])
  const filesState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const filesError = ref('')
  const importError = ref('')
  const apiBase = String(useRuntimeConfig().public.apiBase).replace(/\/$/, '')
  let events: EventSource | undefined
  const loadingServer = new Set<string>()

  async function api(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(apiBase + path, init)
    if (!res.ok) {
      let msg = `Request failed (${res.status})`
      try { const b = await res.json(); const text = b?.message ?? b?.error; if (typeof text === 'string') msg = text } catch { /* keep default */ }
      throw new Error(msg)
    }
    return res
  }

  /** Server layers load a summary only; their points are fetched per viewport (see the three functions below). */
  async function loadServerLayer(meta: LayerMeta, signal: AbortSignal) {
    const res = await api(`/api/layers/${meta.id}`, { signal })
    const layer = parseRemoteLayer(meta, await res.json())
    if (signal.aborted) return
    setState(meta.id, { status: 'ready', layer })
  }

  /** Grid-clustered points of a server layer inside `bbox` ("west,south,east,north") at `zoom`. */
  async function fetchClusters(id: string, bbox: string, zoom: number, signal: AbortSignal, filter?: ServerFilterPayload | null): Promise<ClusterResponse> {
    const f = filter ? `&filter=${encodeURIComponent(JSON.stringify(filter))}` : ''
    const res = await api(`/api/layers/${id}/clusters?bbox=${encodeURIComponent(bbox)}&zoom=${zoom}${f}`, { signal })
    return parseClusterResponse(await res.json())
  }

  /** Individual points inside a small box, for clusters that zooming cannot split. */
  async function fetchPoints(id: string, bbox: string, signal: AbortSignal, filter?: ServerFilterPayload | null): Promise<{ points: PointSummary[]; truncated: boolean }> {
    const f = filter ? `&filter=${encodeURIComponent(JSON.stringify(filter))}` : ''
    const res = await api(`/api/layers/${id}/points?bbox=${encodeURIComponent(bbox)}${f}`, { signal })
    return parsePointList(await res.json())
  }

  /** Every column of one server-layer point. */
  async function fetchPoint(id: string, rowId: string, signal?: AbortSignal): Promise<LayerRow> {
    const res = await api(`/api/layers/${id}/points/${encodeURIComponent(rowId)}`, { signal })
    return parsePointRow(await res.json())
  }

  function showServerLayer(meta: LayerMeta) {
    if (!metas.value.some(m => m.id === meta.id)) metas.value = [...metas.value, meta]
    visible.value = new Set([...visible.value, meta.id])
  }

  /** Loads every server layer we don't have yet (page start, SSE reconnect, finished import). */
  async function syncServerLayers(signal: AbortSignal) {
    try {
      const res = await api('/api/layers', { signal })
      const list = parseLayerIndex(await res.json()).map(m => ({ ...m, imported: true }))
      if (signal.aborted) return
      apiError.value = ''
      await Promise.all(list.filter(m => !states.value[m.id] && !loadingServer.has(m.id)).map(async (m) => {
        loadingServer.add(m.id)
        showServerLayer(m)
        setState(m.id, { status: 'loading' })
        try { await loadServerLayer(m, signal) } catch (e) {
          if (!signal.aborted) setState(m.id, { status: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
        } finally { loadingServer.delete(m.id) }
      }))
    } catch {
      if (!signal.aborted) apiError.value = 'Saved CSV layers are unavailable: the server could not be reached.'
    }
  }

  function applyTask(t: ServerTask) {
    const prev = tasks.value.find(x => x.id === t.id)
    // Events can arrive out of order relative to the snapshot; keep the newest.
    if (prev && prev.updatedAt > t.updatedAt) return
    tasks.value = [t, ...tasks.value.filter(x => x.id !== t.id)]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8)
    if (t.status === 'done' && prev?.status !== 'done' && controller) void syncServerLayers(controller.signal)
  }

  function connectEvents() {
    if (typeof EventSource === 'undefined') return
    events?.close()
    events = new EventSource(`${apiBase}/api/events`)
    events.addEventListener('open', () => { eventsOnline.value = true })
    events.addEventListener('error', () => { eventsOnline.value = false }) // the browser retries by itself
    events.addEventListener('snapshot', (e) => {
      try {
        const { tasks: list } = JSON.parse((e as MessageEvent).data) as { tasks: ServerTask[] }
        list.forEach(applyTask)
        if (controller) void syncServerLayers(controller.signal)
      } catch { /* ignore malformed frame */ }
    })
    events.addEventListener('task', (e) => {
      try { applyTask(JSON.parse((e as MessageEvent).data) as ServerTask) } catch { /* ignore malformed frame */ }
    })
  }

  async function loadFiles() {
    filesState.value = 'loading'
    filesError.value = ''
    try {
      files.value = ((await (await api('/api/files')).json()) as { files: DataFile[] }).files
      filesState.value = 'ready'
    } catch (e) {
      filesError.value = e instanceof Error ? e.message : 'Could not list files'
      filesState.value = 'error'
    }
  }

  /** Asks the server to import a file from its data directory; progress arrives over SSE. */
  async function startImport(name: string) {
    importError.value = ''
    try {
      const res = await api('/api/imports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: name }),
      })
      applyTask(await res.json() as ServerTask)
    } catch (e) {
      importError.value = `${name}: ${e instanceof Error ? e.message : 'could not start the import'}`
    }
  }

  /** Imported layers are deleted on the server; built-in ones are only dropped from this session. */
  async function removeLayer(id: string) {
    if (metas.value.find(m => m.id === id)?.imported) {
      try {
        await api(`/api/layers/${id}`, { method: 'DELETE' })
      } catch (e) {
        apiError.value = `Could not remove the layer: ${e instanceof Error ? e.message : 'unknown error'}`
        return
      }
      apiError.value = ''
    }
    metas.value = metas.value.filter(m => m.id !== id)
    const { [id]: _gone, ...rest } = states.value
    states.value = rest
    const next = new Set(visible.value)
    next.delete(id)
    visible.value = next
  }

  onMounted(load)
  onBeforeUnmount(() => { controller?.abort(); events?.close() })

  return { indexState, indexError, metas, states, visible, toggle, reload: load, retryLayer, tasks, apiError, eventsOnline, files, filesState, filesError, importError, loadFiles, startImport, removeLayer, fetchClusters, fetchPoints, fetchPoint }
}
