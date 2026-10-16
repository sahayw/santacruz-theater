/** Deploy-dependent settings for the email functions. */

import type { Context } from '@netlify/functions'

const PRODUCTION_URL = 'https://santacruz.theater'

const isProduction = (context: Context) => context.deploy?.context === 'production'

/**
 * The site address for links in emails: the domain on production; anywhere else, the
 * deploy that's running, so a test email from the dev deploy links back to it.
 */
export function siteUrl(req: Request, context: Context) {
  return isProduction(context) ? PRODUCTION_URL : new URL(req.url).origin
}

/**
 * The Netlify Blobs store for digest state. Blobs are site-wide, so every deploy but
 * production gets its own store, and testing never touches production's snapshots.
 */
export function digestStoreName(context: Context) {
  return isProduction(context)
    ? 'email-digests'
    : `email-digests-${context.deploy?.context || 'unknown'}`
}

/**
 * Today's date in Santa Cruz (YYYY-MM-DD). Functions run in UTC; the 02:00 UTC digest is
 * the previous evening locally, and "upcoming" means from today there.
 */
export function localToday(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}
