/**
 * Local-file venue lookup, for the Google Calendar sync function.
 *
 * Reads data/sc-theater-venues.json via fs from the function bundle (see
 * [functions].included_files in netlify.toml) rather than the GitHub Contents API.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface Venue {
  code: string
  name: string
  address: string
  website: string
}

const DATA_ROOT = join(process.cwd(), 'data')

function loadVenues(): Venue[] {
  try {
    const raw = readFileSync(join(DATA_ROOT, 'sc-theater-venues.json'), 'utf-8')
    const { venues } = JSON.parse(raw) as { venues: Venue[] }
    return venues
  } catch (e) {
    console.error('venues-data: failed to read sc-theater-venues.json:', e)
    return []
  }
}

const venues = loadVenues()

export interface ResolvedVenue {
  name: string
  address?: string
}

/** Resolves a venue name or code to its canonical name + address; falls back to the raw text passed in as the name when unmatched. */
export function resolveVenue(venueNameOrCode: string): ResolvedVenue {
  const match = venues.find(v => v.name === venueNameOrCode || v.code === venueNameOrCode)
  return match ? { name: match.name, address: match.address } : { name: venueNameOrCode }
}
