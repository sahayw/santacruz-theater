/**
 * The nightly digests for both lists. Each list's snapshot (what was last emailed) lives
 * in Netlify Blobs; tonight's records are compared against it with src/lib/notice-rules.ts.
 *
 * - First run for a list: the snapshot is seeded and nothing is sent (no burst at go-live).
 * - Audition & event notices: one broadcast to the `auditions-events` tag.
 * - Performance updates: one broadcast to subscribers who excluded nothing; each subscriber
 *   with exclusions gets an individual copy holding only their content (identical content
 *   shares one created email), or nothing if nothing is left.
 * - A per-day run record holds what has been sent, so a retry skips it. The snapshot is
 *   saved only once a list's sends are complete.
 * - Dry run (EMAIL_DIGEST_DRY_RUN=true) logs what would be sent and writes nothing.
 *
 * See docs/notifications-spec.md ("Change detection", "Sending").
 */

import { getStore } from '@netlify/blobs'
import type { CompanyEntry } from '../../../src/types.ts'
import {
  classifyActivities,
  classifyProductions,
  type ActivityPrint,
  type ProductionPrint
} from '../../../src/lib/notice-rules.ts'
import { EMAIL_LISTS, EXCLUDED_KEY, SELECTED_TAG } from '../../../src/lib/email-lists.ts'
import { loadAllActivities } from './activities-data.mts'
import { allOf, buttondown, type Buttondown, type Subscriber } from './buttondown.mts'
import { loadCompanies, loadVenues } from './company-data.mts'
import { buildActivityDigest, buildPerformanceDigest, templateFooterLinks } from './email-template.mts'
import { digestProduction, includesProduction, loadRuns } from './shows-data.mts'
import { localToday, SITE_URL } from './site.mts'

const STORE = 'email-digests'
const snapshotKey = (list: string) => `snapshot/${list}`

interface ListRecord {
  broadcast?: string // created email id
  groups?: Record<string, string> // exclusion key → created email id
  sent?: string[] // subscriber ids sent an individual copy
  done?: boolean
}
type RunRecord = Record<string, ListRecord>

type Store = ReturnType<typeof getStore>

const listTag = (list: string) => EMAIL_LISTS.find((l) => l.id === list)!.tag

/** The majors a subscriber left out, as stored in their metadata. */
export function excludedOf(s: Pick<Subscriber, 'metadata'>, companies: CompanyEntry[]) {
  const raw = s.metadata?.[EXCLUDED_KEY]
  const ids = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  const majors = new Set(companies.filter((c) => c.major).map((c) => c.id))
  return [...new Set(ids.map(String).filter((id) => majors.has(id)))].sort()
}

export async function runDigest(opts: { dryRun: boolean }) {
  const { NETLIFY_SITE_ID, NETLIFY_TOKEN } = process.env
  if (!NETLIFY_SITE_ID || !NETLIFY_TOKEN)
    throw new Error('missing NETLIFY_SITE_ID or NETLIFY_TOKEN (required for Blob Storage)')
  const store = getStore({ name: STORE, siteID: NETLIFY_SITE_ID, token: NETLIFY_TOKEN })
  const bd = buttondown()
  const today = localToday()
  const runKey = `run/${today}`
  const record: RunRecord = ((await store.get(runKey, { type: 'json' })) as RunRecord) ?? {}
  const save = () => (opts.dryRun ? Promise.resolve() : store.setJSON(runKey, record))
  const log = (msg: string) => console.log(`digest${opts.dryRun ? ' [dry run]' : ''}: ${msg}`)

  await performancesDigest({ store, bd, today, record, save, log, ...opts })
  await activitiesDigest({ store, bd, today, record, save, log, ...opts })
}

interface Ctx {
  store: Store
  bd: Buttondown
  today: string
  record: RunRecord
  save: () => Promise<unknown>
  log: (msg: string) => void
  dryRun: boolean
}

/** Reads a list's snapshot; seeds it (and returns null) on the first run. */
async function snapshot<P>(ctx: Ctx, list: string, next: Record<string, P>) {
  const prev = (await ctx.store.get(snapshotKey(list), { type: 'json' })) as Record<string, P> | null
  if (prev) return prev
  ctx.log(`${list}: no snapshot yet — seeding ${Object.keys(next).length} records, sending nothing`)
  if (!ctx.dryRun) await ctx.store.setJSON(snapshotKey(list), next)
  return null
}

async function finish<P>(ctx: Ctx, list: string, next: Record<string, P>) {
  if (ctx.dryRun) return
  await ctx.store.setJSON(snapshotKey(list), next)
  ctx.record[list] = { ...ctx.record[list], done: true }
  await ctx.save()
}

// ── Performance updates ──────────────────────────────────────────────────────

async function performancesDigest(ctx: Ctx) {
  const list = 'performances'
  if (ctx.record[list]?.done) return ctx.log(`${list}: already sent today`)
  const companies = loadCompanies()
  const venues = loadVenues()
  const runs = loadRuns()
  const seed = classifyProductions(runs, {}, ctx.today).next
  const prev = await snapshot<ProductionPrint>(ctx, list, seed)
  if (!prev) return
  const result = classifyProductions(runs, prev, ctx.today)

  const byId = new Map(runs.map((r) => [r.id, r]))
  const prod = (id: string) => digestProduction(byId.get(id)!, companies, venues, ctx.today, SITE_URL)
  const byFirstDate = (a: { perfs: { date: string }[] }, b: { perfs: { date: string }[] }) =>
    (a.perfs[0]?.date ?? '').localeCompare(b.perfs[0]?.date ?? '')
  const fresh = result.notices.filter((n) => n.isNew).map((n) => prod(n.id)).sort(byFirstDate)
  const updated = result.notices
    .filter((n) => !n.isNew)
    .map((n) => ({ item: prod(n.id), changes: n.changes }))
    .sort((a, b) => byFirstDate(a.item, b.item))

  ctx.log(`${list}: ${fresh.length} new, ${updated.length} updated`)
  for (const p of fresh) ctx.log(`  NEW   ${p.title} (${p.organizerName})`)
  for (const u of updated)
    ctx.log(`  UPDT  ${u.item.title} (${u.item.organizerName}): ${u.changes.map((c) => c.kind).join(', ')}`)
  if (!fresh.length && !updated.length) return finish(ctx, list, result.next)

  const rec = (ctx.record[list] ??= {})
  const links = templateFooterLinks(SITE_URL)

  // One broadcast to everyone on the list who excluded nothing
  if (!rec.broadcast) {
    const { subject, html } = buildPerformanceDigest(fresh, updated, [], SITE_URL, links)
    if (ctx.dryRun) ctx.log(`${list}: would broadcast "${subject}"`)
    else {
      const tags = await ctx.bd.tagIds([listTag(list), SELECTED_TAG])
      rec.broadcast = (
        await ctx.bd.createEmail({
          subject,
          body: html,
          status: 'about_to_send',
          filters: allOf(
            { field: 'subscriber.tags', operator: 'contains', value: tags[listTag(list)] },
            { field: 'subscriber.tags', operator: 'not_contains', value: tags[SELECTED_TAG] }
          )
        })
      ).id
      await ctx.save()
      ctx.log(`${list}: broadcast "${subject}"`)
    }
  }

  // Individual copies for subscribers who left out some majors
  const selected = (await ctx.bd.listSubscribers(SELECTED_TAG)).filter((s) =>
    s.tags.includes(listTag(list))
  )
  const groups = new Map<string, { excluded: string[]; subs: Subscriber[] }>()
  for (const s of selected) {
    const excluded = excludedOf(s, companies)
    const key = excluded.join(',')
    if (!groups.has(key)) groups.set(key, { excluded, subs: [] })
    groups.get(key)!.subs.push(s)
  }
  rec.groups ??= {}
  rec.sent ??= []
  const sent = new Set(rec.sent)
  for (const [key, { excluded, subs }] of groups) {
    const keep = (p: { organizerIds: string[] }) => includesProduction(p, excluded)
    const f = fresh.filter(keep)
    const u = updated.filter((x) => keep(x.item))
    const todo = subs.filter((s) => !sent.has(s.id))
    if (!f.length && !u.length) {
      ctx.log(`${list}: nothing for ${subs.length} excluding [${key}]`)
      continue
    }
    const names = excluded.map((id) => companies.find((c) => c.id === id)?.name ?? id)
    const { subject, html } = buildPerformanceDigest(f, u, names, SITE_URL, links)
    if (ctx.dryRun) {
      ctx.log(`${list}: would send "${subject}" to ${todo.length} excluding [${key}]`)
      continue
    }
    if (!rec.groups[key]) {
      rec.groups[key] = (await ctx.bd.createEmail({ subject, body: html, status: 'transactional' })).id
      await ctx.save()
    }
    for (const [i, s] of todo.entries()) {
      await ctx.bd.sendTo(s.id, rec.groups[key])
      rec.sent.push(s.id)
      if (i % 10 === 9) await ctx.save()
    }
    await ctx.save()
    ctx.log(`${list}: sent "${subject}" to ${todo.length} excluding [${key}]`)
  }

  await finish(ctx, list, result.next)
}

// ── Audition & event notices ─────────────────────────────────────────────────

async function activitiesDigest(ctx: Ctx) {
  const list = 'auditions-events'
  if (ctx.record[list]?.done) return ctx.log(`${list}: already sent today`)
  const activities = loadAllActivities()
  const seed = classifyActivities(activities, {}, ctx.today).next
  const prev = await snapshot<ActivityPrint>(ctx, list, seed)
  if (!prev) return
  const { notices, next } = classifyActivities(activities, prev, ctx.today)

  const byId = new Map(activities.map((a) => [a.id, a]))
  const byFirstDate = (a: { dates: { date: string }[] }, b: { dates: { date: string }[] }) =>
    (a.dates[0]?.date ?? '').localeCompare(b.dates[0]?.date ?? '')
  const fresh = notices.filter((n) => n.isNew).map((n) => byId.get(n.id)!).sort(byFirstDate)
  const updated = notices
    .filter((n) => !n.isNew)
    .map((n) => ({ item: byId.get(n.id)!, changes: n.changes }))
    .sort((a, b) => byFirstDate(a.item, b.item))

  ctx.log(`${list}: ${fresh.length} new, ${updated.length} updated`)
  for (const a of fresh) ctx.log(`  NEW   ${a.type} ${a.title} (${a.companyName})`)
  for (const u of updated)
    ctx.log(`  UPDT  ${u.item.type} ${u.item.title}: ${u.changes.map((c) => c.kind).join(', ')}`)
  if (!fresh.length && !updated.length) return finish(ctx, list, next)

  const rec = (ctx.record[list] ??= {})
  if (!rec.broadcast) {
    const { subject, html } = buildActivityDigest(fresh, updated, SITE_URL, templateFooterLinks(SITE_URL))
    if (ctx.dryRun) return ctx.log(`${list}: would broadcast "${subject}"`)
    const tags = await ctx.bd.tagIds([listTag(list)])
    rec.broadcast = (
      await ctx.bd.createEmail({
        subject,
        body: html,
        status: 'about_to_send',
        filters: allOf({ field: 'subscriber.tags', operator: 'contains', value: tags[listTag(list)] })
      })
    ).id
    await ctx.save()
    ctx.log(`${list}: broadcast "${subject}"`)
  }
  await finish(ctx, list, next)
}
