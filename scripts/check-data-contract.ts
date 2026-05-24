/**
 * Contract check for the canonical editor export format.
 * Validates the raw RunsFile shape and verifies that the display data layer
 * can consume it without losing or mutating events.
 * Run with: npm run check-data-contract
 */
import runsData from '../data/sc-theater-runs.json'
import { getShows, getPerformances } from '../src/lib/data.ts'
import type { Company, Genre, PerfType, Run, RunsFile, Venue } from '../src/types.ts'

const VALID_COMPANIES = new Set<Company>([
  'SCS',
  'AT',
  'MCT',
  'Renegade',
  'Cabrillo',
  'ABT',
  'Other',
  ''
])
const VALID_GENRES = new Set<Genre>(['Drama', 'Musical', 'Comedy', 'Tragedy', 'Other', ''])
const VALID_VENUES = new Set<Venue>(['G', 'VMB', 'PH', 'AT', 'CCT', 'Other', ''])
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

function validateRunsFile(value: unknown): RunsFile {
  assert(isRecord(value), 'Top-level JSON must be an object')
  assert(Array.isArray(value.runs), 'Top-level JSON must contain a runs array')

  const seenRunIds = new Set<string>()
  const orderingWarnings: string[] = []

  value.runs.forEach((runValue, runIndex) => {
    assert(isRecord(runValue), `runs[${runIndex}] must be an object`)

    const id = expectString(runValue.id, `runs[${runIndex}].id`)
    assert(!seenRunIds.has(id), `Duplicate run id: ${id}`)
    seenRunIds.add(id)

    const company = expectString(runValue.company, `runs[${runIndex}].company`) as Company
    const genre = expectString(runValue.genre, `runs[${runIndex}].genre`) as Genre
    const venue = expectString(runValue.venue, `runs[${runIndex}].venue`) as Venue

    assert(VALID_COMPANIES.has(company), `runs[${runIndex}].company has invalid value: ${company}`)
    assert(VALID_GENRES.has(genre), `runs[${runIndex}].genre has invalid value: ${genre}`)
    assert(VALID_VENUES.has(venue), `runs[${runIndex}].venue has invalid value: ${venue}`)

    expectString(runValue.showAbv, `runs[${runIndex}].showAbv`)
    expectString(runValue.show, `runs[${runIndex}].show`)
    expectString(runValue.price, `runs[${runIndex}].price`)
    expectString(runValue.discounts, `runs[${runIndex}].discounts`)
    expectString(runValue.infoUrl, `runs[${runIndex}].infoUrl`)
    expectString(runValue.ticketsUrl, `runs[${runIndex}].ticketsUrl`)
    assert(Array.isArray(runValue.performances), `runs[${runIndex}].performances must be an array`)

    let previousSortKey = ''
    runValue.performances.forEach((perfValue, perfIndex) => {
      assert(isRecord(perfValue), `runs[${runIndex}].performances[${perfIndex}] must be an object`)

      const date = expectString(perfValue.date, `runs[${runIndex}].performances[${perfIndex}].date`)
      const time = expectString(perfValue.time, `runs[${runIndex}].performances[${perfIndex}].time`)
      const perfType = expectString(
        perfValue.perfType,
        `runs[${runIndex}].performances[${perfIndex}].perfType`
      ) as PerfType

      expectString(perfValue.discounts, `runs[${runIndex}].performances[${perfIndex}].discounts`)
      expectString(perfValue.ticketsUrl, `runs[${runIndex}].performances[${perfIndex}].ticketsUrl`)

      assert(
        DATE_RE.test(date),
        `runs[${runIndex}].performances[${perfIndex}].date must be YYYY-MM-DD`
      )
      assert(TIME_RE.test(time), `runs[${runIndex}].performances[${perfIndex}].time must be HH:MM`)
      assert(
        VALID_PERF_TYPES.has(perfType),
        `runs[${runIndex}].performances[${perfIndex}].perfType has invalid value: ${perfType}`
      )

      const sortKey = `${date}T${time}`
      if (previousSortKey > sortKey) {
        orderingWarnings.push(
          `runs[${runIndex}].performances is not ordered by date/time (${sortKey} after ${previousSortKey})`
        )
      }
      previousSortKey = sortKey
    })
  })

  return Object.assign(value as RunsFile, { __orderingWarnings: orderingWarnings })
}

function tally(items: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  items.forEach((item) => counts.set(item, (counts.get(item) ?? 0) + 1))
  return counts
}

function eventSignature(event: {
  runId: string
  company: string
  showAbv: string
  show: string
  genre: string
  venue: string
  price: string
  discounts: string
  infoUrl: string
  ticketsUrl: string
  date: string
  time: string
  perfType: string
}): string {
  return JSON.stringify(event)
}

const raw = validateRunsFile(runsData)
const [shows, performances] = await Promise.all([getShows(), getPerformances()])
const orderingWarnings =
  (raw as RunsFile & { __orderingWarnings?: string[] }).__orderingWarnings ?? []

assert(
  shows.length === raw.runs.length,
  'getShows() returned a different run count than the raw runs file'
)

const rawRunIds = raw.runs.map((run) => run.id).join('\n')
const loadedRunIds = shows.map((run) => run.id).join('\n')
assert(
  rawRunIds === loadedRunIds,
  'getShows() returned runs in a different order or with different ids'
)

const expectedEvents = raw.runs.flatMap((run: Run) =>
  run.performances.map((perf) =>
    eventSignature({
      runId: run.id,
      company: run.company,
      showAbv: run.showAbv,
      show: run.show,
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
  )
)

const actualEvents = performances.map((event) => eventSignature(event))
assert(
  performances.every(
    (event, index) =>
      index === 0 ||
      `${performances[index - 1].date}T${performances[index - 1].time}` <=
        `${event.date}T${event.time}`
  ),
  'getPerformances() output is not sorted by date/time'
)

const expectedCounts = tally(expectedEvents)
const actualCounts = tally(actualEvents)
assert(
  expectedCounts.size === actualCounts.size,
  'getPerformances() returned a different event set than expected'
)
for (const [signature, count] of expectedCounts) {
  assert(actualCounts.get(signature) === count, `Display event mismatch for ${signature}`)
}

console.log('─────────────────────────────────────────')
console.log('RunsFile contract valid')
console.log(`Runs                 : ${raw.runs.length}`)
console.log(`Performances         : ${performances.length}`)
console.log(
  `Date range           : ${performances[0]?.date ?? '—'} → ${performances.at(-1)?.date ?? '—'}`
)
console.log('Display data layer   : compatible')
if (orderingWarnings.length) {
  console.log(`Ordering warnings    : ${orderingWarnings.length}`)
  orderingWarnings.forEach((warning) => console.log(`  - ${warning}`))
}
console.log('─────────────────────────────────────────')
