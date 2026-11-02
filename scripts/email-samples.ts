/**
 * Sample emails built from the live data, for `npm run check` (check-emails.ts) and for
 * looking at them: `npx tsx scripts/email-samples.ts <dir>` writes each as an HTML file.
 * Every upcoming record is in a digest as "new"; a few also appear as updates carrying
 * every kind of change, and the edge cases (long title, many pips and dates) are synthetic.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { todayIso } from '../src/lib/data-rules.ts'
import type { ActivityChange, ProductionChange } from '../src/lib/notice-rules.ts'
import {
  getUpcomingAuditions,
  getUpcomingEvents,
  loadAllActivities
} from '../netlify/functions/lib/activities-data.mts'
import { loadCompanies, loadVenues } from '../netlify/functions/lib/company-data.mts'
import {
  buildActivityDigest,
  buildManageLinkEmail,
  buildPerformanceDigest,
  buildWelcomeEmail,
  templateFooterLinks
} from '../netlify/functions/lib/email-template.mts'
import { digestProduction, loadRuns } from '../netlify/functions/lib/shows-data.mts'

const SITE = 'https://santacruz.theater'

export interface Sample {
  name: string
  html: string
}

export function buildSamples(today = todayIso()): Sample[] {
  const companies = loadCompanies()
  const venues = loadVenues()
  const links = templateFooterLinks(SITE)
  const productions = loadRuns()
    .map((r) => digestProduction(r, companies, venues, today, SITE))
    .filter((p) => p.perfs.length)
  const activities = loadAllActivities()
  const auditions = getUpcomingAuditions(activities, today)
  const events = getUpcomingEvents(activities, today)

  // Edge cases: a title that must wrap, every genre pip, and a run with many dates
  const base = productions[0]
  const longTitle = base && {
    ...base,
    title: 'The Extraordinarily Long and Complicated Title of a Production That Will Not Fit',
    description:
      'A very long description with **bold**, *italic* and a [link](https://example.com). '.repeat(
        20
      )
  }
  const manyDates = base && {
    ...base,
    perfs: Array.from({ length: 30 }, (_, i) => ({
      id: `perf-x${i}`,
      date: `2099-01-${String(i + 1).padStart(2, '0')}`,
      time: '19:30',
      perfType: ''
    }))
  }

  const prodChanges: ProductionChange[][] = [
    [{ kind: 'dates-added', perfIds: ['a'] }],
    [{ kind: 'dates-removed', when: ['2099-01-01 19:00'], all: false }],
    [{ kind: 'dates-removed', when: ['2099-01-01 19:00'], all: true }],
    [{ kind: 'dates-moved', perfIds: ['a', 'b'] }, { kind: 'venue' }, { kind: 'tickets' }]
  ]
  const actChanges: ActivityChange[][] = [
    [{ kind: 'sessions-added', sessionIds: ['a'] }],
    [{ kind: 'sessions-removed', when: ['2099-01-01 19:00'], all: false }],
    [{ kind: 'sessions-removed', when: ['2099-01-01 19:00'], all: true }]
  ]
  // Session pips only go on records that have dates; a virtual audition has none
  const allActivities = [...auditions, ...events]
  const dated = allActivities.filter((a) => a.dates.some((d) => d.date))
  const virtual = auditions.find((a) => a.virtualSubmission)
  const activityUpdates = [
    ...(dated[0]
      ? [
          {
            item: dated[0],
            changes: [
              { kind: 'sessions-added', sessionIds: [dated[0].dates[0].id] },
              { kind: 'sessions-removed', when: ['2099-01-01 19:00'], all: false },
              { kind: 'sessions-moved', sessionIds: [dated[0].dates[dated[0].dates.length - 1].id] }
            ] as ActivityChange[]
          }
        ]
      : []),
    ...(dated[1]
      ? [
          {
            item: dated[1],
            changes: [{ kind: 'location' }, { kind: 'registration' }] as ActivityChange[]
          }
        ]
      : []),
    ...(virtual ? [{ item: virtual, changes: [{ kind: 'reopened' }] as ActivityChange[] }] : [])
  ]
  const withChanges = <T, C>(list: T[], changes: C[][]) =>
    list.length ? changes.map((c, i) => ({ item: list[i % list.length], changes: c })) : []

  return [
    {
      name: 'performance-digest',
      html: buildPerformanceDigest(
        productions,
        withChanges(productions, prodChanges),
        [],
        SITE,
        links
      ).html
    },
    ...(longTitle && manyDates
      ? [
          {
            name: 'performance-digest-edge-cases',
            html: buildPerformanceDigest(
              [longTitle, manyDates],
              [{ item: longTitle, changes: prodChanges[3] }],
              ['Santa Cruz Shakespeare'],
              SITE,
              links
            ).html
          }
        ]
      : []),
    ...(base
      ? [
          {
            name: 'performance-digest-deleted',
            html: buildPerformanceDigest(
              [],
              [{ item: { ...base, perfs: [], url: '' }, changes: [prodChanges[2][0]] }],
              [],
              SITE,
              links
            ).html
          }
        ]
      : []),
    {
      name: 'activity-digest',
      html: buildActivityDigest(allActivities, activityUpdates, SITE, links).html
    },
    ...(auditions[0]
      ? [
          {
            name: 'activity-digest-deleted',
            html: buildActivityDigest(
              [],
              [
                {
                  item: { ...auditions[0], dates: [], deleted: true },
                  changes: [actChanges[2][0]]
                }
              ],
              SITE,
              links
            ).html
          }
        ]
      : []),
    {
      name: 'welcome-both-lists',
      html: buildWelcomeEmail({ productions, excludedNames: [], auditions, events }, SITE, links)
        .html
    },
    {
      name: 'welcome-empty',
      html: buildWelcomeEmail(
        { productions: [], excludedNames: ['Actors’ Theatre'], auditions: [], events: [] },
        SITE,
        links
      ).html
    },
    { name: 'manage-link', html: buildManageLinkEmail(`${SITE}/subscribe/manage?s=x`).html }
  ]
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2]
  if (!dir) throw new Error('usage: tsx scripts/email-samples.ts <output dir>')
  mkdirSync(dir, { recursive: true })
  for (const s of buildSamples()) writeFileSync(join(dir, `${s.name}.html`), s.html)
  console.log(`wrote ${buildSamples().length} emails to ${dir}`)
}
