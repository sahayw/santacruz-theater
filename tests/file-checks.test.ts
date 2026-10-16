// The save-time check (src/lib/file-checks.ts) — fixture data only.
import { describe, expect, it } from 'vitest'
import { saveErrors } from '../src/lib/file-checks.ts'
import { activity, ctx, run } from './fixtures/calendar.ts'

const TODAY = '2026-10-15'
const refs = { ...ctx, subcategories: new Set(['lighting']) }
const showsFile = (runs = [run()]) => ({ company: 'tst', year: 2026, runs })
const activitiesFile = (activities = [activity()]) => ({ company: 'tst', year: 2026, activities })

describe('saveErrors', () => {
  it('accepts valid show and activity files', () => {
    expect(saveErrors('shows/2026/tst-2026.json', showsFile(), refs, TODAY)).toEqual([])
    expect(
      saveErrors('activities/2026/tst-activities-2026.json', activitiesFile(), refs, TODAY)
    ).toEqual([])
  })

  it('refuses performances without ids — what a stale editor tab writes', () => {
    const noIds = run({ performances: run().performances.map(({ id: _id, ...p }) => p) as never })
    const errors = saveErrors('shows/2026/tst-2026.json', showsFile([noIds]), refs, TODAY)
    expect(errors).toEqual([
      'data/shows/2026/tst-2026.json: runs[0].performances[0].id must be a string'
    ])
  })

  it('refuses ids duplicated within the file', () => {
    const twice = run({ performances: [run().performances[0], run().performances[0]] })
    const errors = saveErrors('shows/2026/tst-2026.json', showsFile([twice]), refs, TODAY)
    expect(errors[0]).toMatch(/is a duplicate: perf-1700000000001/)
  })

  it('applies the content rules, as the build does', () => {
    const errors = saveErrors(
      'shows/2026/tst-2026.json',
      showsFile([run({ show: '' })]),
      refs,
      TODAY
    )
    expect(errors).toEqual([
      'data/shows/2026/tst-2026.json: runs[0] (Much Ado): Full Show Title is required'
    ])
  })

  it('refuses a session without an id', () => {
    const a = activity({ dates: [{ date: '2026-11-05', startTime: '18:00' }] as never })
    const errors = saveErrors(
      'activities/2026/tst-activities-2026.json',
      activitiesFile([a]),
      refs,
      TODAY
    )
    expect(errors[0]).toMatch(/dates\[0\]\.id must be "session-<timestamp>"/)
  })

  it("doesn't check an audition's production (it may not be deployed yet)", () => {
    const linked = activity({
      productionId: 'run-1799999999999',
      title: undefined,
      genre: undefined
    } as never)
    expect(
      saveErrors('activities/2026/tst-activities-2026.json', activitiesFile([linked]), refs, TODAY)
    ).toEqual([])
  })

  it('checks services against the category list, and leaves other files alone', () => {
    const listing = {
      id: 'service-1',
      name: 'Lights Co',
      categories: ['sound'],
      contact: {},
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
    expect(saveErrors('sc-theater-services.json', { listings: [listing] }, refs, TODAY)[0]).toMatch(
      /category "sound" is not a subcategory/
    )
    expect(saveErrors('sc-theater-companies.json', { anything: true }, refs, TODAY)).toEqual([])
  })
})
