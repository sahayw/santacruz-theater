/**
 * Sends the nightly digests for both email lists — see lib/digest.mts. A background
 * function (up to 15 minutes; Netlify retries twice on error), started by send-digest.mts
 * or by hand with the secret:
 *
 *   curl -X POST -H "x-digest-secret: $DIGEST_SECRET" <site>/.netlify/functions/send-digest-background
 *
 * Set EMAIL_DIGEST_DRY_RUN=true to log what would be sent, and save each broadcast as a
 * Buttondown draft with its real audience, without sending anything or saving state.
 * Production keeps its digest state in its own store (lib/site.mts), so runs on other
 * deploys never affect it; their email links point at the deploy that ran them.
 *
 * Required env vars: DIGEST_SECRET, BUTTONDOWN_API_KEY, NETLIFY_SITE_ID, NETLIFY_TOKEN
 * Optional env var: DIGEST_HEALTHCHECK_URL — pinged after a successful run
 */

import type { Config, Context } from '@netlify/functions'
import { runDigest } from './lib/digest.mts'
import { digestStoreName, siteUrl } from './lib/site.mts'

export default async (req: Request, context: Context) => {
  const secret = process.env.DIGEST_SECRET
  if (!secret || req.headers.get('x-digest-secret') !== secret) {
    console.error('send-digest-background: missing or wrong secret')
    return
  }
  await runDigest({
    dryRun: process.env.EMAIL_DIGEST_DRY_RUN === 'true',
    siteUrl: siteUrl(req, context),
    storeName: digestStoreName(context)
  })
  if (process.env.DIGEST_HEALTHCHECK_URL)
    await fetch(process.env.DIGEST_HEALTHCHECK_URL).catch(() => {})
}

export const config: Config = {
  background: true,
  method: 'POST',
  path: '/.netlify/functions/send-digest-background'
}
