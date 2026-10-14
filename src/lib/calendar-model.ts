// Provider-neutral calendar model: turns runs and activities into CalendarEvents and
// groups them into the published feeds. Pure functions (no Astro, DOM, or fs) so they
// can be unit-tested directly; serialized by src/lib/ics.ts and published by
// src/pages/[...feed].ics.ts. See docs/ics-spec.md.

import type { Activity, ActivityDate, CompanyEntry, Run } from '../types.ts'
import { mdToPlain, rolesSum } from './audition-format.ts'

export const SITE_URL = 'https://santacruz.theater'
export const UID_DOMAIN = 'santacruz.theater'
/** Performances have no end time; sessions without one get the same default. */
export const DEFAULT_DURATION_HOURS = 2
/** Composite and company feeds include occurrences from this many months back. */
export const HISTORY_MONTHS = 12

export interface Venue {
  code: string
  name: string
  address?: string
}

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
  lastModified: string // ISO 8601 instant
}

export interface Feed {
  path: string // published as `/${path}.ics`
  name: string // X-WR-CALNAME
  description: string
  events: CalendarEvent[]
}

/** Activity with its file's company id, as returned by getActivities(). */
export type CompanyActivity = Activity & { company: string }

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

function resolveVenue(ctx: CalendarContext, nameOrCode: string): Venue | undefined {
  return ctx.venues.find((v) => v.name === nameOrCode || v.code === nameOrCode)
}

function formatLocation(name: string, address?: string) {
  return address ? `${name} · ${address}` : name
}

/** A venue name or code → `Name · Address`, or the raw text when unknown. */
function venueLocation(ctx: CalendarContext, nameOrCode: string) {
  const venue = resolveVenue(ctx, nameOrCode)
  return venue ? formatLocation(venue.name, venue.address) : nameOrCode
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
  return `${SITE_URL}/runs?id=${bareId(run.id)}`
}

/** `{show} — {company abbreviation}`; just the title for the "other" company. */
export function runFeedName(run: Run, ctx: CalendarContext) {
  const co = company(ctx, run.company)
  const show = run.show.trim()
  return run.company === 'other' || !co ? show : `${show} — ${co.abvName}`
}

export function performanceEvents(run: Run, ctx: CalendarContext): CalendarEvent[] {
  const co = company(ctx, run.company)
  const title = (run.showAbv || run.show).trim()
  const summary = run.company === 'other' || !co ? title : `${title} — ${co.name}`
  const location = venueLocation(ctx, run.venue)
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
        lines(
          run.price && `Price: ${run.price}`,
          discounts && `Discounts: ${discounts}`,
          ticketsUrl && `Tickets: ${ticketsUrl}`,
          run.infoUrl && `More info: ${run.infoUrl}`
        )
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

function organizer(activity: CompanyActivity, ctx: CalendarContext) {
  if (activity.company === 'other') return activity.organizerName || ''
  return company(ctx, activity.company)?.name || ''
}

function sessionLocation(d: ActivityDate, activity: CompanyActivity, ctx: CalendarContext) {
  if (d.location?.name) {
    return d.location.address
      ? formatLocation(d.location.name, d.location.address)
      : venueLocation(ctx, d.location.name)
  }
  const primary = company(ctx, activity.company)?.primaryVenue
  return primary ? venueLocation(ctx, primary) : ''
}

function sessionEnd(d: ActivityDate): LocalDateTime {
  const start = { date: d.date, time: d.startTime }
  if (!d.endTime) return addHours(start, DEFAULT_DURATION_HOURS)
  // An end time at or before the start means the session runs past midnight
  return d.endTime > d.startTime
    ? { date: d.date, time: d.endTime }
    : { date: addHours({ date: d.date, time: '00:00' }, 24).date, time: d.endTime }
}

/** One event per dated session; a closed activity publishes none. */
export function sessionEvents(activity: CompanyActivity, ctx: CalendarContext): CalendarEvent[] {
  if (activity.closed) return []
  const org = organizer(activity, ctx)
  const label = activity.type === 'audition' ? 'Audition' : 'Event'
  const summary = `${label}: ${activity.title.trim()}${org ? ` — ${org}` : ''}`
  const url = activityUrl(activity)
  const roles = activity.type === 'audition' && rolesSum(activity.rolesAvailable || [])
  const body =
    activity.type === 'event' ? activity.description || activity.briefDescription : undefined

  return activity.dates
    .filter((d) => d.date && d.startTime)
    .map((d) => ({
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
        activity.type === 'event' &&
          lines(
            activity.cost && `Cost: ${activity.cost}`,
            activity.registerUrl && `Register: ${activity.registerUrl}`
          )
      ),
      location: sessionLocation(d, activity, ctx),
      url,
      start: { date: d.date, time: d.startTime },
      end: sessionEnd(d),
      lastModified: activity.updatedAt
    }))
}

// ── Feeds ────────────────────────────────────────────────────────────────────

const SITE_NAME = 'Santa Cruz Theater'

/** Calendar names (X-WR-CALNAME) — shared with the Add to Calendar UI. */
export const FEED_NAMES = {
  runs: `${SITE_NAME} — Performances`,
  company: (companyName: string) => `${SITE_NAME} — Performances (${companyName})`,
  activities: `${SITE_NAME} — Auditions & Events`,
  auditions: `${SITE_NAME} — Auditions`
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
 * Every published feed. Composite and company feeds keep occurrences from
 * HISTORY_MONTHS before `today` onward; per-record feeds keep all of theirs.
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

  const perfsByRun = runs.map((run) => ({ run, events: performanceEvents(run, ctx) }))
  feeds.push({
    path: 'runs',
    name: FEED_NAMES.runs,
    description: 'Performances listed on santacruz.theater',
    events: recent(perfsByRun.flatMap((r) => r.events))
  })
  const companyIds = [...new Set(runs.map((r) => r.company))].sort()
  for (const id of companyIds) {
    const name = company(ctx, id)?.name || id
    feeds.push({
      path: `runs/company/${id}`,
      name: FEED_NAMES.company(name),
      description: `${name} performances listed on santacruz.theater`,
      events: recent(perfsByRun.filter((r) => r.run.company === id).flatMap((r) => r.events))
    })
  }
  for (const { run, events } of perfsByRun) {
    feeds.push({
      path: `runs/${bareId(run.id)}`,
      name: runFeedName(run, ctx),
      description: `Performances of ${run.show.trim()}, from santacruz.theater`,
      events
    })
  }

  const sessionsByActivity = activities.map((a) => ({ a, events: sessionEvents(a, ctx) }))
  feeds.push({
    path: 'activities',
    name: FEED_NAMES.activities,
    description: 'Auditions and events listed on santacruz.theater',
    events: recent(sessionsByActivity.flatMap((s) => s.events))
  })
  feeds.push({
    path: 'auditions',
    name: FEED_NAMES.auditions,
    description: 'Auditions listed on santacruz.theater',
    events: recent(
      sessionsByActivity.filter((s) => s.a.type === 'audition').flatMap((s) => s.events)
    )
  })
  for (const { a, events } of sessionsByActivity) {
    feeds.push({
      path: `activities/${bareId(a.id)}`,
      name: a.title.trim(),
      description: `${a.type === 'audition' ? 'Audition' : 'Event'} sessions from santacruz.theater`,
      events
    })
  }

  return feeds.map((f) => ({ ...f, events: sortEvents(f.events) }))
}
