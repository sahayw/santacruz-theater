// RFC 5545 serializer for the calendar feeds. Hand-written rather than a library so the
// output is fully deterministic: no build-time timestamps, a fixed VTIMEZONE, and events
// in a stable order — unchanged data produces byte-identical files, so subscribed clients
// never see spurious changes. Validated against ical.js in tests and scripts/check-feeds.ts.
// See docs/ics-spec.md.

import type { CalendarEvent, Feed, LocalDateTime } from './calendar-model.ts'

export const TZID = 'America/Los_Angeles'
const PRODID = '-//santacruz.theater//Calendar Feeds//EN'
const REFRESH = 'PT12H'
const MAX_LINE_OCTETS = 75

// US daylight-saving rules in force since 2007: second Sunday of March to first Sunday
// of November, switching at 02:00 local time.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0800',
  'TZOFFSETTO:-0700',
  'TZNAME:PDT',
  'DTSTART:20070311T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0700',
  'TZOFFSETTO:-0800',
  'TZNAME:PST',
  'DTSTART:20071104T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE'
]

/** TEXT value escaping (RFC 5545 §3.3.11). */
export function escapeText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/**
 * Folds a content line to at most 75 octets per physical line (RFC 5545 §3.1),
 * continuation lines starting with a space, never splitting a UTF-8 sequence.
 */
export function foldLine(line: string) {
  const encoder = new TextEncoder()
  const out: string[] = []
  let current = ''
  let octets = 0
  for (const ch of line) {
    const size = encoder.encode(ch).length
    const limit = out.length ? MAX_LINE_OCTETS - 1 : MAX_LINE_OCTETS
    if (octets + size > limit) {
      out.push(current)
      current = ''
      octets = 0
    }
    current += ch
    octets += size
  }
  out.push(current)
  return out.join('\r\n ')
}

/** `2026-10-14` + `19:30` → `20261014T193000` (local, used with TZID). */
export function localDateTime({ date, time }: LocalDateTime) {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`
}

/** ISO 8601 instant → `YYYYMMDDTHHMMSSZ`. */
export function utcDateTime(iso: string) {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

function eventLines(e: CalendarEvent) {
  const stamp = utcDateTime(e.lastModified)
  return [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    // DTSTAMP is required; for a published (non-scheduling) feed it's the last change
    // to the source record, never the build time.
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
    `DTSTART;TZID=${TZID}:${localDateTime(e.start)}`,
    `DTEND;TZID=${TZID}:${localDateTime(e.end)}`,
    `SUMMARY:${escapeText(e.summary)}`,
    e.description && `DESCRIPTION:${escapeText(e.description)}`,
    e.location && `LOCATION:${escapeText(e.location)}`,
    // No URL property: the description's last line already links to our page, and
    // Apple Calendar would show the same link a second time as its own field
    'END:VEVENT'
  ].filter((l): l is string => Boolean(l))
}

/** A complete VCALENDAR document, CRLF line endings, lines folded. */
export function serializeFeed(feed: Feed) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `NAME:${escapeText(feed.name)}`,
    `X-WR-CALNAME:${escapeText(feed.name)}`,
    `DESCRIPTION:${escapeText(feed.description)}`,
    `X-WR-CALDESC:${escapeText(feed.description)}`,
    `X-WR-TIMEZONE:${TZID}`,
    // Refresh hints only mean something to a subscription, not a one-off download
    ...(feed.subscribable
      ? [`REFRESH-INTERVAL;VALUE=DURATION:${REFRESH}`, `X-PUBLISHED-TTL:${REFRESH}`]
      : []),
    ...VTIMEZONE,
    ...feed.events.flatMap(eventLines),
    'END:VCALENDAR'
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
