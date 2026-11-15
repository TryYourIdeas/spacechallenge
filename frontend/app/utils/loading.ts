/** A server layer whose points are being fetched for the current view. */
export interface LayerLoading {
  /** `Date.now()` when this fetch started. */
  since: number
  /** How long this layer's previous fetch took, in ms; null before the first one finishes. */
  estimateMs: number | null
}

/** Show the bar only for fetches slower than this, so quick pans do not flash it. */
export const SHOW_AFTER_MS = 400

/** The bar never claims completion before the response arrives. */
export const MAX_ESTIMATED_PROGRESS = 0.95

/**
 * Progress from 0 to 0.95 as an ESTIMATE based on the last fetch time of the same layer, or
 * null (indeterminate) when there is nothing to base an estimate on. The server cannot report
 * real progress for a single query, so this is never presented as exact.
 */
export function estimatedProgress(elapsedMs: number, estimateMs: number | null): number | null {
  if (estimateMs === null || estimateMs <= 0) return null
  return Math.min(MAX_ESTIMATED_PROGRESS, Math.max(0, elapsedMs / estimateMs))
}

/** "3 s", or "1 min 05 s" for longer waits. */
export function formatWait(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}
