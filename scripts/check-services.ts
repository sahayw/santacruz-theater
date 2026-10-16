/**
 * Validates data/sc-theater-services.json with servicesFileCheck() (src/lib/file-checks.ts,
 * shared with the save function).
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serviceSubcategories, servicesFileCheck } from '../src/lib/file-checks.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LABEL = 'sc-theater-services.json'

const readData = (f: string) => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf-8'))
// Listings store leaf-level subcategory ids only. The categories file is hand-edited,
// so a renamed or removed subcategory would leave listings pointing at a dead id.
const { errors, warnings } = servicesFileCheck(
  readData(LABEL),
  LABEL,
  serviceSubcategories(readData('sc-theater-service-categories.json'))
)

if (errors.length) {
  console.error(`\nServices validation failed — ${errors.length} error(s):\n`)
  errors.forEach((e) => console.error('  ✗', e))
  process.exit(1)
} else {
  console.log('Services validation passed.')
}
if (warnings.length) {
  console.log(`Missing details (${warnings.length}):`)
  warnings.forEach((w) => console.log('  -', w))
}
