import { fmtAudDateRange, fmtFullDate, fmtTimeRange, fmtShortDate } from '../../../src/lib/audition-format.ts'
import type { Audition } from '../../../src/types.ts'

export interface DigestAudition extends Audition {
  company: string
  companyName: string
  year: number
}

function esc(s: string) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function auditionBlock(a: DigestAudition, isUpdated: boolean, baseUrl: string) {
  const id = a.id.replace('audition-', '')
  const url = `${baseUrl}/auditions?id=${id}`

  const dateRows = a.auditionDates.slice(0, 3).map(ad =>
    `<tr>
      <td style="padding:3px 14px 3px 0;color:#1a1612;font-weight:500;white-space:nowrap">${esc(fmtFullDate(ad.date))}</td>
      <td style="padding:3px 14px 3px 0;color:#6b6259;white-space:nowrap">${esc(fmtTimeRange(ad.startTime, ad.endTime))}</td>
      <td style="padding:3px 0;color:#6b6259">${ad.location ? esc(ad.location.name) : ''}</td>
    </tr>`
  ).join('')

  const moreDates = a.auditionDates.length > 3
    ? `<tr><td colspan="3" style="padding:2px 0;font-size:12px;color:#9c9189">+ ${a.auditionDates.length - 3} more date${a.auditionDates.length - 3 > 1 ? 's' : ''}</td></tr>`
    : ''

  const openingLine = a.openingDate ? `Opens ${fmtShortDate(a.openingDate)}` : ''

  return `<div style="background:#ffffff;border:1px solid #e0d9d0;border-radius:6px;padding:16px 20px;margin-bottom:12px">
    ${isUpdated ? '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#2c3e9a;background:#dce4fb;display:inline-block;padding:2px 8px;border-radius:8px;margin-bottom:8px">Updated</div>' : ''}
    <div style="font-family:Georgia,\'Times New Roman\',serif;font-size:18px;font-weight:600;color:#1a1612;margin-bottom:3px">${esc(a.production)}</div>
    <div style="font-size:13px;color:#6b6259;margin-bottom:10px">${esc(a.companyName)}${openingLine ? ` &middot; ${openingLine}` : ''}</div>
    <table style="border-collapse:collapse;font-size:13px;margin-bottom:10px">${dateRows}${moreDates}</table>
    <a href="${esc(url)}" style="display:inline-block;font-size:13px;font-weight:500;color:#4f5ce0;text-decoration:none">View audition details &rarr;</a>
  </div>`
}

export function buildDigestHtml(
  newAuditions: DigestAudition[],
  updatedAuditions: DigestAudition[],
  baseUrl: string
) {
  const sections: string[] = []

  if (newAuditions.length > 0) {
    sections.push(
      `<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:600;color:#1a1612;margin:0 0 12px 0">New Auditions</h2>` +
      newAuditions.map(a => auditionBlock(a, false, baseUrl)).join('')
    )
  }

  if (updatedAuditions.length > 0) {
    sections.push(
      `<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:600;color:#1a1612;margin:${newAuditions.length ? '24px' : '0'} 0 12px 0">Updated Auditions</h2>` +
      updatedAuditions.map(a => auditionBlock(a, true, baseUrl)).join('')
    )
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Audition Notices &mdash; Santa Cruz Theater</title>
</head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:'DM Sans',Arial,Helvetica,sans-serif;color:#1a1612">
<div style="max-width:580px;margin:0 auto;padding:32px 16px">

  <div style="margin-bottom:28px">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:#1a1612;line-height:1.1">Santa Cruz Theater</div>
    <div style="font-size:14px;color:#6b6259;margin-top:4px">Audition Notices</div>
  </div>

  ${sections.join('')}

  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e0d9d0;font-size:12px;color:#9c9189;line-height:1.6">
    You're subscribed to audition notices from
    <a href="${baseUrl}/auditions" style="color:#4f5ce0;text-decoration:none">santacruz.theater</a>.
    Audition details may change &mdash; always check the site for current information.
  </div>

</div>
</body>
</html>`
}

export function buildWelcomeHtml(auditions: DigestAudition[], baseUrl: string) {
  const body = auditions.length > 0
    ? auditions.map(a => auditionBlock(a, false, baseUrl)).join('')
    : `<div style="font-size:14px;color:#6b6259;padding:8px 0 4px">Currently there are no upcoming auditions &mdash; you will receive a notification when any new or updated auditions are posted.</div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome &mdash; Santa Cruz Theater Audition Notices</title>
</head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:'DM Sans',Arial,Helvetica,sans-serif;color:#1a1612">
<div style="max-width:580px;margin:0 auto;padding:32px 16px">

  <div style="margin-bottom:20px">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:#1a1612;line-height:1.1">Santa Cruz Theater</div>
    <div style="font-size:14px;color:#6b6259;margin-top:4px">Audition Notices</div>
  </div>

  <div style="font-size:14px;color:#1a1612;margin-bottom:20px;line-height:1.6">
    You're now subscribed to audition notices from Santa Cruz Theater. Here's what's coming up:
  </div>

  ${body}

  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e0d9d0;font-size:12px;color:#9c9189;line-height:1.6">
    You're subscribed to audition notices from
    <a href="${baseUrl}/auditions" style="color:#4f5ce0;text-decoration:none">santacruz.theater</a>.
    Audition details may change &mdash; always check the site for current information.
  </div>

</div>
</body>
</html>`
}
