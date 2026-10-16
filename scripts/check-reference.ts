/**
 * Validates the hand-edited reference lists: data/sc-theater-companies.json (companies
 * and organizers) and data/sc-theater-venues.json. Records are checked against these
 * lists by check-shows.ts and check-activities.ts. See docs/notifications-spec.md.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CompanyEntry, Venue } from '../src/types.ts'

const root = resolve(fileURLToPath(import.meta.url), '../..')
const read = (f: string) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'))
const companies: CompanyEntry[] = read('sc-theater-companies.json').companies
const venues: Venue[] = read('sc-theater-venues.json').venues

/** Short labels appear in calendar entries; longer ones crowd a phone week cell. */
const LABEL_MAX = 12

const errors: string[] = []
const warnings: string[] = []

// ── Venues ──
const venueCodes = new Set<string>()
venues.forEach((v, i) => {
  const at = `venues[${i}] (${v.code || v.name || '?'})`
  if (!v.code) errors.push(`${at}: code is required`)
  else if (venueCodes.has(v.code)) errors.push(`${at}: duplicate code`)
  venueCodes.add(v.code)
  if (!v.name?.trim()) errors.push(`${at}: name is required`)
})

// ── Companies and organizers ──
/** Company ids that have a data file of their own. */
function idsWithFiles() {
  const ids = new Set<string>()
  for (const [dir, re] of [
    ['shows', /^(.+)-\d{4}\.json$/],
    ['activities', /^(.+)-activities-\d{4}\.json$/]
  ] as const) {
    const base = join(root, 'data', dir)
    if (!existsSync(base)) continue
    for (const year of readdirSync(base))
      for (const f of readdirSync(join(base, year))) {
        const m = f.match(re)
        if (m) ids.add(m[1])
      }
  }
  return ids
}
const withFiles = idsWithFiles()

if (companies[0]?.id !== 'admin') errors.push('companies: the "admin" entry must be first')
if (companies.at(-1)?.id !== 'other') errors.push('companies: the "other" entry must be last')

const ids = new Set<string>()
const majorCodes = new Set<number>()
companies.forEach((c, i) => {
  const at = `companies[${i}] (${c.id || '?'})`
  if (!c.id || !/^[a-z0-9-]+$/.test(c.id)) errors.push(`${at}: id must be kebab-case`)
  else if (ids.has(c.id)) errors.push(`${at}: duplicate id`)
  ids.add(c.id)
  if (!c.name?.trim()) errors.push(`${at}: name is required`)
  if (!c.abvName?.trim()) errors.push(`${at}: abvName (short label) is required`)
  else if (!c.adminOnly && c.abvName.length > LABEL_MAX)
    warnings.push(`${at}: abvName "${c.abvName}" is longer than ${LABEL_MAX} characters`)
  if (c.primaryVenue && !venueCodes.has(c.primaryVenue))
    errors.push(`${at}: primaryVenue "${c.primaryVenue}" isn't in the venue list`)

  if (c.adminOnly && (c.major || c.filedUnderOther || c.onCompaniesPage))
    errors.push(`${at}: a sentinel entry can't be a major, filed under Other, or on /companies`)

  if (c.filedUnderOther) {
    if (withFiles.has(c.id)) errors.push(`${at}: filedUnderOther, but it has data files of its own`)
    if (c.editors?.length) errors.push(`${at}: filedUnderOther organizers can't have editors`)
    if (c.major) errors.push(`${at}: a major can't be filed under Other`)
  }

  // majorCode is permanent: a former major keeps its number so published feeds keep
  // their meaning, so it's allowed (and still unique) on non-majors
  const code = c.majorCode
  if (code !== undefined) {
    if (!Number.isInteger(code) || code < 1 || (code & (code - 1)) !== 0)
      errors.push(`${at}: majorCode must be a power of two (1, 2, 4, 8…)`)
    else if (majorCodes.has(code)) errors.push(`${at}: majorCode ${code} is already used`)
    else majorCodes.add(code)
  }
  if (c.major) {
    if (code === undefined) errors.push(`${at}: a major needs a majorCode`)
    if (!c.colour || !/^#[0-9a-f]{6}$/i.test(c.colour))
      errors.push(`${at}: a major needs a colour like "#ce8481"`)
  } else if (c.colour !== undefined) {
    errors.push(`${at}: colour is for majors only`)
  }
})
const majorCount = companies.filter((c) => c.major).length

if (errors.length) {
  console.error(`\nReference data validation failed — ${errors.length} error(s):\n`)
  errors.forEach((e) => console.error('  ✗', e))
  process.exit(1)
}
console.log(
  `Reference data valid: ${companies.length} companies/organizers (${majorCount} majors), ${venues.length} venues.`
)
warnings.forEach((w) => console.log('  -', w))
