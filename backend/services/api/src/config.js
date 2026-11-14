const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10))

export function loadConfig(env = process.env) {
  const need = (k) => {
    if (!env[k]) throw new Error(`Missing required environment variable ${k}`)
    return env[k]
  }
  return {
    port: int(env.PORT, 8080),
    databaseUrl: need('DATABASE_URL'),
    queueUrl: need('QUEUE_URL'),
    sourceDir: env.SOURCE_DIR ?? '/data/source',
    migrationsDir: env.MIGRATIONS_DIR ?? '/app/migrations',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
      .split(',').map(s => s.trim()).filter(Boolean),
    importAttempts: int(env.IMPORT_ATTEMPTS, 3),
    staleAfterSeconds: int(env.IMPORT_STALE_SECONDS, 120),
  }
}
