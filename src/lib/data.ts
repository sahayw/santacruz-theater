import type { Run, ShowsFile, PerformanceEvent, Audition, AuditionsFile } from '../types.ts';
import type { Company } from '../types.ts';

const modules = import.meta.glob<{ default: ShowsFile }>('../../data/shows/**/*.json', { eager: true });
const allRuns: Run[] = Object.values(modules).flatMap(m => m.default.runs);

/** Raw run-based data. Use for run/show card views. */
export async function getShows(): Promise<Run[]> {
  return allRuns;
}

/**
 * Flat array of individual performance events, sorted by date then time.
 * Each entry carries its parent run's metadata.
 * Per-performance discounts and ticketsUrl override the run-level defaults.
 */
export async function getPerformances(): Promise<PerformanceEvent[]> {
  const events: PerformanceEvent[] = [];

  for (const run of allRuns) {
    for (const perf of run.performances) {
      events.push({
        runId:       run.id,
        company:     run.company,
        showAbv:     run.showAbv,
        show:        run.show,
        description: run.description || '',
        genre:       run.genre,
        venue:      run.venue,
        price:      run.price,
        discounts:  perf.discounts  || run.discounts,
        infoUrl:    run.infoUrl,
        ticketsUrl: perf.ticketsUrl || run.ticketsUrl,
        date:       perf.date,
        time:       perf.time,
        perfType:   perf.perfType,
      });
    }
  }

  return events.sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time),
  );
}

export interface AuditionEvent extends Audition {
  company: Company;
  year: number;
}

export function getAuditions(): AuditionEvent[] {
  const files = import.meta.glob<{ default: AuditionsFile }>(
    '../../data/auditions/**/*.json',
    { eager: true },
  );
  const events: AuditionEvent[] = [];
  for (const mod of Object.values(files)) {
    const file = mod.default;
    for (const a of file.auditions) {
      events.push({ ...a, company: file.company, year: file.year });
    }
  }
  return events.sort((a, b) => {
    const da = a.auditionDates[0]?.date ?? '';
    const db = b.auditionDates[0]?.date ?? '';
    return da.localeCompare(db);
  });
}
