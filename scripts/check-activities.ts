/**
 * Validates all data/activities/<year>/<co>-activities-<year>.json files against the Activity schema.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ACTIVITIES_ROOT = join(ROOT, 'data', 'activities')
const FILE_RE = /^(.+)-activities-(\d{4})\.json$/

const VALID_GENRES = new Set(['Drama', 'Musical', 'Comedy', 'Other'])
const VALID_TYPES = new Set(['audition', 'event'])
const VALID_ROLE_TYPES = new Set(['lead', 'supporting', 'ensemble'])
const VALID_GENDERS = new Set(['female', 'male', 'any'])

function isIso8601(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)
}
function isDate(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}
function isTime(v: unknown): boolean {
  return typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)
}

const errors: string[] = []

function err(file: string, msg: string) {
  errors.push(`${file}: ${msg}`)
}

let yearDirs: string[] = []
try {
  yearDirs = readdirSync(ACTIVITIES_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
} catch {
  console.log('No data/activities/ directory found — skipping check.')
  process.exit(0)
}

for (const year of yearDirs) {
  const dir = join(ACTIVITIES_ROOT, year)
  const files = readdirSync(dir).filter(f => FILE_RE.test(f))

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
    if (!Array.isArray(f.activities)) { err(label, 'missing activities array'); continue }

    const acts = f.activities as Record<string, unknown>[]
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i]
      const al = `${label} activity[${i}] (${a.id || 'no-id'})`

      if (typeof a.id !== 'string' || !a.id.startsWith('activity-')) err(al, 'id must be "activity-<timestamp>"')
      if (!VALID_TYPES.has(a.type as string)) err(al, `type must be "audition" or "event", got: ${a.type}`)
      if (typeof a.title !== 'string' || !a.title) err(al, 'title is required')
      if (!Array.isArray(a.genre)) err(al, 'genre must be an array')
      else (a.genre as unknown[]).forEach((g, gi) => {
        if (!VALID_GENRES.has(g as string)) err(al, `genre[${gi}] invalid: ${g}`)
      })

      if (!Array.isArray(a.dates) || (a.dates as unknown[]).length === 0) {
        err(al, 'dates must be a non-empty array')
      } else {
        const dates = a.dates as Record<string, unknown>[]
        dates.forEach((d, di) => {
          const dl = `${al} dates[${di}]`
          if (!isDate(d.date)) err(dl, `date must be YYYY-MM-DD, got: ${d.date}`)
          if (!isTime(d.startTime)) err(dl, `startTime must be HH:MM, got: ${d.startTime}`)
          if (d.endTime !== undefined && !isTime(d.endTime)) err(dl, `endTime must be HH:MM if present, got: ${d.endTime}`)
        })
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
              if (!VALID_ROLE_TYPES.has(r.type as string)) err(al, `roles[${ri}].type invalid: ${r.type}`)
              if (!VALID_GENDERS.has(r.gender as string)) err(al, `roles[${ri}].gender invalid: ${r.gender}`)
            })
          }
        }
        if (a.rehearsalStart !== undefined && !isDate(a.rehearsalStart)) err(al, `rehearsalStart must be YYYY-MM-DD, got: ${a.rehearsalStart}`)
        if (a.openingDate !== undefined && !isDate(a.openingDate)) err(al, `openingDate must be YYYY-MM-DD, got: ${a.openingDate}`)
        // Flag event-only fields used on audition
        if (a.briefDescription !== undefined) err(al, 'briefDescription is event-only')
        if (a.cost !== undefined) err(al, 'cost is event-only')
      }

      // Event-specific
      if (a.type === 'event') {
        if (a.rolesAvailable !== undefined) err(al, 'rolesAvailable is audition-only')
        if (a.prep !== undefined) err(al, 'prep is audition-only')
        if (a.rehearsalStart !== undefined) err(al, 'rehearsalStart is audition-only')
        if (a.openingDate !== undefined) err(al, 'openingDate is audition-only')
        if (a.productionUrl !== undefined) err(al, 'productionUrl is audition-only')
      }
    }
  }
}

if (errors.length) {
  console.error(`\nActivities validation failed — ${errors.length} error(s):\n`)
  errors.forEach(e => console.error('  ✗', e))
  process.exit(1)
} else {
  console.log('Activities validation passed.')
}
