import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface AppConfig {
  databaseUrl: string
  queueUrl: string
  sourceDir: string
  migrationsDir: string
  corsOrigins: string[]
  importAttempts: number
  staleAfterSeconds: number
  role: 'web' | 'worker' | 'all'
}

const int = (v: string | undefined, d: number) => (v === undefined || v === '' ? d : Number.parseInt(v, 10))
// Container paths first; fall back to the repo layout for `nuxt dev`.
const dir = (env: string | undefined, container: string, repo: string) =>
  env ?? (existsSync(container) ? container : resolve(process.cwd(), repo))

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const need = (k: string) => {
    if (!env[k]) throw new Error(`Missing required environment variable ${k}`)
    return env[k] as string
  }
  const role = env.APP_ROLE ?? 'all'
  if (role !== 'web' && role !== 'worker' && role !== 'all') throw new Error('APP_ROLE must be web, worker or all')
  return {
    databaseUrl: need('DATABASE_URL'),
    queueUrl: need('QUEUE_URL'),
    sourceDir: dir(env.SOURCE_DIR, '/data/source', '../data'),
    migrationsDir: dir(env.MIGRATIONS_DIR, '/app/migrations', '../backend/services/database/migrations'),
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
      .split(',').map(s => s.trim()).filter(Boolean),
    importAttempts: int(env.IMPORT_ATTEMPTS, 3),
    staleAfterSeconds: int(env.IMPORT_STALE_SECONDS, 120),
    role,
  }
}

let cached: AppConfig | undefined
export const config = (): AppConfig => (cached ??= loadConfig())
