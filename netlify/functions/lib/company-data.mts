/**
 * Local-file company lookups, used by activities-data.mts.
 *
 * Reads data/sc-theater-companies.json via fs from the function bundle (see
 * [functions].included_files in netlify.toml) rather than the GitHub Contents API.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface CompanyRecord {
  id: string
  name: string
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

