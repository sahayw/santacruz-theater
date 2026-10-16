/**
 * Local-file production loading for the digest and welcome emails — reads
 * data/shows/**\/*.json from the function bundle, like activities-data.mts.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { CompanyEntry, Genre, Run, ShowsFile, Venue } from '../../../src/types.ts'
import { organizerName, recordOrganizerIds } from '../../../src/lib/organizers.ts'
import { runPlace } from '../../../src/lib/venues.ts'
import { bareId } from '../../../src/lib/calendar-model.ts'
import { toGenres } from '../../../src/lib/audition-format.ts'

const SHOWS_ROOT = join(process.cwd(), 'data', 'shows')

/** Every run in every shows file. */
export function loadRuns(): Run[] {
  const runs: Run[] = []
  let years: string[] = []
  try {
    years = readdirSync(SHOWS_ROOT)
  } catch (e) {
    console.error('shows-data: failed to read shows directory:', e)
    return runs
  }
  for (const year of years)
    for (const f of readdirSync(join(SHOWS_ROOT, year)).filter((n) => n.endsWith('.json'))) {
      try {
        const file: ShowsFile = JSON.parse(readFileSync(join(SHOWS_ROOT, year, f), 'utf-8'))
        runs.push(...(file.runs ?? []).map((r) => ({ ...r, company: r.company || file.company })))
      } catch (e) {
        console.error(`shows-data: failed to parse ${f}:`, e)
      }
    }
  return runs
}

/** A production as an email card shows it: upcoming performances only. */
export interface DigestProduction {
  id: string
  title: string
  genre: Genre[]
  organizerIds: string[]
  organizerName: string
  venueName: string
  price: string
  ticketsUrl: string // the run's, else the first upcoming performance's
  perfs: { id: string; date: string; time: string; perfType: string }[]
  url: string // its /productions page
}

export function digestProduction(
  run: Run,
  companies: CompanyEntry[],
  venues: Venue[],
  today: string,
  siteUrl: string
): DigestProduction {
  const organizerIds = recordOrganizerIds(run.company, run.organizers)
  const perfs = run.performances
    .filter((p) => p.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  return {
    id: run.id,
    title: run.show,
    genre: toGenres(run.genre),
    organizerIds,
    organizerName: organizerName(organizerIds, companies),
    venueName: runPlace(run, venues)?.name ?? run.venue,
    price: run.price,
    ticketsUrl: run.ticketsUrl?.trim() || perfs.find((p) => p.ticketsUrl?.trim())?.ticketsUrl || '',
    perfs: perfs.map(({ id, date, time, perfType }) => ({ id, date, time, perfType })),
    url: `${siteUrl}/productions?id=${bareId(run.id)}`
  }
}

/** Whether a subscriber who left out `excluded` majors gets this production (as the feeds). */
export const includesProduction = (p: { organizerIds: string[] }, excluded: string[]) =>
  p.organizerIds.some((id) => !excluded.includes(id))
