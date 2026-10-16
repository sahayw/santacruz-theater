/**
 * Scheduled trigger for the nightly digests — runs at 02:00 UTC (the previous evening in
 * Santa Cruz) and starts send-digest-background, which does the work: scheduled functions
 * are limited to 30 seconds, and the individual Performance updates sends can take longer.
 *
 * Required env vars: DIGEST_SECRET (shared with send-digest-background)
 */

import type { Config } from '@netlify/functions'

export default async () => {
  const { URL: SITE, DIGEST_SECRET } = process.env
  if (!SITE || !DIGEST_SECRET) {
    console.error('send-digest: missing URL or DIGEST_SECRET')
    return
  }
  const resp = await fetch(`${SITE}/.netlify/functions/send-digest-background`, {
    method: 'POST',
    headers: { 'x-digest-secret': DIGEST_SECRET }
  })
  console.log(`send-digest: started background digest (${resp.status})`)
}

export const config: Config = {
  schedule: '0 2 * * *'
}
