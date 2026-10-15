// Organizers, venues, and the record rules that check against them — fixture data only.
import { describe, expect, it } from 'vitest'
import { activityGaps, activityIssues, runGaps, runIssues, type RuleRefs } from '../src/lib/data-rules.ts'
import {
  allOrganizers,
  majors,
  organizerErrors,
  organizerLabel,
  organizerName,
  otherOrganizers,
  recordOrganizerIds
} from '../src/lib/organizers.ts'
import { runPlace, sessionPlace } from '../src/lib/venues.ts'
import type { CompanyEntry } from '../src/types.ts'
import { activity, ctx, run } from './fixtures/calendar.ts'

const companies: CompanyEntry[] = [
  { id: 'admin', abvName: 'Admin', name: 'Data Admin', adminOnly: true },
  { id: 'tst', abvName: 'TST', name: 'Test Theatre', major: true, majorCode: 2, website: 'https://tst.example' },
  { id: 'big', abvName: 'BIG', name: 'Big Company', major: true, majorCode: 1 },
  { id: 'oth', abvName: 'OTH', name: 'Other Players' },
  { id: 'fight', abvName: 'Fight', name: 'Fight Club SC', filedUnderOther: true, website: 'https://fight.example' },
  { id: 'other', abvName: 'Other', name: 'Other Companies', adminOnly: true }
]
const refs: RuleRefs = { companies, venues: ctx.venues, runIds: new Set(['run-1700000000000']) }
const TODAY = '2026-10-15'

describe('organizers', () => {
  it('puts the file’s company first, then co-producers', () => {
    expect(recordOrganizerIds('tst', ['oth'])).toEqual(['tst', 'oth'])
    expect(recordOrganizerIds('tst', ['tst', 'oth'])).toEqual(['tst', 'oth'])
    expect(recordOrganizerIds('tst')).toEqual(['tst'])
  })

  it('uses only the listed organizers for records filed under Other', () => {
    expect(recordOrganizerIds('other', ['fight', 'oth'])).toEqual(['fight', 'oth'])
    expect(recordOrganizerIds('other')).toEqual([])
  })

  it('formats names and short labels', () => {
    expect(organizerName(['tst', 'oth'], companies)).toBe('Test Theatre & Other Players')
    expect(organizerLabel(['tst', 'oth'], companies)).toBe('TST / OTH')
    expect(organizerName(['nobody'], companies)).toBe('nobody')
  })

  it('lists majors by code, Other organizers, and every real organizer', () => {
    expect(majors(companies).map((c) => c.id)).toEqual(['big', 'tst'])
    expect(otherOrganizers(companies).map((c) => c.id)).toEqual(['fight'])
    expect(allOrganizers(companies).map((c) => c.id)).toEqual(['big', 'fight', 'oth', 'tst'])
  })

  it('requires an organizer for records filed under Other', () => {
    expect(organizerErrors('other', undefined, companies)).toEqual(['Organizer is required'])
    expect(organizerErrors('other', ['fight'], companies)).toEqual([])
    expect(organizerErrors('other', ['fight', 'tst'], companies)).toEqual([]) // co-producer
  })

  it('allows co-producers only on productions', () => {
    const rule = 'auditions and events have one organizer — co-producers are for productions only'
    expect(organizerErrors('other', ['fight', 'oth'], companies, { coProducers: false })).toEqual([rule])
    expect(organizerErrors('tst', ['oth'], companies, { coProducers: false })).toEqual([rule])
    expect(organizerErrors('other', ['fight'], companies, { coProducers: false })).toEqual([])
  })

  it('rejects a main organizer under Other that has its own files', () => {
    expect(organizerErrors('other', ['tst'], companies)[0]).toMatch(/has its own data files/)
  })

  it('rejects unknown, sentinel, repeated and self-listed organizers', () => {
    expect(organizerErrors('tst', ['nobody'], companies)).toEqual([
      'organizer "nobody" isn\'t in the companies list'
    ])
    expect(organizerErrors('tst', ['other'], companies)[0]).toMatch(/isn't in the companies list/)
    expect(organizerErrors('tst', ['oth', 'oth'], companies)).toContain('organizer "oth" is listed twice')
    expect(organizerErrors('tst', ['tst'], companies)).toEqual([
      'a co-producer repeats the company this record is filed under'
    ])
  })
})

describe('venues', () => {
  it('resolves a production’s venue code with an optional room', () => {
    expect(runPlace({ venue: 'TH' }, ctx.venues)).toEqual({
      name: 'Test Hall',
      address: '1 Main St, Santa Cruz, CA 95060'
    })
    expect(runPlace({ venue: 'BB', room: ' Studio 2 ' }, ctx.venues)?.name).toBe('Black Box, Studio 2')
    expect(runPlace({ venue: 'Nowhere' }, ctx.venues)).toBeUndefined()
  })

  it('resolves a session’s venue, else its one-off location', () => {
    const base = { id: 'session-1', date: '2026-11-01', startTime: '18:00' }
    expect(sessionPlace({ ...base, venue: 'BB' }, ctx.venues)).toEqual({ name: 'Black Box', address: undefined })
    expect(sessionPlace({ ...base, location: { name: 'Church Hall', address: '2 Elm St' }, room: 'Annex' }, ctx.venues))
      .toEqual({ name: 'Church Hall, Annex', address: '2 Elm St' })
    expect(sessionPlace(base, ctx.venues)).toBeUndefined()
  })
})

describe('record rules', () => {
  it('requires a listed venue for a production', () => {
    expect(runIssues(run({ venue: 'TH' }), 2026, refs, TODAY).errors).toEqual([])
    expect(runIssues(run({ venue: 'Test Hall' }), 2026, refs, TODAY).errors).toEqual([
      'Venue "Test Hall" isn\'t in the venue list'
    ])
  })

  it('applies the organizer rules to productions and activities', () => {
    expect(runIssues(run({ company: 'other' }), 2026, refs, TODAY).errors).toEqual([
      'Organizer is required'
    ])
    expect(activityIssues(activity({ organizers: ['fight'] }), 2026, 'other', refs).errors).toEqual([])
  })

  it('checks session venue codes', () => {
    const a = activity({ dates: [{ id: 'session-9', date: '2026-11-05', startTime: '18:00', venue: 'XX' }] })
    expect(activityIssues(a, 2026, 'tst', refs).errors).toEqual([
      'date row 1 has venue "XX", which isn\'t in the venue list'
    ])
  })

  it('checks that an audition’s production exists', () => {
    const ok = activity({ productionId: 'run-1700000000000' })
    const missing = activity({ productionId: 'run-1' })
    expect(activityIssues(ok, 2026, 'tst', refs).errors).toEqual([])
    expect(activityIssues(missing, 2026, 'tst', refs).errors).toEqual(['Production "run-1" doesn\'t exist'])
    expect(activityIssues(missing, 2026, 'tst', { ...refs, runIds: undefined }).errors).toEqual([])
  })

  it('warns when an audition isn’t linked to a production', () => {
    const warn = 'not linked to a production — fine only for an audition covering several shows'
    expect(activityIssues(activity(), 2026, 'tst', refs).warnings).toEqual([warn])
    expect(activityIssues(activity({ productionId: 'run-1700000000000' }), 2026, 'tst', refs).warnings).toEqual([])
    expect(activityIssues(activity({ type: 'event' }), 2026, 'tst', refs).warnings).toEqual([])
  })

  it('accepts a named organizer’s website as an event’s contact', () => {
    const bare = activity({ type: 'event', rolesAvailable: undefined, contact: undefined })
    expect(activityIssues(bare, 2026, 'tst', refs).errors[0]).toMatch(/an event needs a contact/)
    expect(activityIssues({ ...bare, organizers: ['fight'] }, 2026, 'other', refs).errors).toEqual([])
  })
})

describe('missing details', () => {
  it('lists what an upcoming production lacks', () => {
    expect(runGaps(run(), TODAY)).toEqual([])
    expect(
      runGaps(run({ ticketsUrl: '', price: '', infoUrl: '', description: '', performances: [] }), TODAY)
    ).toEqual(['dates', 'tickets', 'price', 'info', 'description'])
  })

  it('counts a performance’s own tickets link', () => {
    const r = run({ ticketsUrl: '' }) // the fixture's second performance has its own link
    expect(runGaps(r, TODAY)).toEqual([])
  })

  it('has nothing for productions that are over', () => {
    expect(runGaps(run({ price: '' }), '2027-01-01')).toEqual([])
  })

  it('lists what an open activity lacks', () => {
    expect(activityGaps(activity(), undefined, TODAY)).toEqual(['info', 'location'])
    expect(activityGaps(activity({ noticeUrl: 'https://x.example' }), 'TH', TODAY)).toEqual([])
    expect(activityGaps(activity({ closed: true }), undefined, TODAY)).toEqual([])
  })
})
