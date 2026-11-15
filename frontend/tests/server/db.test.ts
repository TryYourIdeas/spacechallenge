import { describe, expect, it } from 'vitest'
import { createPool } from '../../server/utils/db'
import { API_CONNECTION_TIMEOUT_MS, API_STATEMENT_TIMEOUT_MS } from '../../server/utils/services'

const options = (p: ReturnType<typeof createPool>) => (p as unknown as { options: Record<string, unknown> }).options

describe('createPool limits', () => {
  it('sets no timeouts for scripts (migrations and imports run for minutes)', async () => {
    const p = createPool('postgres://u:p@127.0.0.1:1/x')
    expect(options(p).statement_timeout).toBeUndefined()
    expect(options(p).connectionTimeoutMillis).toBeUndefined()
    await p.end()
  })

  it('applies the statement and connection timeouts when given', async () => {
    const p = createPool('postgres://u:p@127.0.0.1:1/x', { statementTimeoutMs: 1234, connectionTimeoutMs: 567 })
    expect(options(p).statement_timeout).toBe(1234)
    expect(options(p).connectionTimeoutMillis).toBe(567)
    await p.end()
  })

  it('keeps the API limits shorter than a serverless request (about 15 s)', () => {
    expect(API_STATEMENT_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000)
    expect(API_STATEMENT_TIMEOUT_MS).toBeLessThan(15_000)
    expect(API_CONNECTION_TIMEOUT_MS).toBeLessThan(API_STATEMENT_TIMEOUT_MS)
  })
})
