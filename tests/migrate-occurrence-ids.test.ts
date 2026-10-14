import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateOccurrenceIds } from '../scripts/migrate-occurrence-ids.ts'

const FIXTURES = join(import.meta.dirname, 'fixtures/data')
const SHOWS = 'shows/2026/tst-2026.json'
const ACTIVITIES = 'activities/2026/tst-activities-2026.json'

let dir: string
const read = (rel: string) => readFileSync(join(dir, rel), 'utf8')
const original = (rel: string) => readFileSync(join(FIXTURES, rel), 'utf8')

/** Parsed file with every occurrence id removed — what the data looked like before. */
function withoutIds(raw: string) {
  const data = JSON.parse(raw)
  for (const r of data.runs ?? []) for (const p of r.performances) delete p.id
  for (const a of data.activities ?? []) for (const d of a.dates) delete d.id
  return data
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'occ-ids-'))
  cpSync(FIXTURES, dir, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('migrateOccurrenceIds', () => {
  it('adds an id to every performance and session that lacks one', () => {
    const result = migrateOccurrenceIds(dir)
    expect(result.performances).toBe(2)
    expect(result.sessions).toBe(2)
    expect(result.filesChanged).toHaveLength(2)

    const perfs = JSON.parse(read(SHOWS)).runs[0].performances
    expect(perfs[0].id).toBe('perf-1600000000000') // pre-existing id kept
    perfs.forEach((p: { id: string }) => expect(p.id).toMatch(/^perf-\d+$/))
    const sessions = JSON.parse(read(ACTIVITIES)).activities[0].dates
    sessions.forEach((d: { id: string }) => expect(d.id).toMatch(/^session-\d+$/))
  })

  it('changes nothing but the ids — updatedAt and every other field are untouched', () => {
    migrateOccurrenceIds(dir)
    for (const rel of [SHOWS, ACTIVITIES]) {
      expect(withoutIds(read(rel))).toEqual(withoutIds(original(rel)))
    }
    const acts = JSON.parse(read(ACTIVITIES)).activities
    expect(acts[0].updatedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('keeps each file’s 2-space JSON and trailing-newline style', () => {
    migrateOccurrenceIds(dir)
    expect(read(SHOWS).endsWith('\n')).toBe(false)
    expect(read(ACTIVITIES).endsWith('\n')).toBe(true)
    expect(read(SHOWS)).toBe(JSON.stringify(JSON.parse(read(SHOWS)), null, 2))
  })

  it('is idempotent — a second run changes nothing', () => {
    migrateOccurrenceIds(dir)
    const first = [read(SHOWS), read(ACTIVITIES)]
    const again = migrateOccurrenceIds(dir)
    expect(again).toEqual({ performances: 0, sessions: 0, filesChanged: [] })
    expect([read(SHOWS), read(ACTIVITIES)]).toEqual(first)
  })
})
