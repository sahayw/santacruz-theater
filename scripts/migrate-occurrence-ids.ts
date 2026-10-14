/**
 * One-time, idempotent backfill of stable occurrence ids: `perf-<epoch-ms>` on every
 * Performance in data/shows and `session-<epoch-ms>` on every ActivityDate in
 * data/activities that lacks one. Nothing else in a file changes — in particular
 * `updatedAt` is never touched, since the email digest treats a newer `updatedAt` as an
 * edit. Files keep the editor's 2-space JSON and their existing trailing-newline style.
 *
 * The /admin editors also backfill missing ids on load, so this is only needed for files
 * no one opens. Re-running it is safe; a second run changes nothing.
 *
 * Run with: npx tsx scripts/migrate-occurrence-ids.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createIdGenerator,
  ensurePerformanceIds,
  ensureSessionIds
} from '../src/lib/occurrence-ids.ts'

export interface MigrationResult {
  performances: number
  sessions: number
  filesChanged: string[]
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(dir, d.name))
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(dir, d.name, f))
    )
    .sort()
}

function rewrite(file: string, update: (data: any) => number, changed: string[]): number {
  const raw = readFileSync(file, 'utf8')
  const data = JSON.parse(raw)
  const added = update(data)
  if (added) {
    const trailing = raw.endsWith('\n') ? '\n' : ''
    writeFileSync(file, JSON.stringify(data, null, 2) + trailing)
    changed.push(file)
  }
  return added
}

export function migrateOccurrenceIds(dataRoot: string, now?: () => number): MigrationResult {
  const nextPerfId = createIdGenerator('perf', now)
  const nextSessionId = createIdGenerator('session', now)
  const filesChanged: string[] = []
  let performances = 0
  let sessions = 0

  for (const file of jsonFiles(join(dataRoot, 'shows'))) {
    performances += rewrite(
      file,
      (d) => ensurePerformanceIds(d.runs ?? [], nextPerfId),
      filesChanged
    )
  }
  for (const file of jsonFiles(join(dataRoot, 'activities'))) {
    sessions += rewrite(
      file,
      (d) => ensureSessionIds(d.activities ?? [], nextSessionId),
      filesChanged
    )
  }
  return { performances, sessions, filesChanged }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '../..')
  const result = migrateOccurrenceIds(join(root, 'data'))
  console.log(`Performance ids added : ${result.performances}`)
  console.log(`Session ids added     : ${result.sessions}`)
  console.log(`Files changed         : ${result.filesChanged.length}`)
  result.filesChanged.forEach((f) => console.log(`  - ${f.slice(root.length + 1)}`))
}
