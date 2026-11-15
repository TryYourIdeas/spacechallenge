import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'

/** DATABASE_URL from the environment, else from the text of a docker .env file. */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv, envFileText = ''): string {
  if (env.DATABASE_URL) return env.DATABASE_URL
  for (const line of envFileText.split('\n')) {
    const m = /^\s*DATABASE_URL\s*=\s*(.*?)\s*$/.exec(line)
    if (m?.[1]) return m[1].replace(/^(['"])(.*)\1$/, '$2')
  }
  throw new Error('DATABASE_URL is not set (export it or add it to backend/docker/.env).')
}

/** Replaces the password so the URL is safe to print. */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.password) u.password = '***'
    return u.toString()
  } catch {
    return url.replace(/:[^:@/\s]*@/, ':***@')
  }
}

/** Absolute path of a non-empty regular *.csv file, or a descriptive error. */
export async function validateCsvPath(path: string): Promise<string> {
  const abs = resolve(path)
  const s = await stat(abs).catch(() => undefined)
  if (!s) throw new Error(`File not found: ${abs}`)
  if (!s.isFile()) throw new Error(`Not a file: ${abs}`)
  if (!/\.csv$/i.test(abs)) throw new Error(`Expected a .csv file: ${abs}`)
  if (s.size === 0) throw new Error(`The file is empty: ${abs}`)
  return abs
}
