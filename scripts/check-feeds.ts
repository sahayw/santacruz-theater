/**
 * Post-build check of every generated calendar feed (dist/**\/*.ics), parsed with an
 * independent iCalendar parser (ical.js) so real data — odd characters, long text — is
 * validated on every deploy, not just the unit-test fixtures. Fails the build on:
 * a parse error, lines over 75 octets or without CRLF, a missing required property,
 * a duplicate UID within a feed, or an event that ends before it starts.
 * Run by `npm run build` after `astro build`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ICAL from 'ical.js'

const root = resolve(fileURLToPath(import.meta.url), '../..')
const dist = join(root, 'dist')

function icsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name)
    if (d.isDirectory()) return icsFiles(path)
    return d.name.endsWith('.ics') ? [path] : []
  })
}

/** Problems found in one serialized feed; empty when it's valid. */
export function feedProblems(text: string): string[] {
  const problems: string[] = []
  if (!text.endsWith('\r\n') || /[^\r]\n/.test(text)) problems.push('lines must end with CRLF')
  const encoder = new TextEncoder()
  text.split('\r\n').forEach((line, i) => {
    if (encoder.encode(line).length > 75) problems.push(`line ${i + 1} is over 75 octets`)
  })

  let calendar: ICAL.Component
  try {
    calendar = new ICAL.Component(ICAL.parse(text))
  } catch (e) {
    return [...problems, `parse error: ${e}`]
  }
  if (calendar.name !== 'vcalendar') return [...problems, 'top-level component is not VCALENDAR']
  for (const prop of ['version', 'prodid', 'x-wr-calname'])
    if (!calendar.hasProperty(prop)) problems.push(`calendar is missing ${prop.toUpperCase()}`)

  const vtimezone = calendar.getFirstSubcomponent('vtimezone')
  if (!vtimezone) problems.push('missing VTIMEZONE')
  else ICAL.TimezoneService.register(vtimezone)

  const uids = new Set<string>()
  for (const vevent of calendar.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(vevent)
    const label = event.uid || '(no UID)'
    for (const prop of ['uid', 'dtstamp', 'dtstart', 'dtend', 'summary', 'description'])
      if (!vevent.hasProperty(prop)) problems.push(`${label}: missing ${prop.toUpperCase()}`)
    if (uids.has(event.uid)) problems.push(`${label}: duplicate UID`)
    uids.add(event.uid)
    if (event.startDate && event.endDate && event.endDate.compare(event.startDate) <= 0)
      problems.push(`${label}: ends at or before its start`)
  }
  return problems
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = icsFiles(dist)
  if (!files.length) {
    console.error('No .ics feeds found in dist/ — did astro build run?')
    process.exit(1)
  }
  let events = 0
  const failures: string[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    events += (text.match(/^BEGIN:VEVENT\r$/gm) || []).length
    feedProblems(text).forEach((p) => failures.push(`${relative(dist, file)}: ${p}`))
  }
  if (failures.length) {
    console.error(`\nCalendar feed check failed — ${failures.length} problem(s):\n`)
    failures.slice(0, 50).forEach((f) => console.error('  ✗', f))
    process.exit(1)
  }
  console.log(`Calendar feeds valid: ${files.length} feeds, ${events} events`)
}
