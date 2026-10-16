/**
 * Local-file activity loading, shared by the digest, subscribe and preferences functions.
 *
 * Reads data/activities/**\/*.json and data/sc-theater-companies.json via fs from the
 * function bundle (see [functions].included_files in netlify.toml) rather than the
 * GitHub Contents API — these files already ship with every deploy, so a network
 * round-trip per file is unnecessary.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Activity, ActivitiesFile, ActivityDate } from '../../../src/types.ts'
import { organizerName, recordOrganizerIds } from '../../../src/lib/organizers.ts'
import { sessionPlace, type Place } from '../../../src/lib/venues.ts'
import { activityTitle, auditionDetails } from '../../../src/lib/audition-format.ts'
import { isUpcomingActivity } from '../../../src/lib/data-rules.ts'
import { loadCompanies, loadVenues } from './company-data.mts'
import { loadRuns } from './shows-data.mts'

export interface DigestActivity extends Activity {
  title: string // resolved: a linked audition's is its production's
  company: string // the data file's company id ("other" for the catch-all file)
  companyName: string // organizer display name(s)
  year: number
  dates: (ActivityDate & { place?: Place })[]
}

const DATA_ROOT = join(process.cwd(), 'data')
const ACTIVITIES_ROOT = join(DATA_ROOT, 'activities')
const FILE_RE = /^.+-activities-\d{4}\.json$/

export function loadAllActivities(): DigestActivity[] {
  const companies = loadCompanies()
  const venues = loadVenues()
  const runs = loadRuns()
  const activities: DigestActivity[] = []

  let yearDirs: string[] = []
  try {
    yearDirs = readdirSync(ACTIVITIES_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch (e) {
    console.error('activities-data: failed to read activities directory:', e)
    return activities
  }

  for (const year of yearDirs) {
    const dir = join(ACTIVITIES_ROOT, year)
    let files: string[] = []
    try {
      files = readdirSync(dir).filter((f) => FILE_RE.test(f))
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
            title: activityTitle(a, runs),
            ...(auditionDetails(a, runs) as Pick<Activity, 'genre' | 'openingDate' | 'productionUrl'>),
            company: parsed.company,
            companyName: organizerName(
              recordOrganizerIds(parsed.company, a.organizers),
              companies
            ),
            year: parsed.year,
            dates: a.dates.map((d) => ({ ...d, place: sessionPlace(d, venues) }))
          })
        }
      } catch (e) {
        console.error(`activities-data: failed to parse ${file}:`, e)
      }
    }
  }

  return activities
}

/** The "upcoming" rule — shared with /events and the editor (src/lib/data-rules.ts). */
export const isUpcoming = (a: DigestActivity, today?: string) => isUpcomingActivity(a, today)

function byEarliestDate(a: DigestActivity, b: DigestActivity) {
  return (a.dates[0]?.date ?? '').localeCompare(b.dates[0]?.date ?? '')
}

export function getUpcomingAuditions(activities: DigestActivity[]): DigestActivity[] {
  return activities.filter((a) => a.type === 'audition' && isUpcoming(a)).sort(byEarliestDate)
}

export function getUpcomingEvents(activities: DigestActivity[]): DigestActivity[] {
  return activities.filter((a) => a.type === 'event' && isUpcoming(a)).sort(byEarliestDate)
}
