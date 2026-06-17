/**
 * Background function — sends a welcome email to a new subscriber listing current
 * upcoming auditions. Invoked by subscribe.mts after a successful subscription.
 *
 * Background functions return 202 immediately; the actual work runs asynchronously.
 *
 * POST /.netlify/functions/send-welcome-email-background
 * Body: { "email": "user@example.com" }
 *
 * Required env var: BUTTONDOWN_API_KEY
 * Optional env var: SUBSCRIBE_HEALTHCHECK_URL — base URL; pinged on success, {url}/fail on error
 */

import { buildWelcomeHtml } from './lib/email-template.mts'
import { loadAllAuditions, getUpcomingAuditions } from './lib/auditions-data.mts'

const BUTTONDOWN_EMAILS_URL = 'https://api.buttondown.email/v1/emails'
const SITE_URL = 'https://santacruz.theater'

const ts = () => new Date().toISOString()

const pingHealthcheck = (fail = false) => {
  const base = process.env.SUBSCRIBE_HEALTHCHECK_URL
  if (!base) return Promise.resolve()
  const url = fail ? `${base}/fail` : base
  return fetch(url).catch(() => {})
}

export const handler = async (event: { body: string | null }) => {
  const { BUTTONDOWN_API_KEY } = process.env
  if (!BUTTONDOWN_API_KEY) {
    console.error(`welcome-email [${ts()}]: missing BUTTONDOWN_API_KEY`)
    await pingHealthcheck(true)
    return
  }

  let email: string | undefined
  try {
    email = JSON.parse(event.body ?? '{}').email
  } catch {
    console.error(`welcome-email [${ts()}]: invalid body`)
    await pingHealthcheck(true)
    return
  }

  if (!email) {
    console.error(`welcome-email [${ts()}]: no email in body`)
    await pingHealthcheck(true)
    return
  }

  const headers = {
    'Authorization': `Token ${BUTTONDOWN_API_KEY}`,
    'Content-Type': 'application/json'
  }

  let draftId: string | undefined
  try {
    console.log(`welcome-email [${ts()}]: loading auditions`)
    const auditions = getUpcomingAuditions(loadAllAuditions())
    console.log(`welcome-email [${ts()}]: building HTML (${auditions.length} auditions)`)
    const html = buildWelcomeHtml(auditions, SITE_URL)

    console.log(`welcome-email [${ts()}]: creating draft`)
    const createResp = await fetch(BUTTONDOWN_EMAILS_URL, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        subject: 'Welcome — Santa Cruz Theater Audition Notices',
        body: html,
        status: 'draft'
      })
    })
    console.log(`welcome-email [${ts()}]: create draft response ${createResp.status}`)
    if (!createResp.ok) {
      console.error(
        `welcome-email: failed to create draft (${createResp.status}): ${await createResp.text()}`
      )
      await pingHealthcheck(true)
      return
    }
    const created = await createResp.json()
    draftId = created.id
    console.log(`welcome-email [${ts()}]: draft created id=${draftId}`)
  } catch (e) {
    console.error(`welcome-email [${ts()}]: failed to create draft:`, e)
    await pingHealthcheck(true)
    return
  }

  try {
    console.log(`welcome-email [${ts()}]: sending draft to ${email}`)
    const sendResp = await fetch(`${BUTTONDOWN_EMAILS_URL}/${draftId}/send-draft`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ recipients: [email] })
    })
    console.log(`welcome-email [${ts()}]: send-draft response ${sendResp.status}`)
    if (!sendResp.ok) {
      console.error(
        `welcome-email: failed to send draft (${sendResp.status}): ${await sendResp.text()}`
      )
      await pingHealthcheck(true)
      return
    }
    console.log(`welcome-email [${ts()}]: complete`)
    await pingHealthcheck()
  } catch (e) {
    console.error(`welcome-email [${ts()}]: failed to send draft:`, e)
    await pingHealthcheck(true)
  }
}
