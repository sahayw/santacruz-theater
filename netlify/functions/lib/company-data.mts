/**
 * Local-file reference lists — companies/organizers and venues — used by
 * activities-data.mts.
 *
 * Reads data/sc-theater-companies.json and data/sc-theater-venues.json via fs from the
 * function bundle (see [functions].included_files in netlify.toml) rather than the
 * GitHub Contents API.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CompanyEntry, Venue } from '../../../src/types.ts'

const DATA_ROOT = join(process.cwd(), 'data')

function readList<T>(file: string, key: string): T[] {
  try {
    return JSON.parse(readFileSync(join(DATA_ROOT, file), 'utf-8'))[key] as T[]
  } catch (e) {
    console.error(`company-data: failed to read ${file}:`, e)
    return []
  }
}

export function loadCompanies(): CompanyEntry[] {
  return readList<CompanyEntry>('sc-theater-companies.json', 'companies')
}

export function loadVenues(): Venue[] {
  return readList<Venue>('sc-theater-venues.json', 'venues')
}
