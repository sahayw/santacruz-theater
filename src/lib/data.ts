import type { Run, ShowsFile, PerformanceEvent, Activity, ActivitiesFile, Genre, ServiceListing, ServicesFile, ServiceCategory, ServiceCategoriesFile } from '../types.ts'

function coerceGenre(raw: unknown): Genre[] {
  if (Array.isArray(raw)) return raw as Genre[]
  return raw && typeof raw === 'string' ? [raw as Genre] : []
}

const modules = import.meta.glob<{ default: ShowsFile }>('../../data/shows/**/*.json', {
  eager: true
})
const allRuns: Run[] = Object.values(modules).flatMap((m) =>
  m.default.runs.map((r) => ({ ...r, genre: coerceGenre((r as unknown as Record<string, unknown>).genre) }))
)

/** Raw run-based data. Use for run/show card views. */
export async function getShows(): Promise<Run[]> {
  return allRuns
}

/**
 * Flat array of individual performance events, sorted by date then time.
 * Each entry carries its parent run's metadata.
 * Per-performance discounts and ticketsUrl override the run-level defaults.
 */
export async function getPerformances(): Promise<PerformanceEvent[]> {
  const events: PerformanceEvent[] = []

  for (const run of allRuns) {
    for (const perf of run.performances) {
      events.push({
        runId: run.id,
        company: run.company,
        showAbv: run.showAbv,
        show: run.show,
        description: run.description || '',
        genre: run.genre,
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

  return events.sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time)
  )
}

export interface ActivityEvent extends Activity {
  company: string
  year: number
}

export function getServices(): ServiceListing[] {
  const file = (
    import.meta.glob<{ default: ServicesFile }>('../../data/sc-theater-services.json', { eager: true })
  )
  const data = Object.values(file)[0]?.default
  return (data?.listings ?? []).filter((l) => l.active)
}

export function getServiceCategories(): ServiceCategory[] {
  const file = (
    import.meta.glob<{ default: ServiceCategoriesFile }>('../../data/sc-theater-service-categories.json', { eager: true })
  )
  const data = Object.values(file)[0]?.default
  return data?.categories ?? []
}

export function getActivities(): ActivityEvent[] {
  const files = import.meta.glob<{ default: ActivitiesFile }>('../../data/activities/**/*.json', {
    eager: true
  })
  const events: ActivityEvent[] = []
  for (const mod of Object.values(files)) {
    const file = mod.default
    for (const a of file.activities) {
      events.push({ ...a, genre: coerceGenre((a as unknown as Record<string, unknown>).genre), company: file.company, year: file.year })
    }
  }
  return events.sort((a, b) => {
    const da = a.dates[0]?.date ?? ''
    const db = b.dates[0]?.date ?? ''
    return da.localeCompare(db)
  })
}
