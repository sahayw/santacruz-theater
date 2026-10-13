import type { Activity, Run, ServiceListing } from '../types.ts'

// Record-level validation rules, shared by the /admin editors (run on Save) and the
// scripts/check-*.ts build validators, so the two can't disagree about what's valid.
// Errors block a save / fail the build; warnings are reported but allowed.
// Structural checks the editors guarantee by construction (field types, id formats,
// timestamps, type-only fields) stay in the check scripts.

export interface RuleIssues {
  errors: string[]
  warnings: string[]
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

export function runIssues(run: Run, fileYear: number): RuleIssues {
  const errors: string[] = []
  const warnings: string[] = []

  if (isBlank(run.show)) errors.push('Full Show Title is required')
  if (isBlank(run.showAbv)) errors.push('Abbrev is required')
  else if (run.showAbv.length > SHOW_ABV_MAX)
    errors.push(`Abbrev is longer than ${SHOW_ABV_MAX} characters`)
  if (isBlank(run.venue)) errors.push('Venue is required')

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

  if (!run.performances.length) warnings.push('no performances — it won’t appear on the calendar')
  if (isBlank(run.price)) warnings.push('Price is empty')
  if (isBlank(run.infoUrl)) warnings.push('Info URL is empty')
  if (isBlank(run.description)) warnings.push('Description is empty')

  return { errors, warnings }
}

/** `a.dates` should already have the editor's blank rows removed, as saved. */
export function activityIssues(a: Activity, fileYear: number): RuleIssues {
  const errors: string[] = []
  const warnings: string[] = []

  if (isBlank(a.title)) errors.push('Title is required')

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
  }

  if (
    a.type === 'event' &&
    isBlank(a.contact?.email) &&
    isBlank(a.contact?.phone) &&
    isBlank(a.noticeUrl) &&
    isBlank(a.registerUrl) &&
    isBlank(a.organizerUrl)
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
