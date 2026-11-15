import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseLayer, parseLayerIndex } from '../app/utils/layers'

const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'))

describe('shipped layer data', () => {
  const metas = parseLayerIndex(read('layers.json'))
  it('has a valid (possibly empty) index', () => expect(Array.isArray(metas)).toBe(true))
  it.each(metas.map(m => [m.id, m] as const))('%s parses with no skipped rows', (_id, meta) => {
    const layer = parseLayer(meta, read(meta.source))
    expect(layer.rows.length).toBeGreaterThan(0)
    expect(layer.skipped).toBe(0)
    for (const f of layer.fields) expect(layer.rows.every(r => f.key in r)).toBe(true)
  })
})
