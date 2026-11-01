// How a production is displayed — the shared pieces (docs/feature-guide.md, "How a
// production is displayed"). Used by the /productions page, the editor Preview and the
// emails, so pips, colours, wording and the record body cannot drift between views.
// Browser-safe: also served to /admin (src/pages/admin/production-view.js.ts).
import type { Performance, Run } from '../types.ts'
import { fmt12, fmtFullDate, renderMd } from './audition-format.ts'

export interface Colour {
  bg: string
  fg: string
}

export const GENRE_COLOURS: Record<string, Colour> = {
  Musical: { bg: '#dce4fb', fg: '#2c3e9a' },
  Drama: { bg: '#fbe5e1', fg: '#8c3a2e' },
  Comedy: { bg: '#dff4d6', fg: '#2d6020' },
  Other: { bg: '#f0ece6', fg: '#6b6259' }
}

export const PERF_TYPE_COLOURS: Record<string, Colour> = {
  Preview: { bg: '#fff0cc', fg: '#7a5200' },
  Opening: { bg: '#c8f0da', fg: '#1a5c35' },
  Closing: { bg: '#ffd4d4', fg: '#8c1e1e' },
  'Talk-back': { bg: '#d4ddff', fg: '#2035a0' }
}

export const CHANGE_COLOURS: Record<'info' | 'onSale' | 'cancelled', Colour> = {
  info: { bg: '#dce4fb', fg: '#2c3e9a' },
  onSale: { bg: '#fff0cc', fg: '#7a5200' },
  cancelled: { bg: '#ffd4d4', fg: '#8c1e1e' }
}

const FALLBACK: Colour = GENRE_COLOURS.Other

export function pipStyle(c: Colour | undefined) {
  const { bg, fg } = c ?? FALLBACK
  return `background:${bg};color:${fg}`
}

function esc(v: string) {
  return (v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** A genre pill; one per genre, same colours in every view. */
export function genrePipHtml(genre: string) {
  return `<span class="pv-genre" style="${pipStyle(GENRE_COLOURS[genre])}">${esc(genre)}</span>`
}

/** A performance-type pill (performances only, never a production). */
export function perfTypePipHtml(type: string) {
  return `<span class="pv-type" style="${pipStyle(PERF_TYPE_COLOURS[type])}">${esc(type)}</span>`
}

/** "7pm" / "7:30pm" */
export function fmtPerfTime(t: string) {
  if (!t) return ''
  return `${fmt12(t)}${Number(t.split(':')[0]) < 12 ? 'am' : 'pm'}`
}

export const EMAIL_DESCRIPTION_MAX = 600

// A cut must not leave a half-open **bold**, *italic* or [link](url)
function balanced(md: string) {
  const noBold = md.replace(/\*\*/g, '')
  return (
    (md.match(/\*\*/g) ?? []).length % 2 === 0 &&
    (noBold.match(/\*/g) ?? []).length % 2 === 0 &&
    (md.match(/\[/g) ?? []).length === (md.match(/\]\([^)]*\)/g) ?? []).length
  )
}

/**
 * Cap a Markdown description at about `max` characters, cutting at a line break or the end
 * of a sentence (never inside bold, italic or a link) so the result still renders cleanly.
 */
export function cutDescription(md: string, max = EMAIL_DESCRIPTION_MAX) {
  const text = (md || '').trim()
  if (text.length <= max) return { text, cut: false }
  const floor = Math.floor(max * 0.4)
  const ends: number[] = []
  for (let i = floor; i <= max; i++) {
    const c = text[i - 1]
    if (c === '\n' || ((c === '.' || c === '!' || c === '?') && /\s/.test(text[i] ?? ' ')))
      ends.push(i)
  }
  const lineBreaks = ends.filter((i) => text[i - 1] === '\n')
  for (const pool of [lineBreaks, ends]) {
    for (const i of [...pool].reverse()) {
      const head = text.slice(0, i).trim()
      if (balanced(head)) return { text: head, cut: true }
    }
  }
  const space = text.lastIndexOf(' ', max)
  const head = text.slice(0, space > floor ? space : max).trim()
  return { text: balanced(head) ? head : head.replace(/[*[]+[^\]*]*$/, '').trim(), cut: true }
}

export interface RecordOptions {
  /** Per-row "Add to my calendar" (the public record has it; editor Preview does not). */
  withAdd?: boolean
  /** Maps a performance id to the id used in its calendar-event link. */
  eventId?: (perfId: string) => string
}

export function sortPerformances(perfs: Performance[]) {
  return [...perfs].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

/**
 * The body of a production record: description, every performance, discounts and links.
 * The /productions page and the editor Preview both render this.
 */
export function recordDetailHtml(run: Run, opts: RecordOptions = {}) {
  const perfs = sortPerformances(run.performances)
  const hasOverrides = perfs.some((p) => p.discounts || p.ticketsUrl)
  const rows = perfs
    .map(
      (p) => `<div class="perf-row" data-date="${esc(p.date)}">
<span class="perf-date">${esc(fmtFullDate(p.date))}</span>
<span class="perf-time">${esc(fmtPerfTime(p.time))}</span>
${p.perfType ? perfTypePipHtml(p.perfType) : ''}
${p.discounts ? `<span class="perf-discounts">Discounts: ${esc(p.discounts)}</span>` : ''}
${p.ticketsUrl ? `<a href="${esc(p.ticketsUrl)}" class="detail-link-inline" target="_blank" rel="noopener">Tickets →</a>` : ''}
${opts.withAdd ? `<button type="button" class="perf-add" data-ics-event="performances/${esc(opts.eventId ? opts.eventId(p.id) : p.id)}">Add to my calendar</button>` : ''}
</div>`
    )
    .join('')
  const links =
    run.infoUrl || run.ticketsUrl
      ? `<div class="detail-links-row">
${run.infoUrl ? `<a href="${esc(run.infoUrl)}" class="detail-action-link" target="_blank" rel="noopener">More info →</a>` : ''}
${run.ticketsUrl ? `<a href="${esc(run.ticketsUrl)}" class="detail-action-link" target="_blank" rel="noopener">Get tickets →</a>` : ''}
</div>`
      : ''
  return `${
    run.description
      ? `<section class="detail-section"><div class="detail-description">${renderMd(run.description)}</div></section>`
      : ''
  }<section class="detail-section"><h4 class="detail-section-head">${
    perfs.length === 1 ? 'Performance' : `${perfs.length} performances`
  }</h4>${rows || '<div class="detail-empty">No performances scheduled</div>'}</section>${
    run.discounts
      ? `<div class="detail-default">${hasOverrides ? 'Default discounts' : 'Discounts'}: ${esc(run.discounts)}</div>`
      : ''
  }${links}`
}

/** CSS for the genre and performance-type pills (every view that shows them). */
export const PILL_CSS = `
.pv-genre { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 10px; letter-spacing: 0.02em; flex-shrink: 0; }
.pv-type { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 7px; border-radius: 8px; }
`

/** CSS for the pills and the record body, shared by the page and the editor Preview. */
export const PRODUCTION_VIEW_CSS = `${PILL_CSS}
.detail-section { margin-bottom: 16px; }
.detail-section-head { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-muted, #6b6259); margin-bottom: 8px; }
.detail-description { font-size: 13px; line-height: 1.55; white-space: pre-wrap; max-width: 68ch; }
.detail-description a { color: var(--link, #4f5ce0); }
.detail-empty { font-size: 12px; color: var(--ink-muted, #6b6259); }
.perf-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; font-size: 13px; padding: 6px 0; border-bottom: 1px solid var(--border, #e0d9d0); }
.perf-row:first-of-type { padding-top: 0; }
.perf-row:last-child { border-bottom: none; }
.perf-row--past { opacity: 0.5; }
.perf-date { font-weight: 500; white-space: nowrap; min-width: 92px; }
.perf-time { color: var(--ink-muted, #6b6259); white-space: nowrap; min-width: 56px; }
.perf-discounts { font-size: 11px; color: var(--ink-subtle, #9c9189); font-style: italic; }
.detail-link-inline { font-size: 12px; color: var(--link, #4f5ce0); text-decoration: none; }
.detail-link-inline:hover { text-decoration: underline; }
.detail-default { font-size: 12px; color: var(--ink-muted, #6b6259); padding-top: 8px; border-top: 1px solid var(--border, #e0d9d0); margin-bottom: 4px; }
.detail-links-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: baseline; padding-top: 12px; border-top: 1px solid var(--border, #e0d9d0); margin-top: 4px; }
.detail-action-link { font: inherit; font-size: 13px; font-weight: 500; color: var(--link, #4f5ce0); text-decoration: none; }
.detail-action-link:hover { color: #2c3e9a; text-decoration: underline; }
.perf-add { margin-left: auto; font: inherit; font-size: 12px; color: var(--link, #4f5ce0); background: none; border: none; padding: 0; cursor: pointer; }
.perf-add:hover { text-decoration: underline; }
.perf-row--past .perf-add { display: none; }
`
