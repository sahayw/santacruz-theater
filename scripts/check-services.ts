/**
 * Validates data/sc-theater-services.json against the ServiceListing schema.
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ServiceListing } from '../src/types.ts'
import { listingIssues } from '../src/lib/data-rules.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LABEL = 'sc-theater-services.json'

function isIso8601(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)
}

const errors: string[] = []
const warnings: string[] = []

const file = JSON.parse(readFileSync(join(ROOT, 'data', LABEL), 'utf-8'))
if (!Array.isArray(file.listings)) {
  console.error(`${LABEL}: missing listings array`)
  process.exit(1)
}

const seenIds = new Set<string>()
;(file.listings as Record<string, unknown>[]).forEach((l, i) => {
  const ll = `${LABEL} listings[${i}] (${l.name || l.id || 'no-id'})`
  const err = (msg: string) => errors.push(`${ll}: ${msg}`)

  if (typeof l.id !== 'string' || !l.id.startsWith('service-'))
    err('id must be "service-<timestamp>"')
  else if (seenIds.has(l.id)) err(`duplicate id ${l.id}`)
  else seenIds.add(l.id)
  if (typeof l.name !== 'string') err('name must be a string')
  if (!Array.isArray(l.categories) || l.categories.some((c) => typeof c !== 'string'))
    err('categories must be an array of strings')
  if (typeof l.contact !== 'object' || l.contact === null) err('contact must be an object')
  if (typeof l.active !== 'boolean') err('active must be a boolean')
  if (!isIso8601(l.createdAt)) err('createdAt must be ISO 8601 timestamp')
  if (!isIso8601(l.updatedAt)) err('updatedAt must be ISO 8601 timestamp')
  // Editor-only fields (underscore-prefixed) are stripped on save
  for (const key of Object.keys(l)) if (key.startsWith('_')) err(`editor-only field ${key} saved`)

  // Content rules shared with the /admin editor
  if (typeof l.name === 'string' && Array.isArray(l.categories)) {
    const issues = listingIssues(l as unknown as ServiceListing)
    issues.errors.forEach(err)
    issues.warnings.forEach((m) => warnings.push(`${ll}: ${m}`))
  }
})

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
