import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateOrganizersVenues, titleKey } from '../scripts/migrate-organizers-venues.ts'

// A miniature data/ tree using real record ids from the mapping tables
let dir: string
const write = (rel: string, data: unknown) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), JSON.stringify(data, null, 2) + '\n')
}
const read = (rel: string) => JSON.parse(readFileSync(join(dir, rel), 'utf8'))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'org-venues-'))
  write('sc-theater-venues.json', {
    venues: [
      { code: 'AT', name: "Actors' Theatre" },
      { code: 'StA', name: 'St Andrews Hall' },
      { code: 'UCSC-TA', name: 'UCSC Theater Arts Center' }
    ]
  })
  write('shows/2026/other-2026.json', {
    company: 'other',
    year: 2026,
    runs: [
      { id: 'run-1782741993666', company: 'other', show: 'Dracula (Midsummer Ensemble)', venue: "Actors' Theatre", price: '' },
      { id: 'run-1791850670833', company: 'other', show: 'UCSC New Play Festival', venue: 'Theater Arts Second Stage at UC Santa Cruz', price: '' },
      { id: 'run-9', company: 'other', show: 'Mystery', venue: 'Somewhere New', price: '' }
    ]
  })
  write('activities/2026/other-activities-2026.json', {
    company: 'other',
    year: 2026,
    activities: [
      {
        id: 'activity-1791907412501',
        title: 'Audition Clinic',
        dates: [
          { id: 'session-1', date: '2026-11-01', startTime: '10:00', location: { name: "St. Andrew's Episcopal Church", address: 'x' } },
          { id: 'session-2', date: '2026-11-02', startTime: '10:00', location: { name: 'A Barn', address: 'y' } }
        ],
        organizerName: 'Dor Atkinson',
        organizerUrl: 'https://example.com',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ]
  })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('titleKey', () => {
  it('ignores case, "&", a trailing parenthetical and ", The Musical"', () => {
    expect(titleKey('Sister Act, The Musical')).toBe(titleKey('Sister Act'))
    expect(titleKey('Rumors')).toBe(titleKey('Rumors (Neil Simon)'))
    expect(titleKey('Feathers & Teeth')).toBe(titleKey('Feathers and Teeth'))
    expect(titleKey('8 Tens @ 8 (2027)')).toBe(titleKey('8 Tens @ 8'))
    expect(titleKey('Macbeth')).not.toBe(titleKey('Much Ado'))
  })
})

describe('linking auditions to productions', () => {
  beforeEach(() => {
    write('shows/2026/tst-2026.json', {
      company: 'tst',
      year: 2026,
      runs: [
        { id: 'run-1', company: 'tst', show: 'Rumors (Neil Simon)', showAbv: 'Rumors', venue: 'AT' },
        { id: 'run-2', company: 'tst', show: 'Annie', showAbv: 'Annie', venue: 'AT' },
        { id: 'run-3', company: 'tst', show: 'Annie', showAbv: 'Annie Jr', venue: 'AT' }
      ]
    })
    write('activities/2026/tst-activities-2026.json', {
      company: 'tst',
      year: 2026,
      activities: [
        { id: 'activity-1', type: 'audition', title: 'Rumors', dates: [] },
        { id: 'activity-2', type: 'audition', title: 'Annie', dates: [] },
        { id: 'activity-3', type: 'audition', title: 'Season auditions', dates: [] },
        { id: 'activity-4', type: 'event', title: 'Rumors', dates: [] }
      ]
    })
  })

  it('links a unique match, takes its title, and lists the rest', () => {
    const r = migrateOrganizersVenues(dir)
    const [rumors, annie, season, event] = read('activities/2026/tst-activities-2026.json').activities
    expect(rumors).toMatchObject({ title: 'Rumors (Neil Simon)', productionId: 'run-1' })
    expect(annie.productionId).toBeUndefined()
    expect(season.productionId).toBeUndefined()
    expect(event.productionId).toBeUndefined()
    expect(r.unmapped).toContain('activity-2 (Annie): several productions match')
    expect(r.unmapped).toContain('activity-3 (Season auditions): no matching production')
  })
})

describe('migrateOrganizersVenues', () => {
  it('codes venues, assigns organizers and fixes the Dracula title', () => {
    const r = migrateOrganizersVenues(dir)
    const [dracula, plays, mystery] = read('shows/2026/other-2026.json').runs
    expect(dracula).toMatchObject({ show: 'Dracula', venue: 'AT', organizers: ['midsummer'] })
    expect(plays).toMatchObject({ venue: 'UCSC-TA', room: 'Second Stage', organizers: ['ucsc-ta'] })
    expect(Object.keys(plays)).toEqual(['id', 'company', 'organizers', 'show', 'venue', 'room', 'price'])
    expect(mystery.venue).toBe('Somewhere New')
    expect(r.unmapped).toEqual(['run-9 (Mystery): venue "Somewhere New"', 'run-9 (Mystery): no organizer'])
  })

  it('codes listed session venues, keeps one-offs, and drops free-text organizers', () => {
    migrateOrganizersVenues(dir)
    const [a] = read('activities/2026/other-activities-2026.json').activities
    expect(a.dates[0]).toEqual({ id: 'session-1', date: '2026-11-01', startTime: '10:00', venue: 'StA' })
    expect(a.dates[1].location).toEqual({ name: 'A Barn', address: 'y' })
    expect(a.organizers).toEqual(['dor-atkinson'])
    expect(a.organizerName).toBeUndefined()
    expect(a.organizerUrl).toBeUndefined()
    expect(a.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('changes nothing on a second run', () => {
    migrateOrganizersVenues(dir)
    const r = migrateOrganizersVenues(dir)
    expect(r.filesChanged).toEqual([])
  })
})
