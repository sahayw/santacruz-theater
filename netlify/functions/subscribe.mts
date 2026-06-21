/**
 * Subscription endpoint — adds a subscriber to the Buttondown mailing list, then sends
 * them a one-off welcome email listing current upcoming auditions.
 *
 * Netlify Functions v2. context.waitUntil() is used to send the welcome email after the
 * HTTP response is returned to the user, so the user only waits for the subscriber POST
 * rather than the full welcome-email create/send flow.
 *
 * POST /.netlify/functions/subscribe
 * Body: { "email": "user@example.com" }
 *
 * Required env var: BUTTONDOWN_API_KEY
 * Optional env var: SUBSCRIBE_HEALTHCHECK_URL — base URL; pinged on success, {url}/fail on error
 */

import type { Config, Context } from '@netlify/functions'
import { buildWelcomeHtml } from './lib/email-template.mts'
import { loadAllActivities, getUpcomingAuditions, getUpcomingEvents } from './lib/activities-data.mts'

const BUTTONDOWN_SUBSCRIBERS_URL = 'https://api.buttondown.email/v1/subscribers'
const BUTTONDOWN_EMAILS_URL = 'https://api.buttondown.email/v1/emails'
const SITE_URL = 'https://santacruz.theater'

const ts = () => new Date().toISOString()

export default async (req: Request, context: Context) => {
  console.log(`subscribe [${ts()}]: handler invoked method=${req.method}`)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const { BUTTONDOWN_API_KEY } = process.env
  if (!BUTTONDOWN_API_KEY) {
    return new Response('Server misconfiguration: missing BUTTONDOWN_API_KEY', { status: 500 })
  }

  let email: string | undefined
  try {
    const body = await req.json()
    email = body.email?.trim()
  } catch {
    return new Response('Invalid request body', { status: 400 })
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, 'Please enter a valid email address.')
  }

  try {
    console.log(`subscribe [${ts()}]: posting subscriber`)
    const resp = await fetch(BUTTONDOWN_SUBSCRIBERS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BUTTONDOWN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ email_address: email, type: 'regular' })
    })
    console.log(`subscribe [${ts()}]: subscriber POST response ${resp.status}`)

    if (resp.status === 201) {
      console.log(`subscribe [${ts()}]: subscriber created, scheduling welcome email via waitUntil`)
      context.waitUntil(sendWelcomeEmail(email, BUTTONDOWN_API_KEY))
      console.log(`subscribe [${ts()}]: returning 200`)
      return json(
        200,
        "Thanks for subscribing! We've sent you a welcome email with upcoming auditions and other events."
      )
    }
    if (resp.status === 409 || resp.status === 422)
      return json(409, 'That address is already subscribed.')
    if (resp.status === 400) {
      let detail = ''
      try {
        detail = JSON.stringify(await resp.json())
      } catch {
        /* ignore */
      }
      if (detail && /unsubscrib|exist|collision|already/i.test(detail)) {
        return json(
          409,
          'That address is already in our system. If you previously unsubscribed and want to re-subscribe, please contact us at admin@santacruz.theater'
        )
      }
      return json(400, 'Something went wrong — please try again shortly.')
    }
    return json(500, 'Something went wrong — please try again shortly.')
  } catch (e) {
    console.error(`subscribe [${ts()}]: subscriber POST error:`, e)
    return json(500, 'Something went wrong — please try again shortly.')
  }
}

export const config: Config = {
  path: '/.netlify/functions/subscribe'
}

function json(status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const pingHealthcheck = (fail = false) => {
  const base = process.env.SUBSCRIBE_HEALTHCHECK_URL
  if (!base) return Promise.resolve()
  const url = fail ? `${base}/fail` : base
  return fetch(url).catch(() => {})
}

async function sendWelcomeEmail(email: string, apiKey: string) {
  console.log(`subscribe [${ts()}]: sendWelcomeEmail start`)
  const headers = {
    'Authorization': `Token ${apiKey}`,
    'Content-Type': 'application/json'
  }

  let emailId: string | undefined
  try {
    console.log(`subscribe [${ts()}]: loading activities`)
    const all = loadAllActivities()
    const auditions = getUpcomingAuditions(all)
    const events = getUpcomingEvents(all)
    console.log(`subscribe [${ts()}]: building welcome HTML (${auditions.length} auditions, ${events.length} events)`)
    const html = buildWelcomeHtml(auditions, events, SITE_URL)

    console.log(`subscribe [${ts()}]: creating transactional welcome email`)
    const createResp = await fetch(BUTTONDOWN_EMAILS_URL, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        subject: 'Welcome — Santa Cruz Theater Audition & Event Notices',
        body: html,
        status: 'transactional'
      })
    })
    console.log(`subscribe [${ts()}]: create email response ${createResp.status}`)
    if (!createResp.ok) {
      console.error(
        `subscribe: failed to create welcome email (${createResp.status}): ${await createResp.text()}`
      )
      await pingHealthcheck(true)
      return
    }
    const created = await createResp.json()
    emailId = created.id
    console.log(`subscribe [${ts()}]: welcome email created id=${emailId}`)
  } catch (e) {
    console.error(`subscribe [${ts()}]: failed to create welcome email:`, e)
    await pingHealthcheck(true)
    return
  }

  try {
    console.log(`subscribe [${ts()}]: sending welcome email to subscriber ${email}`)
    const sendResp = await fetch(
      `${BUTTONDOWN_SUBSCRIBERS_URL}/${encodeURIComponent(email)}/emails/${emailId}`,
      {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(8000)
      }
    )
    console.log(`subscribe [${ts()}]: subscriber send response ${sendResp.status}`)
    if (!sendResp.ok) {
      console.error(
        `subscribe: failed to send welcome email (${sendResp.status}): ${await sendResp.text()}`
      )
      await pingHealthcheck(true)
      return
    }
    console.log(`subscribe [${ts()}]: welcome email sent email=${email} emailId=${emailId}`)
  } catch (e) {
    console.error(`subscribe [${ts()}]: failed to send welcome email:`, e)
    await pingHealthcheck(true)
    return
  }

  console.log(`subscribe [${ts()}]: sendWelcomeEmail complete`)
  await pingHealthcheck()
}
