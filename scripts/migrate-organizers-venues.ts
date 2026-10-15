/**
 * One-time, idempotent migration to organizer and venue references
 * (docs/notifications-spec.md, stage 1):
 *
 * - Production `venue` text becomes a venue code from data/sc-theater-venues.json, with
 *   an optional `room`.
 * - Audition/event session `location`s that match a listed venue become a `venue` code;
 *   ad-hoc places stay as one-off locations.
 * - Records in other-<year> files get `organizers`; activities lose the free-text
 *   `organizerName` / `organizerUrl` (now on the organizer's entry).
 * - "(Midsummer Ensemble)" comes out of the Dracula title.
 *
 * `updatedAt` is never touched. Files keep the editor's 2-space JSON and their existing
 * trailing-newline style. A second run changes nothing. Anything it can't map is listed,
 * not guessed. Live editor saves land on main, so at release this is re-run against
 * main's data rather than merged as committed (see the spec's Stages section).
 *
 * Run with: npx tsx scripts/migrate-organizers-venues.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface VenueRef {
  venue: string
  room?: string
}

/** Production venue text that isn't simply a listed venue's name. */
const RUN_VENUE_TEXT: Record<string, VenueRef> = {
  'SV High School': { venue: 'SVHS' },
  'Theater Arts B100 Studio Theater at UC Santa Cruz': {
    venue: 'UCSC-TA',
    room: 'B100 Studio Theater'
  },
  'Theater Arts Second Stage at UC Santa Cruz': { venue: 'UCSC-TA', room: 'Second Stage' },
  'Cabrillo Black Box Theater': { venue: 'CBB' }
}

/** Productions whose venue text is wrong, by run id. */
const RUN_VENUE_FIX: Record<string, VenueRef> = {
  'run-1779618248131': { venue: 'LN' } // She Kills Monsters: was "Other"
}

/** Session location names that are a listed venue under another name. */
const SESSION_LOCATION_ALIASES: Record<string, string> = {
  "St. Andrew's Episcopal Church": 'StA',
  'Crocker Mainstage, Cabrillo College': 'CCT'
}

/** Organizers for records filed under Other, by record id. */
export const OTHER_ORGANIZERS: Record<string, string[]> = {
  'run-1779397816337': ['sh-theatrical'], // Rosencrantz and Guildenstern are Dead
  'run-1781503044353': ['sh-theatrical'], // Gross Indecency
  'activity-1780261748445': ['sh-theatrical'], // Gross Indecency audition
  'run-1779619220498': ['shadow-city'], // The Whole Monkey Show
  'run-1781470398513': ['cabrillo-ta'], // Machinal
  'activity-1781438400003': ['cabrillo-ta'], // Machinal audition
  'run-1791918917067': ['cabrillo-pac'], // The 39 Steps, Abridged
  'run-1782741993666': ['midsummer'], // Dracula
  'run-1791850043550': ['ucsc-barnstorm'], // The Flick
  'run-1791850670833': ['ucsc-ta'], // UCSC New Play Festival
  'activity-1791907412501': ['dor-atkinson'] // Audition Clinic
}

/** Title corrections, by run id: [from, to]. */
const TITLE_FIX: Record<string, [string, string]> = {
  'run-1782741993666': ['Dracula (Midsummer Ensemble)', 'Dracula']
}

export interface MigrationResult {
  venues: number
  sessions: number
  organizers: number
  titles: number
  filesChanged: string[]
  unmapped: string[]
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(dir, d.name))
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(dir, d.name, f))
    )
    .sort()
}

function rewrite(file: string, update: (data: any) => number, changed: string[]): number {
  const raw = readFileSync(file, 'utf8')
  const data = JSON.parse(raw)
  const n = update(data)
  if (n) {
    const trailing = raw.endsWith('\n') ? '\n' : ''
    writeFileSync(file, JSON.stringify(data, null, 2) + trailing)
    changed.push(file)
  }
  return n
}

/**
 * Sets `fields` on `obj`, keeping key order readable: a field that already exists keeps
 * its place; new ones go right after `afterKey` (or at the end). Undefined values are
 * left out.
 */
function setAfter(obj: Record<string, unknown>, afterKey: string, fields: Record<string, unknown>) {
  const pending = new Map(Object.entries(fields))
  const out: [string, unknown][] = []
  const flush = () => {
    for (const [k, v] of pending) if (v !== undefined) out.push([k, v])
    pending.clear()
  }
  for (const [k, v] of Object.entries(obj)) {
    if (pending.has(k)) {
      const nv = pending.get(k)
      pending.delete(k)
      if (nv !== undefined) out.push([k, nv])
    } else if (!(k in fields)) out.push([k, v])
    if (k === afterKey) flush()
  }
  flush()
  for (const k of Object.keys(obj)) delete obj[k]
  Object.assign(obj, Object.fromEntries(out))
}

export function migrateOrganizersVenues(dataRoot: string): MigrationResult {
  const venueList: { code: string; name: string }[] = JSON.parse(
    readFileSync(join(dataRoot, 'sc-theater-venues.json'), 'utf8')
  ).venues
  const codes = new Set(venueList.map((v) => v.code))
  const byName = new Map(venueList.map((v) => [v.name, v.code]))
  const result: MigrationResult = {
    venues: 0,
    sessions: 0,
    organizers: 0,
    titles: 0,
    filesChanged: [],
    unmapped: []
  }

  for (const file of jsonFiles(join(dataRoot, 'shows'))) {
    rewrite(
      file,
      (d) => {
        let n = 0
        for (const r of d.runs ?? []) {
          if (!codes.has(r.venue)) {
            const ref: VenueRef | undefined =
              RUN_VENUE_FIX[r.id] ??
              RUN_VENUE_TEXT[r.venue] ??
              (byName.has(r.venue) ? { venue: byName.get(r.venue)! } : undefined)
            if (ref) {
              setAfter(r, 'venue', { venue: ref.venue, room: ref.room })
              result.venues++
              n++
            } else result.unmapped.push(`${r.id} (${r.show}): venue "${r.venue}"`)
          }
          if (d.company === 'other' && !r.organizers?.length) {
            const orgs = OTHER_ORGANIZERS[r.id]
            if (orgs) {
              setAfter(r, 'company', { organizers: orgs })
              result.organizers++
              n++
            } else result.unmapped.push(`${r.id} (${r.show}): no organizer`)
          }
          const fix = TITLE_FIX[r.id]
          if (fix && r.show === fix[0]) {
            r.show = fix[1]
            result.titles++
            n++
          }
        }
        return n
      },
      result.filesChanged
    )
  }

  for (const file of jsonFiles(join(dataRoot, 'activities'))) {
    rewrite(
      file,
      (d) => {
        let n = 0
        for (const a of d.activities ?? []) {
          for (const s of a.dates ?? []) {
            const name = s.location?.name?.trim()
            if (s.venue || !name) continue
            const code = byName.get(name) ?? SESSION_LOCATION_ALIASES[name]
            if (code) {
              delete s.location
              setAfter(s, 'startTime' in s && !s.endTime ? 'startTime' : 'endTime', {
                venue: code
              })
              result.sessions++
              n++
            }
          }
          if (d.company === 'other' && !a.organizers?.length) {
            const orgs = OTHER_ORGANIZERS[a.id]
            if (orgs) {
              setAfter(a, 'dates', { organizers: orgs })
              result.organizers++
              n++
            } else result.unmapped.push(`${a.id} (${a.title}): no organizer`)
          }
          if ('organizerName' in a || 'organizerUrl' in a) {
            delete a.organizerName
            delete a.organizerUrl
            n++
          }
        }
        return n
      },
      result.filesChanged
    )
  }
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '../..')
  const r = migrateOrganizersVenues(join(root, 'data'))
  console.log(`Production venues coded : ${r.venues}`)
  console.log(`Session venues coded    : ${r.sessions}`)
  console.log(`Organizers assigned     : ${r.organizers}`)
  console.log(`Titles corrected        : ${r.titles}`)
  console.log(`Files changed           : ${r.filesChanged.length}`)
  r.filesChanged.forEach((f) => console.log(`  - ${f.slice(root.length + 1)}`))
  if (r.unmapped.length) {
    console.log(`Not mapped (fix by hand) : ${r.unmapped.length}`)
    r.unmapped.forEach((u) => console.log(`  - ${u}`))
  }
}
