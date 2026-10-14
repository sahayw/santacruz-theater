// Stable occurrence ids for individual performances (`perf-<epoch-ms>`) and activity
// sessions (`session-<epoch-ms>`) — the identity behind calendar feed UIDs, so they must
// never change when a row's date or time is edited. Shared by the /admin editors (served
// via src/pages/admin/occurrence-ids.js.ts), scripts/migrate-occurrence-ids.ts, and the
// check scripts. See docs/ics-spec.md.

export const PERF_ID_RE = /^perf-\d+$/
export const SESSION_ID_RE = /^session-\d+$/

/**
 * Returns a function issuing `<prefix>-<epoch-ms>` ids. Monotonic within one generator:
 * if the clock hasn't moved past the last id issued, it uses `last + 1`, so bulk
 * creation (pattern generator, paste importer, migration) never repeats an id.
 */
export function createIdGenerator(prefix: string, now: () => number = Date.now) {
  let last = 0
  return () => {
    last = Math.max(now(), last + 1)
    return `${prefix}-${last}`
  }
}

/**
 * Gives every row in `rows[key]` that lacks an id a new one, placed first in the object.
 * Rows that already have an id are left untouched. Returns how many ids were added.
 */
function ensureRowIds<K extends string>(
  records: Record<K, { id?: string }[]>[],
  key: K,
  next: () => string
): number {
  let added = 0
  for (const record of records) {
    if (!Array.isArray(record[key])) continue
    record[key] = record[key].map((row) => {
      if (row.id) return row
      added++
      return { id: next(), ...row }
    })
  }
  return added
}

/** Backfills `Performance.id` on every run's performances. */
export function ensurePerformanceIds(
  runs: { performances: { id?: string }[] }[],
  next: () => string
): number {
  return ensureRowIds(runs, 'performances', next)
}

/** Backfills `ActivityDate.id` on every activity's sessions. */
export function ensureSessionIds(
  activities: { dates: { id?: string }[] }[],
  next: () => string
): number {
  return ensureRowIds(activities, 'dates', next)
}
