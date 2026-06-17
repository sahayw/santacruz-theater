/**
 * Local-file audition loading, shared by the digest and welcome-email functions.
 *
 * Reads data/auditions/**\/*.json and data/sc-theater-companies.json via fs from the
 * function bundle (see [functions].included_files in netlify.toml) rather than the
 * GitHub Contents API — these files already ship with every deploy, so a network
 * round-trip per file is unnecessary.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Audition, AuditionsFile } from '../../../src/types.ts'

export interface DigestAudition extends Audition {
  company: string
  companyName: string
  year: number
}

const DATA_ROOT = join(process.cwd(), 'data')
const AUDITIONS_ROOT = join(DATA_ROOT, 'auditions')
const FILE_RE = /^.+-auditions-\d{4}\.json$/

function loadCompanyNames(): Record<string, string> {
  try {
    const raw = readFileSync(join(DATA_ROOT, 'sc-theater-companies.json'), 'utf-8')
    const { companies } = JSON.parse(raw) as { companies: Array<{ id: string; name: string }> }
    return Object.fromEntries(companies.map(c => [c.id, c.name]))
  } catch (e) {
    console.error('auditions-data: failed to read sc-theater-companies.json:', e)
    return {}
  }
}

export function loadAllAuditions(): DigestAudition[] {
  const nameMap = loadCompanyNames()
  const auditions: DigestAudition[] = []

  let yearDirs: string[] = []
  try {
    yearDirs = readdirSync(AUDITIONS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  } catch (e) {
    console.error('auditions-data: failed to read auditions directory:', e)
    return auditions
  }

  for (const year of yearDirs) {
    const dir = join(AUDITIONS_ROOT, year)
    let files: string[] = []
    try {
      files = readdirSync(dir).filter(f => FILE_RE.test(f))
    } catch (e) {
      console.error(`auditions-data: failed to read ${dir}:`, e)
      continue
    }

    for (const file of files) {
      try {
        const parsed: AuditionsFile = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
        for (const a of parsed.auditions) {
          auditions.push({
            ...a,
            company: parsed.company,
            companyName: nameMap[parsed.company] ?? parsed.company,
            year: parsed.year
          })
        }
      } catch (e) {
        console.error(`auditions-data: failed to parse ${file}:`, e)
      }
    }
  }

  return auditions
}

export function isUpcoming(a: DigestAudition, todayStr = new Date().toISOString().slice(0, 10)): boolean {
  return (a.auditionDates.map(d => d.date).filter(Boolean).sort().pop() ?? '') >= todayStr
}

function byEarliestDate(a: DigestAudition, b: DigestAudition) {
  return (a.auditionDates[0]?.date ?? '').localeCompare(b.auditionDates[0]?.date ?? '')
}

export function getUpcomingAuditions(auditions: DigestAudition[]): DigestAudition[] {
  return auditions.filter(a => isUpcoming(a)).sort(byEarliestDate)
}

export function classifyForDigest(auditions: DigestAudition[], lastSent: Date) {
  const newAuditions = auditions
    .filter(a => new Date(a.createdAt) > lastSent)
    .sort(byEarliestDate)

  const updatedAuditions = auditions
    .filter(a => new Date(a.updatedAt) > lastSent && new Date(a.createdAt) <= lastSent && isUpcoming(a))
    .sort(byEarliestDate)

  return { newAuditions, updatedAuditions }
}
