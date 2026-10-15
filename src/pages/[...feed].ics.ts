// Builds every calendar feed as a static .ics file at build time: /runs.ics,
// /runs/company/{id}.ics, /runs/{id}.ics, /activities.ics, /auditions.ics,
// /activities/{id}.ics. Content-Type comes from the /*.ics header in netlify.toml.
// See docs/ics-spec.md.
import type { APIRoute, GetStaticPaths } from 'astro'
import { buildFeeds } from '../lib/calendar-model.ts'
import { companies, getActivities, getShows, venues } from '../lib/data.ts'
import { todayIso } from '../lib/data-rules.ts'
import { serializeFeed } from '../lib/ics.ts'

export const getStaticPaths = (async () => {
  const ctx = { companies, venues }
  const feeds = buildFeeds(await getShows(), getActivities(), ctx, todayIso())
  return feeds.map((feed) => ({
    params: { feed: feed.path },
    props: { body: serializeFeed(feed) }
  }))
}) satisfies GetStaticPaths

export const GET: APIRoute = ({ props }) =>
  new Response(props.body as string, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' }
  })
