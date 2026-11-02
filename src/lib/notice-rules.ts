import type { Activity, Run } from '../types.ts'
import { isUpcomingActivity } from './data-rules.ts'

// What sends an email. Each digest keeps a snapshot of every record's *significant*
// fields as last emailed (a "print") and compares tonight's prints against it. A record
// is new when it first becomes listable; it has changed when a significant field
// differs — including losing all its remaining dates, which is a cancellation. Everything
// else — descriptions, typos, price, contact — never sends email.
// Pure functions, unit-tested; the digest function stores the snapshots.
// See docs/notifications-spec.md ("Change detection").

// ── Productions ──────────────────────────────────────────────────────────────

export interface ProductionPrint {
  listable: boolean // has upcoming performances
  perfs: Record<string, string> // upcoming performance id → "YYYY-MM-DD HH:MM"
  venue: string // venue code + room
  tickets: boolean // a tickets link (the run's or an upcoming performance's)
}

export type ProductionChange =
  | { kind: 'dates-added'; perfIds: string[] }
  | { kind: 'dates-removed'; when: string[]; all: boolean } // all: none upcoming are left
  | { kind: 'dates-moved'; perfIds: string[] }
  | { kind: 'venue' }
  | { kind: 'tickets' }

export function productionPrint(run: Run, today: string): ProductionPrint {
  const upcoming = run.performances.filter((p) => p.date >= today)
  return {
    listable: upcoming.length > 0,
    perfs: Object.fromEntries(upcoming.map((p) => [p.id, `${p.date} ${p.time}`])),
    venue: `${run.venue}|${run.room ?? ''}`,
    tickets: !!run.ticketsUrl?.trim() || upcoming.some((p) => !!p.ticketsUrl?.trim())
  }
}

/** First and last date of a print's performances or sessions ('' when there are none). */
function dateRange(entries: Record<string, string>, ids = Object.keys(entries)) {
  const dates = ids.map((id) => entries[id].slice(0, 10)).sort()
  return `${dates[0] ?? ''}|${dates[dates.length - 1] ?? ''}`
}

/**
 * `silent`: ids deleted as data-entry corrections (the record's silentRemovals) — never
 * announced. A production email shows only the first–last date range and the count, so a
 * time change is silent, and a date moved within the range is silent too; "Dates changed"
 * is sent only when the range itself moves and no add/cancel pip already reports it.
 */
export function productionChanges(
  prev: ProductionPrint,
  cur: ProductionPrint,
  today: string,
  silent: ReadonlySet<string> = new Set()
): ProductionChange[] {
  const changes: ProductionChange[] = []
  const added = Object.keys(cur.perfs).filter((id) => !(id in prev.perfs))
  // Gone and still in the future (a past performance just drops off)
  const gone = Object.entries(prev.perfs).filter(
    ([id, when]) => !(id in cur.perfs) && when.slice(0, 10) >= today
  )
  const removed = gone.filter(([id]) => !silent.has(id))
  const moved = Object.keys(cur.perfs).filter(
    (id) => id in prev.perfs && prev.perfs[id].slice(0, 10) !== cur.perfs[id].slice(0, 10)
  )
  const before = Object.keys(prev.perfs).filter(
    (id) => prev.perfs[id].slice(0, 10) >= today && !(silent.has(id) && !(id in cur.perfs))
  )
  const rangeMoved = dateRange(prev.perfs, before) !== dateRange(cur.perfs)
  if (added.length) changes.push({ kind: 'dates-added', perfIds: added })
  if (removed.length)
    changes.push({
      kind: 'dates-removed',
      when: removed.map(([, w]) => w).sort(),
      all: !Object.keys(cur.perfs).length
    })
  if (moved.length && rangeMoved && !added.length && !removed.length)
    changes.push({ kind: 'dates-moved', perfIds: moved })
  if (prev.venue !== cur.venue) changes.push({ kind: 'venue' })
  if (!prev.tickets && cur.tickets) changes.push({ kind: 'tickets' })
  return changes
}

// ── Auditions & events ───────────────────────────────────────────────────────

export interface ActivityPrint {
  listable: boolean // upcoming and not closed (isUpcomingActivity)
  closed: boolean
  sessions: Record<string, string> // upcoming session id → "YYYY-MM-DD HH:MM"
  places: Record<string, string> // upcoming session id → venue code / one-off name + room
  registration: boolean // event with a registration link
}

export type ActivityChange =
  | { kind: 'sessions-added'; sessionIds: string[] }
  | { kind: 'sessions-removed'; when: string[]; all: boolean } // all: none upcoming are left
  | { kind: 'sessions-moved'; sessionIds: string[] }
  | { kind: 'location' }
  | { kind: 'registration' }
  | { kind: 'reopened' }

export function activityPrint(a: Activity, today: string): ActivityPrint {
  const upcoming = (a.dates || []).filter((d) => d.date && d.date >= today)
  return {
    listable: isUpcomingActivity(a, today),
    closed: !!a.closed,
    sessions: Object.fromEntries(upcoming.map((d) => [d.id, `${d.date} ${d.startTime ?? ''}`])),
    places: Object.fromEntries(
      upcoming.map((d) => [d.id, `${d.venue ?? d.location?.name ?? ''}|${d.room ?? ''}`])
    ),
    registration: a.type === 'event' && !!a.registerUrl?.trim()
  }
}

/**
 * `silent`: session ids deleted as data-entry corrections — never announced.
 * `cancelled`: the record was deleted with Notify cancellation, so it reports
 * "Cancelled" even when it had no sessions to remove (a virtual audition).
 */
export function activityChanges(
  prev: ActivityPrint,
  cur: ActivityPrint,
  today: string,
  opts: { silent?: ReadonlySet<string>; cancelled?: boolean } = {}
): ActivityChange[] {
  const changes: ActivityChange[] = []
  const silent = opts.cancelled ? new Set<string>() : (opts.silent ?? new Set<string>())
  if (prev.closed && !cur.closed) changes.push({ kind: 'reopened' })
  const added = Object.keys(cur.sessions).filter((id) => !(id in prev.sessions))
  const removed = Object.entries(prev.sessions).filter(
    ([id, when]) => !(id in cur.sessions) && !silent.has(id) && when.slice(0, 10) >= today
  )
  const moved = Object.keys(cur.sessions).filter(
    (id) => id in prev.sessions && prev.sessions[id] !== cur.sessions[id]
  )
  if (added.length) changes.push({ kind: 'sessions-added', sessionIds: added })
  if (removed.length || (opts.cancelled && prev.listable))
    changes.push({
      kind: 'sessions-removed',
      when: removed.map(([, w]) => w).sort(),
      all: !Object.keys(cur.sessions).length
    })
  if (moved.length) changes.push({ kind: 'sessions-moved', sessionIds: moved })
  if (Object.keys(cur.places).some((id) => id in prev.places && prev.places[id] !== cur.places[id]))
    changes.push({ kind: 'location' })
  if (!prev.registration && cur.registration) changes.push({ kind: 'registration' })
  return changes
}

// ── Classifying against the last snapshot ───────────────────────────────────

export interface Notice<C> {
  id: string
  isNew: boolean
  changes: C[] // empty when new
}

/**
 * Compares every record's print with the previous snapshot. A record is **new** when it's
 * listable now and wasn't listable (or known) before — so a record created early, before
 * its dates, is announced when its dates arrive. A **reopened** activity is a change, not
 * new. A record that was listable and has lost all its remaining dates is reported with
 * its changes (a cancellation); one that closed, or whose dates simply passed, isn't.
 * The returned snapshot holds every current record (deleted ones drop out).
 */
export function classify<P extends { listable: boolean; closed?: boolean }, C>(
  records: { id: string; print: P }[],
  prev: Record<string, P>,
  changesOf: (prev: P, cur: P, id: string) => C[]
): { notices: Notice<C>[]; next: Record<string, P> } {
  const notices: Notice<C>[] = []
  const next: Record<string, P> = {}
  for (const { id, print } of records) {
    next[id] = print
    const before = prev[id]
    if (!print.listable) {
      if (before?.listable && !print.closed) {
        const changes = changesOf(before, print, id)
        if (changes.length) notices.push({ id, isNew: false, changes })
      }
      continue
    }
    const reopening = !!before?.closed && !print.closed
    if (!before || (!before.listable && !reopening)) {
      notices.push({ id, isNew: true, changes: [] })
      continue
    }
    const changes = changesOf(before, print, id)
    if (changes.length) notices.push({ id, isNew: false, changes })
  }
  return { notices, next }
}

/** The ids a record's silentRemovals lists (data-entry corrections — never announced). */
const silentIds = (r: { silentRemovals?: { id: string }[] }) =>
  new Set((r.silentRemovals ?? []).map((s) => s.id))

/**
 * `runs` are the current runs plus any deleted with Notify cancellation (given with no
 * performances left), so they report "Cancelled" like a run that lost its last date.
 */
export function classifyProductions(
  runs: Run[],
  prev: Record<string, ProductionPrint>,
  today: string
) {
  const silent = new Map(runs.map((r) => [r.id, silentIds(r)]))
  return classify(
    runs.map((r) => ({ id: r.id, print: productionPrint(r, today) })),
    prev,
    (p, c, id) => productionChanges(p, c, today, silent.get(id))
  )
}

/** `cancelled`: ids of activities deleted with Notify cancellation (given with no sessions). */
export function classifyActivities(
  activities: Activity[],
  prev: Record<string, ActivityPrint>,
  today: string,
  cancelled: ReadonlySet<string> = new Set()
) {
  const silent = new Map(activities.map((a) => [a.id, silentIds(a)]))
  return classify(
    activities.map((a) => ({ id: a.id, print: activityPrint(a, today) })),
    prev,
    (p, c, id) =>
      activityChanges(p, c, today, { silent: silent.get(id), cancelled: cancelled.has(id) })
  )
}

// ── Labels shown in emails ───────────────────────────────────────────────────

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function productionChangeLabel(c: ProductionChange) {
  switch (c.kind) {
    case 'dates-added':
      return `${plural(c.perfIds.length, 'date')} added`
    case 'dates-removed':
      return c.all ? 'Cancelled' : `${plural(c.when.length, 'date')} cancelled`
    case 'dates-moved':
      return 'Dates changed'
    case 'venue':
      return 'Venue changed'
    case 'tickets':
      return 'Tickets now on sale'
  }
}

export function activityChangeLabel(c: ActivityChange) {
  switch (c.kind) {
    case 'sessions-added':
      return `${plural(c.sessionIds.length, 'session')} added`
    case 'sessions-removed':
      return c.all ? 'Cancelled' : `${plural(c.when.length, 'session')} cancelled`
    case 'sessions-moved':
      return `${plural(c.sessionIds.length, 'session')} updated`
    case 'location':
      return 'Location changed'
    case 'registration':
      return 'Registration open'
    case 'reopened':
      return 'Reopened'
  }
}

const sessionCount = (c: ActivityChange) =>
  c.kind === 'sessions-added' || c.kind === 'sessions-moved'
    ? c.sessionIds.length
    : c.kind === 'sessions-removed' && !c.all
      ? c.when.length
      : 0

/**
 * The pips for an activity's changes: added, cancelled and updated sessions share one
 * "N sessions modified" pip (the card lists which). A cancelled activity stays "Cancelled".
 */
export function activityChangeLabels(changes: ActivityChange[]) {
  const modified = changes.reduce((n, c) => n + sessionCount(c), 0)
  const pips: { label: string; change: ActivityChange }[] = []
  let merged = false
  for (const c of changes) {
    if (!sessionCount(c)) pips.push({ label: activityChangeLabel(c), change: c })
    else if (!merged) {
      merged = true
      pips.push({ label: modifiedLabel(modified), change: c })
    }
  }
  return pips
}

const modifiedLabel = (n: number) => `${plural(n, 'session')} modified`
