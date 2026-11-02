/**
 * Email HTML for both lists: the two digests, the welcome email and the manage-link email.
 * Inline styles only (email clients). Activity cards are one of the four activity-card
 * rendering paths — see CLAUDE.md. See docs/notifications-spec.md ("Emails").
 */

import {
  fmtAudDateRange,
  fmtFullDate,
  fmtShortDate,
  fmtTimeRange,
  renderMd
} from '../../../src/lib/audition-format.ts'
import {
  CHANGE_COLOURS,
  GENRE_COLOURS,
  cutDescription,
  pipStyle,
  type Colour
} from '../../../src/lib/production-view.ts'
import {
  activityChangeLabel,
  productionChangeLabel,
  type ActivityChange,
  type ProductionChange
} from '../../../src/lib/notice-rules.ts'
import {
  ACTIVITY_COLOURS,
  VIRTUAL_NOTE,
  activityRangeText
} from '../../../src/lib/activity-view.ts'
import type { DigestActivity } from './activities-data.mts'
import type { DigestProduction } from './shows-data.mts'

function esc(s: string) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const SERIF = "Georgia,'Times New Roman',serif"
const CARD =
  'background:#ffffff;border:1px solid #e0d9d0;border-radius:6px;padding:16px 20px;margin-bottom:12px'
const TITLE = `font-family:${SERIF};font-size:18px;font-weight:600;color:#1a1612;margin-bottom:3px`
const META = 'font-size:13px;color:#6b6259;margin-bottom:10px'
const LINK =
  'display:inline-block;font-size:13px;font-weight:500;color:#4f5ce0;text-decoration:none'
const BUTTON =
  'display:inline-block;font-size:13px;font-weight:600;color:#ffffff;background:#1a1612;text-decoration:none;padding:7px 14px;border-radius:4px;margin-right:14px'

// Change pips: blue for a change, amber when something can now be booked, red when cancelled
const pill = (label: string, colour: Colour = CHANGE_COLOURS.info) =>
  `<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;${pipStyle(colour)};display:inline-block;padding:2px 8px;border-radius:8px;margin:0 6px 8px 0">${esc(label)}</span>`

// Genre pip, same colours as the site
const genrePill = (g: string) =>
  `<span style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:500;${pipStyle(GENRE_COLOURS[g])};display:inline-block;padding:2px 8px;border-radius:10px;margin-left:6px;vertical-align:middle">${esc(g)}</span>`

function changeColour(c: ProductionChange) {
  if (c.kind === 'tickets') return CHANGE_COLOURS.onSale
  if (c.kind === 'dates-removed' && c.all) return CHANGE_COLOURS.cancelled
  return CHANGE_COLOURS.info
}

function activityChangeColour(c: ActivityChange) {
  if (c.kind === 'registration') return CHANGE_COLOURS.onSale
  if (c.kind === 'sessions-removed' && c.all) return CHANGE_COLOURS.cancelled
  return CHANGE_COLOURS.info
}

// Type and Virtual pips, then genre — as on the site (activityPipsHtml)
const typePill = (label: string, colour: Colour) =>
  `<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;${pipStyle(colour)};display:inline-block;padding:2px 7px;border-radius:8px;margin-left:6px;vertical-align:middle">${esc(label)}</span>`

function activityPills(a: DigestActivity) {
  const audition = a.type === 'audition'
  return [
    typePill(audition ? 'Audition' : 'Event', ACTIVITY_COLOURS[a.type]),
    audition && a.virtualSubmission ? typePill('Virtual', ACTIVITY_COLOURS.virtual) : '',
    audition ? (a.genre ?? []).map(genrePill).join('') : ''
  ].join('')
}

const heading = (text: string, top = true) =>
  `<h2 style="font-family:${SERIF};font-size:19px;font-weight:600;color:#1a1612;margin:${top ? '24px' : '0'} 0 12px 0">${text}</h2>`

const quiet = (text: string) =>
  `<div style="font-size:14px;color:#6b6259;padding:8px 0 4px">${text}</div>`

// ── Footer ───────────────────────────────────────────────────────────────────

/** Links for the footer. Broadcasts use Buttondown's template variables. */
export interface FooterLinks {
  manageUrl: string
  unsubscribeUrl: string
}

export const templateFooterLinks = (siteUrl: string): FooterLinks => ({
  manageUrl: `${siteUrl}/subscribe/manage?s={{ subscriber.id }}`,
  unsubscribeUrl: '{{ unsubscribe_url }}'
})

function footer(what: string, links: FooterLinks) {
  return `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e0d9d0;font-size:12px;color:#9c9189;line-height:1.6">
    ${what} Details may change &mdash; always check the site for current information.<br>
    <a href="${links.manageUrl}" style="color:#4f5ce0;text-decoration:none">Change your choices</a>
    &nbsp;&middot;&nbsp;
    <a href="${links.unsubscribeUrl}" style="color:#4f5ce0;text-decoration:none">Unsubscribe from everything</a>
  </div>`
}

function page(title: string, subtitle: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:'DM Sans',Arial,Helvetica,sans-serif;color:#1a1612">
<div style="max-width:580px;margin:0 auto;padding:32px 16px">

  <div style="margin-bottom:24px">
    <div style="font-family:${SERIF};font-size:26px;font-weight:600;color:#1a1612;line-height:1.1">Santa Cruz Theater</div>
    <div style="font-size:14px;color:#6b6259;margin-top:4px">${subtitle}</div>
  </div>

  ${body}

</div>
</body>
</html>`
}

// ── Performance cards ────────────────────────────────────────────────────────

/**
 * A production card — fields as in docs/feature-guide.md ("How a production is displayed").
 * No performance rows and one link to the record. A new production carries its description;
 * an update carries its change pips instead.
 */
export function productionCard(p: DigestProduction, changes: ProductionChange[] = []) {
  const cancelled = changes.some((c) => c.kind === 'dates-removed' && c.all)
  const meta = [p.organizerName, p.venueName, p.price].filter(Boolean).map(esc).join(' &middot; ')
  const description = changes.length ? '' : cutDescription(p.description)
  return `<div style="${CARD}">
    ${changes.map((c) => pill(productionChangeLabel(c), changeColour(c))).join('')}
    <div style="${TITLE}">${esc(p.title)}${p.genre.map(genrePill).join('')}</div>
    <div style="font-size:13px;color:#6b6259;margin-bottom:2px">${meta}</div>
    ${
      cancelled
        ? ''
        : `<div style="${META}">${esc(fmtAudDateRange(p.perfs))} &middot; ${p.perfs.length === 1 ? '1 performance' : `${p.perfs.length} performances`}</div>`
    }
    ${
      description && description.text
        ? `<div style="font-size:13px;color:#1a1612;line-height:1.55;margin-bottom:12px;white-space:pre-wrap">${renderMd(description.text)}${description.cut ? ` <a href="${esc(p.url)}" style="color:#4f5ce0;text-decoration:none">&hellip; Read more</a>` : ''}</div>`
        : ''
    }
    ${cancelled || !p.url ? '' : `<a href="${esc(p.url)}" style="${LINK}">Details &amp; tickets &rarr;</a>`}
  </div>`
}

/** One row per production, for the welcome email: title (the link), genre, organizer, venue, dates. */
function productionLine(p: DigestProduction) {
  const meta = [p.organizerName, p.venueName].filter(Boolean).map(esc).join(' &middot; ')
  return `<tr>
    <td style="padding:6px 12px 6px 0;vertical-align:top"><a href="${esc(p.url)}" style="color:#1a1612;font-weight:600;text-decoration:none">${esc(p.title)}</a>${p.genre.map(genrePill).join('')}<br><span style="color:#6b6259">${meta}</span></td>
    <td style="padding:6px 0;vertical-align:top;color:#6b6259;white-space:nowrap;text-align:right">${esc(fmtAudDateRange(p.perfs))}</td>
  </tr>`
}

// ── Audition & event cards ───────────────────────────────────────────────────

/** One row per audition or event, for the welcome email: title (the link), pips, organizer, dates. */
function activityLine(a: DigestActivity, siteUrl: string) {
  return `<tr>
    <td style="padding:6px 12px 6px 0;vertical-align:top"><a href="${esc(activityUrl(a, siteUrl))}" style="color:#1a1612;font-weight:600;text-decoration:none">${esc(a.title)}</a>${activityPills(a)}<br><span style="color:#6b6259">${esc(a.companyName)}</span></td>
    <td style="padding:6px 0;vertical-align:top;color:#6b6259;white-space:nowrap;text-align:right">${esc(activityRangeText(a))}</td>
  </tr>`
}

const activityUrl = (a: DigestActivity, siteUrl: string) =>
  `${siteUrl}/events?id=${a.id.replace('activity-', '')}`

/**
 * An audition or event card — fields as in docs/feature-guide.md ("How an audition or event
 * is displayed"). Keeps up to three session rows; one link to the record, no Register
 * button. An update carries its change pips.
 */
export function activityCard(a: DigestActivity, siteUrl: string, changes: ActivityChange[] = []) {
  const url = activityUrl(a, siteUrl)
  const added = changes.find((c) => c.kind === 'sessions-added')
  const removed = changes.find((c) => c.kind === 'sessions-removed')
  const moved = changes.find((c) => c.kind === 'sessions-moved')

  interface Row {
    date: string
    start?: string
    end?: string
    place?: string
    gone?: boolean
  }
  const toRow = (d: DigestActivity['dates'][number]): Row => ({
    date: d.date,
    start: d.startTime,
    end: d.endTime,
    place: d.place?.name
  })
  const rowsHtml = (rows: Row[]) => {
    const body = rows
      .slice(0, 3)
      .map((r) => {
        const strike = r.gone ? 'text-decoration:line-through;' : ''
        return `<tr>
      <td style="padding:3px 14px 3px 0;color:#1a1612;font-weight:500;white-space:nowrap;${strike}">${esc(fmtFullDate(r.date))}</td>
      <td style="padding:3px 14px 3px 0;color:#6b6259;white-space:nowrap;${strike}">${esc(fmtTimeRange(r.start, r.end ?? ''))}</td>
      <td style="padding:3px 0;color:#6b6259;${strike}">${r.place ? esc(r.place) : ''}</td>
    </tr>`
      })
      .join('')
    const more =
      rows.length > 3
        ? `<tr><td colspan="3" style="padding:2px 0;font-size:12px;color:#9c9189">+ ${rows.length - 3} more date${rows.length - 3 > 1 ? 's' : ''}</td></tr>`
        : ''
    return `<table style="border-collapse:collapse;font-size:13px;margin-bottom:10px">${body}${more}</table>`
  }
  const labelled = (label: string, rows: Row[]) =>
    rows.length
      ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b6259;margin:4px 0 2px">${label}</div>${rowsHtml(rows)}`
      : ''
  const byId = (ids: string[]) => a.dates.filter((d) => ids.includes(d.id)).map(toRow)
  const goneRows = (removed?.kind === 'sessions-removed' ? removed.when : []).map(
    (w): Row => ({ date: w.slice(0, 10), start: w.slice(11) || undefined, gone: true })
  )

  const noScheduledDates = !a.dates.some((d) => d.date)
  const cancelled = changes.some((c) => c.kind === 'sessions-removed' && c.all)
  const sessionChange = !!(added || moved || goneRows.length)
  const datesHtml = cancelled
    ? ''
    : sessionChange
      ? labelled('Added', added?.kind === 'sessions-added' ? byId(added.sessionIds) : []) +
        labelled('Cancelled', goneRows) +
        labelled('Updated', moved?.kind === 'sessions-moved' ? byId(moved.sessionIds) : [])
      : noScheduledDates && a.type === 'audition' && a.virtualSubmission
        ? `<div style="${META}">${esc(VIRTUAL_NOTE)}</div>`
        : noScheduledDates && a.type === 'event' && a.datesByRequest
          ? `<div style="${META}">On request</div>`
          : rowsHtml(a.dates.map(toRow))

  const subLine =
    a.type === 'audition' && a.openingDate
      ? `Opens ${fmtShortDate(a.openingDate)}`
      : a.type === 'event' && a.briefDescription
        ? a.briefDescription
        : ''

  return `<div style="${CARD}">
    ${changes.map((c) => pill(activityChangeLabel(c), activityChangeColour(c))).join('')}
    <div style="${TITLE}">${esc(a.title)}${activityPills(a)}</div>
    <div style="${META}">${esc(a.companyName)}${subLine ? ` &middot; ${esc(subLine)}` : ''}</div>
    ${datesHtml}
    ${cancelled ? '' : `<a href="${esc(url)}" style="${LINK}">${a.type === 'event' ? 'Details &amp; registration' : 'Details'} &rarr;</a>`}
  </div>`
}

// ── Digests ──────────────────────────────────────────────────────────────────

export interface Update<T, C> {
  item: T
  changes: C[]
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The Performance updates digest. `excludedNames` are the majors this copy leaves out
 * (empty for the broadcast).
 */
export function buildPerformanceDigest(
  fresh: DigestProduction[],
  updated: Update<DigestProduction, ProductionChange>[],
  excludedNames: string[],
  siteUrl: string,
  links: FooterLinks
) {
  const parts: string[] = []
  if (fresh.length)
    parts.push(heading('New productions', false) + fresh.map((p) => productionCard(p)).join(''))
  if (updated.length)
    parts.push(
      heading('Updates', parts.length > 0) +
        updated.map((u) => productionCard(u.item, u.changes)).join('')
    )
  const subject = [
    fresh.length && count(fresh.length, 'new production'),
    updated.length && count(updated.length, 'update')
  ]
    .filter(Boolean)
    .join(', ')
  const leftOut = excludedNames.length
    ? ` Productions by ${esc(excludedNames.join(', '))} are left out, as you chose.`
    : ''
  return {
    subject: `Performance updates: ${subject}`,
    html: page(
      'Performance updates — Santa Cruz Theater',
      'Performance updates',
      parts.join('') +
        footer(
          `You're subscribed to performance updates from <a href="${siteUrl}/calendar" style="color:#4f5ce0;text-decoration:none">santacruz.theater</a>.${leftOut}`,
          links
        )
    )
  }
}

/** The Audition & event notices digest. */
export function buildActivityDigest(
  fresh: DigestActivity[],
  updated: Update<DigestActivity, ActivityChange>[],
  siteUrl: string,
  links: FooterLinks
) {
  const parts: string[] = []
  const section = (title: string, items: string[]) => {
    if (items.length) parts.push(heading(title, parts.length > 0) + items.join(''))
  }
  section(
    'New auditions',
    fresh.filter((a) => a.type === 'audition').map((a) => activityCard(a, siteUrl))
  )
  section(
    'New events',
    fresh.filter((a) => a.type === 'event').map((a) => activityCard(a, siteUrl))
  )
  section(
    'Updates',
    updated.map((u) => activityCard(u.item, siteUrl, u.changes))
  )
  const total = fresh.length + updated.length
  return {
    subject:
      total === 1
        ? 'New notice — Santa Cruz Theater'
        : `${total} theater notices — Santa Cruz Theater`,
    html: page(
      'Theater notices — Santa Cruz Theater',
      'Audition &amp; event notices',
      parts.join('') +
        footer(
          `You're subscribed to audition and event notices from <a href="${siteUrl}/events" style="color:#4f5ce0;text-decoration:none">santacruz.theater</a>.`,
          links
        )
    )
  }
}

// ── Welcome and manage-link emails ───────────────────────────────────────────

/** One welcome email with a section for each list chosen (`null` = not chosen). */
export function buildWelcomeEmail(
  content: {
    productions: DigestProduction[] | null
    excludedNames: string[]
    auditions: DigestActivity[] | null
    events: DigestActivity[] | null
  },
  siteUrl: string,
  links: FooterLinks
) {
  const { productions, auditions, events, excludedNames } = content
  const chosen = [
    productions && 'performance updates',
    auditions && 'audition and event notices'
  ].filter(Boolean)
  const parts = [
    `<div style="font-size:14px;color:#1a1612;margin-bottom:8px;line-height:1.6">You're now subscribed to ${chosen.join(' and ')} from Santa Cruz Theater. Here's what's coming up:</div>`
  ]
  if (productions) {
    parts.push(
      heading('Upcoming productions') +
        (productions.length
          ? `<table style="border-collapse:collapse;font-size:13px;width:100%">${productions.map(productionLine).join('')}</table>`
          : quiet("No upcoming productions right now &mdash; you'll hear when new ones are added."))
    )
    if (excludedNames.length)
      parts.push(quiet(`Leaving out ${esc(excludedNames.join(', '))}, as you chose.`))
  }
  if (auditions && events) {
    parts.push(
      heading('Upcoming auditions') +
        (auditions.length
          ? `<table style="border-collapse:collapse;font-size:13px;width:100%">${auditions.map((a) => activityLine(a, siteUrl)).join('')}</table>`
          : quiet(
              "No upcoming auditions right now &mdash; you'll be notified when new ones are posted."
            )),
      heading('Upcoming events') +
        (events.length
          ? `<table style="border-collapse:collapse;font-size:13px;width:100%">${events.map((a) => activityLine(a, siteUrl)).join('')}</table>`
          : quiet(
              "No upcoming events right now &mdash; you'll be notified when new ones are posted."
            ))
    )
  }
  return {
    subject: 'Welcome — Santa Cruz Theater updates',
    html: page(
      'Welcome — Santa Cruz Theater',
      'Welcome',
      parts.join('') +
        footer(
          `You're subscribed to ${chosen.join(' and ')} from <a href="${siteUrl}" style="color:#4f5ce0;text-decoration:none">santacruz.theater</a>.`,
          links
        )
    )
  }
}

/** Sent when someone asks for their link, or subscribes an address that's already on file. */
export function buildManageLinkEmail(manageUrl: string) {
  return {
    subject: 'Your Santa Cruz Theater email choices',
    html: page(
      'Your email choices — Santa Cruz Theater',
      'Email updates',
      `<div style="font-size:14px;color:#1a1612;line-height:1.6;margin-bottom:20px">
        Someone (hopefully you) asked to subscribe this address or to change its email choices.
        Use the link below to see and change what you get.
      </div>
      <a href="${esc(manageUrl)}" style="${BUTTON}">Change your choices</a>
      <div style="font-size:12px;color:#9c9189;line-height:1.6;margin-top:24px">
        If this wasn't you, you can ignore this email &mdash; nothing has changed.
      </div>`
    )
  }
}
