export const log = (level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level, time: new Date().toISOString(), msg, ...extra }))
