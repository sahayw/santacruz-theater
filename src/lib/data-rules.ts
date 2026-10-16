import type { Activity, CompanyEntry, Run, ServiceListing, Venue } from '../types.ts'
import { organizerErrors } from './organizers.ts'
import { venueByCode } from './venues.ts'

// Record-level validation rules, shared by the /admin editors (run on Save) and the
// scripts/check-*.ts build validators, so the two can't disagree about what's valid.
// Errors block a save / fail the build; warnings are reported but allowed.
// Structural checks the editors guarantee by construction (field types, id formats,
// timestamps, type-only fields) stay in the check scripts.

export interface RuleIssues {
  errors: string[]
  warnings: string[]
}

/** Reference data the rules check records against. */
export interface RuleRefs {
  companies: CompanyEntry[]
  venues: Venue[]
  /** Every Run id, for checking an audition's productionId. Omit to skip that check. */
  runIds?: Set<string>
}

/**
 * Details a record still lacks. Shown as editor warnings (productions) and published in
 * /missing-details.json for the external alerting agent. Records whose dates are all past
 * have none.
 */
export type Gap = 'dates' | 'tickets' | 'price' | 'info' | 'description' | 'location'

const RUN_GAP_WARNINGS: Record<Gap, string> = {
  dates: 'no performances — it won’t appear on the calendar',
  tickets: 'no tickets link yet',
  price: 'Price is empty',
  info: 'Info URL is empty',
  description: 'Description is empty',
  location: 'Venue is empty'
}

/** Genre cap — enforced by the editor's picker and check-shows.ts (after legacy coercion). */
export const MAX_GENRES = 2
export const SHOW_ABV_MAX = 20

function isBlank(v: string | undefined) {
  return !v || !v.trim()
}

/** `YYYY-MM-DD` and a real calendar date. */
export function isRealDate(v: string | undefined) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** A real date no more than one year either side of the file's year. */
export function isDateNearYear(v: string | undefined, fileYear: number) {
  if (!isRealDate(v)) return false
  const y = Number(v!.slice(0, 4))
  return y >= fileYear - 1 && y <= fileYear + 1
}

/** `HH:MM`, 24-hour. */
export function isValidTime(v: string | undefined) {
  if (!v || !/^\d{2}:\d{2}$/.test(v)) return false
  const [h, m] = v.split(':').map(Number)
  return h <= 23 && m <= 59
}

function firstDateYearIssue(dates: string[], fileYear: number, what: string) {
  const first = dates.filter((d) => isDateNearYear(d, fileYear)).sort()[0]
  if (!first) return null
  const yr = Number(first.slice(0, 4))
  if (yr === fileYear) return null
  return `first ${what} ${first} is in ${yr} — it belongs in the ${yr} file`
}

/**
 * Today as `YYYY-MM-DD` in Santa Cruz — the one definition of "today" for upcoming,
 * listings, feeds and emails, wherever the code runs (builds and functions run in UTC).
 * The /events and /productions page scripts and the calendar compute the same date inline.
 */
export function todayIso(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

/** What a production still lacks; none once its last performance is before `today`. */
export function runGaps(run: Run, today = todayIso()): Gap[] {
  const dates = run.performances.map((p) => p.date).sort()
  if (dates.length && dates.at(-1)! < today) return []
  const gaps: Gap[] = []
  if (!dates.length) gaps.push('dates')
  if (isBlank(run.ticketsUrl) && !run.performances.some((p) => !isBlank(p.ticketsUrl)))
    gaps.push('tickets')
  if (isBlank(run.price)) gaps.push('price')
  if (isBlank(run.infoUrl)) gaps.push('info')
  if (isBlank(run.description)) gaps.push('description')
  return gaps
}

/**
 * What an open activity still lacks; none once it's closed or its dates are all past.
 * `primaryVenue` is the organizing company's default venue, if any.
 */
export function activityGaps(a: Activity, primaryVenue?: string, today = todayIso()): Gap[] {
  const dated = (a.dates || []).filter((d) => d.date)
  if (a.closed || (dated.length && dated.every((d) => d.date < today))) return []
  const gaps: Gap[] = []
  if (isBlank(a.noticeUrl) && isBlank(a.registerUrl)) gaps.push('info')
  if (!primaryVenue && dated.some((d) => isBlank(d.venue) && isBlank(d.location?.name)))
    gaps.push('location')
  return gaps
}

/**
 * The "upcoming" rule for activities (CLAUDE.md): closed is never upcoming; a virtual
 * audition or a "dates by request" event with no dates stays upcoming; otherwise the
 * latest date must be `today` or later. Used by the digests and change rules; the
 * /events client filter and the editor Preview implement the same rule.
 */
export function isUpcomingActivity(
  a: Pick<Activity, 'closed' | 'virtualSubmission' | 'type' | 'datesByRequest' | 'dates'>,
  today = todayIso()
): boolean {
  if (a.closed) return false
  if (a.virtualSubmission) return true // no scheduled dates needed — current until closed
  const dates = (a.dates || []).map((d) => d.date).filter(Boolean)
  if (a.type === 'event' && a.datesByRequest && !dates.length) return true
  return (dates.sort().pop() ?? '') >= today
}

/** Warnings are skipped for a historic run — one whose last performance is before `today`. */
export function runIssues(
  run: Run,
  fileYear: number,
  refs: RuleRefs,
  today = todayIso()
): RuleIssues {
  const errors: string[] = []
  const warnings: string[] = []

  if (isBlank(run.show)) errors.push('Full Show Title is required')
  if (isBlank(run.showAbv)) errors.push('Abbrev is required')
  else if (run.showAbv.length > SHOW_ABV_MAX)
    errors.push(`Abbrev is longer than ${SHOW_ABV_MAX} characters`)
  if (isBlank(run.venue)) errors.push('Venue is required')
  else if (!venueByCode(run.venue, refs.venues))
    errors.push(`Venue "${run.venue}" isn't in the venue list`)
  errors.push(...organizerErrors(run.company, run.organizers, refs.companies))

  run.performances.forEach((p, i) => {
    if (!isDateNearYear(p.date, fileYear))
      errors.push(`performance ${i + 1} has an invalid date "${p.date || '(empty)'}"`)
    if (!isValidTime(p.time))
      errors.push(`performance ${i + 1} has an invalid time "${p.time || '(empty)'}"`)
  })
  const yearIssue = firstDateYearIssue(
    run.performances.map((p) => p.date),
    fileYear,
    'performance'
  )
  if (yearIssue) errors.push(yearIssue)

  warnings.push(...runGaps(run, today).map((g) => RUN_GAP_WARNINGS[g]))

  return { errors, warnings }
}

/** `a.dates` should already have the editor's blank rows removed, as saved. */
export function activityIssues(
  a: Activity,
  fileYear: number,
  fileCompany: string,
  refs: RuleRefs
): RuleIssues {
  const errors: string[] = []
  const warnings: string[] = []

  const linked = a.type === 'audition' && !!a.productionId
  if (!linked && isBlank(a.title)) errors.push('Title is required')
  errors.push(
    ...organizerErrors(fileCompany, a.organizers, refs.companies, { coProducers: false })
  )

  const dates = a.dates || []
  const noDatesAllowed =
    (a.type === 'audition' && a.virtualSubmission === true) ||
    (a.type === 'event' && a.datesByRequest === true)
  if (!dates.length && !noDatesAllowed) errors.push('at least one date is required')
  dates.forEach((d, i) => {
    if (!isDateNearYear(d.date, fileYear))
      errors.push(`date row ${i + 1} has an invalid date "${d.date || '(empty)'}"`)
    if (!isValidTime(d.startTime))
      errors.push(`date row ${i + 1} has an invalid start time "${d.startTime || '(empty)'}"`)
    if (d.endTime !== undefined && !isValidTime(d.endTime))
      errors.push(`date row ${i + 1} has an invalid end time "${d.endTime}"`)
    if (d.venue !== undefined && !venueByCode(d.venue, refs.venues))
      errors.push(`date row ${i + 1} has venue "${d.venue}", which isn't in the venue list`)
  })
  const yearIssue = firstDateYearIssue(
    dates.map((d) => d.date),
    fileYear,
    'date'
  )
  if (yearIssue) errors.push(yearIssue)

  if (a.type === 'audition') {
    if (a.rehearsalStart !== undefined && !isRealDate(a.rehearsalStart))
      errors.push(`Rehearsal Start "${a.rehearsalStart}" is not a valid date`)
    if (a.openingDate !== undefined && !isRealDate(a.openingDate))
      errors.push(`Opening "${a.openingDate}" is not a valid date`)
    if (a.productionId !== undefined && refs.runIds && !refs.runIds.has(a.productionId))
      errors.push(`Production "${a.productionId}" doesn't exist`)
    // Normally an audition is for one production; a season-wide audition can't be, so
    // this is a warning (Save anyway?), not an error
    if (a.productionId === undefined)
      warnings.push('not linked to a production')
  }

  // An organizer named on the record (Other or co-producer) counts as a contact via its website
  const organizerSite = (a.organizers || []).some(
    (id) => !isBlank(refs.companies.find((c) => c.id === id)?.website)
  )
  if (
    a.type === 'event' &&
    isBlank(a.contact?.email) &&
    isBlank(a.contact?.phone) &&
    isBlank(a.noticeUrl) &&
    isBlank(a.registerUrl) &&
    !organizerSite
  )
    errors.push('an event needs a contact email, phone, or link (info, registration, or organizer)')

  return { errors, warnings }
}

export function listingIssues(l: ServiceListing): RuleIssues {
  const errors: string[] = []
  const warnings: string[] = []

  if (isBlank(l.name)) errors.push('Name is required')
  if (!(l.categories || []).length) errors.push('at least one category is required')
  if (isBlank(l.contact?.tel) && isBlank(l.contact?.email))
    errors.push('contact needs at least a phone or email')

  return { errors, warnings }
}
