// How an audition or event is displayed — the shared pieces (docs/feature-guide.md, "How an
// audition or event is displayed"). Used by the /events page, the editor Preview and the
// emails, so pips, wording and the expanded card cannot drift between views.
// Browser-safe: also served to /admin (src/pages/admin/activity-view.js.ts).
import type { ActivityContact, AuditionPrep, AuditionRole } from '../types.ts'
import {
  fmtAudDateRange,
  fmtFullDate,
  fmtShortDate,
  fmtTimeRange,
  renderMd
} from './audition-format.ts'
import { genrePipHtml, type Colour } from './production-view.ts'

export const ACTIVITY_COLOURS: Record<'event' | 'audition' | 'virtual', Colour> = {
  event: { bg: '#e8f4f0', fg: '#1a6b50' },
  audition: { bg: '#fbefd9', fg: '#8a5a12' },
  virtual: { bg: '#eef0f7', fg: '#4a4f80' }
}

export interface ViewSession {
  id: string
  date: string
  startTime?: string
  endTime?: string
  notes?: string
  place?: { name: string; address?: string }
}

export interface ViewActivity {
  id: string
  type: 'audition' | 'event'
  title: string
  genre?: string[]
  closed?: boolean
  virtualSubmission?: boolean
  datesByRequest?: boolean
  briefDescription?: string
  description?: string
  cost?: string
  registerUrl?: string
  noticeUrl?: string
  productionUrl?: string
  openingDate?: string
  rehearsalStart?: string
  notes?: string
  prep?: AuditionPrep
  rolesAvailable?: AuditionRole[]
  contact?: ActivityContact
  dates: ViewSession[]
}

export interface NamedOrganizer {
  name: string
  website?: string
}

export interface DetailOptions {
  /** Organizers to list: those the record names (filed under Other); empty for a company's own. */
  organizers?: NamedOrganizer[]
  /** The public card has per-session "Add to my calendar" and "Download all dates"; Preview omits them. */
  withAdd?: boolean
  /** Maps a session or activity id to the id used in its calendar link. */
  eventId?: (id: string) => string
  /** Shown instead of nothing when there are no dates and no flag explains it (Preview). */
  noDatesNote?: string
}

function esc(v: string) {
  return (v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const datedSessions = (a: ViewActivity) => a.dates.filter((d) => d.date)

/** Type, Virtual and genre pills, in that order — the same in every view that has a full title. */
export function activityPipsHtml(a: Pick<ViewActivity, 'type' | 'virtualSubmission' | 'genre'>) {
  const isAudition = a.type === 'audition'
  return [
    `<span class="type-badge type-${a.type}">${isAudition ? 'Audition' : 'Event'}</span>`,
    isAudition && a.virtualSubmission ? '<span class="type-badge type-virtual">Virtual</span>' : '',
    isAudition ? (a.genre ?? []).map(genrePipHtml).join('') : ''
  ].join('')
}

/** A Closed or Past pill for the Preview (the public card toggles its own by class). */
export function activityStatusPipHtml(status: 'closed' | 'past') {
  return `<span class="status-pip">${status === 'closed' ? 'Closed' : 'Past'}</span>`
}

/** The right-hand date text of a collapsed card: the range, or why there is none. */
export function activityRangeText(a: ViewActivity) {
  if (datedSessions(a).length) return fmtAudDateRange(a.dates)
  if (a.type === 'event' && a.datesByRequest) return 'On request'
  if (a.type === 'audition' && a.virtualSubmission) return 'Virtual submission'
  return ''
}

/** Organizer, opening and rehearsal dates under the title of a collapsed card (plain text). */
export function activityMetaText(
  a: Pick<ViewActivity, 'type' | 'openingDate' | 'rehearsalStart'>,
  organizerName: string
) {
  return [
    organizerName,
    a.type === 'audition' && a.openingDate ? `Opens ${fmtShortDate(a.openingDate)}` : '',
    a.type === 'audition' && a.rehearsalStart
      ? `Rehearsals start ${fmtShortDate(a.rehearsalStart)}`
      : ''
  ]
    .filter(Boolean)
    .join(' · ')
}

export const VIRTUAL_NOTE =
  'Virtual submission — no scheduled audition dates. See the audition notice for how to apply.'

function sessionsHtml(a: ViewActivity, opts: DetailOptions) {
  const rows = datedSessions(a)
  const names = rows.map((d) => d.place?.name).filter(Boolean)
  const shared =
    names.length > 0 && names.every((n) => n === names[0])
      ? rows.find((d) => d.place)?.place
      : undefined
  const note = !rows.length
    ? a.type === 'event' && a.datesByRequest
      ? 'On request'
      : a.type === 'audition' && a.virtualSubmission
        ? VIRTUAL_NOTE
        : (opts.noDatesNote ?? '')
    : ''
  const html = rows
    .map((d, i) => {
      const seenBefore =
        !shared && i > 0 && rows.slice(0, i).some((p) => p.place?.name === d.place?.name)
      return `<div class="detail-date-row" data-date="${esc(d.date)}">
<span class="detail-date-label">${esc(fmtFullDate(d.date))}</span>
<span class="detail-time-label">${esc(fmtTimeRange(d.startTime, d.endTime ?? ''))}</span>
${d.notes ? `<span class="detail-date-note">${esc(d.notes)}</span>` : ''}
${opts.withAdd && !a.closed ? `<button type="button" class="session-add" data-ics-event="sessions/${esc(opts.eventId ? opts.eventId(d.id) : d.id)}">Add to my calendar</button>` : ''}
${
  !shared && d.place
    ? `<div class="detail-date-location"><span class="detail-location-name">${esc(d.place.name)}</span>${!seenBefore && d.place.address ? `<span class="detail-sub"> · ${esc(d.place.address)}</span>` : ''}</div>`
    : ''
}
</div>`
    })
    .join('')
  const sharedHtml = shared
    ? `<div class="detail-date-location" style="margin-top:4px"><span class="detail-location-name">${esc(shared.name)}</span>${shared.address ? `<span class="detail-sub"> · ${esc(shared.address)}</span>` : ''}</div>`
    : ''
  return `<section class="detail-section"><h4 class="detail-section-head">${
    a.type === 'event' ? 'Dates' : 'Audition dates'
  }</h4>${note ? `<p class="detail-virtual-note">${esc(note)}</p>` : ''}${html}${sharedHtml}</section>`
}

function prepHtml(prep: AuditionPrep | undefined) {
  if (!prep) return ''
  const row = (label: string, value: string | undefined) =>
    value
      ? `<div class="detail-prep-row"><span class="prep-label">${label}</span><span class="prep-value">${esc(value)}</span></div>`
      : ''
  const rows = [
    row('Acting', prep.acting),
    row('Singing', prep.singing),
    row('Dance', prep.dance),
    row('Bring', prep.bring?.length ? prep.bring.join('\n') : '')
  ].join('')
  return rows
    ? `<section class="detail-section"><h4 class="detail-section-head">Prepare</h4>${rows}</section>`
    : ''
}

function organizersHtml(organizers: NamedOrganizer[] | undefined) {
  if (!organizers?.length) return ''
  return `<section class="detail-section"><h4 class="detail-section-head">Organizer</h4>${organizers
    .map(
      (o) =>
        `<div class="detail-sub detail-org-name">${esc(o.name)}</div>${o.website ? `<div class="detail-sub" style="overflow-wrap:anywhere"><a href="${esc(o.website)}" class="detail-link-inline" target="_blank" rel="noopener">${esc(o.website)}</a></div>` : ''}`
    )
    .join('')}</section>`
}

function contactHtml(c: ActivityContact | undefined) {
  if (!c || !(c.name || c.email || c.phone)) return ''
  return `<section class="detail-section contact-section"><h4 class="detail-section-head">Contact</h4>${
    c.name ? `<div class="detail-contact-name">${esc(c.name)}</div>` : ''
  }${c.email ? `<div><a href="mailto:${esc(c.email)}" class="detail-link-inline">${esc(c.email)}</a></div>` : ''}${
    c.phone ? `<div class="detail-sub">${esc(c.phone)}</div>` : ''
  }</section>`
}

const roleTypeLabel = (t: string) =>
  t === 'lead' ? 'Lead' : t === 'supporting' ? 'Supp.' : 'Ensemble'

/**
 * Roles as Role / Type / Age (/ Voice). A role's description sits in a full-width row under
 * the role, so the table never grows wider than its column.
 */
function rolesHtml(a: ViewActivity) {
  const roles = a.rolesAvailable ?? []
  if (!roles.length) return ''
  const voice = a.genre?.includes('Musical')
  const cols = voice ? 4 : 3
  const rows = roles
    .map(
      (r) => `<tr${r.description ? ' class="has-desc"' : ''}>
<td class="role-name-cell">${esc(r.role)}</td>
<td class="role-type role-${esc(r.type)}">${roleTypeLabel(r.type)}</td>
<td class="role-age">${esc(r.ageRange ?? '')}</td>${voice ? `<td class="role-voice">${esc(r.voicePart ?? '')}</td>` : ''}
</tr>${r.description ? `<tr class="role-desc-row"><td class="role-desc-cell" colspan="${cols}"><span class="role-desc">${esc(r.description)}</span></td></tr>` : ''}`
    )
    .join('')
  return `<section class="detail-section"><h4 class="detail-section-head">Roles available</h4><table class="roles-table"><thead><tr><th>Role</th><th>Type</th><th>Age</th>${voice ? '<th>Voice</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></section>`
}

/**
 * The expanded body of an audition or event: description, sessions, details, roles, notes
 * and links. The /events page and the editor Preview both render this.
 */
export function activityDetailHtml(a: ViewActivity, opts: DetailOptions = {}) {
  const isEvent = a.type === 'event'
  const left = isEvent
    ? [
        sessionsHtml(a, opts),
        a.cost
          ? `<section class="detail-section"><h4 class="detail-section-head">Cost</h4><div class="detail-sub detail-val">${esc(a.cost)}</div></section>`
          : '',
        a.registerUrl
          ? `<section class="detail-section"><h4 class="detail-section-head">Register</h4><div><a href="${esc(a.registerUrl)}" class="detail-link-inline" target="_blank" rel="noopener">Register here →</a></div></section>`
          : '',
        contactHtml(a.contact)
      ]
    : [
        sessionsHtml(a, opts),
        prepHtml(a.prep),
        organizersHtml(opts.organizers),
        contactHtml(a.contact)
      ]
  const right = isEvent ? organizersHtml(opts.organizers) : rolesHtml(a)
  const downloadAll =
    opts.withAdd && !a.closed && datedSessions(a).length > 1
      ? `<button type="button" class="detail-action-link detail-cal-btn" data-ics-download="activities/${esc(opts.eventId ? opts.eventId(a.id) : a.id)}" data-ics-name="${esc(a.title.trim())}">Download all dates</button>`
      : ''
  const links =
    a.noticeUrl || (!isEvent && a.productionUrl) || downloadAll
      ? `<div class="detail-links-row">${
          a.noticeUrl
            ? `<a href="${esc(a.noticeUrl)}" class="detail-action-link" target="_blank" rel="noopener">${isEvent ? 'More info →' : 'Audition notice →'}</a>`
            : ''
        }${
          !isEvent && a.productionUrl
            ? `<a href="${esc(a.productionUrl)}" class="detail-action-link" target="_blank" rel="noopener">Production info →</a>`
            : ''
        }${downloadAll}</div>`
      : ''
  return `${
    isEvent && a.description
      ? `<section class="detail-section"><div class="detail-description">${renderMd(a.description)}</div></section>`
      : ''
  }<div class="detail-grid"><div class="detail-left">${left.join('')}</div>${right ? `<div class="detail-right">${right}</div>` : ''}</div>${
    a.notes ? `<div class="detail-notes-full">${renderMd(a.notes)}</div>` : ''
  }${links}`
}

const badge = (c: Colour) => `background:${c.bg};color:${c.fg}`

/** CSS for the pills and the expanded body, shared by the page and the editor Preview. */
export const ACTIVITY_VIEW_CSS = `
.type-badge { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 7px; border-radius: 8px; flex-shrink: 0; }
.type-event { ${badge(ACTIVITY_COLOURS.event)} }
.type-audition { ${badge(ACTIVITY_COLOURS.audition)} }
.type-virtual { ${badge(ACTIVITY_COLOURS.virtual)} }
.status-pip { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 7px; border-radius: 8px; color: var(--ink-subtle, #9c9189); background: rgba(0,0,0,0.06); }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px 32px; margin-bottom: 16px; }
.detail-grid:not(:has(.detail-right)) { grid-template-columns: 1fr; }
.detail-left, .detail-right { min-width: 0; }
.detail-section { margin-bottom: 16px; }
.detail-section:last-child { margin-bottom: 0; }
.detail-section-head { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-muted, #6b6259); margin-bottom: 8px; }
.contact-section .detail-section-head { margin-bottom: 4px; }
.detail-description { font-size: 13px; line-height: 1.55; white-space: pre-wrap; max-width: 68ch; }
.detail-description a { color: var(--link, #4f5ce0); }
.detail-date-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; margin-bottom: 5px; font-size: 13px; }
.session-add { margin-left: auto; font-family: inherit; font-size: 12px; color: #4f5ce0; background: none; border: none; padding: 0; cursor: pointer; }
.session-add:hover { text-decoration: underline; }
.detail-date-row.past .session-add, .aud-card.past .detail-cal-btn { display: none; }
.detail-date-label { font-weight: 500; color: var(--ink, #1a1612); white-space: nowrap; }
.detail-time-label { color: var(--ink-muted, #6b6259); white-space: nowrap; }
.detail-date-note { font-size: 11px; color: var(--ink-subtle, #9c9189); font-style: italic; }
.detail-date-location { width: 100%; font-size: 12px; color: var(--ink-muted, #6b6259); margin-top: 1px; }
.detail-location-name { font-weight: 500; color: var(--ink-muted, #6b6259); }
.detail-sub { font-size: 12px; color: var(--ink-muted, #6b6259); line-height: 1.5; }
.detail-org-name, .detail-val { font-size: 13px; color: var(--ink, #1a1612); }
.detail-prep-row { display: flex; gap: 6px; font-size: 13px; margin-bottom: 5px; line-height: 1.45; }
.detail-prep-row:last-child { margin-bottom: 0; }
.prep-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted, #6b6259); white-space: nowrap; padding-top: 2px; flex-shrink: 0; min-width: 48px; }
.prep-value { white-space: pre-line; }
.detail-virtual-note { font-size: 13px; line-height: 1.5; color: var(--ink-muted, #6b6259); margin: 0; }
.detail-contact-name { font-size: 13px; color: var(--ink, #1a1612); margin-bottom: 2px; }
.detail-link-inline { font-size: 12px; color: #4f5ce0; text-decoration: none; }
.detail-link-inline:hover { text-decoration: underline; }
.roles-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.roles-table th { text-align: left; font-size: 11px; font-weight: 600; color: var(--ink-muted, #6b6259); padding: 0 10px 5px 0; border-bottom: 1px solid var(--border, #e0d9d0); white-space: nowrap; }
.roles-table td { padding: 6px 10px 6px 0; border-bottom: 1px solid var(--border, #e0d9d0); vertical-align: top; line-height: 1.4; }
.roles-table tr:last-child td { border-bottom: none; }
.role-name-cell { font-weight: 500; color: var(--ink, #1a1612); }
.roles-table tr.has-desc td { border-bottom: none; padding-bottom: 2px; }
.role-desc-cell { padding-top: 0; }
.role-desc { display: block; font-size: 11px; font-weight: 400; color: var(--ink-muted, #6b6259); font-style: italic; line-height: 1.4; }
.role-type, .role-age { white-space: nowrap; }
.role-lead { color: #6c3bb5; font-weight: 500; }
.role-supporting { color: var(--ink-muted, #6b6259); }
.role-ensemble { color: var(--ink-subtle, #9c9189); font-style: italic; }
.role-age, .role-voice { color: var(--ink-muted, #6b6259); }
.detail-notes-full { font-size: 13px; color: var(--ink-muted, #6b6259); line-height: 1.6; padding: 12px 0 8px; border-top: 1px solid var(--border, #e0d9d0); margin-top: 4px; font-style: italic; white-space: pre-wrap; }
.detail-links-row { display: flex; gap: 16px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid var(--border, #e0d9d0); margin-top: 4px; }
.detail-notes-full + .detail-links-row, .detail-grid + .detail-links-row { margin-top: 0; }
.detail-cal-btn { margin-left: auto; background: none; border: none; padding: 0; font-family: inherit; cursor: pointer; }
.detail-action-link { font-size: 13px; font-weight: 500; color: #4f5ce0; text-decoration: none; }
.detail-action-link:hover { color: #2c3e9a; text-decoration: underline; }
@media (max-width: 600px) { .detail-grid { grid-template-columns: 1fr; } .detail-cal-btn { margin-left: 0; } }
`
