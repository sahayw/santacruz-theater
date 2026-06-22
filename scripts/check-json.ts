/**
 * Validates that all JSON files under data/ are syntactically valid.
 * Run with: npm run check-json
 * Also run automatically as part of build and preview.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { resolve, join, relative } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const root = resolve(__dirname, '..')
const dataDir = resolve(root, 'data')

function collectJsonFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...collectJsonFiles(full))
    } else if (entry.endsWith('.json')) {
      files.push(full)
    }
  }
  return files
}

const files = collectJsonFiles(dataDir)
let errors = 0

for (const file of files) {
  const rel = relative(root, file)
  const raw = readFileSync(file, 'utf8')
  try {
    JSON.parse(raw)
  } catch (e) {
    const msg = e instanceof SyntaxError ? e.message : String(e)
    console.error(`✗ ${rel}: ${msg}`)
    errors++
  }
}

if (errors > 0) {
  console.error(`\n${errors} JSON file(s) have syntax errors. Fix them before building.`)
  process.exit(1)
} else {
  console.log(`✓ All ${files.length} JSON files are valid.`)
}
