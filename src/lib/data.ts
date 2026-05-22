import runsData from '../../data/sc-theater-runs.json';
import type { Run, RunsFile, PerformanceEvent } from '../types.ts';

const { runs } = runsData as RunsFile;

/** Raw run-based data. Use for run/show card views. */
export async function getShows(): Promise<Run[]> {
  return runs;
}

/**
 * Flat array of individual performance events, sorted by date then time.
 * Each entry carries its parent run's metadata.
 * Per-performance discounts and ticketsUrl override the run-level defaults.
 */
export async function getPerformances(): Promise<PerformanceEvent[]> {
  const events: PerformanceEvent[] = [];

  for (const run of runs) {
    for (const perf of run.performances) {
      events.push({
        runId:      run.id,
        company:    run.company,
        showAbv:    run.showAbv,
        show:       run.show,
        genre:      run.genre,
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
