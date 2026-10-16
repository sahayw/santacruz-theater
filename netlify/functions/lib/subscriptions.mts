/**
 * Shared by the subscribe and preferences functions: reading a subscriber's choices,
 * writing them to Buttondown, and the one-off welcome and manage-link emails.
 * See docs/notifications-spec.md ("Subscribe and manage").
 */

import {
  EXCLUDED_KEY,
  isListId,
  listsFromTags,
  MANAGED_TAGS,
  tagsFor,
  type ListId
} from '../../../src/lib/email-lists.ts'
import { todayIso } from '../../../src/lib/data-rules.ts'
import type { CompanyEntry } from '../../../src/types.ts'
import { getUpcomingAuditions, getUpcomingEvents, loadAllActivities } from './activities-data.mts'
import type { Buttondown, Subscriber } from './buttondown.mts'
import { loadCompanies, loadVenues } from './company-data.mts'
import { excludedOf } from './digest.mts'
import { buildManageLinkEmail, buildWelcomeEmail } from './email-template.mts'
import { digestProduction, includesProduction, loadRuns } from './shows-data.mts'

export interface Choices {
  lists: ListId[]
  excluded: string[] // major company ids left out of Performance updates
}

/** Choices from a request body, keeping only known lists and majors. */
export function readChoices(
  body: { lists?: unknown; excluded?: unknown },
  companies: CompanyEntry[]
) {
  const lists = Array.isArray(body.lists) ? [...new Set(body.lists.filter(isListId))] : []
  const majors = new Set(companies.filter((c) => c.major).map((c) => c.id))
  const excluded = Array.isArray(body.excluded)
    ? [...new Set(body.excluded.map(String).filter((id) => majors.has(id)))].sort()
    : []
  return { lists, excluded: lists.includes('performances') ? excluded : [] } as Choices
}

/** A subscriber's current choices (none when unsubscribed). */
export function choicesOf(s: Subscriber, companies: CompanyEntry[]): Choices {
  if (s.type === 'unsubscribed') return { lists: [], excluded: [] }
  const lists = listsFromTags(s.tags)
  return { lists, excluded: lists.includes('performances') ? excludedOf(s, companies) : [] }
}

/** Buttondown fields for `choices`, keeping tags and metadata this system doesn't manage. */
export function subscriberFields(
  choices: Choices,
  current?: Pick<Subscriber, 'tags' | 'metadata'>
) {
  return {
    tags: [
      ...(current?.tags ?? []).filter((t) => !MANAGED_TAGS.includes(t)),
      ...tagsFor(choices.lists, choices.excluded)
    ],
    metadata: { ...(current?.metadata ?? {}), [EXCLUDED_KEY]: choices.excluded.join(',') }
  }
}

export const manageUrl = (siteUrl: string, subscriberId: string) =>
  `${siteUrl}/subscribe/manage?s=${encodeURIComponent(subscriberId)}`

/** Creates a one-off email and sends it to one subscriber. */
async function sendOne(
  bd: Buttondown,
  subscriberId: string,
  email: { subject: string; html: string }
) {
  const { id } = await bd.createEmail({
    subject: email.subject,
    body: email.html,
    status: 'transactional'
  })
  await bd.sendTo(subscriberId, id)
}

/** The welcome email: a section for each list chosen, with what's coming up. */
export async function sendWelcome(
  bd: Buttondown,
  s: Subscriber,
  choices: Choices,
  siteUrl: string
) {
  const companies = loadCompanies()
  const today = todayIso()
  const wantsPerformances = choices.lists.includes('performances')
  const wantsActivities = choices.lists.includes('auditions-events')
  const venues = wantsPerformances ? loadVenues() : []
  const productions = wantsPerformances
    ? loadRuns()
        .map((r) => digestProduction(r, companies, venues, today, siteUrl))
        .filter((p) => p.perfs.length && includesProduction(p, choices.excluded))
        .sort((a, b) => a.perfs[0].date.localeCompare(b.perfs[0].date))
    : null
  const activities = wantsActivities ? loadAllActivities() : []
  const email = buildWelcomeEmail(
    {
      productions,
      excludedNames: choices.excluded.map((id) => companies.find((c) => c.id === id)?.name ?? id),
      auditions: wantsActivities ? getUpcomingAuditions(activities, today) : null,
      events: wantsActivities ? getUpcomingEvents(activities, today) : null
    },
    siteUrl,
    { manageUrl: manageUrl(siteUrl, s.id), unsubscribeUrl: '{{ unsubscribe_url }}' }
  )
  await sendOne(bd, s.id, email)
}

/** Emails a subscriber the link to their choices. */
export function sendManageLink(bd: Buttondown, s: Subscriber, siteUrl: string) {
  return sendOne(bd, s.id, buildManageLinkEmail(manageUrl(siteUrl, s.id)))
}

export function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
