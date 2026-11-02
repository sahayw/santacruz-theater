/**
 * Local-file production loading for the digest and welcome emails — reads
 * data/shows/**\/*.json from the function bundle, like activities-data.mts.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  Cancellation,
  CancellationsFile,
  CompanyEntry,
  Genre,
  Run,
  ShowsFile,
  Venue
} from '../../../src/types.ts'
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

/**
 * Runs deleted with "Notify cancellation" that aren't back in the data, as runs with no
 * performances left — the digest then reports them "Cancelled" like a run that lost its
 * last date. `current` is every run now (a restored run's entry is ignored).
 */
export function loadCancelledRuns(current: Run[]): Run[] {
  const ids = new Set(current.map((r) => r.id))
  return loadCancellations()
    .filter((c) => c.kind === 'run' && !ids.has(c.record.id))
    .map((c) => ({
      ...(c.record as Run),
      company: c.company,
      performances: [],
      silentRemovals: undefined
    }))
}

/** data/cancellations.json's entries; none if it can't be read. */
export function loadCancellations(): Cancellation[] {
  try {
    const file: CancellationsFile = JSON.parse(
      readFileSync(join(process.cwd(), 'data', 'cancellations.json'), 'utf-8')
    )
    return file.cancelled ?? []
  } catch (e) {
    console.error('shows-data: failed to read cancellations.json:', e)
    return []
  }
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
  description: string // Markdown; only new-production emails carry it
  ticketsUrl: string // the run's, else the first upcoming performance's
  perfs: { id: string; date: string; time: string; perfType: string }[]
  url: string // its /productions page; empty for a deleted production (its page is gone)
}

export function digestProduction(
  run: Run,
  companies: CompanyEntry[],
  venues: Venue[],
  today: string,
  siteUrl: string,
  deleted = false
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
    description: run.description?.trim() ?? '',
    ticketsUrl: run.ticketsUrl?.trim() || perfs.find((p) => p.ticketsUrl?.trim())?.ticketsUrl || '',
    perfs: perfs.map(({ id, date, time, perfType }) => ({ id, date, time, perfType })),
    url: deleted ? '' : `${siteUrl}/productions?id=${bareId(run.id)}`
  }
}

/** Whether a subscriber who left out `excluded` majors gets this production (as the feeds). */
export const includesProduction = (p: { organizerIds: string[] }, excluded: string[]) =>
  p.organizerIds.some((id) => !excluded.includes(id))
