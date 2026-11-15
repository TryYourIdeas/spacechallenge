import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface AppConfig {
  databaseUrl: string
  migrationsDir: string
  corsOrigins: string[]
}

// Container paths first; fall back to the repo layout for `nuxt dev`.
const dir = (env: string | undefined, container: string, repo: string) =>
  env ?? (existsSync(container) ? container : resolve(process.cwd(), repo))

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (!env.DATABASE_URL) throw new Error('Missing required environment variable DATABASE_URL')
  return {
    databaseUrl: env.DATABASE_URL,
    migrationsDir: dir(env.MIGRATIONS_DIR, '/app/migrations', '../backend/services/database/migrations'),
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
      .split(',').map(s => s.trim()).filter(Boolean),
  }
}

let cached: AppConfig | undefined
export const config = (): AppConfig => (cached ??= loadConfig())
