export type Genre = 'Drama' | 'Musical' | 'Comedy' | 'Other'

export type PerfType = '' | 'Preview' | 'Opening' | 'Closing' | 'Talk-back'

/** One date/time slot within a run. */
export interface Performance {
  id: string // "perf-<timestamp>", stable identifier (calendar feed UID)
  date: string // YYYY-MM-DD
  time: string // HH:MM (24-hour)
  perfType: PerfType
  discounts: string // non-empty overrides Run.discounts
  ticketsUrl: string // non-empty overrides Run.ticketsUrl
}

/** A single production run — the unit produced and consumed by the editor. */
export interface Run {
  id: string // "run-<timestamp>", stable identifier
  company: string
  showAbv: string // short display label, e.g. "Much Ado"
  show: string // full title, e.g. "Much Ado About Nothing (Shakespeare)"
  description?: string // optional narrative; supports bold, italic, links, and bullet lists
  genre: Genre[]
  venue: string // venue code from data/sc-theater-venues.json
  room?: string // optional space within the venue, e.g. "Second Stage"
  price: string
  discounts: string
  infoUrl: string
  ticketsUrl: string
  performances: Performance[]
  organizers?: string[] // organizer ids, main first; see recordOrganizerIds() in src/lib/organizers.ts
  updatedAt?: string // ISO 8601; set by the editor when the run changes (calendar feed LAST-MODIFIED)
}

/** Shape of each data/shows/<year>/<company>-<year>.json file. */
export interface ShowsFile {
  company: string
  year: number
  runs: Run[]
}

/** One entry in a CompanyEntry's editors array. */
export interface CompanyEditor {
  email: string
  datasets: string[] // e.g. ['calendar', 'activities']
}

/** Shape of data/sc-theater-companies.json. */
export interface CompanyEntry {
  id: string
  abvName: string
  name: string
  primaryVenue?: string
  website?: string
  logo?: string
  logoDark?: boolean
  logoFill?: boolean
  editors?: CompanyEditor[]
  adminOnly?: boolean // the "admin" and "other" sentinels
  filedUnderOther?: boolean // an organizer without its own data files; its records live in other-<year> files
  major?: boolean // offered as a checkbox in subscriptions; has its own calendar colour
  majorCode?: number // majors only: 1, 2, 4, 8… permanent; numbers the filtered feeds
  colour?: string // majors only: calendar colour (hex)
  onCompaniesPage?: boolean // listed on /companies
}

/** Shape of data/sc-theater-venues.json entries. */
export interface Venue {
  code: string
  name: string
  address?: string
  website?: string
}

export type AuditionGender = 'female' | 'male' | 'any'
export type AuditionRoleType = 'lead' | 'supporting' | 'ensemble'

export interface AuditionRole {
  role: string
  type: AuditionRoleType
  gender: AuditionGender
  ageRange?: string // e.g. "30s", "20s–40s", "18+", "Any"
  voicePart?: string // e.g. "Soprano", "Baritone" — musicals only
  description?: string
}

export interface ActivityDate {
  id: string // "session-<timestamp>", stable identifier (calendar feed UID)
  date: string // YYYY-MM-DD
  startTime: string // HH:MM 24-hour
  endTime?: string // HH:MM 24-hour (optional)
  notes?: string // e.g. "First come, first served"
  venue?: string // venue code from data/sc-theater-venues.json
  location?: AuditionLocation // one-off place not in the venue list (used when venue is unset)
  room?: string // optional space within the venue, e.g. "Mainstage"
}

export interface AuditionLocation {
  name: string
  address?: string
}

export interface ActivityContact {
  name?: string
  email?: string
  phone?: string
}

export interface AuditionPrep {
  acting?: string // may contain newlines; rendered line-for-line
  singing?: string
  dance?: string
  bring?: string[] // one entry per line; rendered line-for-line
}

export type ActivityType = 'audition' | 'event'

export interface Activity {
  id: string // "activity-<timestamp>"
  type: ActivityType
  title: string // production name (audition) or event name
  briefDescription?: string // event only: short blurb for collapsed card header
  description?: string // full description; supports bold, italic, links, and bullet lists
  genre: Genre[]
  dates: ActivityDate[]
  organizers?: string[] // organizer ids, main first; see recordOrganizerIds() in src/lib/organizers.ts
  rolesAvailable?: AuditionRole[] // audition only; suppressed when empty
  prep?: AuditionPrep // audition only
  virtualSubmission?: boolean // audition only; no scheduled dates — always "upcoming" until closed
  datesByRequest?: boolean // event only; no scheduled dates — always "upcoming" until closed
  closed?: boolean // either type; retained but excluded from "upcoming" (retire without deleting)
  rehearsalStart?: string // audition only; YYYY-MM-DD
  openingDate?: string // audition only; YYYY-MM-DD
  productionId?: string // audition only; a Run id (validated; the run may not have dates yet)
  cost?: string // event only; free text e.g. "Free", "$20"
  registerUrl?: string // event only; registration link
  contact?: ActivityContact
  noticeUrl?: string // primary info/notice URL
  productionUrl?: string // audition only; production page URL
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface ActivitiesFile {
  company: string
  year: number
  activities: Activity[]
}

export interface ServiceSubcategory {
  id: string
  label: string
  description?: string // pill text override; falls back to label when absent
}

export interface ServiceCategory {
  id: string
  label: string
  subcategories: ServiceSubcategory[]
}

export interface ServiceCategoriesFile {
  categories: ServiceCategory[]
}

export interface ServiceContact {
  name?: string
  tel?: string
  email?: string
  address?: string
}

export interface ServiceListing {
  id: string // "service-<timestamp>"
  name: string
  categories: string[] // subcategory ids (leaf-level only)
  contact: ServiceContact
  photo?: string // local path e.g. "/images/services/jane-smith.jpg"
  url?: string
  description?: string // supports bold, italic, links, and bullet lists
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface ServicesFile {
  listings: ServiceListing[]
}

/**
 * Flat record for calendar and list views.
 * One entry per date/time slot; run-level metadata is merged in.
 * discounts and ticketsUrl are already resolved (performance override wins).
 */
export interface PerformanceEvent {
  id: string // Performance.id
  runId: string
  company: string
  showAbv: string
  show: string
  description: string
  genre: Genre[]
  organizers: string[] // organizer ids, main first
  organizerName: string // display name(s), e.g. "Santa Cruz Shakespeare & Actors' Theatre"
  organizerLabel: string // short label(s), e.g. "SCS / AT"
  venue: string // venue display name (with room)
  venueCode: string
  price: string
  discounts: string
  infoUrl: string
  ticketsUrl: string
  date: string // YYYY-MM-DD
  time: string // HH:MM (24-hour)
  perfType: PerfType
}
