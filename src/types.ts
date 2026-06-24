export type Genre = 'Drama' | 'Musical' | 'Comedy' | 'Other'

export type PerfType = '' | 'Preview' | 'Opening' | 'Closing' | 'Talk-back'

/** One date/time slot within a run. */
export interface Performance {
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
  description?: string // optional narrative paragraph; supports **bold** and *italic*
  genre: Genre[]
  venue: string
  price: string
  discounts: string
  infoUrl: string
  ticketsUrl: string
  performances: Performance[]
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
  venueCode?: string
  website?: string
  logo?: string
  logoDark?: boolean
  editors?: CompanyEditor[]
  adminOnly?: boolean
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
  date: string // YYYY-MM-DD
  startTime: string // HH:MM 24-hour
  endTime?: string // HH:MM 24-hour (optional)
  notes?: string // e.g. "First come, first served"
  location?: AuditionLocation
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
  acting?: string
  singing?: string
  dance?: string
  bring?: string[]
}

export type ActivityType = 'audition' | 'event'

export interface Activity {
  id: string // "activity-<timestamp>"
  type: ActivityType
  title: string // production name (audition) or event name
  briefDescription?: string // event only: short blurb for collapsed card header
  description?: string // full description; supports **bold** and *italic*
  genre: Genre[]
  dates: ActivityDate[]
  organizerName?: string // required when company is "other"
  organizerUrl?: string // optional organizer website when company is "other"
  rolesAvailable?: AuditionRole[] // audition only; suppressed when empty
  prep?: AuditionPrep // audition only
  rehearsalStart?: string // audition only; YYYY-MM-DD
  openingDate?: string // audition only; YYYY-MM-DD
  productionId?: string // audition only; soft ref to a Run id
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
  description?: string // supports **bold** and *italic*
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
  runId: string
  company: string
  showAbv: string
  show: string
  description: string
  genre: Genre[]
  venue: string
  price: string
  discounts: string
  infoUrl: string
  ticketsUrl: string
  date: string // YYYY-MM-DD
  time: string // HH:MM (24-hour)
  perfType: PerfType
}
