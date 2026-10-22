// Provider-neutral calendar model: turns runs and activities into CalendarEvents and
// groups them into the published feeds. Pure functions (no Astro, DOM, or fs) so they
// can be unit-tested directly; serialized by src/lib/ics.ts and published by
// src/pages/[...feed].ics.ts. See docs/ics-spec.md.

import type { Activity, ActivityDate, CompanyEntry, Run, Venue } from '../types.ts'
import { mdToPlain, rolesSum } from './audition-format.ts'
import { organizerName, recordOrganizerIds } from './organizers.ts'
import { runPlace, sessionPlace, venueByCode } from './venues.ts'

export const SITE_URL = 'https://santacruz.theater'
export const UID_DOMAIN = 'santacruz.theater'
/** Performances have no end time; sessions without one get the same default. */
export const DEFAULT_DURATION_HOURS = 2
/** Composite and company feeds include occurrences from this many months back. */
export const HISTORY_MONTHS = 12

export interface CalendarContext {
  companies: CompanyEntry[]
  venues: Venue[]
}

/** Wall-clock date/time in America/Los_Angeles. */
export interface LocalDateTime {
  date: string // YYYY-MM-DD
  time: string // HH:MM
}

export interface CalendarEvent {
  uid: string // `${occurrenceId}@santacruz.theater`
  kind: 'performance' | 'audition' | 'event'
  sourceId: string // Performance.id / ActivityDate.id
  parentId: string // Run.id / Activity.id
  company: string
  summary: string
  description: string // plain text
  location: string
  url: string
  start: LocalDateTime
  end: LocalDateTime
  /** A session with no start time: a whole-day entry. `start`/`end` are midnight to the next midnight. */
  allDay?: true
  lastModified: string // ISO 8601 instant
}

export interface Feed {
  path: string // published as `/${path}.ics`
  name: string // X-WR-CALNAME
  description: string
  events: CalendarEvent[]
  /** Offered as a live subscription (gets refresh hints) rather than a one-off download. */
  subscribable: boolean
}

/** Activity with its file's company id and resolved title, as returned by getActivities(). */
export type CompanyActivity = Activity & { company: string; title: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

/** `run-1781520814689` → `1781520814689` — the `?id=` / feed-path form. */
export function bareId(id: string) {
  return id.replace(/^[a-z]+-/, '')
}

/** Adds hours to a wall-clock time, rolling the date over as needed. */
export function addHours(start: LocalDateTime, hours: number): LocalDateTime {
  const [y, m, d] = start.date.split('-').map(Number)
  const [hh, mm] = start.time.split(':').map(Number)
  // UTC used purely as neutral clock arithmetic, not as a real instant
  const dt = new Date(Date.UTC(y, m - 1, d, hh + hours, mm))
  return {
    date: dt.toISOString().slice(0, 10),
    time: dt.toISOString().slice(11, 16)
  }
}

/** The date `months` before `today` (both YYYY-MM-DD). */
export function monthsBefore(today: string, months: number) {
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 - months, d)).toISOString().slice(0, 10)
}

function formatLocation(place: { name: string; address?: string }) {
  return place.address ? `${place.name} · ${place.address}` : place.name
}

function company(ctx: CalendarContext, id: string) {
  return ctx.companies.find((c) => c.id === id)
}

/** Creation time from a `<prefix>-<epoch-ms>` id, for records without `updatedAt`. */
function idTimestamp(id: string) {
  const ms = Number(bareId(id))
  return new Date(Number.isFinite(ms) && ms > 0 ? ms : 0).toISOString()
}

function paragraphs(...blocks: (string | false | undefined)[]) {
  return blocks.filter(Boolean).join('\n\n')
}

function lines(...items: (string | false | undefined)[]) {
  return items.filter(Boolean).join('\n')
}

// ── Performances ─────────────────────────────────────────────────────────────

export function runUrl(run: Run) {
  return `${SITE_URL}/productions?id=${bareId(run.id)}`
}

export function performanceEvents(run: Run, ctx: CalendarContext): CalendarEvent[] {
  const org = organizerName(recordOrganizerIds(run.company, run.organizers), ctx.companies)
  const title = (run.showAbv || run.show).trim()
  const summary = org ? `${title} — ${org}` : title
  const place = runPlace(run, ctx.venues)
  const location = place ? formatLocation(place) : run.venue
  const url = runUrl(run)
  const lastModified = run.updatedAt || idTimestamp(run.id)

  return run.performances.map((p) => {
    const start = { date: p.date, time: p.time }
    const discounts = p.discounts || run.discounts
    const ticketsUrl = p.ticketsUrl || run.ticketsUrl
    return {
      uid: `${p.id}@${UID_DOMAIN}`,
      kind: 'performance',
      sourceId: p.id,
      parentId: run.id,
      company: run.company,
      summary,
      description: paragraphs(
        p.perfType && `${p.perfType} performance`,
        run.description && mdToPlain(run.description),
        lines(run.price && `Price: ${run.price}`, discounts && `Discounts: ${discounts}`),
        // One short link to our page (which has the ticket and info links) rather than
        // raw third-party URLs, which calendar apps show in full
        `${ticketsUrl ? 'Details & tickets' : 'Details'}: ${url}`
      ),
      location,
      url,
      start,
      end: addHours(start, DEFAULT_DURATION_HOURS),
      lastModified
    }
  })
}

// ── Activity sessions ────────────────────────────────────────────────────────

export function activityUrl(activity: Activity) {
  return `${SITE_URL}/events?id=${bareId(activity.id)}`
}

/** The session's venue or one-off place, else the main organizer's primary venue. */
function sessionLocation(d: ActivityDate, organizers: string[], ctx: CalendarContext) {
  const place = sessionPlace(d, ctx.venues)
  if (place) return formatLocation(place)
  const primary = venueByCode(company(ctx, organizers[0] ?? '')?.primaryVenue, ctx.venues)
  return primary ? formatLocation(primary) : ''
}

function sessionEnd(d: ActivityDate & { startTime: string }): LocalDateTime {
  const start = { date: d.date, time: d.startTime }
  if (!d.endTime) return addHours(start, DEFAULT_DURATION_HOURS)
  // An end time at or before the start means the session runs past midnight
  return d.endTime > d.startTime
    ? { date: d.date, time: d.endTime }
    : { date: addHours({ date: d.date, time: '00:00' }, 24).date, time: d.endTime }
}

/** One event per dated session (all-day if it has no start time); a closed activity publishes none. */
export function sessionEvents(activity: CompanyActivity, ctx: CalendarContext): CalendarEvent[] {
  if (activity.closed) return []
  const organizers = recordOrganizerIds(activity.company, activity.organizers)
  const org = organizerName(organizers, ctx.companies)
  const label = activity.type === 'audition' ? 'Audition' : 'Event'
  const summary = `${label}: ${activity.title.trim()}${org ? ` — ${org}` : ''}`
  const url = activityUrl(activity)
  const roles = activity.type === 'audition' && rolesSum(activity.rolesAvailable || [])
  const body =
    activity.type === 'event' ? activity.description || activity.briefDescription : undefined

  return activity.dates
    .filter((d) => d.date)
    .map(
      (d): CalendarEvent => ({
        uid: `${d.id}@${UID_DOMAIN}`,
        kind: activity.type,
        sourceId: d.id,
        parentId: activity.id,
        company: activity.company,
        summary,
        description: paragraphs(
          roles && `Roles: ${roles}`,
          body && mdToPlain(body),
          d.notes && mdToPlain(d.notes),
          activity.type === 'event' && activity.cost && `Cost: ${activity.cost}`,
          `${activity.type === 'event' && activity.registerUrl ? 'Details & registration' : 'Details'}: ${url}`
        ),
        location: sessionLocation(d, organizers, ctx),
        url,
        ...(d.startTime
          ? {
              start: { date: d.date, time: d.startTime },
              end: sessionEnd({ ...d, startTime: d.startTime })
            }
          : {
              allDay: true as const,
              start: { date: d.date, time: '00:00' },
              end: addHours({ date: d.date, time: '00:00' }, 24)
            }),
        lastModified: activity.updatedAt
      })
    )
}

// ── Feeds ────────────────────────────────────────────────────────────────────

const SITE_NAME = 'Santa Cruz Theater'

/** Calendar names (X-WR-CALNAME) — shared with the Add to Calendar UI. */
export const FEED_NAMES = {
  productions: `${SITE_NAME} — All Performances`,
  /** Performances without some majors; `excluded` are their short labels. */
  selection: (excluded: string[]) =>
    `${SITE_NAME} — Performances (excluding ${excluded.join(', ')})`,
  activities: `${SITE_NAME} — All Auditions & Events`,
  auditions: `${SITE_NAME} — Auditions`
}

/**
 * Performance feed for the majors left out, given as the sum of their permanent
 * `majorCode`s (`notifications-spec.md`): 0 is every performance. Numbers keep their
 * meaning as majors come and go, so a subscription never changes underneath anyone.
 */
export function selectionFeedPath(excludedMask: number) {
  return excludedMask ? `productions/selection/${excludedMask}` : 'productions'
}

/**
 * Every exclusion number to publish: each non-empty combination of the `majorCode`s ever
 * assigned (current and former majors), so a published feed is never withdrawn.
 */
export function selectionMasks(companies: CompanyEntry[]) {
  const codes = companies.map((c) => c.majorCode).filter((c): c is number => !!c)
  const masks: number[] = []
  for (let combo = 1; combo < 1 << codes.length; combo++)
    masks.push(codes.reduce((sum, code, i) => (combo & (1 << i) ? sum + code : sum), 0))
  return masks.sort((a, b) => a - b)
}

/** Sorted by start, then uid, so unchanged data serializes byte-identically. */
export function sortEvents(events: CalendarEvent[]) {
  return [...events].sort(
    (a, b) =>
      `${a.start.date}T${a.start.time}`.localeCompare(`${b.start.date}T${b.start.time}`) ||
      a.uid.localeCompare(b.uid)
  )
}

/**
 * Every published file. Subscriptions: all performances, performances without some
 * majors (one per exclusion number), all auditions & events, auditions only — each
 * keeps occurrences from HISTORY_MONTHS
 * before `today` onward. Downloads: one file per performance and per session (a
 * single event to add), and one per activity (all of its dates).
 */
export function buildFeeds(
  runs: Run[],
  activities: CompanyActivity[],
  ctx: CalendarContext,
  today: string
): Feed[] {
  const since = monthsBefore(today, HISTORY_MONTHS)
  const recent = (events: CalendarEvent[]) => events.filter((e) => e.start.date >= since)
  const feeds: Feed[] = []

  const perfsByRun = runs.map((run) => ({
    organizers: recordOrganizerIds(run.company, run.organizers),
    events: performanceEvents(run, ctx)
  }))
  feeds.push({
    path: selectionFeedPath(0),
    name: FEED_NAMES.productions,
    description: 'Performances listed on santacruz.theater',
    events: recent(perfsByRun.flatMap((r) => r.events)),
    subscribable: true
  })
  // Leaving majors out: a production stays in if any of its organizers is included, so
  // everyone who isn't a (current) major is always included
  const currentMajors = ctx.companies.filter((c) => c.major && c.majorCode)
  for (const mask of selectionMasks(ctx.companies)) {
    const excluded = currentMajors.filter((c) => mask & c.majorCode!)
    const out = new Set(excluded.map((c) => c.id))
    feeds.push({
      path: selectionFeedPath(mask),
      name: excluded.length
        ? FEED_NAMES.selection(excluded.map((c) => c.abvName))
        : FEED_NAMES.productions,
      description: 'Performances listed on santacruz.theater',
      events: recent(
        perfsByRun.filter((r) => r.organizers.some((o) => !out.has(o))).flatMap((r) => r.events)
      ),
      subscribable: true
    })
  }

  const sessionsByActivity = activities.map((a) => ({ a, events: sessionEvents(a, ctx) }))
  feeds.push({
    path: 'activities',
    name: FEED_NAMES.activities,
    description: 'Auditions and events listed on santacruz.theater',
    events: recent(sessionsByActivity.flatMap((s) => s.events)),
    subscribable: true
  })
  feeds.push({
    path: 'auditions',
    name: FEED_NAMES.auditions,
    description: 'Auditions listed on santacruz.theater',
    events: recent(
      sessionsByActivity.filter((s) => s.a.type === 'audition').flatMap((s) => s.events)
    ),
    subscribable: true
  })
  for (const { a, events } of sessionsByActivity) {
    feeds.push({
      path: `activities/${bareId(a.id)}`,
      name: a.title.trim(),
      description: `${a.type === 'audition' ? 'Audition' : 'Event'} dates from santacruz.theater`,
      events,
      subscribable: false
    })
  }

  // One file per occurrence, for "add this one event"
  const single =
    (folder: string) =>
    (e: CalendarEvent): Feed => ({
      path: `${folder}/${bareId(e.sourceId)}`,
      name: e.summary,
      description: 'From santacruz.theater',
      events: [e],
      subscribable: false
    })
  feeds.push(...perfsByRun.flatMap((r) => r.events).map(single('performances')))
  feeds.push(...sessionsByActivity.flatMap((s) => s.events).map(single('sessions')))

  return feeds.map((f) => ({ ...f, events: sortEvents(f.events) }))
}
