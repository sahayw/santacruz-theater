import { fmtAudDateRange, fmtFullDate, fmtTimeRange, fmtShortDate } from '../../../src/lib/audition-format.ts'
import type { DigestActivity } from './activities-data.mts'

function esc(s: string) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function activityBlock(a: DigestActivity, isUpdated: boolean, baseUrl: string) {
  const id = a.id.replace('activity-', '')
  const url = `${baseUrl}/events?id=${id}`

  const dateRows = a.dates.slice(0, 3).map(ad =>
    `<tr>
      <td style="padding:3px 14px 3px 0;color:#1a1612;font-weight:500;white-space:nowrap">${esc(fmtFullDate(ad.date))}</td>
      <td style="padding:3px 14px 3px 0;color:#6b6259;white-space:nowrap">${esc(fmtTimeRange(ad.startTime, ad.endTime ?? ''))}</td>
      <td style="padding:3px 0;color:#6b6259">${ad.location ? esc(ad.location.name) : ''}</td>
    </tr>`
  ).join('')

  const moreDates = a.dates.length > 3
    ? `<tr><td colspan="3" style="padding:2px 0;font-size:12px;color:#9c9189">+ ${a.dates.length - 3} more date${a.dates.length - 3 > 1 ? 's' : ''}</td></tr>`
    : ''

  const subLine = a.type === 'audition' && a.openingDate
    ? `Opens ${fmtShortDate(a.openingDate)}`
    : a.type === 'event' && a.briefDescription
      ? a.briefDescription
      : ''

  const linkLabel = a.type === 'event' ? 'View event details' : 'View audition details'

  return `<div style="background:#ffffff;border:1px solid #e0d9d0;border-radius:6px;padding:16px 20px;margin-bottom:12px">
    ${isUpdated ? '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#2c3e9a;background:#dce4fb;display:inline-block;padding:2px 8px;border-radius:8px;margin-bottom:8px">Updated</div>' : ''}
    <div style="font-family:Georgia,\'Times New Roman\',serif;font-size:18px;font-weight:600;color:#1a1612;margin-bottom:3px">${esc(a.title)}</div>
    <div style="font-size:13px;color:#6b6259;margin-bottom:10px">${esc(a.companyName)}${subLine ? ` &middot; ${esc(subLine)}` : ''}</div>
    <table style="border-collapse:collapse;font-size:13px;margin-bottom:10px">${dateRows}${moreDates}</table>
    <a href="${esc(url)}" style="display:inline-block;font-size:13px;font-weight:500;color:#4f5ce0;text-decoration:none">${linkLabel} &rarr;</a>
  </div>`
}

export function buildDigestHtml(
  newAuditions: DigestActivity[],
  updatedAuditions: DigestActivity[],
  newEvents: DigestActivity[],
  updatedEvents: DigestActivity[],
  baseUrl: string
) {
  const sections: string[] = []
  const hasAny = newAuditions.length + updatedAuditions.length + newEvents.length + updatedEvents.length > 0

  if (!hasAny) return ''

  const hd = (text: string, topMargin: boolean) =>
    `<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:600;color:#1a1612;margin:${topMargin ? '24px' : '0'} 0 12px 0">${text}</h2>`

  let first = true
  if (newAuditions.length > 0) {
    sections.push(hd('New Auditions', !first) + newAuditions.map(a => activityBlock(a, false, baseUrl)).join(''))
    first = false
  }
  if (updatedAuditions.length > 0) {
    sections.push(hd('Updated Auditions', !first) + updatedAuditions.map(a => activityBlock(a, true, baseUrl)).join(''))
    first = false
  }
  if (newEvents.length > 0) {
    sections.push(hd('New Events', !first) + newEvents.map(a => activityBlock(a, false, baseUrl)).join(''))
    first = false
  }
  if (updatedEvents.length > 0) {
    sections.push(hd('Updated Events', !first) + updatedEvents.map(a => activityBlock(a, true, baseUrl)).join(''))
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Theater Notices &mdash; Santa Cruz Theater</title>
</head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:'DM Sans',Arial,Helvetica,sans-serif;color:#1a1612">
<div style="max-width:580px;margin:0 auto;padding:32px 16px">

  <div style="margin-bottom:28px">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:#1a1612;line-height:1.1">Santa Cruz Theater</div>
    <div style="font-size:14px;color:#6b6259;margin-top:4px">Audition &amp; Event Notices</div>
  </div>

  ${sections.join('')}

  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e0d9d0;font-size:12px;color:#9c9189;line-height:1.6">
    You're subscribed to audition and event notices from
    <a href="${baseUrl}/events" style="color:#4f5ce0;text-decoration:none">santacruz.theater</a>.
    Details may change &mdash; always check the site for current information.
  </div>

</div>
</body>
</html>`
}

export function buildWelcomeHtml(auditions: DigestActivity[], events: DigestActivity[], baseUrl: string) {
  const audBody = auditions.length > 0
    ? auditions.map(a => activityBlock(a, false, baseUrl)).join('')
    : `<div style="font-size:14px;color:#6b6259;padding:8px 0 4px">No upcoming auditions right now &mdash; you'll be notified when new ones are posted.</div>`

  const evtBody = events.length > 0
    ? events.map(a => activityBlock(a, false, baseUrl)).join('')
    : `<div style="font-size:14px;color:#6b6259;padding:8px 0 4px">No upcoming events right now &mdash; you'll be notified when new ones are posted.</div>`

  const hd = (text: string) =>
    `<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:600;color:#1a1612;margin:0 0 12px 0">${text}</h2>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome &mdash; Santa Cruz Theater</title>
</head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:'DM Sans',Arial,Helvetica,sans-serif;color:#1a1612">
<div style="max-width:580px;margin:0 auto;padding:32px 16px">

  <div style="margin-bottom:20px">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:#1a1612;line-height:1.1">Santa Cruz Theater</div>
    <div style="font-size:14px;color:#6b6259;margin-top:4px">Audition &amp; Event Notices</div>
  </div>

  <div style="font-size:14px;color:#1a1612;margin-bottom:20px;line-height:1.6">
    You're now subscribed to audition and event notices from Santa Cruz Theater. Here's what's coming up:
  </div>

  ${hd('Upcoming Auditions')}
  ${audBody}

  <div style="margin:24px 0 12px">${hd('Upcoming Events')}</div>
  ${evtBody}

  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e0d9d0;font-size:12px;color:#9c9189;line-height:1.6">
    You're subscribed to audition and event notices from
    <a href="${baseUrl}/events" style="color:#4f5ce0;text-decoration:none">santacruz.theater</a>.
    Details may change &mdash; always check the site for current information.
  </div>

</div>
</body>
</html>`
}
