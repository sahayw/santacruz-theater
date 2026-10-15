/**
 * Contract check for the per-company per-year show files.
 * Validates each ShowsFile's shape and verifies that flattening produces
 * a consistent, sorted event list — mirroring the logic in src/lib/data.ts.
 * Run with: npm run check:shows (or npm run check for all validators)
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'
import type { CompanyEntry, Genre, PerfType, Run, ShowsFile, Venue } from '../src/types.ts'
import { MAX_GENRES, runIssues, todayIso, type RuleRefs } from '../src/lib/data-rules.ts'
import { PERF_ID_RE } from '../src/lib/occurrence-ids.ts'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const root = resolve(__dirname, '..')
const showsDir = resolve(root, 'data/shows')

const companiesJson = JSON.parse(
  readFileSync(resolve(root, 'data/sc-theater-companies.json'), 'utf8')
)

const refs: RuleRefs = {
  companies: companiesJson.companies as CompanyEntry[],
  venues: JSON.parse(readFileSync(resolve(root, 'data/sc-theater-venues.json'), 'utf8'))
    .venues as Venue[]
}
const VALID_COMPANIES = new Set<string>(refs.companies.map((c) => c.id))
const VALID_GENRES = new Set<Genre>(['Drama', 'Musical', 'Comedy', 'Other'])
const VALID_PERF_TYPES = new Set<PerfType>(['', 'Preview', 'Opening', 'Closing', 'Talk-back'])
const today = todayIso()
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
// Performance ids are unique across every file, not just within a run
const seenPerfIds = new Set<string>()

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expectString(value: unknown, label: string): string {
  assert(typeof value === 'string', `${label} must be a string`)
  return value
}

function validateShowsFile(
  value: unknown,
  filePath: string
): ShowsFile & { __orderingWarnings: string[] } {
  assert(isRecord(value), `${filePath}: top-level JSON must be an object`)
  assert(typeof value.year === 'number', `${filePath}: year must be a number`)
  assert(Array.isArray(value.runs), `${filePath}: must contain a runs array`)

  const orderingWarnings: string[] = []

  value.runs.forEach((runValue, runIndex) => {
    const loc = `${filePath}: runs[${runIndex}]`
    assert(isRecord(runValue), `${loc} must be an object`)

    const company = expectString(runValue.company, `${loc}.company`)
    expectString(runValue.venue, `${loc}.venue`)

    assert(VALID_COMPANIES.has(company), `${loc}.company has invalid value: ${company}`)

    const rawGenre = runValue.genre
    const genres: Genre[] = Array.isArray(rawGenre)
      ? (rawGenre as unknown[]).map((g) => {
          assert(
            typeof g === 'string' && VALID_GENRES.has(g as Genre),
            `${loc}.genre contains invalid value: ${g}`
          )
          return g as Genre
        })
      : typeof rawGenre === 'string' && rawGenre !== ''
        ? (assert(
            VALID_GENRES.has(rawGenre as Genre),
            `${loc}.genre has invalid value: ${rawGenre}`
          ),
          [rawGenre as Genre])
        : (assert(
            rawGenre === '' || rawGenre === undefined || Array.isArray(rawGenre),
            `${loc}.genre must be an array or empty string`
          ),
          [])
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
    assert(company === value.company, `${loc}.company must match the file's company "${value.company}"`)
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
      if (previousSortKey > sortKey && !isHistoric) {
        orderingWarnings.push(
          `${loc}.performances is not ordered by date/time (${sortKey} after ${previousSortKey})`
        )
      }
      previousSortKey = sortKey
    })

    // Content rules shared with the /admin editor
    const label = `${loc} (${runValue.showAbv || runValue.show || runValue.id})`
    const issues = runIssues(runValue as unknown as Run, value.year as number, refs)
    issues.errors.forEach((m) => ruleErrors.push(`${label}: ${m}`))
    issues.warnings.forEach((m) => ruleWarnings.push(`${label}: ${m}`))
  })

  return Object.assign(value as unknown as ShowsFile, { __orderingWarnings: orderingWarnings })
}

/** Every performance's date and time, sorted — mirroring getPerformances() in src/lib/data.ts. */
function flattenAndSort(runs: Run[]) {
  return runs
    .flatMap((run) => run.performances.map((p) => ({ date: p.date, time: p.time })))
    .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time)))
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
    const validated = validateShowsFile(raw, filePath)
    for (const run of validated.runs) {
      assert(!seenRunIds.has(run.id), `Duplicate run id across files: ${run.id}`)
      seenRunIds.add(run.id)
      allRawRuns.push(run)
    }
    allOrderingWarnings.push(...validated.__orderingWarnings)
    fileCount++
  }
}

if (ruleErrors.length) {
  console.error(`\nShows validation failed — ${ruleErrors.length} error(s):\n`)
  ruleErrors.forEach((e) => console.error('  ✗', e))
  process.exit(1)
}

const performances = flattenAndSort(allRawRuns)

assert(
  performances.every(
    (event, index) =>
      index === 0 ||
      `${performances[index - 1].date}T${performances[index - 1].time}` <=
        `${event.date}T${event.time}`
  ),
  'Flattened performances are not sorted by date/time'
)

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
