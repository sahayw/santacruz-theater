/**
 * Validates all data/activities/<year>/<co>-activities-<year>.json files against the Activity schema.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Activity, CompanyEntry, Venue } from '../src/types.ts'
import { activityIssues, type RuleRefs } from '../src/lib/data-rules.ts'
import { SESSION_ID_RE } from '../src/lib/occurrence-ids.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ACTIVITIES_ROOT = join(ROOT, 'data', 'activities')
const FILE_RE = /^(.+)-activities-(\d{4})\.json$/

/** Every Run id across data/shows, for checking an audition's productionId. */
function allRunIds() {
  const ids = new Set<string>()
  const showsRoot = join(ROOT, 'data', 'shows')
  for (const year of readdirSync(showsRoot))
    for (const f of readdirSync(join(showsRoot, year)).filter((n) => n.endsWith('.json')))
      for (const r of JSON.parse(readFileSync(join(showsRoot, year, f), 'utf-8')).runs ?? [])
        ids.add(r.id)
  return ids
}

const readData = (f: string) => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf-8'))
const refs: RuleRefs = {
  companies: readData('sc-theater-companies.json').companies as CompanyEntry[],
  venues: readData('sc-theater-venues.json').venues as Venue[],
  runIds: allRunIds()
}
/** Sessions at places not in the venue list — fine, but regulars belong in the list. */
const oneOffs = new Map<string, number>()

const VALID_GENRES = new Set(['Drama', 'Musical', 'Comedy', 'Other'])
const VALID_TYPES = new Set(['audition', 'event'])
const VALID_ROLE_TYPES = new Set(['lead', 'supporting', 'ensemble'])
const VALID_GENDERS = new Set(['female', 'male', 'any'])

function isIso8601(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)
}

const errors: string[] = []
const warnings: string[] = []
const seenSessionIds = new Set<string>()

function err(file: string, msg: string) {
  errors.push(`${file}: ${msg}`)
}

let yearDirs: string[] = []
try {
  yearDirs = readdirSync(ACTIVITIES_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
} catch {
  console.log('No data/activities/ directory found — skipping check.')
  process.exit(0)
}

for (const year of yearDirs) {
  const dir = join(ACTIVITIES_ROOT, year)
  const files = readdirSync(dir).filter((f) => FILE_RE.test(f))

  for (const file of files) {
    const label = `activities/${year}/${file}`
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
    } catch (e) {
      err(label, `JSON parse error: ${e}`)
      continue
    }

    const f = raw as Record<string, unknown>
    if (typeof f.company !== 'string') err(label, 'missing company string')
    if (typeof f.year !== 'number') err(label, 'missing year number')
    if (!Array.isArray(f.activities)) {
      err(label, 'missing activities array')
      continue
    }

    const acts = f.activities as Record<string, unknown>[]
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
            else oneOffs.set(loc.name, (oneOffs.get(loc.name) ?? 0) + 1)
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
      if (a.datesByRequest !== undefined && typeof a.datesByRequest !== 'boolean') {
        err(al, 'datesByRequest must be a boolean if present')
      }

      if (!isIso8601(a.createdAt)) err(al, 'createdAt must be ISO 8601 timestamp')
      if (!isIso8601(a.updatedAt)) err(al, 'updatedAt must be ISO 8601 timestamp')

      // Audition-specific
      if (a.type === 'audition') {
        if (a.rolesAvailable !== undefined) {
          if (!Array.isArray(a.rolesAvailable)) {
            err(al, 'rolesAvailable must be an array')
          } else {
            const roles = a.rolesAvailable as Record<string, unknown>[]
            roles.forEach((r, ri) => {
              if (typeof r.role !== 'string') err(al, `roles[${ri}].role must be string`)
              if (!VALID_ROLE_TYPES.has(r.type as string))
                err(al, `roles[${ri}].type invalid: ${r.type}`)
              if (!VALID_GENDERS.has(r.gender as string))
                err(al, `roles[${ri}].gender invalid: ${r.gender}`)
            })
          }
        }
        if (a.virtualSubmission !== undefined && typeof a.virtualSubmission !== 'boolean')
          err(al, 'virtualSubmission must be a boolean if present')
        // Flag event-only fields used on audition
        if (a.datesByRequest !== undefined) err(al, 'datesByRequest is event-only')
        if (a.briefDescription !== undefined) err(al, 'briefDescription is event-only')
        if (a.cost !== undefined) err(al, 'cost is event-only')
      }

      // Event-specific
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
        const issues = activityIssues(
          a as unknown as Activity,
          Number(year),
          String(f.company),
          refs
        )
        issues.errors.forEach((m) => err(al, m))
        issues.warnings.forEach((m) => warnings.push(`${al}: ${m}`))
      }
    }
  }
}

if (errors.length) {
  console.error(`\nActivities validation failed — ${errors.length} error(s):\n`)
  errors.forEach((e) => console.error('  ✗', e))
  process.exit(1)
} else {
  console.log('Activities validation passed.')
}
if (warnings.length) {
  console.log(`Missing details (${warnings.length}):`)
  warnings.forEach((w) => console.log('  -', w))
}
if (oneOffs.size) {
  console.log(`One-off locations, not in the venue list (${oneOffs.size}):`)
  for (const [name, n] of oneOffs) console.log(`  - ${name} (${n} session${n > 1 ? 's' : ''})`)
}
