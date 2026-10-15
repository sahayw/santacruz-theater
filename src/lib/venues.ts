import type { ActivityDate, Venue } from '../types.ts'

// Where things happen. Productions and audition/event sessions refer to a venue in
// data/sc-theater-venues.json by its code; a session may instead give a one-off
// `location` for an ad-hoc place. Either may add a `room` within the building. Shared by
// pages, feeds, emails and the /admin editors (served as /admin/venues.js).
// See docs/notifications-spec.md.

export interface Place {
  name: string // includes the room, e.g. "UCSC Theater Arts Center, Second Stage"
  address?: string
}

export function venueByCode(code: string | undefined, venues: Venue[]) {
  return code ? venues.find((v) => v.code === code) : undefined
}

function withRoom(name: string, room?: string) {
  return room?.trim() ? `${name}, ${room.trim()}` : name
}

/** A production's venue, or undefined when its code isn't listed. */
export function runPlace(run: { venue: string; room?: string }, venues: Venue[]): Place | undefined {
  const v = venueByCode(run.venue, venues)
  return v ? { name: withRoom(v.name, run.room), address: v.address } : undefined
}

/** A session's listed venue or one-off location, or undefined when it has neither. */
export function sessionPlace(d: ActivityDate, venues: Venue[]): Place | undefined {
  const v = venueByCode(d.venue, venues)
  if (v) return { name: withRoom(v.name, d.room), address: v.address }
  if (d.location?.name?.trim())
    return { name: withRoom(d.location.name.trim(), d.room), address: d.location.address }
  return undefined
}
