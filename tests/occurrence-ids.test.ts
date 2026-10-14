import { describe, expect, it } from 'vitest'
import {
  PERF_ID_RE,
  SESSION_ID_RE,
  createIdGenerator,
  ensurePerformanceIds,
  ensureSessionIds
} from '../src/lib/occurrence-ids.ts'

describe('createIdGenerator', () => {
  it('uses the clock when it has moved on', () => {
    let t = 1000
    const next = createIdGenerator('perf', () => t)
    expect(next()).toBe('perf-1000')
    t = 5000
    expect(next()).toBe('perf-5000')
  })

  it('stays monotonic when the clock stands still or goes backwards', () => {
    let t = 1000
    const next = createIdGenerator('session', () => t)
    expect([next(), next(), next()]).toEqual(['session-1000', 'session-1001', 'session-1002'])
    t = 500
    expect(next()).toBe('session-1003')
  })

  it('issues unique ids in a real-clock burst', () => {
    const next = createIdGenerator('perf')
    const ids = Array.from({ length: 1000 }, next)
    expect(new Set(ids).size).toBe(1000)
    ids.forEach((id) => expect(id).toMatch(PERF_ID_RE))
  })
})

describe('ensurePerformanceIds / ensureSessionIds', () => {
  it('adds ids only where missing, first in the object, leaving other fields alone', () => {
    const next = createIdGenerator('perf', () => 42)
    const runs = [
      {
        performances: [
          { id: 'perf-1', date: '2026-01-01', time: '19:30' },
          { date: '2026-01-02', time: '19:30' }
        ]
      }
    ]
    expect(ensurePerformanceIds(runs, next)).toBe(1)
    expect(runs[0].performances[0]).toEqual({
      id: 'perf-1',
      date: '2026-01-01',
      time: '19:30'
    })
    expect(Object.keys(runs[0].performances[1])).toEqual(['id', 'date', 'time'])
    expect(runs[0].performances[1].id).toBe('perf-42')
  })

  it('is a no-op the second time', () => {
    const next = createIdGenerator('session')
    const activities: { dates: { id?: string; date: string }[] }[] = [
      { dates: [{ date: '2026-01-01' }, { date: '2026-01-02' }] }
    ]
    expect(ensureSessionIds(activities, next)).toBe(2)
    const after = JSON.stringify(activities)
    expect(ensureSessionIds(activities, next)).toBe(0)
    expect(JSON.stringify(activities)).toBe(after)
    activities[0].dates.forEach((d) => expect(d.id).toMatch(SESSION_ID_RE))
  })

  it('skips records without a rows array', () => {
    const next = createIdGenerator('session')
    const activities = [{} as { dates: { id?: string }[] }]
    expect(ensureSessionIds(activities, next)).toBe(0)
    expect(activities[0]).toEqual({})
  })
})
