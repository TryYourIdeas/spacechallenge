import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyze, points, parseNumber, ImportError } from '../src/csv.js'

async function withCsv(text, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'csv-'))
  const p = join(dir, 'a.csv')
  await writeFile(p, text)
  try { return await fn(p) } finally { await rm(dir, { recursive: true }) }
}
const collect = async (it) => { const out = []; for await (const x of it) out.push(x); return out }

test('parseNumber is strict', () => {
  assert.equal(parseNumber(' 1.5e2 '), 150)
  for (const bad of ['', 'abc', '0x10', 'Infinity', '1,5', null]) assert.equal(parseNumber(bad), null)
})

test('analyze + points keep every column and skip bad coordinates', () =>
  withCsv('﻿id,sample_name,Lat,LON,SiO2,note\r\n1,A,10,20,50.5,"a,b"\r\n2,B,999,20,1,x\r\n3,C,,5,2,y\r\n4,D,-5,-6,,"multi\nline"\r\n',
    async (p) => {
      const a = await analyze(p)
      assert.equal(a.valid, 2)
      assert.equal(a.skipped, 2)
      assert.deepEqual(a.fields.map(f => f.type), ['number', 'string', 'number', 'number', 'number', 'string'])
      const pts = await collect(points(p, a))
      assert.equal(pts.length, 2)
      assert.deepEqual(pts[0], { idx: 0, latitude: 10, longitude: 20, name: 'A',
        data: { c0: 1, c1: 'A', c2: 10, c3: 20, c4: 50.5, c5: 'a,b' } })
      assert.equal(pts[1].idx, 3)
      assert.equal(pts[1].data.c4, null)
      assert.equal(pts[1].data.c5, 'multi\nline')
    }))

test('analyze rejects unusable files with user-safe errors', async () => {
  await withCsv('a,b\n1,2\n', p => assert.rejects(analyze(p), ImportError))
  await withCsv('lat,lon\nx,y\n', p => assert.rejects(analyze(p), /valid latitude/))
  await withCsv('lat,lon\n', p => assert.rejects(analyze(p), /valid latitude/))
  await withCsv('', p => assert.rejects(analyze(p), /empty/))
})
