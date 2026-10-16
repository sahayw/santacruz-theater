import type { Activity, Genre, PerfType, Run, ServiceListing } from '../types.ts'
import {
  MAX_GENRES,
  activityIssues,
  listingIssues,
  runIssues,
  type RuleRefs
} from './data-rules.ts'
import { PERF_ID_RE, SESSION_ID_RE } from './occurrence-ids.ts'

// Whole-file checks for the data files the editors write: shape, ids, and the content
// rules from data-rules.ts. Shared by the build (scripts/check-*.ts) and the save
// function (netlify/functions/data.mts), so a save the build would reject is refused
// before it's committed. Pure — callers read the files.
//
// Cross-file rules need every file, so only the build has what they need: callers pass
// the ids seen in earlier files, and `refs.runIds` for checking an audition's
// productionId. Without them those checks are skipped.

export interface FileCheck {
  errors: string[]
  warnings: string[]
}

export interface ShowsFileCheck extends FileCheck {
  runs: Run[]
  orderingWarnings: string[]
}

export interface ActivitiesFileCheck extends FileCheck {
  oneOffs: string[] // one-off location names, one per session
}

const VALID_GENRES = new Set<string>(['Drama', 'Musical', 'Comedy', 'Other'])
const VALID_PERF_TYPES = new Set<PerfType>(['', 'Preview', 'Opening', 'Closing', 'Talk-back'])
const VALID_TYPES = new Set(['audition', 'event'])
const VALID_ROLE_TYPES = new Set(['lead', 'supporting', 'ensemble'])
const VALID_GENDERS = new Set(['female', 'male', 'any'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Thrown by a shows-file assertion: the file's shape is wrong, so checking stops. */
class ShapeError extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ShapeError(message)
}

function expectString(value: unknown, label: string): string {
  assert(typeof value === 'string', `${label} must be a string`)
  return value
}

// ── Shows: data/shows/<year>/<company>-<year>.json ──────────────────────────

export function showsFileCheck(
  value: unknown,
  filePath: string,
  refs: RuleRefs,
  today: string,
  seenPerfIds = new Set<string>()
): ShowsFileCheck {
  const errors: string[] = []
  const warnings: string[] = []
  const orderingWarnings: string[] = []
  const validCompanies = new Set(refs.companies.map((c) => c.id))
  try {
    assert(isRecord(value), `${filePath}: top-level JSON must be an object`)
    assert(typeof value.year === 'number', `${filePath}: year must be a number`)
    assert(Array.isArray(value.runs), `${filePath}: must contain a runs array`)

    value.runs.forEach((runValue, runIndex) => {
      const loc = `${filePath}: runs[${runIndex}]`
      assert(isRecord(runValue), `${loc} must be an object`)

      const company = expectString(runValue.company, `${loc}.company`)
      expectString(runValue.venue, `${loc}.venue`)
      assert(validCompanies.has(company), `${loc}.company has invalid value: ${company}`)

      const rawGenre = runValue.genre
      let genres: Genre[] = []
      if (Array.isArray(rawGenre)) {
        genres = (rawGenre as unknown[]).map((g) => {
          assert(
            typeof g === 'string' && VALID_GENRES.has(g),
            `${loc}.genre contains invalid value: ${g}`
          )
          return g as Genre
        })
      } else if (typeof rawGenre === 'string' && rawGenre !== '') {
        assert(VALID_GENRES.has(rawGenre), `${loc}.genre has invalid value: ${rawGenre}`)
        genres = [rawGenre as Genre]
      } else {
        assert(
          rawGenre === '' || rawGenre === undefined,
          `${loc}.genre must be an array or empty string`
        )
      }
      assert(genres.length <= MAX_GENRES, `${loc}.genre has more than ${MAX_GENRES} values`)

      expectString(runValue.id, `${loc}.id`)
      expectString(runValue.showAbv, `${loc}.showAbv`)
      expectString(runValue.show, `${loc}.show`)
      expectString(runValue.price, `${loc}.price`)
      expectString(runValue.discounts, `${loc}.discounts`)
      expectString(runValue.infoUrl, `${loc}.infoUrl`)
      expectString(runValue.ticketsUrl, `${loc}.ticketsUrl`)
      if (runValue.room !== undefined) expectString(runValue.room, `${loc}.room`)
      if (runValue.organizers !== undefined)
        assert(
          Array.isArray(runValue.organizers) &&
            runValue.organizers.every((o) => typeof o === 'string'),
          `${loc}.organizers must be an array of organizer ids`
        )
      assert(
        company === value.company,
        `${loc}.company must match the file's company "${value.company}"`
      )
      if (runValue.updatedAt !== undefined)
        assert(
          typeof runValue.updatedAt === 'string' && ISO_RE.test(runValue.updatedAt),
          `${loc}.updatedAt must be an ISO 8601 timestamp`
        )
      assert(Array.isArray(runValue.performances), `${loc}.performances must be an array`)

      let previousSortKey = ''
      // Historic runs (last performance before today) don't get warnings
      const perfDates = (runValue.performances as { date?: unknown }[]).map((p) => String(p.date))
      const isHistoric = perfDates.length > 0 && perfDates.every((d) => d < today)
      runValue.performances.forEach((perfValue, perfIndex) => {
        const ploc = `${loc}.performances[${perfIndex}]`
        assert(isRecord(perfValue), `${ploc} must be an object`)

        const perfId = expectString(perfValue.id, `${ploc}.id`)
        assert(PERF_ID_RE.test(perfId), `${ploc}.id must be "perf-<timestamp>", got: ${perfId}`)
        assert(!seenPerfIds.has(perfId), `${ploc}.id is a duplicate: ${perfId}`)
        seenPerfIds.add(perfId)

        const date = expectString(perfValue.date, `${ploc}.date`)
        const time = expectString(perfValue.time, `${ploc}.time`)
        const perfType = expectString(perfValue.perfType, `${ploc}.perfType`) as PerfType
        expectString(perfValue.discounts, `${ploc}.discounts`)
        expectString(perfValue.ticketsUrl, `${ploc}.ticketsUrl`)

        assert(DATE_RE.test(date), `${ploc}.date must be YYYY-MM-DD`)
        assert(TIME_RE.test(time), `${ploc}.time must be HH:MM`)
        assert(VALID_PERF_TYPES.has(perfType), `${ploc}.perfType has invalid value: ${perfType}`)

        const sortKey = `${date}T${time}`
        if (previousSortKey > sortKey && !isHistoric)
          orderingWarnings.push(
            `${loc}.performances is not ordered by date/time (${sortKey} after ${previousSortKey})`
          )
        previousSortKey = sortKey
      })

      // Content rules shared with the /admin editor
      const label = `${loc} (${runValue.showAbv || runValue.show || runValue.id})`
      const issues = runIssues(runValue as unknown as Run, value.year as number, refs, today)
      issues.errors.forEach((m) => errors.push(`${label}: ${m}`))
      issues.warnings.forEach((m) => warnings.push(`${label}: ${m}`))
    })
  } catch (e) {
    if (!(e instanceof ShapeError)) throw e
    errors.unshift(e.message)
    return { errors, warnings, orderingWarnings, runs: [] }
  }
  const runs = (value as { runs: Run[] }).runs
  return { errors, warnings, orderingWarnings, runs }
}

// ── Activities: data/activities/<year>/<company>-activities-<year>.json ─────

export function activitiesFileCheck(
  value: unknown,
  label: string,
  year: number,
  refs: RuleRefs,
  seenSessionIds = new Set<string>()
): ActivitiesFileCheck {
  const errors: string[] = []
  const warnings: string[] = []
  const oneOffs: string[] = []
  const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`)

  if (!isRecord(value)) {
    err(label, 'top-level JSON must be an object')
    return { errors, warnings, oneOffs }
  }
  if (typeof value.company !== 'string') err(label, 'missing company string')
  if (typeof value.year !== 'number') err(label, 'missing year number')
  if (!Array.isArray(value.activities)) {
    err(label, 'missing activities array')
    return { errors, warnings, oneOffs }
  }

  const acts = value.activities as Record<string, unknown>[]
  for (let i = 0; i < acts.length; i++) {
    const a = acts[i]
    const al = `${label} activity[${i}] (${a.id || 'no-id'})`

    if (typeof a.id !== 'string' || !a.id.startsWith('activity-'))
      err(al, 'id must be "activity-<timestamp>"')
    if (!VALID_TYPES.has(a.type as string))
      err(al, `type must be "audition" or "event", got: ${a.type}`)
    const linked = a.type === 'audition' && typeof a.productionId === 'string'
    for (const k of ['title', 'genre', 'openingDate', 'productionUrl'])
      if (linked && a[k] !== undefined)
        err(al, `a linked audition's ${k} comes from its production — don't store one`)
    if (!linked && typeof a.title !== 'string') err(al, 'title must be a string')
    if (!linked && !Array.isArray(a.genre)) err(al, 'genre must be an array')
    else if (Array.isArray(a.genre))
      (a.genre as unknown[]).forEach((g, gi) => {
        if (!VALID_GENRES.has(g as string)) err(al, `genre[${gi}] invalid: ${g}`)
      })

    if (!Array.isArray(a.dates)) err(al, 'dates must be an array')
    else
      (a.dates as Record<string, unknown>[]).forEach((d, di) => {
        if (typeof d.id !== 'string' || !SESSION_ID_RE.test(d.id))
          err(al, `dates[${di}].id must be "session-<timestamp>", got: ${d.id ?? '(missing)'}`)
        else if (seenSessionIds.has(d.id)) err(al, `dates[${di}].id is a duplicate: ${d.id}`)
        else seenSessionIds.add(d.id)
        if (d.venue !== undefined && typeof d.venue !== 'string')
          err(al, `dates[${di}].venue must be a venue code`)
        if (d.room !== undefined && typeof d.room !== 'string')
          err(al, `dates[${di}].room must be a string`)
        const loc = d.location as Record<string, unknown> | undefined
        if (loc !== undefined) {
          if (typeof loc !== 'object' || typeof loc.name !== 'string')
            err(al, `dates[${di}].location must be { name, address? }`)
          else if (d.venue !== undefined)
            err(al, `dates[${di}] has both a venue and a one-off location`)
          else oneOffs.push(loc.name)
        }
      })

    if (
      a.organizers !== undefined &&
      !(Array.isArray(a.organizers) && a.organizers.every((o) => typeof o === 'string'))
    )
      err(al, 'organizers must be an array of organizer ids')
    if (a.organizerName !== undefined || a.organizerUrl !== undefined)
      err(al, 'organizerName / organizerUrl are no longer used — set organizers instead')

    if (a.closed !== undefined && typeof a.closed !== 'boolean')
      err(al, 'closed must be a boolean if present')
    if (a.datesByRequest !== undefined && typeof a.datesByRequest !== 'boolean')
      err(al, 'datesByRequest must be a boolean if present')

    if (!(typeof a.createdAt === 'string' && ISO_RE.test(a.createdAt)))
      err(al, 'createdAt must be ISO 8601 timestamp')
    if (!(typeof a.updatedAt === 'string' && ISO_RE.test(a.updatedAt)))
      err(al, 'updatedAt must be ISO 8601 timestamp')

    if (a.type === 'audition') {
      if (a.rolesAvailable !== undefined) {
        if (!Array.isArray(a.rolesAvailable)) err(al, 'rolesAvailable must be an array')
        else
          (a.rolesAvailable as Record<string, unknown>[]).forEach((r, ri) => {
            if (typeof r.role !== 'string') err(al, `roles[${ri}].role must be string`)
            if (!VALID_ROLE_TYPES.has(r.type as string))
              err(al, `roles[${ri}].type invalid: ${r.type}`)
            if (!VALID_GENDERS.has(r.gender as string))
              err(al, `roles[${ri}].gender invalid: ${r.gender}`)
          })
      }
      if (a.virtualSubmission !== undefined && typeof a.virtualSubmission !== 'boolean')
        err(al, 'virtualSubmission must be a boolean if present')
      // Event-only fields on an audition
      if (a.datesByRequest !== undefined) err(al, 'datesByRequest is event-only')
      if (a.briefDescription !== undefined) err(al, 'briefDescription is event-only')
      if (a.cost !== undefined) err(al, 'cost is event-only')
    }

    if (a.type === 'event') {
      if (a.rolesAvailable !== undefined) err(al, 'rolesAvailable is audition-only')
      if (a.prep !== undefined) err(al, 'prep is audition-only')
      if (a.virtualSubmission !== undefined) err(al, 'virtualSubmission is audition-only')
      if (a.rehearsalStart !== undefined) err(al, 'rehearsalStart is audition-only')
      if (a.openingDate !== undefined) err(al, 'openingDate is audition-only')
      if (a.productionUrl !== undefined) err(al, 'productionUrl is audition-only')
      if (a.productionId !== undefined) err(al, 'productionId is audition-only')
    }

    // Content rules shared with the /admin editor
    if (Array.isArray(a.dates)) {
      const issues = activityIssues(a as unknown as Activity, year, String(value.company), refs)
      issues.errors.forEach((m) => err(al, m))
      issues.warnings.forEach((m) => warnings.push(`${al}: ${m}`))
    }
  }
  return { errors, warnings, oneOffs }
}

// ── Services: data/sc-theater-services.json ─────────────────────────────────

export function servicesFileCheck(
  value: unknown,
  label: string,
  subcategories: Set<string>
): FileCheck {
  const errors: string[] = []
  const warnings: string[] = []
  if (!isRecord(value) || !Array.isArray(value.listings)) {
    errors.push(`${label}: missing listings array`)
    return { errors, warnings }
  }

  const seenIds = new Set<string>()
  ;(value.listings as Record<string, unknown>[]).forEach((l, i) => {
    const ll = `${label} listings[${i}] (${l.name || l.id || 'no-id'})`
    const err = (msg: string) => errors.push(`${ll}: ${msg}`)

    if (typeof l.id !== 'string' || !l.id.startsWith('service-'))
      err('id must be "service-<timestamp>"')
    else if (seenIds.has(l.id)) err(`duplicate id ${l.id}`)
    else seenIds.add(l.id)
    if (typeof l.name !== 'string') err('name must be a string')
    if (!Array.isArray(l.categories) || l.categories.some((c) => typeof c !== 'string'))
      err('categories must be an array of strings')
    else
      for (const c of l.categories as string[])
        if (!subcategories.has(c))
          err(`category "${c}" is not a subcategory in sc-theater-service-categories.json`)
    if (typeof l.contact !== 'object' || l.contact === null) err('contact must be an object')
    if (typeof l.active !== 'boolean') err('active must be a boolean')
    if (!(typeof l.createdAt === 'string' && ISO_RE.test(l.createdAt)))
      err('createdAt must be ISO 8601 timestamp')
    if (!(typeof l.updatedAt === 'string' && ISO_RE.test(l.updatedAt)))
      err('updatedAt must be ISO 8601 timestamp')
    // Editor-only fields (underscore-prefixed) are stripped on save
    for (const key of Object.keys(l)) if (key.startsWith('_')) err(`editor-only field ${key} saved`)

    // Content rules shared with the /admin editor
    if (typeof l.name === 'string' && Array.isArray(l.categories)) {
      const issues = listingIssues(l as unknown as ServiceListing)
      issues.errors.forEach(err)
      issues.warnings.forEach((m) => warnings.push(`${ll}: ${m}`))
    }
  })
  return { errors, warnings }
}

/** Leaf subcategory ids from sc-theater-service-categories.json — what listings store. */
export function serviceSubcategories(categoriesFile: unknown) {
  const cats = (categoriesFile as { categories?: { subcategories: { id: string }[] }[] }).categories
  return new Set((cats ?? []).flatMap((c) => c.subcategories.map((s) => s.id)))
}

// ── A file the editors save, by its path under data/ ────────────────────────

const SHOWS_PATH = /^shows\/(\d{4})\/[\w-]+-\d{4}\.json$/
const ACTIVITIES_PATH = /^activities\/(\d{4})\/[\w-]+-activities-\d{4}\.json$/
const SERVICES_PATH = 'sc-theater-services.json'

/**
 * Errors that would fail the build if `value` were saved at `path` (relative to data/).
 * Single-file only: ids are checked for duplicates within the file, and an audition's
 * productionId isn't checked (a production saved moments ago isn't deployed yet).
 * Files the editors don't write aren't checked here.
 */
export function saveErrors(
  path: string,
  value: unknown,
  refs: RuleRefs & { subcategories: Set<string> },
  today: string
): string[] {
  const label = `data/${path}`
  const { runIds: _skip, ...singleFile } = refs
  let m = path.match(SHOWS_PATH)
  if (m) return showsFileCheck(value, label, singleFile, today).errors
  m = path.match(ACTIVITIES_PATH)
  if (m) return activitiesFileCheck(value, label, Number(m[1]), singleFile).errors
  if (path === SERVICES_PATH) return servicesFileCheck(value, label, refs.subcategories).errors
  return []
}
