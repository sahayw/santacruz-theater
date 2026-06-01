/**
 * Contract check for the per-company per-year audition files.
 * Validates each AuditionsFile's shape — mirroring the logic in src/lib/data.ts.
 * Run with: npm run check-auditions
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'
import type { Genre, AuditionRoleType, AuditionGender, AuditionsFile } from '../src/types.ts'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const root = resolve(__dirname, '..')
const auditionsDir = resolve(root, 'data/auditions')

const companiesJson = JSON.parse(
  readFileSync(resolve(root, 'data/sc-theater-companies.json'), 'utf8')
)

const VALID_COMPANIES = new Set<string>(
  companiesJson.companies.map((c: { id: string }) => c.id)
)
const VALID_GENRES = new Set<Genre>(['Drama', 'Musical', 'Comedy', 'Tragedy', 'Other', ''])
const VALID_ROLE_TYPES = new Set<AuditionRoleType>(['lead', 'supporting', 'ensemble'])
const VALID_GENDERS = new Set<AuditionGender>(['female', 'male', 'any'])
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

function validateAuditionsFile(
  value: unknown,
  filePath: string
): AuditionsFile & { __orderingWarnings: string[] } {
  assert(isRecord(value), `${filePath}: top-level JSON must be an object`)
  assert(typeof value.year === 'number', `${filePath}: year must be a number`)
  assert(Array.isArray(value.auditions), `${filePath}: must contain an auditions array`)

  const company = expectString(value.company, `${filePath}.company`)
  assert(VALID_COMPANIES.has(company), `${filePath}.company has invalid value: ${company}`)

  const orderingWarnings: string[] = []

  value.auditions.forEach((audValue: unknown, audIndex: number) => {
    const loc = `${filePath}: auditions[${audIndex}]`
    assert(isRecord(audValue), `${loc} must be an object`)

    expectString(audValue.id, `${loc}.id`)
    expectString(audValue.production, `${loc}.production`)
    expectString(audValue.createdAt, `${loc}.createdAt`)
    expectString(audValue.updatedAt, `${loc}.updatedAt`)

    const genre = expectString(audValue.genre, `${loc}.genre`) as Genre
    assert(VALID_GENRES.has(genre), `${loc}.genre has invalid value: ${genre}`)

    assert(Array.isArray(audValue.auditionDates), `${loc}.auditionDates must be an array`)
    assert(
      (audValue.auditionDates as unknown[]).length >= 1,
      `${loc} must have at least one auditionDate`
    )

    let previousSortKey = ''
    ;(audValue.auditionDates as unknown[]).forEach((dateValue: unknown, dateIndex: number) => {
      const dloc = `${loc}.auditionDates[${dateIndex}]`
      assert(isRecord(dateValue), `${dloc} must be an object`)

      const date = expectString(dateValue.date, `${dloc}.date`)
      const startTime = expectString(dateValue.startTime, `${dloc}.startTime`)
      const endTime = expectString(dateValue.endTime, `${dloc}.endTime`)

      assert(DATE_RE.test(date), `${dloc}.date must be YYYY-MM-DD`)
      assert(TIME_RE.test(startTime), `${dloc}.startTime must be HH:MM`)
      assert(TIME_RE.test(endTime), `${dloc}.endTime must be HH:MM`)

      if (dateValue.location !== undefined) {
        assert(isRecord(dateValue.location), `${dloc}.location must be an object`)
        expectString((dateValue.location as Record<string, unknown>).name, `${dloc}.location.name`)
      }

      const sortKey = `${date}T${startTime}`
      if (previousSortKey > sortKey) {
        orderingWarnings.push(
          `${loc}.auditionDates is not ordered by date/time (${sortKey} after ${previousSortKey})`
        )
      }
      previousSortKey = sortKey
    })

    assert(Array.isArray(audValue.rolesAvailable), `${loc}.rolesAvailable must be an array`)
    ;(audValue.rolesAvailable as unknown[]).forEach((roleValue: unknown, roleIndex: number) => {
      const rloc = `${loc}.rolesAvailable[${roleIndex}]`
      assert(isRecord(roleValue), `${rloc} must be an object`)

      expectString(roleValue.role, `${rloc}.role`)
      const type = expectString(roleValue.type, `${rloc}.type`) as AuditionRoleType
      const gender = expectString(roleValue.gender, `${rloc}.gender`) as AuditionGender
      assert(VALID_ROLE_TYPES.has(type), `${rloc}.type has invalid value: ${type}`)
      assert(VALID_GENDERS.has(gender), `${rloc}.gender has invalid value: ${gender}`)
    })

    if (audValue.rehearsalStart !== undefined && audValue.rehearsalStart !== '') {
      const rs = expectString(audValue.rehearsalStart, `${loc}.rehearsalStart`)
      assert(DATE_RE.test(rs), `${loc}.rehearsalStart must be YYYY-MM-DD`)
    }
    if (audValue.openingDate !== undefined && audValue.openingDate !== '') {
      const od = expectString(audValue.openingDate, `${loc}.openingDate`)
      assert(DATE_RE.test(od), `${loc}.openingDate must be YYYY-MM-DD`)
    }
  })

  return Object.assign(value as AuditionsFile, { __orderingWarnings: orderingWarnings })
}

// Read and validate all AuditionsFiles
const yearDirs = readdirSync(auditionsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const allOrderingWarnings: string[] = []
const seenAuditionIds = new Set<string>()

let fileCount = 0
let auditionCount = 0

for (const year of yearDirs) {
  const yearDir = join(auditionsDir, year)
  const files = readdirSync(yearDir).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    const filePath = join('data/auditions', year, file)
    const raw = JSON.parse(readFileSync(join(root, filePath), 'utf8'))
    const validated = validateAuditionsFile(raw, filePath)
    for (const audition of validated.auditions) {
      assert(
        !seenAuditionIds.has(audition.id),
        `Duplicate audition id across files: ${audition.id}`
      )
      seenAuditionIds.add(audition.id)
      auditionCount++
    }
    allOrderingWarnings.push(...validated.__orderingWarnings)
    fileCount++
  }
}

console.log('─────────────────────────────────────────')
console.log('AuditionsFile contract valid')
console.log(`Files                : ${fileCount}`)
console.log(`Auditions            : ${auditionCount}`)
if (allOrderingWarnings.length) {
  console.log(`Ordering warnings    : ${allOrderingWarnings.length}`)
  allOrderingWarnings.forEach((warning) => console.log(`  - ${warning}`))
}
console.log('─────────────────────────────────────────')
