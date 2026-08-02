/**
 * Local-file performance loading, for the Google Calendar sync function.
 *
 * Reads data/shows/**\/*.json via fs from the function bundle (see
 * [functions].included_files in netlify.toml) rather than the GitHub Contents API,
 * flattening each Run's performances into PerformanceEvent-shaped records
 * (mirrors getPerformances() in src/lib/data.ts).
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Run, ShowsFile } from '../../../src/types.ts'
import { loadCompanyNames } from './company-data.mts'

function coerceGenre(raw: unknown): Run['genre'] {
  if (Array.isArray(raw)) return raw as Run['genre']
  return raw && typeof raw === 'string' ? [raw as Run['genre'][number]] : []
}

export interface SyncPerformance {
  runId: string
  company: string
  companyName: string
  showAbv: string
  show: string
  description: string
  genre: Run['genre']
  venue: string
  price: string
  discounts: string
  infoUrl: string
  ticketsUrl: string
  date: string // YYYY-MM-DD
  time: string // HH:MM (24-hour)
  perfType: Run['performances'][number]['perfType']
}

const DATA_ROOT = join(process.cwd(), 'data')
const SHOWS_ROOT = join(DATA_ROOT, 'shows')
const FILE_RE = /^.+-\d{4}\.json$/

export function loadAllPerformances(): SyncPerformance[] {
  const nameMap = loadCompanyNames()
  const performances: SyncPerformance[] = []

  let yearDirs: string[] = []
  try {
    yearDirs = readdirSync(SHOWS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  } catch (e) {
    console.error('shows-data: failed to read shows directory:', e)
    return performances
  }

  for (const year of yearDirs) {
    const dir = join(SHOWS_ROOT, year)
    let files: string[] = []
    try {
      files = readdirSync(dir).filter(f => FILE_RE.test(f))
    } catch (e) {
      console.error(`shows-data: failed to read ${dir}:`, e)
      continue
    }

    for (const file of files) {
      try {
        const parsed: ShowsFile = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
        for (const run of parsed.runs) {
          for (const perf of run.performances) {
            performances.push({
              runId: run.id,
              company: run.company,
              companyName: nameMap[run.company] ?? run.company,
              showAbv: run.showAbv,
              show: run.show,
              description: run.description || '',
              genre: coerceGenre(run.genre),
              venue: run.venue,
              price: run.price,
              discounts: perf.discounts || run.discounts,
              infoUrl: run.infoUrl,
              ticketsUrl: perf.ticketsUrl || run.ticketsUrl,
              date: perf.date,
              time: perf.time,
              perfType: perf.perfType
            })
          }
        }
      } catch (e) {
        console.error(`shows-data: failed to parse ${file}:`, e)
      }
    }
  }

  return performances.sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time)
  )
}
