import { describe, expect, it } from 'vitest'
import { mdToPlain } from '../src/lib/audition-format.ts'
import {
  addHours,
  buildFeeds,
  monthsBefore,
  performanceEvents,
  sessionEvents
} from '../src/lib/calendar-model.ts'
import { activity, ctx, run } from './fixtures/calendar.ts'

describe('mdToPlain', () => {
  it('drops emphasis, keeps only link text, and writes bullets as •', () => {
    expect(mdToPlain('**bold** and *italic*')).toBe('bold and italic')
    expect(mdToPlain('[tickets](https://example.com/t?a=1)')).toBe('tickets')
    expect(mdToPlain('Intro\n- one\n* two\n+ three')).toBe('Intro\n• one\n• two\n• three')
  })

  it('leaves non-HTTP links and plain text alone', () => {
    expect(mdToPlain('[x](javascript:alert(1)) & <b>')).toBe('[x](javascript:alert(1)) & <b>')
  })
})

describe('helpers', () => {
  it('addHours rolls over midnight', () => {
    expect(addHours({ date: '2026-12-31', time: '23:30' }, 2)).toEqual({
      date: '2027-01-01',
      time: '01:30'
    })
  })

  it('monthsBefore', () => {
    expect(monthsBefore('2026-10-14', 12)).toBe('2025-10-14')
    expect(monthsBefore('2027-03-31', 1)).toBe('2027-03-03') // JS date overflow of Feb 31
  })
})

describe('performanceEvents', () => {
  const [opening, matinee] = performanceEvents(run(), ctx)

  it('builds identity, summary, location, url and times', () => {
    expect(opening.uid).toBe('perf-1700000000001@santacruz.theater')
    expect(opening.kind).toBe('performance')
    expect(opening.parentId).toBe('run-1700000000000')
    expect(opening.summary).toBe('Much Ado — Test Theatre')
    expect(opening.location).toBe('Test Hall · 1 Main St, Santa Cruz, CA 95060')
    expect(opening.url).toBe('https://santacruz.theater/runs?id=1700000000000')
    expect(opening.start).toEqual({ date: '2026-10-30', time: '19:30' })
    expect(opening.end).toEqual({ date: '2026-10-30', time: '21:30' })
    expect(opening.lastModified).toBe('2026-09-01T12:00:00.000Z')
  })

  it('writes a plain-text description ending in one short link to our page', () => {
    expect(opening.description).toBe(
      'Opening performance\n\nShakespeare in the park.\n• Bring a blanket\n\n' +
        'Price: $20\nDiscounts: Students $10\n\n' +
        'Details & tickets: https://santacruz.theater/runs?id=1700000000000'
    )
    expect(matinee.description).toContain('Discounts: Pay what you can')
    expect(matinee.description).not.toContain('performance\n')
    // No raw third-party URLs — the runs page carries the ticket and info links
    expect(opening.description).not.toContain('example.com')
    expect(matinee.description).not.toContain('example.com')
  })

  it('says just "Details" when a run has no ticket link', () => {
    const [e] = performanceEvents(
      run({ ticketsUrl: '', performances: [run().performances[0]] }),
      ctx
    )
    expect(
      e.description.endsWith('\n\nDetails: https://santacruz.theater/runs?id=1700000000000')
    ).toBe(true)
  })

  it('keeps the same UID when a performance’s date and time change', () => {
    const edited = run()
    edited.performances[0] = { ...edited.performances[0], date: '2026-10-31', time: '20:00' }
    const [moved] = performanceEvents(edited, ctx)
    expect(moved.uid).toBe(opening.uid)
    expect(moved.start).toEqual({ date: '2026-10-31', time: '20:00' })
  })

  it('omits the company for "other" and falls back for unknown venues and missing updatedAt', () => {
    const [e] = performanceEvents(
      run({ company: 'other', venue: 'Somebody’s Barn', updatedAt: undefined }),
      ctx
    )
    expect(e.summary).toBe('Much Ado')
    expect(e.location).toBe('Somebody’s Barn')
    expect(e.lastModified).toBe(new Date(1700000000000).toISOString())
  })
})

describe('sessionEvents', () => {
  it('builds an audition session with roles, notes and the company primary venue', () => {
    const [first, second] = sessionEvents(activity(), ctx)
    expect(first.uid).toBe('session-1700000000101@santacruz.theater')
    expect(first.kind).toBe('audition')
    expect(first.summary).toBe('Audition: Hamlet Auditions — Test Theatre')
    expect(first.description).toBe(
      'Roles: 1 female · 1 any · ensemble\n\nPrepare a monologue\n\n' +
        'Details: https://santacruz.theater/events?id=1700000000100'
    )
    expect(first.location).toBe('Test Hall · 1 Main St, Santa Cruz, CA 95060')
    expect(first.url).toBe('https://santacruz.theater/events?id=1700000000100')
    expect(first.end).toEqual({ date: '2026-11-05', time: '21:00' })
    expect(first.lastModified).toBe('2026-09-15T08:30:00.000Z')
    expect(second.end).toEqual({ date: '2026-11-06', time: '20:00' }) // default 2h
  })

  it('builds an event with description, cost, registration and its own location', () => {
    const [e] = sessionEvents(
      activity({
        type: 'event',
        title: 'Stage Combat Workshop',
        company: 'other',
        organizerName: 'Fight Club SC',
        rolesAvailable: undefined,
        description: 'Learn *safe* falls',
        cost: '$15',
        registerUrl: 'https://example.com/register',
        dates: [
          {
            id: 'session-1',
            date: '2026-11-07',
            startTime: '22:00',
            endTime: '00:30',
            location: { name: 'BB' }
          }
        ]
      }),
      ctx
    )
    expect(e.kind).toBe('event')
    expect(e.summary).toBe('Event: Stage Combat Workshop — Fight Club SC')
    expect(e.description).toBe(
      'Learn safe falls\n\nCost: $15\n\n' +
        'Details & registration: https://santacruz.theater/events?id=1700000000100'
    )
    expect(e.location).toBe('Black Box')
    expect(e.end).toEqual({ date: '2026-11-08', time: '00:30' }) // past midnight
  })

  it('uses a session’s own address over any venue lookup', () => {
    const [e] = sessionEvents(
      activity({
        dates: [
          {
            id: 'session-2',
            date: '2026-11-05',
            startTime: '18:00',
            location: { name: 'Studio', address: '9 Side St' }
          }
        ]
      }),
      ctx
    )
    expect(e.location).toBe('Studio · 9 Side St')
  })

  it('publishes nothing for a closed activity, and skips undated rows', () => {
    expect(sessionEvents(activity({ closed: true }), ctx)).toEqual([])
    const undated = activity({
      dates: [{ id: 'session-3', date: '', startTime: '' }],
      virtualSubmission: true
    })
    expect(sessionEvents(undated, ctx)).toEqual([])
  })
})

describe('buildFeeds', () => {
  const runs = [
    run(),
    run({
      id: 'run-1600000000000',
      company: 'oth',
      showAbv: 'Old Show',
      performances: [
        {
          id: 'perf-1600000000001',
          date: '2025-09-01', // more than 12 months before "today"
          time: '19:30',
          perfType: '',
          discounts: '',
          ticketsUrl: ''
        },
        {
          id: 'perf-1600000000002',
          date: '2025-11-01',
          time: '19:30',
          perfType: '',
          discounts: '',
          ticketsUrl: ''
        }
      ]
    })
  ]
  const activities = [
    activity(),
    activity({
      id: 'activity-1700000000200',
      type: 'event',
      title: 'Workshop',
      dates: [{ id: 'session-1700000000201', date: '2026-12-01', startTime: '10:00' }]
    }),
    activity({ id: 'activity-1700000000300', title: 'Closed Auditions', closed: true })
  ]
  const feeds = buildFeeds(runs, activities, ctx, '2026-10-14')
  const feed = (path: string) => feeds.find((f) => f.path === path)!
  const uids = (path: string) => feed(path).events.map((e) => e.uid.split('@')[0])

  it('publishes the subscriptions, per-activity downloads, and one file per occurrence', () => {
    expect(feeds.map((f) => f.path).sort()).toEqual(
      [
        'activities',
        'activities/1700000000100',
        'activities/1700000000200',
        'activities/1700000000300',
        'auditions',
        'runs',
        'runs/company/oth',
        'runs/company/tst',
        'performances/1600000000001',
        'performances/1600000000002',
        'performances/1700000000001',
        'performances/1700000000002',
        'sessions/1700000000101',
        'sessions/1700000000102',
        'sessions/1700000000201'
      ].sort()
    )
  })

  it('marks only the big feeds as subscriptions', () => {
    const subs = feeds.filter((f) => f.subscribable).map((f) => f.path)
    expect(subs.sort()).toEqual([
      'activities',
      'auditions',
      'runs',
      'runs/company/oth',
      'runs/company/tst'
    ])
  })

  it('puts exactly one event, named after it, in each single-occurrence file', () => {
    const f = feed('performances/1700000000001')
    expect(uids('performances/1700000000001')).toEqual(['perf-1700000000001'])
    expect(f.name).toBe('Much Ado — Test Theatre')
    expect(uids('sessions/1700000000102')).toEqual(['session-1700000000102'])
    // Single files aren't windowed: an old performance can still be added
    expect(uids('performances/1600000000001')).toEqual(['perf-1600000000001'])
  })

  it('keeps record types apart and orders events by start', () => {
    expect(feed('runs').events.every((e) => e.kind === 'performance')).toBe(true)
    expect(feed('activities').events.map((e) => e.kind)).toEqual(['audition', 'audition', 'event'])
    expect(feed('auditions').events.every((e) => e.kind === 'audition')).toBe(true)
    expect(uids('runs')).toEqual(['perf-1600000000002', 'perf-1700000000001', 'perf-1700000000002'])
  })

  it('applies the 12-month window to subscriptions only', () => {
    expect(uids('runs')).not.toContain('perf-1600000000001')
    expect(uids('runs/company/oth')).toEqual(['perf-1600000000002'])
  })

  it('filters per company and per record', () => {
    expect(uids('runs/company/tst')).toEqual(['perf-1700000000001', 'perf-1700000000002'])
    expect(uids('activities/1700000000200')).toEqual(['session-1700000000201'])
  })

  it('leaves closed activities out, with no single-session files', () => {
    expect(feed('activities').events.map((e) => e.parentId)).not.toContain('activity-1700000000300')
    expect(feed('activities/1700000000300').events).toEqual([])
    expect(feeds.some((f) => f.events.some((e) => e.parentId === 'activity-1700000000300'))).toBe(
      false
    )
  })

  it('trims stray whitespace from titles', () => {
    const padded = run({ show: 'Spaced Out ', showAbv: ' Spaced ' })
    expect(performanceEvents(padded, ctx)[0].summary).toBe('Spaced — Test Theatre')
    const single = buildFeeds([padded], [], ctx, '2026-10-14').find(
      (f) => f.path === 'performances/1700000000001'
    )!
    expect(single.name).toBe('Spaced — Test Theatre')
  })

  it('names feeds', () => {
    expect(feed('runs').name).toBe('Santa Cruz Theater — All Performances')
    expect(feed('runs/company/tst').name).toBe('Santa Cruz Theater — Performances (Test Theatre)')
    expect(feed('activities').name).toBe('Santa Cruz Theater — All Auditions & Events')
    expect(feed('auditions').name).toBe('Santa Cruz Theater — Auditions')
    expect(feed('activities/1700000000100').name).toBe('Hamlet Auditions')
  })
})
