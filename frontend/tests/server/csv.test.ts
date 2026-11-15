import { describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyze, points, parseNumber, ImportError } from '../../server/utils/csv'

async function withCsv<T>(text: string, fn: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'csv-'))
  const p = join(dir, 'a.csv')
  await writeFile(p, text)
  try { return await fn(p) } finally { await rm(dir, { recursive: true }) }
}
const collect = async <T>(it: AsyncIterable<T>) => { const out: T[] = []; for await (const x of it) out.push(x); return out }

describe('parseNumber', () => {
  it('is strict', () => {
    expect(parseNumber(' 1.5e2 ')).toBe(150)
    for (const bad of ['', 'abc', '0x10', 'Infinity', '1,5', null]) expect(parseNumber(bad)).toBeNull()
  })
})

describe('analyze + points', () => {
  it('keeps every column and skips bad coordinates', () =>
    withCsv('﻿id,sample_name,Lat,LON,SiO2,note\r\n1,A,10,20,50.5,"a,b"\r\n2,B,999,20,1,x\r\n3,C,,5,2,y\r\n4,D,-5,-6,,"multi\nline"\r\n',
      async (p) => {
        const a = await analyze(p)
        expect([a.valid, a.skipped]).toEqual([2, 2])
        expect(a.fields.map(f => f.type)).toEqual(['number', 'string', 'number', 'number', 'number', 'string'])
        const pts = await collect(points(p, a))
        expect(pts).toHaveLength(2)
        expect(pts[0]).toEqual({ idx: 0, latitude: 10, longitude: 20, name: 'A',
          data: { c0: 1, c1: 'A', c2: 10, c3: 20, c4: 50.5, c5: 'a,b' } })
        expect(pts[1]!.idx).toBe(3)
        expect(pts[1]!.data.c4).toBeNull()
        expect(pts[1]!.data.c5).toBe('multi\nline')
      }))

  it('rejects unusable files with user-safe errors', async () => {
    await withCsv('a,b\n1,2\n', p => expect(analyze(p)).rejects.toBeInstanceOf(ImportError))
    await withCsv('lat,lon\nx,y\n', p => expect(analyze(p)).rejects.toThrow(/valid latitude/))
    await withCsv('lat,lon\n', p => expect(analyze(p)).rejects.toThrow(/valid latitude/))
    await withCsv('', p => expect(analyze(p)).rejects.toThrow(/empty/))
  })
})
