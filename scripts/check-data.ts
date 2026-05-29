/**
 * Dry-run data check: prints show count, performance count, and date range.
 * Reads data/shows/**\/*.json directly (import.meta.glob is Vite-only).
 * Run with: npm run check-data
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'
import type { Run, ShowsFile, PerformanceEvent } from '../src/types.ts'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const root = resolve(__dirname, '..')
const showsDir = resolve(root, 'data/shows')

const yearDirs = readdirSync(showsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

const allRuns: Run[] = []
for (const year of yearDirs) {
  const yearDir = join(showsDir, year)
  for (const file of readdirSync(yearDir).filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(join(yearDir, file), 'utf8')) as ShowsFile
    allRuns.push(...data.runs)
  }
}

const events: PerformanceEvent[] = allRuns.flatMap(run =>
  run.performances.map(perf => ({
    runId:       run.id,
    company:     run.company,
    showAbv:     run.showAbv,
    show:        run.show,
    description: run.description || '',
    genre:       run.genre,
    venue:       run.venue,
    price:       run.price,
    discounts:   perf.discounts  || run.discounts,
    infoUrl:     run.infoUrl,
    ticketsUrl:  perf.ticketsUrl || run.ticketsUrl,
    date:        perf.date,
    time:        perf.time,
    perfType:    perf.perfType,
  }))
).sort((a, b) =>
  a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time)
)

const firstDate = events[0]?.date ?? '—'
const lastDate  = events[events.length - 1]?.date ?? '—'

const byCompany: Record<string, number> = {}
const byRun: Record<string, number> = {}
for (const p of events) {
  byCompany[p.company] = (byCompany[p.company] ?? 0) + 1
  const key = `${p.company} · ${p.showAbv}`
  byRun[key] = (byRun[key] ?? 0) + 1
}

console.log('─────────────────────────────────────────')
console.log(`Shows (runs) loaded : ${allRuns.length}`)
console.log(`Total performances  : ${events.length}`)
console.log(`Date range          : ${firstDate} → ${lastDate}`)
console.log('')
console.log('By company:')
for (const [co, n] of Object.entries(byCompany).sort()) {
  console.log(`  ${String(co).padEnd(10)} ${n} performance${n === 1 ? '' : 's'}`)
}
console.log('')
console.log('By run:')
for (const [label, n] of Object.entries(byRun)) {
  console.log(`  ${label.padEnd(34)} ${n}`)
}
console.log('─────────────────────────────────────────')
