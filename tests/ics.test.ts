import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'
import { buildFeeds, type Feed } from '../src/lib/calendar-model.ts'
import { escapeText, foldLine, serializeFeed } from '../src/lib/ics.ts'
import { feedProblems } from '../scripts/check-feeds.ts'
import { activity, ctx, run } from './fixtures/calendar.ts'

const octets = (s: string) => new TextEncoder().encode(s).length

function feedFor(runs = [run()], activities = [activity()]): Feed {
  return buildFeeds(runs, activities, ctx, '2026-10-14').find((f) => f.path === 'runs')!
}

/** Parses with ical.js, registering the feed's own VTIMEZONE. */
function parse(text: string) {
  const calendar = new ICAL.Component(ICAL.parse(text))
  ICAL.TimezoneService.register(calendar.getFirstSubcomponent('vtimezone')!)
  return calendar.getAllSubcomponents('vevent').map((v) => new ICAL.Event(v))
}

describe('escapeText', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf')
  })
})

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short')
  })

  it('folds at 75 octets with a leading space on continuation lines', () => {
    const folded = foldLine('DESCRIPTION:' + 'x'.repeat(200))
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(2)
    parts.forEach((p) => expect(octets(p)).toBeLessThanOrEqual(75))
    parts.slice(1).forEach((p) => expect(p.startsWith(' ')).toBe(true))
    expect(folded.replace(/\r\n /g, '')).toBe('DESCRIPTION:' + 'x'.repeat(200))
  })

  it('never splits a multibyte character', () => {
    const line = 'SUMMARY:' + 'é—🎭'.repeat(40)
    const parts = foldLine(line).split('\r\n')
    parts.forEach((p) => {
      expect(octets(p)).toBeLessThanOrEqual(75)
      expect(p).not.toContain('�')
    })
    expect(foldLine(line).replace(/\r\n /g, '')).toBe(line)
  })
})

describe('serializeFeed', () => {
  const text = serializeFeed(feedFor())

  it('uses CRLF line endings throughout', () => {
    expect(text.endsWith('\r\n')).toBe(true)
    expect(/[^\r]\n/.test(text)).toBe(false)
  })

  it('is byte-identical for unchanged data', () => {
    expect(serializeFeed(feedFor())).toBe(text)
  })

  it('changes only the edited event when a source record changes', () => {
    const edited = run()
    edited.performances[1] = { ...edited.performances[1], time: '15:00' }
    const blocks = (t: string) => t.split('BEGIN:VEVENT').slice(1)
    const before = blocks(text)
    const after = blocks(serializeFeed(feedFor([edited])))
    expect(after[0]).toBe(before[0])
    expect(after[1]).not.toBe(before[1])
    expect(after[1]).toContain('UID:perf-1700000000002@santacruz.theater')
  })

  it('parses with ical.js, keeping text and properties intact', () => {
    const [opening] = parse(text)
    expect(opening.uid).toBe('perf-1700000000001@santacruz.theater')
    expect(opening.summary).toBe('Much Ado — Test Theatre')
    expect(opening.location).toBe('Test Hall · 1 Main St, Santa Cruz, CA 95060')
    expect(opening.description).toContain('Shakespeare in the park.\n• Bring a blanket')
    expect(opening.component.getFirstPropertyValue('url')).toBe(
      'https://santacruz.theater/runs?id=1700000000000'
    )
    expect(opening.component.getFirstPropertyValue('dtstamp')?.toString()).toBe(
      '2026-09-01T12:00:00Z'
    )
  })

  it('converts local times to the right instants across both DST changes', () => {
    const perf = (id: string, date: string) => ({
      id,
      date,
      time: '19:30',
      perfType: '' as const,
      discounts: '',
      ticketsUrl: ''
    })
    const dst = run({
      performances: [
        perf('perf-1', '2026-10-31'), // PDT, UTC-7
        perf('perf-2', '2026-11-01'), // PST, UTC-8 (DST ended 1 Nov 2026)
        perf('perf-3', '2027-03-13'), // PST
        perf('perf-4', '2027-03-14') // PDT (DST began 14 Mar 2027)
      ]
    })
    const utc = parse(serializeFeed(feedFor([dst], []))).map((e) =>
      e.startDate.toJSDate().toISOString()
    )
    expect(utc).toEqual([
      '2026-11-01T02:30:00.000Z',
      '2026-11-02T03:30:00.000Z',
      '2027-03-14T03:30:00.000Z',
      '2027-03-15T02:30:00.000Z'
    ])
  })

  it('escapes special characters so they round-trip', () => {
    const tricky = run({ showAbv: 'Rock, Paper; Scissors\\Lizard', show: 'x' })
    const [e] = parse(serializeFeed(feedFor([tricky], [])))
    expect(e.summary).toBe('Rock, Paper; Scissors\\Lizard — Test Theatre')
  })

  it('produces a valid empty calendar', () => {
    const empty = buildFeeds([], [], ctx, '2026-10-14').find((f) => f.path === 'activities')!
    const out = serializeFeed(empty)
    expect(feedProblems(out)).toEqual([])
    expect(parse(out)).toEqual([])
  })
})

describe('feedProblems (scripts/check-feeds.ts)', () => {
  const good = serializeFeed(feedFor())

  it('passes a real feed', () => {
    expect(feedProblems(good)).toEqual([])
  })

  it('catches LF endings, long lines, duplicate UIDs and bad times', () => {
    expect(feedProblems(good.replace(/\r\n/g, '\n'))).toContain('lines must end with CRLF')
    const long = good.replace('SUMMARY:Much Ado', 'SUMMARY:' + 'x'.repeat(100))
    expect(feedProblems(long).some((p) => p.includes('over 75 octets'))).toBe(true)
    const dup = good.replace(
      'UID:perf-1700000000002@santacruz.theater',
      'UID:perf-1700000000001@santacruz.theater'
    )
    expect(feedProblems(dup).some((p) => p.includes('duplicate UID'))).toBe(true)
    const backwards = good.replace(
      'DTEND;TZID=America/Los_Angeles:20261030T213000',
      'DTEND;TZID=America/Los_Angeles:20261030T180000'
    )
    expect(feedProblems(backwards).some((p) => p.includes('ends at or before'))).toBe(true)
  })
})
