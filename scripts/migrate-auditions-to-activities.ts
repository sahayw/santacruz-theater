/**
 * One-time migration: data/auditions/ → data/activities/
 *
 * For each data/auditions/<year>/<co>-auditions-<year>.json:
 *   - Creates data/activities/<year>/<co>-activities-<year>.json
 *   - Renames array key: auditions → activities
 *   - Renames record fields: production→title, auditionDates→dates, auditionNoticeUrl→noticeUrl
 *   - Adds type: "audition" to every record
 *   - Renames each id from "audition-<ts>" → "activity-<ts>"
 *
 * Also updates sc-theater-companies.json: datasets "auditions" → "activities"
 *
 * The old data/auditions/ tree is left in place; remove it manually after verifying.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const AUDITIONS_ROOT = join(ROOT, 'data', 'auditions')
const ACTIVITIES_ROOT = join(ROOT, 'data', 'activities')
const COMPANIES_FILE = join(ROOT, 'data', 'sc-theater-companies.json')

function migrateRecord(a: Record<string, unknown>): Record<string, unknown> {
  const rec: Record<string, unknown> = { ...a }

  // Coerce genre string → array
  if (typeof rec.genre === 'string') {
    rec.genre = rec.genre ? [rec.genre] : []
  } else if (!Array.isArray(rec.genre)) {
    rec.genre = []
  }

  // Add type discriminant
  if (!rec.type) rec.type = 'audition'

  // Rename id
  if (typeof rec.id === 'string' && rec.id.startsWith('audition-')) {
    rec.id = rec.id.replace('audition-', 'activity-')
  }

  // Rename production → title
  if ('production' in rec && !('title' in rec)) {
    rec.title = rec.production
    delete rec.production
  }

  // Rename auditionDates → dates
  if ('auditionDates' in rec && !('dates' in rec)) {
    rec.dates = rec.auditionDates
    delete rec.auditionDates
  }

  // Rename auditionNoticeUrl → noticeUrl
  if ('auditionNoticeUrl' in rec && !('noticeUrl' in rec)) {
    rec.noticeUrl = rec.auditionNoticeUrl
    delete rec.auditionNoticeUrl
  }

  return rec
}

// Migrate audition data files
let yearDirs: string[] = []
try {
  yearDirs = readdirSync(AUDITIONS_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
} catch {
  console.log('No data/auditions/ directory found — nothing to migrate.')
  process.exit(0)
}

let fileCount = 0
let recordCount = 0

for (const year of yearDirs) {
  const srcDir = join(AUDITIONS_ROOT, year)
  const dstDir = join(ACTIVITIES_ROOT, year)
  mkdirSync(dstDir, { recursive: true })

  const files = readdirSync(srcDir).filter(f => /^.+-auditions-\d{4}\.json$/.test(f))
  for (const file of files) {
    const srcPath = join(srcDir, file)
    const dstFile = file.replace(/-auditions-(\d{4})\.json$/, '-activities-$1.json')
    const dstPath = join(dstDir, dstFile)

    const raw = JSON.parse(readFileSync(srcPath, 'utf-8'))
    const auditions: Record<string, unknown>[] = raw.auditions || []

    const migrated = {
      company: raw.company,
      year: raw.year,
      activities: auditions.map(migrateRecord)
    }

    writeFileSync(dstPath, JSON.stringify(migrated, null, 2) + '\n', 'utf-8')
    console.log(`  ✓ ${srcPath.replace(ROOT + '/', '')} → ${dstPath.replace(ROOT + '/', '')} (${auditions.length} records)`)
    fileCount++
    recordCount += auditions.length
  }
}

// Update datasets in sc-theater-companies.json
const companiesRaw = readFileSync(COMPANIES_FILE, 'utf-8')
const companiesData = JSON.parse(companiesRaw)
let datasetUpdates = 0

for (const company of companiesData.companies) {
  if (!company.editors) continue
  for (const editor of company.editors) {
    if (!Array.isArray(editor.datasets)) continue
    const idx = editor.datasets.indexOf('auditions')
    if (idx !== -1) {
      editor.datasets[idx] = 'activities'
      datasetUpdates++
    }
  }
}

if (datasetUpdates > 0) {
  writeFileSync(COMPANIES_FILE, JSON.stringify(companiesData, null, 2) + '\n', 'utf-8')
  console.log(`  ✓ sc-theater-companies.json: updated ${datasetUpdates} "auditions" dataset reference(s) to "activities"`)
}

console.log(`\nDone: ${fileCount} file(s) migrated, ${recordCount} record(s) converted.`)
console.log('The original data/auditions/ tree has been left in place.')
console.log('After verifying, remove it with: rm -rf data/auditions')
