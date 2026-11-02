import { describe, expect, it } from 'vitest'
import { productionCard } from '../netlify/functions/lib/email-template.mts'
import type { DigestProduction } from '../netlify/functions/lib/shows-data.mts'
import {
  cutDescription,
  fmtPerfTime,
  genrePipHtml,
  perfTypePipHtml,
  recordDetailHtml
} from '../src/lib/production-view.ts'
import { run } from './fixtures/calendar.ts'

describe('cutDescription', () => {
  it('leaves a short description alone', () => {
    expect(cutDescription('Short and sweet.', 600)).toEqual({
      text: 'Short and sweet.',
      cut: false
    })
  })

  it('cuts a long description at a line break, not mid-sentence', () => {
    const md = `${'First paragraph sentence. '.repeat(10).trim()}\n${'Second paragraph. '.repeat(40)}`
    const { text, cut } = cutDescription(md, 600)
    expect(cut).toBe(true)
    expect(text.length).toBeLessThanOrEqual(600)
    expect(text.endsWith('sentence.')).toBe(true)
  })

  it('never leaves a half-open bold, italic or link', () => {
    const md = `${'word '.repeat(50)}**bold phrase that runs past the limit ${'x '.repeat(100)}** end`
    const { text } = cutDescription(md, 300)
    expect((text.match(/\*\*/g) ?? []).length % 2).toBe(0)
    const link = `${'word '.repeat(55)}[a link](https://example.com/${'p'.repeat(50)}) after`
    const cutLink = cutDescription(link, 290).text
    expect(cutLink.includes('[') && !cutLink.includes('](')).toBe(false)
  })
})

describe('shared pieces', () => {
  it('writes times as 7pm / 7:30pm', () => {
    expect(fmtPerfTime('19:00')).toBe('7pm')
    expect(fmtPerfTime('19:30')).toBe('7:30pm')
  })

  it('gives every view the same pip colours', () => {
    expect(genrePipHtml('Drama')).toContain('background:#fbe5e1;color:#8c3a2e')
    expect(perfTypePipHtml('Opening')).toContain('background:#c8f0da;color:#1a5c35')
  })

  it('renders the record with no About heading, and Add to my calendar only when asked', () => {
    const r = run()
    expect(recordDetailHtml(r)).not.toContain('About')
    expect(recordDetailHtml(r)).not.toContain('Add to my calendar')
    expect(recordDetailHtml(r, { withAdd: true })).toContain('Add to my calendar')
  })
})

describe('productionCard', () => {
  const p: DigestProduction = {
    id: 'run-1',
    title: 'Much Ado About Nothing',
    genre: ['Comedy'],
    organizerIds: ['tst'],
    organizerName: 'Test Theatre',
    venueName: 'Test Hall',
    price: '$20',
    description: 'Shakespeare in the park.',
    ticketsUrl: 'https://example.com/t',
    perfs: [
      { id: 'perf-1', date: '2026-10-30', time: '19:30', perfType: 'Opening' },
      { id: 'perf-2', date: '2026-10-31', time: '14:00', perfType: '' }
    ],
    url: 'https://santacruz.theater/productions?id=1'
  }

  it('a new production has description, genre pip, date range and one link', () => {
    const html = productionCard(p)
    expect(html).toContain('Shakespeare in the park.')
    expect(html).toContain('Comedy')
    expect(html).toContain('2 performances')
    expect(html).toContain('Details &amp; tickets')
    expect(html).not.toContain('Get tickets')
    expect(html).not.toContain('Opening')
    expect(html.match(/<a /g)).toHaveLength(1)
  })

  it('an update carries change pips and no description', () => {
    const html = productionCard(p, [{ kind: 'tickets' }])
    expect(html).toContain('Tickets now on sale')
    expect(html).not.toContain('Shakespeare in the park.')
  })

  it('a cancelled production is a red pip and title only, with no link', () => {
    const html = productionCard({ ...p, perfs: [] }, [
      { kind: 'dates-removed', all: true, when: [] }
    ])
    expect(html).toContain('Cancelled')
    expect(html).toContain('#ffd4d4')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('No upcoming')
  })
})
