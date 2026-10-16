// /missing-details.json — every upcoming production or open activity that still lacks a
// detail (dates, tickets link, price, info link, description, location), built at build
// time. Read by the external alerting agent that chases missing details, e.g. when
// tickets go on sale. The rules are runGaps()/activityGaps() in src/lib/data-rules.ts,
// the same ones behind the editor's warnings. See docs/notifications-spec.md.
import type { APIRoute } from 'astro'
import type { ActivitiesFile, ShowsFile } from '../types.ts'
import { companies } from '../lib/data.ts'
import { activityGaps, runGaps, todayIso, type Gap } from '../lib/data-rules.ts'
import { recordOrganizerIds } from '../lib/organizers.ts'
import { activityTitle } from '../lib/audition-format.ts'

interface MissingDetails {
  kind: 'production' | 'audition' | 'event'
  id: string
  title: string
  organizers: string[] // organizer ids, main first
  file: string // data file holding the record, e.g. "data/shows/2026/scs-2026.json"
  firstDate?: string // earliest date, if any
  missing: Gap[]
}

const shows = import.meta.glob<{ default: ShowsFile }>('../../data/shows/**/*.json', { eager: true })
const activities = import.meta.glob<{ default: ActivitiesFile }>('../../data/activities/**/*.json', {
  eager: true
})
const dataPath = (globKey: string) => globKey.replace(/^(\.\.\/)+/, '')

export const GET: APIRoute = () => {
  const today = todayIso()
  const records: MissingDetails[] = []

  for (const [key, mod] of Object.entries(shows)) {
    for (const r of mod.default.runs) {
      const missing = runGaps(r, today)
      if (!missing.length) continue
      records.push({
        kind: 'production',
        id: r.id,
        title: r.show,
        organizers: recordOrganizerIds(mod.default.company, r.organizers),
        file: dataPath(key),
        firstDate: r.performances.map((p) => p.date).sort()[0],
        missing
      })
    }
  }

  for (const [key, mod] of Object.entries(activities)) {
    for (const a of mod.default.activities) {
      const organizers = recordOrganizerIds(mod.default.company, a.organizers)
      const primaryVenue = companies.find((c) => c.id === organizers[0])?.primaryVenue
      const missing = activityGaps(a, primaryVenue, today)
      if (!missing.length) continue
      records.push({
        kind: a.type,
        id: a.id,
        title: activityTitle(
          a,
          Object.values(shows).flatMap((m) => m.default.runs)
        ),
        organizers,
        file: dataPath(key),
        firstDate: a.dates.map((d) => d.date).filter(Boolean).sort()[0],
        missing
      })
    }
  }

  records.sort((a, b) => (a.firstDate ?? '9999').localeCompare(b.firstDate ?? '9999'))
  return new Response(JSON.stringify({ generated: today, records }, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
