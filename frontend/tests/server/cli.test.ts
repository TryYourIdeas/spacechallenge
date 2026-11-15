import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { maskUrl, resolveDatabaseUrl, validateCsvPath } from '../../server/utils/cli'

let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'cli-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

describe('resolveDatabaseUrl', () => {
  it('prefers the environment', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: 'postgres://e' }, 'DATABASE_URL=postgres://f')).toBe('postgres://e')
  })
  it('falls back to the env file, ignoring comments and quotes', () => {
    expect(resolveDatabaseUrl({}, '# x\nFOO=1\nDATABASE_URL="postgres://f/db"\n')).toBe('postgres://f/db')
  })
  it('throws when neither has it', () => {
    expect(() => resolveDatabaseUrl({}, 'FOO=1')).toThrow(/DATABASE_URL/)
    expect(() => resolveDatabaseUrl({})).toThrow(/DATABASE_URL/)
  })
})

describe('maskUrl', () => {
  it('hides the password', () => {
    const m = maskUrl('postgres://user:secret@host:5432/db')
    expect(m).not.toContain('secret')
    expect(m).toContain('host:5432/db')
  })
  it('hides the password in unparsable input', () => {
    expect(maskUrl('not a url:secret@x')).not.toContain('secret')
  })
})

describe('validateCsvPath', () => {
  it('returns an absolute path for a real csv', async () => {
    const p = join(dir, 'ok.csv'); await writeFile(p, 'a\n1\n')
    const r = await validateCsvPath(p)
    expect(isAbsolute(r)).toBe(true)
  })
  it('rejects missing, directory, non-csv and empty files', async () => {
    await mkdir(join(dir, 'd.csv'))
    await writeFile(join(dir, 'x.txt'), 'a'); await writeFile(join(dir, 'empty.csv'), '')
    await expect(validateCsvPath(join(dir, 'nope.csv'))).rejects.toThrow(/not found/i)
    await expect(validateCsvPath(join(dir, 'd.csv'))).rejects.toThrow(/not a file/i)
    await expect(validateCsvPath(join(dir, 'x.txt'))).rejects.toThrow(/\.csv/)
    await expect(validateCsvPath(join(dir, 'empty.csv'))).rejects.toThrow(/empty/i)
  })
})
