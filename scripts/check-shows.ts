/**
 * Contract check for the per-company per-year show files.
 * Validates each ShowsFile's shape and verifies that flattening produces
 * a consistent, sorted event list — mirroring the logic in src/lib/data.ts.
 * Run with: npm run check-shows
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'
import type { Genre, PerfType, Run, ShowsFile, PerformanceEvent } from '../src/types.ts'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const root = resolve(__dirname, '..')
const showsDir = resolve(root, 'data/shows')

const companiesJson = JSON.parse(
  readFileSync(resolve(root, 'data/sc-theater-companies.json'), 'utf8')
)
const venuesJson = JSON.parse(readFileSync(resolve(root, 'data/sc-theater-venues.json'), 'utf8'))

const VALID_COMPANIES = new Set<string>(companiesJson.companies.map((c: { id: string }) => c.id))
const VALID_GENRES = new Set<Genre>(['Drama', 'Musical', 'Comedy', 'Other', ''])
const VALID_VENUES = new Set<string>([
  ...venuesJson.venues.map((v: { name: string }) => v.name),
  'Other',
  ''
])
const VALID_PERF_TYPES = new Set<PerfType>(['', 'Preview', 'Opening', 'Closing', 'Talk-back'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

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
    const genre = expectString(runValue.genre, `${loc}.genre`) as Genre
    const venue = expectString(runValue.venue, `${loc}.venue`)

    assert(VALID_COMPANIES.has(company), `${loc}.company has invalid value: ${company}`)
    assert(VALID_GENRES.has(genre), `${loc}.genre has invalid value: ${genre}`)
    assert(VALID_VENUES.has(venue), `${loc}.venue has invalid value: ${venue}`)

    expectString(runValue.id, `${loc}.id`)
    expectString(runValue.showAbv, `${loc}.showAbv`)
    expectString(runValue.show, `${loc}.show`)
    expectString(runValue.price, `${loc}.price`)
    expectString(runValue.discounts, `${loc}.discounts`)
    expectString(runValue.infoUrl, `${loc}.infoUrl`)
    expectString(runValue.ticketsUrl, `${loc}.ticketsUrl`)
    assert(Array.isArray(runValue.performances), `${loc}.performances must be an array`)

    let previousSortKey = ''
    runValue.performances.forEach((perfValue, perfIndex) => {
      const ploc = `${loc}.performances[${perfIndex}]`
      assert(isRecord(perfValue), `${ploc} must be an object`)

      const date = expectString(perfValue.date, `${ploc}.date`)
      const time = expectString(perfValue.time, `${ploc}.time`)
      const perfType = expectString(perfValue.perfType, `${ploc}.perfType`) as PerfType

      expectString(perfValue.discounts, `${ploc}.discounts`)
      expectString(perfValue.ticketsUrl, `${ploc}.ticketsUrl`)

      assert(DATE_RE.test(date), `${ploc}.date must be YYYY-MM-DD`)
      assert(TIME_RE.test(time), `${ploc}.time must be HH:MM`)
      assert(VALID_PERF_TYPES.has(perfType), `${ploc}.perfType has invalid value: ${perfType}`)

      const sortKey = `${date}T${time}`
      if (previousSortKey > sortKey) {
        orderingWarnings.push(
          `${loc}.performances is not ordered by date/time (${sortKey} after ${previousSortKey})`
        )
      }
      previousSortKey = sortKey
    })
  })

  return Object.assign(value as unknown as ShowsFile, { __orderingWarnings: orderingWarnings })
}

function flattenAndSort(runs: Run[]): PerformanceEvent[] {
  const events: PerformanceEvent[] = []
  for (const run of runs) {
    for (const perf of run.performances) {
      events.push({
        runId: run.id,
        company: run.company,
        showAbv: run.showAbv,
        show: run.show,
        description: run.description || '',
        genre: run.genre,
        venue: run.venue,
        price: run.price,
        discounts: perf.discounts || run.discounts,
        infoUrl: run.infoUrl,
        ticketsUrl: perf.ticketsUrl || run.ticketsUrl,
        date: perf.date,
        time: perf.time,
        perfType: perf.perfType
      })
    }
  }
  return events.sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time)
  )
}

// Read and validate all ShowsFiles
const yearDirs = readdirSync(showsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const allRawRuns: Run[] = []
const allOrderingWarnings: string[] = []
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
console.log('─────────────────────────────────────────')
