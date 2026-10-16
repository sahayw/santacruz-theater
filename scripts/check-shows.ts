/**
 * Contract check for the per-company per-year show files.
 * Checks each ShowsFile with showsFileCheck() (src/lib/file-checks.ts, shared with the
 * save function), plus the cross-file rules: run and performance ids unique across
 * files. Then verifies that flattening produces a sorted event list, mirroring
 * src/lib/data.ts.
 * Run with: npm run check:shows (or npm run check for all validators)
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'
import type { CompanyEntry, Run, Venue } from '../src/types.ts'
import { todayIso, type RuleRefs } from '../src/lib/data-rules.ts'
import { showsFileCheck } from '../src/lib/file-checks.ts'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const root = resolve(__dirname, '..')
const showsDir = resolve(root, 'data/shows')

const readData = (f: string) => JSON.parse(readFileSync(resolve(root, 'data', f), 'utf8'))
const refs: RuleRefs = {
  companies: readData('sc-theater-companies.json').companies as CompanyEntry[],
  venues: readData('sc-theater-venues.json').venues as Venue[]
}
const today = todayIso()
// Performance ids are unique across every file, not just within a run
const seenPerfIds = new Set<string>()

/** Every performance's date and time, sorted — mirroring getPerformances() in src/lib/data.ts. */
function flattenAndSort(runs: Run[]) {
  return runs
    .flatMap((run) => run.performances.map((p) => ({ date: p.date, time: p.time })))
    .sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time)
    )
}

// Read and validate all ShowsFiles
const yearDirs = readdirSync(showsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const allRawRuns: Run[] = []
const allOrderingWarnings: string[] = []
const ruleErrors: string[] = []
const ruleWarnings: string[] = []
const seenRunIds = new Set<string>()

let fileCount = 0
for (const year of yearDirs) {
  const yearDir = join(showsDir, year)
  const files = readdirSync(yearDir).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    const filePath = join('data/shows', year, file)
    const raw = JSON.parse(readFileSync(join(root, filePath), 'utf8'))
    const checked = showsFileCheck(raw, filePath, refs, today, seenPerfIds)
    ruleErrors.push(...checked.errors)
    ruleWarnings.push(...checked.warnings)
    for (const run of checked.runs) {
      if (seenRunIds.has(run.id)) ruleErrors.push(`Duplicate run id across files: ${run.id}`)
      seenRunIds.add(run.id)
      allRawRuns.push(run)
    }
    allOrderingWarnings.push(...checked.orderingWarnings)
    fileCount++
  }
}

if (ruleErrors.length) {
  console.error(`\nShows validation failed — ${ruleErrors.length} error(s):\n`)
  ruleErrors.forEach((e) => console.error('  ✗', e))
  process.exit(1)
}

const performances = flattenAndSort(allRawRuns)

if (
  !performances.every(
    (event, index) =>
      index === 0 ||
      `${performances[index - 1].date}T${performances[index - 1].time}` <=
        `${event.date}T${event.time}`
  )
) {
  console.error('Flattened performances are not sorted by date/time')
  process.exit(1)
}

console.log('─────────────────────────────────────────')
console.log('ShowsFile contract valid')
console.log(`Files                : ${fileCount}`)
console.log(`Runs                 : ${allRawRuns.length}`)
console.log(`Performances         : ${performances.length}`)
console.log(
  `Date range           : ${performances[0]?.date ?? '—'} → ${performances.at(-1)?.date ?? '—'}`
)
if (allOrderingWarnings.length) {
  console.log(`Ordering warnings    : ${allOrderingWarnings.length}`)
  allOrderingWarnings.forEach((warning) => console.log(`  - ${warning}`))
}
if (ruleWarnings.length) {
  console.log(`Missing details      : ${ruleWarnings.length}`)
  ruleWarnings.forEach((warning) => console.log(`  - ${warning}`))
}
console.log('─────────────────────────────────────────')
