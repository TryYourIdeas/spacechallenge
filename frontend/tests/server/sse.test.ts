import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHub } from '../../server/utils/sse'
import { CHANNEL, taskView, type TaskRow } from '../../server/utils/events'
import { listCsvFiles } from '../../server/utils/files'

describe('taskView', () => {
  it('normalises a database row', () => {
    const v = taskView({ id: 'x', kind: 'csv_import', source_name: 'a.csv', status: 'processing',
      progress_done: '5', progress_total: null, imported_rows: null, skipped_rows: null, error: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: new Date(0) } satisfies TaskRow)
    expect([v.progressDone, v.progressTotal, v.importedRows, v.error]).toEqual([5, null, null, null])
    expect(v.updatedAt).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('hub', () => {
  it('forwards published tasks to clients and stops after remove', async () => {
    const sub = Object.assign(new EventEmitter(), { subscribe: async () => {}, disconnect() {} })
    const hub = await createHub({ duplicate: () => sub } as never)
    const got: [string, unknown][] = []
    const client = { send: (e: string, d: unknown) => got.push([e, d]) }
    expect(hub.add(client)).toBe(true)
    sub.emit('message', CHANNEL, JSON.stringify({ id: '1', status: 'done' }))
    expect(got).toEqual([['task', { id: '1', status: 'done' }]])
    hub.remove(client)
    sub.emit('message', CHANNEL, '{"id":"2"}')
    sub.emit('message', CHANNEL, 'not json')
    expect(got).toHaveLength(1)
    await hub.close()
  })
})

describe('listCsvFiles', () => {
  it('returns only visible regular .csv files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'files-'))
    try {
      await writeFile(join(dir, 'b.csv'), 'x')
      await writeFile(join(dir, 'A.CSV'), 'xy')
      await writeFile(join(dir, '.hidden.csv'), 'x')
      await writeFile(join(dir, 'notes.md'), 'x')
      await mkdir(join(dir, 'sub.csv'))
      await symlink('/etc/passwd', join(dir, 'link.csv'))
      expect((await listCsvFiles(dir)).map(f => [f.name, f.size])).toEqual([['A.CSV', 2], ['b.csv', 1]])
    } finally { await rm(dir, { recursive: true }) }
  })
})
