import { describe, expect, it } from 'vitest'
import {
  activityTitle,
  auditionDetails,
  fmtTimeRange,
  runOpeningDate
} from '../src/lib/audition-format.ts'

describe('fmtTimeRange', () => {
  it('shows a lone time with its am/pm', () => {
    expect(fmtTimeRange('19:00', '')).toBe('7 pm')
    expect(fmtTimeRange('10:30', '')).toBe('10:30 am')
    expect(fmtTimeRange('', '21:00')).toBe('9 pm')
  })

  it('shares the suffix when both ends are on the same side of noon', () => {
    expect(fmtTimeRange('19:00', '21:30')).toBe('7–9:30 pm')
    expect(fmtTimeRange('11:00', '13:00')).toBe('11 am–1 pm')
  })

  it('is empty with no times', () => {
    expect(fmtTimeRange('', '')).toBe('')
  })
})

describe('linked auditions', () => {
  const run = {
    id: 'run-1',
    show: 'Macbeth',
    genre: ['Drama'],
    infoUrl: 'https://example.com/macbeth',
    performances: [
      { date: '2026-07-15', perfType: '' },
      { date: '2026-07-12', perfType: 'Preview' },
      { date: '2026-07-17', perfType: 'Opening' }
    ]
  }

  it('opens on the performance marked Opening, else the first', () => {
    expect(runOpeningDate(run)).toBe('2026-07-17')
    expect(runOpeningDate({ ...run, performances: run.performances.slice(0, 2) })).toBe(
      '2026-07-12'
    )
    expect(runOpeningDate({ ...run, performances: [] })).toBeUndefined()
  })

  it('takes title, genre, opening and link from the production', () => {
    const a = {
      productionId: 'run-1',
      title: 'stale',
      genre: ['Comedy'],
      openingDate: '2026-01-01'
    }
    expect(activityTitle(a, [run])).toBe('Macbeth')
    expect(auditionDetails(a, [run])).toEqual({
      genre: ['Drama'],
      openingDate: '2026-07-17',
      productionUrl: 'https://example.com/macbeth'
    })
  })

  it('keeps an unlinked audition’s own details', () => {
    const a = { title: '2027 season', genre: ['Musical'], productionUrl: 'https://x.example' }
    expect(activityTitle(a, [run])).toBe('2027 season')
    expect(auditionDetails(a, [run])).toEqual({
      genre: ['Musical'],
      openingDate: undefined,
      productionUrl: 'https://x.example'
    })
  })
})
