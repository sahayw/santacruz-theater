import type { AuditionDate, AuditionRole } from '../types.ts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function fmt12(t: string) {
  if (!t) return ''
  const [hStr, mStr] = t.replace('.', ':').split(':')
  const h = Number(hStr), m = mStr !== undefined ? Number(mStr) : 0
  return m === 0 ? String(h % 12 || 12) : `${h % 12 || 12}:${String(m).padStart(2, '0')}`
}

export function fmtTimeRange(start: string, end: string) {
  if (!start && !end) return ''
  if (!start || !end) return fmt12(start || end)
  const sh = Number(start.split(':')[0]), eh = Number(end.split(':')[0])
  const sp = sh < 12 ? 'am' : 'pm', ep = eh < 12 ? 'am' : 'pm'
  return sp === ep
    ? `${fmt12(start)}–${fmt12(end)} ${ep}`
    : `${fmt12(start)} ${sp}–${fmt12(end)} ${ep}`
}

export function fmtFullDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function fmtShortDate(dateStr: string) {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

export function fmtAudDateRange(dates: AuditionDate[]) {
  const ds = dates.filter(d => d.date)
  if (!ds.length) return ''
  if (ds.length === 1) {
    const [y, m, d] = ds[0].date.split('-').map(Number)
    return `${MONTHS[m - 1]} ${d}, ${y}`
  }
  const [fy, fm, fd] = ds[0].date.split('-').map(Number)
  const [ly, lm, ld] = ds[ds.length - 1].date.split('-').map(Number)
  if (fy === ly) {
    if (fm === lm) return `${MONTHS[fm - 1]} ${fd}–${ld}, ${fy}`
    return `${MONTHS[fm - 1]} ${fd} – ${MONTHS[lm - 1]} ${ld}, ${fy}`
  }
  return `${MONTHS[fm - 1]} ${fd}, ${fy} – ${MONTHS[lm - 1]} ${ld}, ${ly}`
}

export function rolesSum(roles: AuditionRole[]) {
  let female = 0, male = 0, any = 0, hasEnsemble = false
  for (const r of (roles || [])) {
    if (r.type === 'ensemble') { hasEnsemble = true; continue }
    if (r.gender === 'female') female++
    else if (r.gender === 'male') male++
    else any++
  }
  const parts = []
  if (female) parts.push(`${female} female`)
  if (male) parts.push(`${male} male`)
  if (any) parts.push(`${any} any`)
  if (hasEnsemble) parts.push('ensemble')
  return parts.join(' · ')
}
