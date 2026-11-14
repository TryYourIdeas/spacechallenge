import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHub, frame } from '../src/sse.js'
import { CHANNEL, taskView } from '../src/events.js'
import { listCsvFiles } from '../src/files.js'

test('taskView normalises a database row', () => {
  const v = taskView({ id: 'x', kind: 'csv_import', source_name: 'a.csv', status: 'processing',
    progress_done: '5', progress_total: null, created_at: '2026-01-01T00:00:00Z', updated_at: new Date(0) })
  assert.deepEqual([v.progressDone, v.progressTotal, v.importedRows, v.error], [5, null, null, null])
  assert.equal(v.updatedAt, '1970-01-01T00:00:00.000Z')
})

test('hub forwards published tasks as SSE frames and stops after remove', async () => {
  const sub = Object.assign(new EventEmitter(), { subscribe: async () => {}, disconnect() {} })
  const hub = await createHub({ duplicate: () => sub })
  const got = []
  const client = { write: (c) => got.push(c) }
  assert.equal(hub.add(client), true)
  sub.emit('message', CHANNEL, JSON.stringify({ id: '1', status: 'done' }))
  assert.deepEqual(got, [frame('task', { id: '1', status: 'done' })])
  assert.match(got[0], /^event: task\ndata: \{.*\}\n\n$/)
  hub.remove(client)
  sub.emit('message', CHANNEL, '{"id":"2"}')
  sub.emit('message', CHANNEL, 'not json')
  assert.equal(got.length, 1)
  await hub.close()
})

test('listCsvFiles returns only visible regular .csv files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'files-'))
  try {
    await writeFile(join(dir, 'b.csv'), 'x')
    await writeFile(join(dir, 'A.CSV'), 'xy')
    await writeFile(join(dir, '.hidden.csv'), 'x')
    await writeFile(join(dir, 'notes.md'), 'x')
    await mkdir(join(dir, 'sub.csv'))
    await symlink('/etc/passwd', join(dir, 'link.csv'))
    const files = await listCsvFiles(dir)
    assert.deepEqual(files.map(f => [f.name, f.size]), [['A.CSV', 2], ['b.csv', 1]])
  } finally { await rm(dir, { recursive: true }) }
})
