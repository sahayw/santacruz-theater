// Constrained string unions matching the editor's dropdown options exactly.
// Empty string is a valid value for all of these (editor allows unset).

export type Company = 'SCS' | 'AT' | 'MCT' | 'Renegade' | 'Cabrillo' | 'ABT' | 'Other' | '';

export type Genre = 'Drama' | 'Musical' | 'Comedy' | 'Tragedy' | 'Other' | '';

// G = The Grove (SCS), VMB = Veterans Memorial Building, PH = Park Hall (MCT),
// AT = Actors' Theatre, CCT = Cabrillo Crocker Theater
export type Venue = 'G' | 'VMB' | 'PH' | 'AT' | 'CCT' | 'Other' | '';

export type PerfType =
  | ''
  | 'Preview'
  | 'Opening'
  | 'Closing'
  | 'Talk-back';

/** One date/time slot within a run. */
export interface Performance {
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM (24-hour)
  perfType: PerfType;
  discounts: string;  // non-empty overrides Run.discounts
  ticketsUrl: string; // non-empty overrides Run.ticketsUrl
}

/** A single production run — the unit produced and consumed by the editor. */
export interface Run {
  id: string;         // "run-<timestamp>", stable identifier
  company: Company;
  showAbv: string;    // short display label, e.g. "Much Ado"
  show: string;       // full title, e.g. "Much Ado About Nothing (Shakespeare)"
  description?: string; // optional narrative paragraph; supports **bold** and *italic*
  genre: Genre;
  venue: Venue;
  price: string;
  discounts: string;
  infoUrl: string;
  ticketsUrl: string;
  performances: Performance[];
}

/** Shape of data/sc-theater-runs.json — the editor's two-tier export format. */
export interface RunsFile {
  runs: Run[];
}

/**
 * Flat record for calendar and list views.
 * One entry per date/time slot; run-level metadata is merged in.
 * discounts and ticketsUrl are already resolved (performance override wins).
 */
export interface PerformanceEvent {
  runId: string;
  company: Company;
  showAbv: string;
  show: string;
  description: string;
  genre: Genre;
  venue: Venue;
  price: string;
  discounts: string;
  infoUrl: string;
  ticketsUrl: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM (24-hour)
  perfType: PerfType;
}
