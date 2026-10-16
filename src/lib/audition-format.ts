import type { ActivityDate, AuditionRole } from '../types.ts'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * An activity's title. A linked audition's title is its production's, looked up by
 * `productionId` each time (never stored), so renaming the show renames the audition.
 */
export function activityTitle(
  a: { title?: string; productionId?: string },
  runs: { id: string; show: string }[]
) {
  const run = a.productionId ? runs.find((r) => r.id === a.productionId) : undefined
  return run ? run.show : (a.title ?? '')
}

/** The production fields an audition can take from its run. */
interface RunLike {
  id: string
  show: string
  genre?: unknown
  infoUrl?: string
  performances?: { date: string; perfType?: string }[]
}

/** A production's opening: the performance marked Opening, else the first performance. */
export function runOpeningDate(run: RunLike): string | undefined {
  const perfs = (run.performances || []).filter((p) => p.date).sort((a, b) => a.date.localeCompare(b.date))
  return (perfs.find((p) => p.perfType === 'Opening') ?? perfs[0])?.date
}

/**
 * An audition's genre, opening date and production link. A linked audition's come from
 * its production (looked up by id, never stored); an unlinked one's are its own.
 */
export function auditionDetails(
  a: { productionId?: string; genre?: unknown; openingDate?: string; productionUrl?: string },
  runs: RunLike[]
) {
  const run = a.productionId ? runs.find((r) => r.id === a.productionId) : undefined
  const genre = (run ? run.genre : a.genre) as string[] | string | undefined
  return {
    genre: Array.isArray(genre) ? genre : genre ? [genre] : [],
    openingDate: run ? runOpeningDate(run) : a.openingDate,
    productionUrl: run ? run.infoUrl || undefined : a.productionUrl
  }
}

export function fmt12(t: string) {
  if (!t) return ''
  const [hStr, mStr] = t.replace('.', ':').split(':')
  const h = Number(hStr),
    m = mStr !== undefined ? Number(mStr) : 0
  return m === 0 ? String(h % 12 || 12) : `${h % 12 || 12}:${String(m).padStart(2, '0')}`
}

/** "7–9 pm", "11 am–1 pm"; a lone start (or end) time still gets its am/pm: "7 pm". */
export function fmtTimeRange(start: string, end: string) {
  if (!start && !end) return ''
  const suffix = (t: string) => (Number(t.replace('.', ':').split(':')[0]) < 12 ? 'am' : 'pm')
  if (!start || !end) {
    const t = start || end
    return `${fmt12(t)} ${suffix(t)}`
  }
  const sp = suffix(start),
    ep = suffix(end)
  return sp === ep
    ? `${fmt12(start)}–${fmt12(end)} ${ep}`
    : `${fmt12(start)} ${sp}–${fmt12(end)} ${ep}`
}

export function fmtFullDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

export function fmtShortDate(dateStr: string) {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

/** Date range across any dated rows — activity sessions or performances. */
export function fmtAudDateRange(dates: Pick<ActivityDate, 'date'>[]) {
  const ds = dates.filter((d) => d.date)
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

export function renderMd(raw: string) {
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  const renderInline = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>'
      )
  const lines = escapeHtml(raw).replace(/\r\n?/g, '\n').split('\n')
  const blocks: string[] = []
  let paragraphLines: string[] = []
  let listItems: string[] = []

  const flushParagraph = () => {
    if (paragraphLines.length) blocks.push(paragraphLines.map(renderInline).join('\n'))
    paragraphLines = []
  }
  const flushList = () => {
    if (listItems.length) {
      blocks.push(
        `<ul class="md-list" style="margin:0.4em 0;padding-left:1.4em;white-space:normal">${listItems.map((item) => `<li>${item}</li>`).join('')}</ul>`
      )
    }
    listItems = []
  }

  for (let index = 0; index < lines.length; index++) {
    const bullet = lines[index].match(/^\s*[-*+]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      listItems.push(renderInline(bullet[1]))
    } else if (
      !lines[index].trim() &&
      listItems.length &&
      /^\s*[-*+]\s+/.test(lines[index + 1] || '')
    ) {
      continue
    } else {
      flushList()
      paragraphLines.push(lines[index])
    }
  }

  flushParagraph()
  flushList()
  return blocks.join('\n')
}

/**
 * Plain-text counterpart to renderMd() for non-HTML outputs (calendar feeds): drops
 * bold/italic markers, keeps only a link's text (calendar apps would show the raw URL in
 * full; the event links to our page instead), and writes bullets as `• item`. Same
 * Markdown subset as renderMd(); no escaping — callers escape for their own format.
 */
export function mdToPlain(raw: string) {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const bullet = line.match(/^\s*[-*+]\s+(.+)$/)
      const text = (bullet ? bullet[1] : line)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*([^*\n]+?)\*/g, '$1')
      return bullet ? `• ${text}` : text
    })
    .join('\n')
    .trim()
}

export function rolesSum(roles: AuditionRole[]) {
  let female = 0,
    male = 0,
    any = 0,
    hasEnsemble = false
  for (const r of roles || []) {
    if (r.type === 'ensemble') {
      hasEnsemble = true
      continue
    }
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
