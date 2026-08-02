/**
 * Scheduled trigger — kicks off sync-calendar-background.mts, which does the actual
 * Google Calendar sync work.
 *
 * Netlify Functions v2 (config export). Scheduled Functions have a hard 30s execution
 * limit, too short for a full reconciliation (a few hundred writes on a first run or
 * any change to a field every event shares). Netlify doesn't support a single function
 * being both scheduled and background at once, so this function's only job is to fire
 * one HTTP request at the background function's own URL and return — trivially within
 * 30s — while the background function (up to 15 minutes) does the real work. See
 * docs/google-calendar-sync.md for the full design.
 *
 * Runs at 04:15 UTC daily (offset from the 02:00 UTC digest cron).
 */

import type { Config } from '@netlify/functions'

export default async (req: Request) => {
  const { next_run } = await req.json().catch(() => ({ next_run: undefined as string | undefined }))

  const baseUrl = process.env.URL
  if (!baseUrl) {
    console.error('sync-calendar-trigger: missing URL env var (Netlify injects this automatically)')
    return
  }

  try {
    await fetch(`${baseUrl}/.netlify/functions/sync-calendar-background`, { method: 'POST' })
    console.log(`sync-calendar-trigger: dispatched background sync${next_run ? ` (next scheduled run: ${next_run})` : ''}`)
  } catch (e) {
    console.error('sync-calendar-trigger: failed to dispatch background sync:', e)
  }
}

export const config: Config = {
  schedule: '15 4 * * *'
}
