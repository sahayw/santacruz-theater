/**
 * Background function — one-way mirror of upcoming performances and activity sessions
 * into two public Google Calendars (Shows; Auditions & Events). Does the actual sync
 * work; triggered by sync-calendar-trigger.mts's daily cron (04:15 UTC, offset from
 * the 02:00 UTC digest cron) via a plain HTTP POST to this function's own URL.
 *
 * Netlify Functions v2 (config export). This is a Background Function (config.background
 * = true) rather than a Scheduled Function because a full reconciliation of the entire
 * dataset (e.g. the first-ever run, or any change to a field every event shares) is a
 * few hundred writes — comfortably over a Scheduled Function's hard 30s limit, but well
 * within a Background Function's 15 minutes. Netlify doesn't support a single function
 * being both scheduled and background at once, hence the two-function split — see
 * docs/google-calendar-sync.md.
 *
 * Each run does a full, idempotent reconciliation (insert/update/delete) against a
 * 30-day-past..18-month-future window, keyed by deterministic event IDs and a stored
 * content hash — no cross-invocation state needed; Google Calendar itself is the
 * source of truth. This endpoint has no auth check: it's a pure read of the current
 * source-of-truth data files with no request-derived input, so an unauthenticated
 * early/extra trigger just converges the calendars sooner, not incorrectly.
 *
 * Set CALENDAR_SYNC_DRY_RUN=true to log planned inserts/updates/deletes without
 * calling the API.
 *
 * Set CALENDAR_SYNC_HEALTHCHECK_URL to a healthchecks.io-style ping URL to monitor this
 * unattended job: a clean run POSTs a per-calendar count summary to the base URL; any
 * per-item write failure or fatal error POSTs a summary + failure details to `/fail`.
 *
 * Required env vars: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
 * GOOGLE_SHOWS_CALENDAR_ID, GOOGLE_ACTIVITIES_CALENDAR_ID
 *
 * See docs/google-calendar-sync.md for the full design.
 */

import { createHash } from 'node:crypto'
import type { Config } from '@netlify/functions'
import { loadAllPerformances, type SyncPerformance } from './lib/shows-data.mts'
import { loadAllActivities, type DigestActivity } from './lib/activities-data.mts'
import { loadCompanyPrimaryVenues } from './lib/company-data.mts'
import { resolveVenue } from './lib/venues-data.mts'
import { listManagedEvents, insertEvent, updateEvent, deleteEvent, computeContentHash, type CalendarEventBody } from './lib/google-calendar.mts'
import { renderMd, rolesSum } from '../../src/lib/audition-format.ts'
import type { ActivityDate } from '../../src/types.ts'

const TIMEZONE = 'America/Los_Angeles'
const GRACE_DAYS = 30
const FORWARD_MONTHS = 18
const DEFAULT_DURATION_HOURS = 2
const SITE_URL = 'https://santacruz.theater'

// ── Date/time helpers ────────────────────────────────────────────────────────
// dateTime is sent to Calendar as a naive "wall clock" string alongside an explicit
// timeZone — Google resolves the actual offset (including DST), so no local timezone
// math is needed here. UTC methods below are used purely as neutral clock arithmetic
// for adding a duration and handling day rollover, not as real UTC instants.

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function toDateTime(date: string, time: string): string {
  return `${date}T${time}:00`
}

function addHours(date: string, time: string, hours: number): { date: string; time: string } {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm))
  dt.setUTCHours(dt.getUTCHours() + hours)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`,
    time: `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`
  }
}

function computeEventId(sourceKey: string): string {
  return createHash('sha1').update(sourceKey).digest('hex')
}

function escAttr(url: string): string {
  return url.replace(/"/g, '&quot;')
}

function formatLocation(name: string, address?: string): string {
  return address ? `${name} · ${address}` : name
}

function viewOnSiteLink(url: string): string {
  return `<a href="${escAttr(url)}">View on santacruz.theater</a>`
}

// renderMd() escapes and applies **bold**/*italic*/[link](url), but leaves literal
// newlines as-is; Calendar's HTML description collapses those like any other HTML
// consumer, so multi-line notes/descriptions need an explicit <br> per line break.
function mdToHtml(text: string): string {
  return renderMd(text).replace(/\n/g, '<br>')
}

// ── Shows → Calendar events ──────────────────────────────────────────────────

function buildShowSummary(p: SyncPerformance): string {
  return `${p.showAbv || p.show} — ${p.companyName}`
}

function buildShowDescription(p: SyncPerformance): string {
  const lines: string[] = []
  if (p.description) lines.push(mdToHtml(p.description))
  lines.push(viewOnSiteLink(`${SITE_URL}/calendar`))
  return lines.join('<br><br>')
}

export function buildShowEvent(p: SyncPerformance): { id: string; body: CalendarEventBody } {
  const start = { dateTime: toDateTime(p.date, p.time), timeZone: TIMEZONE }
  const endHm = addHours(p.date, p.time, DEFAULT_DURATION_HOURS)
  const end = { dateTime: toDateTime(endHm.date, endHm.time), timeZone: TIMEZONE }
  const venue = resolveVenue(p.venue)
  const location = formatLocation(venue.name, venue.address)
  const summary = buildShowSummary(p)
  const description = buildShowDescription(p)

  const contentHash = computeContentHash({ summary, description, location, start: start.dateTime, end: end.dateTime })
  const id = computeEventId(`perf|${p.runId}|${p.date}|${p.time}`)

  return {
    id,
    body: {
      summary,
      description,
      location,
      start,
      end,
      extendedProperties: {
        private: {
          sctheaterManaged: 'true',
          sctheaterType: 'show',
          sctheaterSourceId: p.runId,
          sctheaterContentHash: contentHash
        }
      }
    }
  }
}

// ── Activities → Calendar events ─────────────────────────────────────────────

function activityDisplayName(a: DigestActivity): string {
  if (a.company === 'other' && a.organizerName) return a.organizerName
  return a.companyName
}

function activityDeepLink(a: DigestActivity): string {
  return `${SITE_URL}/events?id=${a.id.replace('activity-', '')}`
}

function buildAuditionDescription(a: DigestActivity, deepLink: string): string {
  const lines: string[] = []

  if (a.rolesAvailable && a.rolesAvailable.length > 0) {
    const summary = rolesSum(a.rolesAvailable)
    if (summary) lines.push(`Roles: ${summary}`)
  }

  lines.push(viewOnSiteLink(deepLink))
  return lines.join('<br><br>')
}

function buildEventDescription(a: DigestActivity, deepLink: string): string {
  const lines: string[] = []

  const desc = a.description || a.briefDescription
  if (desc) lines.push(mdToHtml(desc))

  lines.push(viewOnSiteLink(deepLink))
  return lines.join('<br><br>')
}

function locationForDate(ad: ActivityDate, fallbackVenue: string | undefined): string {
  if (ad.location?.address) return formatLocation(ad.location.name, ad.location.address)
  if (ad.location?.name) return formatLocation(ad.location.name, resolveVenue(ad.location.name).address)
  if (fallbackVenue) {
    const venue = resolveVenue(fallbackVenue)
    return formatLocation(venue.name, venue.address)
  }
  return ''
}

export function buildActivityEvent(
  a: DigestActivity,
  ad: ActivityDate,
  dateIndex: number,
  primaryVenues: Record<string, string>
): { id: string; body: CalendarEventBody } {
  const start = { dateTime: toDateTime(ad.date, ad.startTime), timeZone: TIMEZONE }
  const endHm = ad.endTime
    ? { date: ad.date, time: ad.endTime }
    : addHours(ad.date, ad.startTime, DEFAULT_DURATION_HOURS)
  const end = { dateTime: toDateTime(endHm.date, endHm.time), timeZone: TIMEZONE }

  const location = locationForDate(ad, primaryVenues[a.company])
  const summary = `${a.type === 'audition' ? 'Audition' : 'Event'}: ${a.title} — ${activityDisplayName(a)}`
  const deepLink = activityDeepLink(a)
  const description = a.type === 'audition'
    ? buildAuditionDescription(a, deepLink)
    : buildEventDescription(a, deepLink)

  const contentHash = computeContentHash({ summary, description, location, start: start.dateTime, end: end.dateTime })
  const id = computeEventId(`activity|${a.id}|${dateIndex}`)

  return {
    id,
    body: {
      summary,
      description,
      location,
      start,
      end,
      extendedProperties: {
        private: {
          sctheaterManaged: 'true',
          sctheaterType: a.type,
          sctheaterSourceId: `${a.id}|${dateIndex}`,
          sctheaterContentHash: contentHash
        }
      }
    }
  }
}

// ── Reconciliation ───────────────────────────────────────────────────────────

interface ReconcileCounts {
  inserted: number
  updated: number
  deleted: number
  unchanged: number
}

interface ReconcileFailure {
  id: string
  summary: string
  error: string
}

interface ReconcileResult {
  counts: ReconcileCounts
  failures: ReconcileFailure[]
}

// Concurrency 10 (~10 simultaneous requests) proved bursty enough to trip Google's
// short-term rate limiting even though total volume is well under the documented
// 600 req/min quota, so this stays conservative — there's no need to push it higher
// now that this runs as a Background Function with up to 15 minutes to work with.
const WRITE_CONCURRENCY = 5

async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  async function worker(): Promise<void> {
    while (index < items.length) {
      const item = items[index++]
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
}

async function reconcile(
  calendarId: string,
  desired: Map<string, CalendarEventBody>,
  timeMin: string,
  timeMax: string,
  dryRun: boolean
): Promise<ReconcileResult> {
  const existing = await listManagedEvents(calendarId, timeMin, timeMax)
  const counts: ReconcileCounts = { inserted: 0, updated: 0, deleted: 0, unchanged: 0 }
  const failures: ReconcileFailure[] = []

  const toInsert: Array<[string, CalendarEventBody]> = []
  const toUpdate: Array<[string, CalendarEventBody]> = []

  for (const [id, body] of desired) {
    const desiredHash = body.extendedProperties.private.sctheaterContentHash
    const existingHash = existing.get(id)

    if (existingHash === undefined) toInsert.push([id, body])
    else if (existingHash !== desiredHash) toUpdate.push([id, body])
    else counts.unchanged++
  }

  const toDelete = [...existing.keys()].filter(id => !desired.has(id))

  counts.inserted = toInsert.length
  counts.updated = toUpdate.length
  counts.deleted = toDelete.length

  if (dryRun) {
    for (const [id, body] of toInsert) console.log(`[DRY_RUN] insert ${id}: ${body.summary}`)
    for (const [id, body] of toUpdate) console.log(`[DRY_RUN] update ${id}: ${body.summary}`)
    for (const id of toDelete) console.log(`[DRY_RUN] delete ${id}`)
    return { counts, failures }
  }

  // A single item exhausting retries shouldn't abort the whole run — idempotent
  // design means it's safely retried on the next run, so log, record, and move on.
  const doInsert = async ([id, body]: [string, CalendarEventBody]) => {
    try {
      await insertEvent(calendarId, id, body)
    } catch (e) {
      console.error(`sync-calendar-background: insert failed for ${id} (${body.summary}):`, e)
      failures.push({ id, summary: body.summary, error: String(e) })
    }
  }
  const doUpdate = async ([id, body]: [string, CalendarEventBody]) => {
    try {
      await updateEvent(calendarId, id, body)
    } catch (e) {
      console.error(`sync-calendar-background: update failed for ${id} (${body.summary}):`, e)
      failures.push({ id, summary: body.summary, error: String(e) })
    }
  }
  const doDelete = async (id: string) => {
    try {
      await deleteEvent(calendarId, id)
    } catch (e) {
      console.error(`sync-calendar-background: delete failed for ${id}:`, e)
      failures.push({ id, summary: '(delete)', error: String(e) })
    }
  }

  await runPool(toInsert, WRITE_CONCURRENCY, doInsert)
  await runPool(toUpdate, WRITE_CONCURRENCY, doUpdate)
  await runPool(toDelete, WRITE_CONCURRENCY, doDelete)

  return { counts, failures }
}

// ── Handler ───────────────────────────────────────────────────────────────────

const MAX_FAILURES_IN_MESSAGE = 20

function formatCounts(label: string, counts: ReconcileCounts, failedCount: number): string {
  return `${label}: inserted ${counts.inserted}, updated ${counts.updated}, deleted ${counts.deleted}, unchanged ${counts.unchanged}, failed ${failedCount}`
}

function formatFailures(failures: ReconcileFailure[]): string {
  const lines = failures.slice(0, MAX_FAILURES_IN_MESSAGE).map(f => `- ${f.id} (${f.summary}): ${f.error}`)
  if (failures.length > MAX_FAILURES_IN_MESSAGE) {
    lines.push(`... and ${failures.length - MAX_FAILURES_IN_MESSAGE} more`)
  }
  return lines.join('\n')
}

function pingHealthcheck(message: string, failed: boolean) {
  const url = process.env.CALENDAR_SYNC_HEALTHCHECK_URL
  if (!url) return
  const target = failed ? `${url}/fail` : url
  return fetch(target, { method: 'POST', body: message }).catch(() => {})
}

export default async (_req: Request) => {
  const {
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    GOOGLE_SHOWS_CALENDAR_ID,
    GOOGLE_ACTIVITIES_CALENDAR_ID,
    CALENDAR_SYNC_DRY_RUN
  } = process.env

  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    const msg = 'sync-calendar-background: missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'
    console.error(msg)
    await pingHealthcheck(msg, true)
    return
  }
  if (!GOOGLE_SHOWS_CALENDAR_ID || !GOOGLE_ACTIVITIES_CALENDAR_ID) {
    const msg = 'sync-calendar-background: missing GOOGLE_SHOWS_CALENDAR_ID or GOOGLE_ACTIVITIES_CALENDAR_ID'
    console.error(msg)
    await pingHealthcheck(msg, true)
    return
  }

  const dryRun = CALENDAR_SYNC_DRY_RUN === 'true'

  const now = new Date()
  const windowStart = new Date(now)
  windowStart.setUTCDate(windowStart.getUTCDate() - GRACE_DAYS)
  const windowStartDateStr = isoDate(windowStart)

  const windowEnd = new Date(now)
  windowEnd.setUTCMonth(windowEnd.getUTCMonth() + FORWARD_MONTHS)

  const timeMin = windowStart.toISOString()
  const timeMax = windowEnd.toISOString()

  try {
    // ── Shows reconciliation ────────────────────────────────────────────────
    const performances = loadAllPerformances().filter(p => p.date >= windowStartDateStr)
    const desiredShows = new Map<string, CalendarEventBody>()
    for (const p of performances) {
      const { id, body } = buildShowEvent(p)
      desiredShows.set(id, body)
    }
    const showResult = await reconcile(GOOGLE_SHOWS_CALENDAR_ID, desiredShows, timeMin, timeMax, dryRun)
    console.log(`sync-calendar-background: shows — inserted ${showResult.counts.inserted}, updated ${showResult.counts.updated}, deleted ${showResult.counts.deleted}, unchanged ${showResult.counts.unchanged}, failed ${showResult.failures.length}`)

    // ── Activities reconciliation ───────────────────────────────────────────
    const activities = loadAllActivities()
    const primaryVenues = loadCompanyPrimaryVenues()
    const desiredActivities = new Map<string, CalendarEventBody>()
    for (const a of activities) {
      a.dates.forEach((ad, dateIndex) => {
        if (!ad.date || ad.date < windowStartDateStr) return
        const { id, body } = buildActivityEvent(a, ad, dateIndex, primaryVenues)
        desiredActivities.set(id, body)
      })
    }
    const activityResult = await reconcile(GOOGLE_ACTIVITIES_CALENDAR_ID, desiredActivities, timeMin, timeMax, dryRun)
    console.log(`sync-calendar-background: activities — inserted ${activityResult.counts.inserted}, updated ${activityResult.counts.updated}, deleted ${activityResult.counts.deleted}, unchanged ${activityResult.counts.unchanged}, failed ${activityResult.failures.length}`)

    const allFailures = [...showResult.failures, ...activityResult.failures]
    const hasChanges = [showResult.counts, activityResult.counts]
      .some(c => c.inserted > 0 || c.updated > 0 || c.deleted > 0)

    // Most runs are no-ops (nothing to insert/update/delete, nothing failed) — daily
    // pings full of zeros add noise with no signal, so those are skipped entirely.
    // Trade-off: healthchecks.io can no longer catch "the cron silently stopped
    // firing" via a missed check-in on its own, only real changes/failures ping it.
    if (!hasChanges && allFailures.length === 0) {
      console.log('sync-calendar-background: no changes, skipping healthcheck ping')
      return
    }

    const messageParts = [
      formatCounts('shows', showResult.counts, showResult.failures.length),
      formatCounts('activities', activityResult.counts, activityResult.failures.length)
    ]
    if (allFailures.length > 0) {
      messageParts.push('', `FAILURES (${allFailures.length}):`, formatFailures(allFailures))
    }

    await pingHealthcheck(messageParts.join('\n'), allFailures.length > 0)
  } catch (e) {
    console.error('sync-calendar-background: failed:', e)
    await pingHealthcheck(`FATAL: ${e}`, true)
  }
}

export const config: Config = {
  background: true
}
