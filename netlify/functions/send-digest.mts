/**
 * Scheduled function — sends a daily email digest of new/updated auditions and events.
 *
 * Runs at 02:00 UTC daily. Schedule is the cron expression in the schedule() call below.
 * Reads activities from the local data files bundled with the function (see
 * lib/activities-data.mts), compares against the last-sent timestamp stored in Netlify
 * Blob Storage, formats a digest via email-template.mts, and sends to all subscribers
 * via the Buttondown broadcast API.
 *
 * Set EMAIL_DIGEST_DRY_RUN=true to log which records would be included without sending.
 *
 * Required env vars: BUTTONDOWN_API_KEY, NETLIFY_SITE_ID, NETLIFY_TOKEN
 */

import { schedule } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { buildDigestHtml } from './lib/email-template.mts'
import { loadAllActivities, classifyForDigest } from './lib/activities-data.mts'

const BLOB_STORE = 'audition-notifications'
const BLOB_KEY = 'last-sent'
const BUTTONDOWN_URL = 'https://api.buttondown.email/v1/emails'
const SITE_URL = 'https://santacruz.theater'

const pingHealthcheck = () => {
  if (process.env.DIGEST_HEALTHCHECK_URL) {
    return fetch(process.env.DIGEST_HEALTHCHECK_URL).catch(() => {})
  }
}

export const handler = schedule('0 2 * * *', async () => {
  const { BUTTONDOWN_API_KEY, EMAIL_DIGEST_DRY_RUN } = process.env

  const isDryRun = EMAIL_DIGEST_DRY_RUN === 'true'

  if (!BUTTONDOWN_API_KEY) {
    console.error('send-digest: missing BUTTONDOWN_API_KEY')
    return
  }

  const { NETLIFY_SITE_ID, NETLIFY_TOKEN } = process.env
  if (!NETLIFY_SITE_ID || !NETLIFY_TOKEN) {
    console.error(
      'send-digest: missing NETLIFY_SITE_ID or NETLIFY_TOKEN (required for Blob Storage)'
    )
    return
  }

  // ── 1. Read last-sent timestamp ──────────────────────────────────────────
  const store = getStore({ name: BLOB_STORE, siteID: NETLIFY_SITE_ID, token: NETLIFY_TOKEN })
  const lastSentStr = await store.get(BLOB_KEY)
  const lastSent = lastSentStr ? new Date(lastSentStr) : new Date(0)
  console.log(`send-digest: last sent ${lastSent.toISOString()}`)

  // ── 2. Read all activity files and classify new vs updated ───────────────
  const activities = loadAllActivities()
  const { newAuditions, updatedAuditions, newEvents, updatedEvents } = classifyForDigest(
    activities,
    lastSent
  )

  console.log(
    `send-digest: ${newAuditions.length} new auditions, ${updatedAuditions.length} updated auditions, ${newEvents.length} new events, ${updatedEvents.length} updated events`
  )

  if (
    newAuditions.length === 0 &&
    updatedAuditions.length === 0 &&
    newEvents.length === 0 &&
    updatedEvents.length === 0
  ) {
    console.log('send-digest: nothing to send')
    await pingHealthcheck()
    return
  }

  for (const a of newAuditions) {
    console.log(`  NEW AUDITION   ${a.title} (${a.company}) createdAt=${a.createdAt}`)
  }
  for (const a of updatedAuditions) {
    console.log(`  UPDT AUDITION  ${a.title} (${a.company}) updatedAt=${a.updatedAt}`)
  }
  for (const a of newEvents) {
    console.log(`  NEW EVENT      ${a.title} (${a.company}) createdAt=${a.createdAt}`)
  }
  for (const a of updatedEvents) {
    console.log(`  UPDT EVENT     ${a.title} (${a.company}) updatedAt=${a.updatedAt}`)
  }

  if (isDryRun) {
    console.log('send-digest: EMAIL_DIGEST_DRY_RUN — skipping send')
    return
  }

  // ── 3. Format and send digest ────────────────────────────────────────────
  const total =
    newAuditions.length + updatedAuditions.length + newEvents.length + updatedEvents.length
  const subject =
    total === 1
      ? 'New notice — Santa Cruz Theater'
      : `${total} theater notices — Santa Cruz Theater`

  const html = buildDigestHtml(newAuditions, updatedAuditions, newEvents, updatedEvents, SITE_URL)

  try {
    const sendResp = await fetch(BUTTONDOWN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BUTTONDOWN_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Buttondown-Live-Dangerously': 'true'
      },
      body: JSON.stringify({ subject, body: html, status: 'about_to_send' })
    })
    if (!sendResp.ok) {
      const err = await sendResp.text()
      console.error(`send-digest: Buttondown error ${sendResp.status}: ${err}`)
      return
    }
    console.log(`send-digest: sent "${subject}"`)
  } catch (e) {
    console.error('send-digest: failed to send email:', e)
    return
  }

  // ── 4. Update timestamp (only on success) ────────────────────────────────
  try {
    await store.set(BLOB_KEY, new Date().toISOString())
    console.log('send-digest: timestamp updated')
  } catch (e) {
    console.error('send-digest: failed to update timestamp:', e)
  }

  // ── 5. Ping healthcheck monitor ──────────────────────────────────────────
  await pingHealthcheck()
})
