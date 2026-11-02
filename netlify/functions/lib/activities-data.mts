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
import type {
  Activity,
  ActivitiesFile,
  ActivityDate,
  CompanyEntry,
  Run,
  Venue
} from '../../../src/types.ts'
import { organizerName, recordOrganizerIds } from '../../../src/lib/organizers.ts'
import { sessionPlace, type Place } from '../../../src/lib/venues.ts'
import { activityTitle, auditionDetails } from '../../../src/lib/audition-format.ts'
import { isUpcomingActivity } from '../../../src/lib/data-rules.ts'
import { loadCompanies, loadVenues } from './company-data.mts'
import { loadCancellations, loadRuns } from './shows-data.mts'

export interface DigestActivity extends Activity {
  title: string // resolved: a linked audition's is its production's
  company: string // the data file's company id ("other" for the catch-all file)
  companyName: string // organizer display name(s)
  year: number
  dates: (ActivityDate & { place?: Place })[]
  deleted?: boolean // deleted with Notify cancellation: no page to link to
}

const DATA_ROOT = join(process.cwd(), 'data')
const ACTIVITIES_ROOT = join(DATA_ROOT, 'activities')
const FILE_RE = /^.+-activities-\d{4}\.json$/

/** An activity with its title, organizer names and places resolved. */
function digestActivity(
  a: Activity,
  company: string,
  year: number,
  ref: { companies: CompanyEntry[]; venues: Venue[]; runs: Run[] }
): DigestActivity {
  return {
    ...a,
    title: activityTitle(a, ref.runs),
    ...(auditionDetails(a, ref.runs) as Pick<Activity, 'genre' | 'openingDate' | 'productionUrl'>),
    company,
    companyName: organizerName(recordOrganizerIds(company, a.organizers), ref.companies),
    year,
    dates: a.dates.map((d) => ({ ...d, place: sessionPlace(d, ref.venues) }))
  }
}

/**
 * Activities deleted with "Notify cancellation" that aren't back in the data, as
 * activities with no sessions left — the digest reports them "Cancelled".
 */
export function loadCancelledActivities(current: Activity[]): DigestActivity[] {
  const ids = new Set(current.map((a) => a.id))
  const ref = { companies: loadCompanies(), venues: loadVenues(), runs: loadRuns() }
  return loadCancellations()
    .filter((c) => c.kind === 'activity' && !ids.has(c.record.id))
    .map((c) => {
      const a = c.record as Activity
      return {
        ...digestActivity(
          {
            ...a,
            dates: [],
            closed: false,
            virtualSubmission: false,
            datesByRequest: false,
            silentRemovals: undefined
          },
          c.company,
          c.year ?? 0,
          ref
        ),
        deleted: true
      }
    })
}

export function loadAllActivities(): DigestActivity[] {
  const ref = { companies: loadCompanies(), venues: loadVenues(), runs: loadRuns() }
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
          activities.push(digestActivity(a, parsed.company, parsed.year, ref))
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

export function getUpcomingAuditions(activities: DigestActivity[], today?: string) {
  return activities
    .filter((a) => a.type === 'audition' && isUpcoming(a, today))
    .sort(byEarliestDate)
}

export function getUpcomingEvents(activities: DigestActivity[], today?: string) {
  return activities.filter((a) => a.type === 'event' && isUpcoming(a, today)).sort(byEarliestDate)
}
