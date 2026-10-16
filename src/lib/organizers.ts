import type { CompanyEntry } from '../types.ts'

// Who puts on a production or activity. Every record has one or more organizers, main
// organizer first. A record in a company's own data file is organized by that company;
// a production may add co-producers in its `organizers` field. A record in an
// `other-<year>` file names its organizer(s) in `organizers`. Auditions and events have
// exactly one organizer — co-producers are for productions only. "Other" is only a
// group name (organizers that aren't majors) — never an organizer itself. Shared by
// pages, feeds, emails and the /admin editors (served as /admin/organizers.js).
// See docs/notifications-spec.md.

/** The data-file bucket for organizers without their own files. Not an organizer. */
export const OTHER_FILE = 'other'
/** Sentinel company entries that are never organizers. */
const SENTINELS = new Set(['admin', OTHER_FILE])

/** Organizer ids for a record in `fileCompany`'s file, main organizer first. */
export function recordOrganizerIds(fileCompany: string, organizers?: string[]): string[] {
  const listed = (organizers || []).filter(Boolean)
  if (fileCompany === OTHER_FILE) return listed
  return [fileCompany, ...listed.filter((id) => id !== fileCompany)]
}

function entry(id: string, companies: CompanyEntry[]) {
  return companies.find((c) => c.id === id)
}

/** Display name(s): "Santa Cruz Shakespeare & Actors' Theatre". Unknown ids show as-is. */
export function organizerName(ids: string[], companies: CompanyEntry[]) {
  return ids.map((id) => entry(id, companies)?.name || id).join(' & ')
}

/** Short label(s) for tight spaces: "SCS / AT". */
export function organizerLabel(ids: string[], companies: CompanyEntry[]) {
  return ids.map((id) => entry(id, companies)?.abvName || id).join(' / ')
}

/** The organizers' entries, in order, skipping unknown ids. */
export function organizerEntries(ids: string[], companies: CompanyEntry[]) {
  return ids.map((id) => entry(id, companies)).filter((c): c is CompanyEntry => !!c)
}

/** The majors, in `majorCode` order. */
export function majors(companies: CompanyEntry[]) {
  return companies.filter((c) => c.major).sort((a, b) => (a.majorCode ?? 0) - (b.majorCode ?? 0))
}

/** Organizers whose records are filed under Other (they have no data files of their own). */
export function otherOrganizers(companies: CompanyEntry[]) {
  return companies.filter((c) => c.filedUnderOther).sort((a, b) => a.name.localeCompare(b.name))
}

/** Every real organizer (sentinels excluded), for co-producer pickers. */
export function allOrganizers(companies: CompanyEntry[]) {
  return companies.filter((c) => !SENTINELS.has(c.id)).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Problems with a record's `organizers` field, given the file it's in. Productions may
 * have co-producers; auditions and events (`coProducers: false`) may not.
 */
export function organizerErrors(
  fileCompany: string,
  organizers: string[] | undefined,
  companies: CompanyEntry[],
  { coProducers = true } = {}
): string[] {
  const errors: string[] = []
  const listed = organizers || []
  const seen = new Set<string>()
  for (const id of listed) {
    const c = entry(id, companies)
    if (!c || SENTINELS.has(id)) errors.push(`organizer "${id}" isn't in the companies list`)
    if (seen.has(id)) errors.push(`organizer "${id}" is listed twice`)
    seen.add(id)
  }
  const maxListed = fileCompany === OTHER_FILE ? 1 : 0
  if (!coProducers && listed.length > maxListed)
    errors.push('auditions and events have one organizer — co-producers are for productions only')
  if (fileCompany === OTHER_FILE) {
    if (!listed.length) errors.push('Organizer is required')
    else {
      const main = entry(listed[0], companies)
      if (main && !SENTINELS.has(main.id) && !main.filedUnderOther)
        errors.push(
          `${main.name} has its own data files — file this record under that company instead`
        )
    }
  } else if (listed.includes(fileCompany)) {
    errors.push('a co-producer repeats the company this record is filed under')
  }
  return errors
}
