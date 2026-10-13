/**
 * Validates all data/activities/<year>/<co>-activities-<year>.json files against the Activity schema.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Activity } from '../src/types.ts'
import { activityIssues } from '../src/lib/data-rules.ts'

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

const errors: string[] = []
const warnings: string[] = []

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
      if (typeof a.title !== 'string') err(al, 'title must be a string')
      if (!Array.isArray(a.genre)) err(al, 'genre must be an array')
      else
        (a.genre as unknown[]).forEach((g, gi) => {
          if (!VALID_GENRES.has(g as string)) err(al, `genre[${gi}] invalid: ${g}`)
        })

      if (!Array.isArray(a.dates)) err(al, 'dates must be an array')

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
      }

      // Content rules shared with the /admin editor
      if (typeof a.title === 'string' && Array.isArray(a.dates)) {
        const issues = activityIssues(a as unknown as Activity, Number(year))
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
