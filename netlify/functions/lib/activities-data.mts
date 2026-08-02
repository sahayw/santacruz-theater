/**
 * Local-file activity loading, shared by the digest and welcome-email functions.
 *
 * Reads data/activities/**\/*.json and data/sc-theater-companies.json via fs from the
 * function bundle (see [functions].included_files in netlify.toml) rather than the
 * GitHub Contents API — these files already ship with every deploy, so a network
 * round-trip per file is unnecessary.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Activity, ActivitiesFile } from '../../../src/types.ts'
import { loadCompanyNames } from './company-data.mts'

export interface DigestActivity extends Activity {
  company: string
  companyName: string
  year: number
}

const DATA_ROOT = join(process.cwd(), 'data')
const ACTIVITIES_ROOT = join(DATA_ROOT, 'activities')
const FILE_RE = /^.+-activities-\d{4}\.json$/

export function loadAllActivities(): DigestActivity[] {
  const nameMap = loadCompanyNames()
  const activities: DigestActivity[] = []

  let yearDirs: string[] = []
  try {
    yearDirs = readdirSync(ACTIVITIES_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  } catch (e) {
    console.error('activities-data: failed to read activities directory:', e)
    return activities
  }

  for (const year of yearDirs) {
    const dir = join(ACTIVITIES_ROOT, year)
    let files: string[] = []
    try {
      files = readdirSync(dir).filter(f => FILE_RE.test(f))
    } catch (e) {
      console.error(`activities-data: failed to read ${dir}:`, e)
      continue
    }

    for (const file of files) {
      try {
        const parsed: ActivitiesFile = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
        for (const a of parsed.activities) {
          activities.push({
            ...a,
            company: parsed.company,
            companyName: nameMap[parsed.company] ?? parsed.company,
            year: parsed.year
          })
        }
      } catch (e) {
        console.error(`activities-data: failed to parse ${file}:`, e)
      }
    }
  }

  return activities
}

export function isUpcoming(a: DigestActivity, todayStr = new Date().toISOString().slice(0, 10)): boolean {
  return (a.dates.map(d => d.date).filter(Boolean).sort().pop() ?? '') >= todayStr
}

function byEarliestDate(a: DigestActivity, b: DigestActivity) {
  return (a.dates[0]?.date ?? '').localeCompare(b.dates[0]?.date ?? '')
}

export function getUpcomingActivities(activities: DigestActivity[]): DigestActivity[] {
  return activities.filter(a => isUpcoming(a)).sort(byEarliestDate)
}

export function getUpcomingAuditions(activities: DigestActivity[]): DigestActivity[] {
  return activities.filter(a => a.type === 'audition' && isUpcoming(a)).sort(byEarliestDate)
}

export function getUpcomingEvents(activities: DigestActivity[]): DigestActivity[] {
  return activities.filter(a => a.type === 'event' && isUpcoming(a)).sort(byEarliestDate)
}

export function classifyForDigest(activities: DigestActivity[], lastSent: Date) {
  const newAuditions = activities
    .filter(a => a.type === 'audition' && new Date(a.createdAt) > lastSent)
    .sort(byEarliestDate)

  const updatedAuditions = activities
    .filter(a => a.type === 'audition' && new Date(a.updatedAt) > lastSent && new Date(a.createdAt) <= lastSent && isUpcoming(a))
    .sort(byEarliestDate)

  const newEvents = activities
    .filter(a => a.type === 'event' && new Date(a.createdAt) > lastSent)
    .sort(byEarliestDate)

  const updatedEvents = activities
    .filter(a => a.type === 'event' && new Date(a.updatedAt) > lastSent && new Date(a.createdAt) <= lastSent && isUpcoming(a))
    .sort(byEarliestDate)

  return { newAuditions, updatedAuditions, newEvents, updatedEvents }
}
