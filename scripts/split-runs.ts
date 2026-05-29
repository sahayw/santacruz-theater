/**
 * One-off migration: splits data/sc-theater-runs.json into per-company per-year files.
 * Output: data/shows/<year>/<company-id>-<year>.json
 * Run with: npx tsx scripts/split-runs.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Run, RunsFile } from '../src/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const source = JSON.parse(
  readFileSync(resolve(root, 'data/sc-theater-runs.json'), 'utf8')
) as RunsFile

const companySlug: Record<string, string> = {
  SCS: 'scs',
  AT: 'at',
  MCT: 'mct',
  Renegade: 'renegade',
  Cabrillo: 'cabrillo',
  ABT: 'abt',
  Other: 'other',
  '': 'other',
}

const buckets = new Map<string, { company: string; year: number; runs: Run[] }>()

for (const run of source.runs) {
  const year = parseInt(run.performances[0]?.date.slice(0, 4) ?? '2026', 10)
  const slug = companySlug[run.company] ?? 'other'
  const key = `${slug}-${year}`
  if (!buckets.has(key)) {
    buckets.set(key, { company: run.company, year, runs: [] })
  }
  buckets.get(key)!.runs.push(run)
}

for (const [key, data] of buckets) {
  const dir = resolve(root, `data/shows/${data.year}`)
  mkdirSync(dir, { recursive: true })
  const path = resolve(dir, `${key}.json`)
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`Wrote ${path.replace(root + '/', '')} (${data.runs.length} runs)`)
}

console.log(`\nDone — ${buckets.size} files written.`)
