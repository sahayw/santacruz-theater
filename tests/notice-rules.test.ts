// Change detection for the email digests — fixture data only.
import { describe, expect, it } from 'vitest'
import {
  activityChangeLabel,
  classifyActivities,
  classifyProductions,
  productionChangeLabel,
  productionPrint
} from '../src/lib/notice-rules.ts'
import { activity, run } from './fixtures/calendar.ts'

const TODAY = '2026-10-15'
// The fixture run: performances on Oct 30 (opening) and Nov 1 (own tickets link)
const snap = (runs: ReturnType<typeof run>[]) => classifyProductions(runs, {}, TODAY).next

describe('productions', () => {
  it('announces a production when it first has upcoming performances', () => {
    const { notices } = classifyProductions([run()], {}, TODAY)
    expect(notices).toEqual([{ id: 'run-1700000000000', isNew: true, changes: [] }])
  })

  it('waits for dates: a production saved without them is announced when they arrive', () => {
    const early = run({ performances: [] })
    const first = classifyProductions([early], {}, TODAY)
    expect(first.notices).toEqual([])
    expect(classifyProductions([run()], first.next, TODAY).notices[0].isNew).toBe(true)
  })

  it('ignores a production whose dates are all past', () => {
    expect(classifyProductions([run()], {}, '2026-12-01').notices).toEqual([])
  })

  it('reports nothing when only insignificant fields change', () => {
    const changed = run({ price: '$99', description: 'typo fixed', show: 'Much Ado!', discounts: '' })
    expect(classifyProductions([changed], snap([run()]), TODAY).notices).toEqual([])
  })

  it('reports dates added, cancelled and moved by performance id', () => {
    const before = run()
    const after = run({
      performances: [
        { ...before.performances[0], time: '20:00' }, // moved
        { id: 'perf-9', date: '2026-11-08', time: '14:00', perfType: '', discounts: '', ticketsUrl: '' }
        // perf-1700000000002 cancelled
      ]
    })
    const [n] = classifyProductions([after], snap([before]), TODAY).notices
    expect(n.changes.map(productionChangeLabel)).toEqual([
      '1 date added',
      '1 date cancelled',
      '1 date changed'
    ])
  })

  it('reports tickets going on sale, not one link replacing another', () => {
    const noTickets = run({
      ticketsUrl: '',
      performances: run().performances.map((p) => ({ ...p, ticketsUrl: '' }))
    })
    const onSale = classifyProductions([run()], snap([noTickets]), TODAY).notices[0]
    expect(onSale.changes).toEqual([{ kind: 'tickets' }])
    const swapped = run({ ticketsUrl: 'https://other.example/tickets' })
    expect(classifyProductions([swapped], snap([run()]), TODAY).notices).toEqual([])
  })

  it('reports a venue or room change', () => {
    const moved = run({ room: 'Studio 2' })
    expect(classifyProductions([moved], snap([run()]), TODAY).notices[0].changes).toEqual([
      { kind: 'venue' }
    ])
  })

  it('lets a performance that has happened drop off silently', () => {
    const before = snap([run()])
    const after = run({ performances: run().performances.slice(1) }) // Oct 30 now past
    expect(classifyProductions([after], before, '2026-10-31').notices).toEqual([])
  })

  it('reports a production that loses all its remaining dates as cancelled', () => {
    const [n] = classifyProductions([run({ performances: [] })], snap([run()]), TODAY).notices
    expect(n).toMatchObject({ isNew: false })
    expect(n.changes.map(productionChangeLabel)).toEqual(['Cancelled'])
  })

  it('keeps only upcoming performances in a print', () => {
    expect(Object.keys(productionPrint(run(), '2026-10-31').perfs)).toEqual(['perf-1700000000002'])
  })
})

describe('auditions & events', () => {
  const prevOf = (a: ReturnType<typeof activity>) => classifyActivities([a], {}, TODAY).next

  it('announces an upcoming activity once', () => {
    const a = activity()
    expect(classifyActivities([a], {}, TODAY).notices[0].isNew).toBe(true)
    expect(classifyActivities([a], prevOf(a), TODAY).notices).toEqual([])
  })

  it('reports sessions added and location changes, not wording', () => {
    const a = activity()
    const changed = activity({
      description: 'reworded',
      notes: 'new notes',
      dates: [
        { ...a.dates[0], venue: 'BB' },
        a.dates[1],
        { id: 'session-9', date: '2026-11-07', startTime: '10:00' }
      ]
    })
    const [n] = classifyActivities([changed], prevOf(a), TODAY).notices
    expect(n.changes.map(activityChangeLabel)).toEqual(['1 session added', 'Location changed'])
  })

  it('reports registration opening', () => {
    const ev = activity({ type: 'event', registerUrl: undefined })
    const open = activity({ type: 'event', registerUrl: 'https://example.com/register' })
    expect(classifyActivities([open], prevOf(ev), TODAY).notices[0].changes).toEqual([
      { kind: 'registration' }
    ])
  })

  it('reports a reopened activity as a change, and a closed one not at all', () => {
    const closed = activity({ closed: true })
    expect(classifyActivities([closed], {}, TODAY).notices).toEqual([])
    const [n] = classifyActivities([activity()], prevOf(closed), TODAY).notices
    expect(n).toMatchObject({ isNew: false, changes: [{ kind: 'reopened' }] })
  })

  it('reports an activity that loses all its remaining sessions as cancelled', () => {
    const [n] = classifyActivities([activity({ dates: [] })], prevOf(activity()), TODAY).notices
    expect(n.changes.map(activityChangeLabel)).toEqual(['Cancelled'])
  })

  it('sends nothing when a listed activity closes', () => {
    expect(classifyActivities([activity({ closed: true })], prevOf(activity()), TODAY).notices).toEqual(
      []
    )
  })

  it('keeps a virtual audition with no dates listable', () => {
    const virtual = activity({ virtualSubmission: true, dates: [] })
    expect(classifyActivities([virtual], {}, TODAY).notices[0].isNew).toBe(true)
  })
})
