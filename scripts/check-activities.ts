/**
 * Validates all data/activities/<year>/<co>-activities-<year>.json files with
 * activitiesFileCheck() (src/lib/file-checks.ts, shared with the save function), plus the
 * cross-file rules: session ids unique across files, and productionId naming a production.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CompanyEntry, Venue } from '../src/types.ts'
import type { RuleRefs } from '../src/lib/data-rules.ts'
import { activitiesFileCheck } from '../src/lib/file-checks.ts'

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

const errors: string[] = []
const warnings: string[] = []
const seenSessionIds = new Set<string>()

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
      errors.push(`${label}: JSON parse error: ${e}`)
      continue
    }

    const checked = activitiesFileCheck(raw, label, Number(year), refs, seenSessionIds)
    errors.push(...checked.errors)
    warnings.push(...checked.warnings)
    for (const name of checked.oneOffs) oneOffs.set(name, (oneOffs.get(name) ?? 0) + 1)
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
