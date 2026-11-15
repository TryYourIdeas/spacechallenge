import { config } from '../utils/config'

// The SPA is normally served from the same origin; this is for a separately hosted
// frontend (e.g. Pages) calling this API. Only origins in CORS_ORIGINS are allowed.
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return
  let origin: string[]
  try { origin = config().corsOrigins } catch { return }
  if (handleCors(event, { origin, methods: ['GET'], preflight: { statusCode: 204 } })) return true
})
