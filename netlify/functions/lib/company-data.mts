/**
 * Local-file company lookups, shared by activities-data.mts, shows-data.mts, and
 * sync-calendar.mts.
 *
 * Reads data/sc-theater-companies.json via fs from the function bundle (see
 * [functions].included_files in netlify.toml) rather than the GitHub Contents API.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface CompanyRecord {
  id: string
  name: string
  primaryVenue?: string
}

const DATA_ROOT = join(process.cwd(), 'data')

function loadCompanies(): CompanyRecord[] {
  try {
    const raw = readFileSync(join(DATA_ROOT, 'sc-theater-companies.json'), 'utf-8')
    const { companies } = JSON.parse(raw) as { companies: CompanyRecord[] }
    return companies
  } catch (e) {
    console.error('company-data: failed to read sc-theater-companies.json:', e)
    return []
  }
}

export function loadCompanyNames(): Record<string, string> {
  return Object.fromEntries(loadCompanies().map(c => [c.id, c.name]))
}

/** company id -> primaryVenue (venue name or code), for companies that have one set. */
export function loadCompanyPrimaryVenues(): Record<string, string> {
  const entries = loadCompanies()
    .filter((c): c is CompanyRecord & { primaryVenue: string } => Boolean(c.primaryVenue))
    .map(c => [c.id, c.primaryVenue] as const)
  return Object.fromEntries(entries)
}
