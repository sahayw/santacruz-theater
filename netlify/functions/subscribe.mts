/**
 * Subscription endpoint — adds a subscriber to the Buttondown mailing list, then sends
 * them a one-off welcome email listing current upcoming auditions.
 *
 * POST /.netlify/functions/subscribe
 * Body: { "email": "user@example.com" }
 *
 * Required env var: BUTTONDOWN_API_KEY
 * Optional env var: SUBSCRIBE_HEALTHCHECK_URL — base URL; pinged on success, {url}/fail on error
 */

import { buildWelcomeHtml } from './lib/email-template.mts'
import { loadAllAuditions, getUpcomingAuditions } from './lib/auditions-data.mts'

const BUTTONDOWN_SUBSCRIBERS_URL = 'https://api.buttondown.email/v1/subscribers'
const BUTTONDOWN_EMAILS_URL = 'https://api.buttondown.email/v1/emails'
const SITE_URL = 'https://santacruz.theater'

const ts = () => new Date().toISOString()

export const handler = async (event: {
  httpMethod: string
  isBase64Encoded: boolean
  body: string | null
}) => {
  console.log(`subscribe [${ts()}]: handler invoked method=${event.httpMethod}`)
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const { BUTTONDOWN_API_KEY } = process.env
  if (!BUTTONDOWN_API_KEY) {
    return { statusCode: 500, body: 'Server misconfiguration: missing BUTTONDOWN_API_KEY' }
  }

  let email: string | undefined
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('utf-8')
      : event.body || ''
    email = JSON.parse(body).email?.trim()
  } catch {
    return { statusCode: 400, body: 'Invalid request body' }
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
      console.log(`subscribe [${ts()}]: subscriber created, starting welcome email`)
      await sendWelcomeEmail(email, BUTTONDOWN_API_KEY)
      console.log(`subscribe [${ts()}]: returning 200`)
      return json(
        200,
        "Thanks for subscribing! We've sent you a welcome email with current upcoming auditions."
      )
    }
    if (resp.status === 409 || resp.status === 422)
      return json(409, 'That address is already subscribed.')
    if (resp.status === 400) {
      // 400 from Buttondown typically means a subscriber collision (existing email),
      // not an invalid address — parse the body to surface a useful message.
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

function json(status: number, message: string) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  }
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

  let draftId: string | undefined
  try {
    console.log(`subscribe [${ts()}]: loading auditions`)
    const auditions = getUpcomingAuditions(loadAllAuditions())
    console.log(`subscribe [${ts()}]: building welcome HTML (${auditions.length} auditions)`)
    const html = buildWelcomeHtml(auditions, SITE_URL)

    console.log(`subscribe [${ts()}]: creating draft`)
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
    console.log(`subscribe [${ts()}]: create draft response ${createResp.status}`)
    if (!createResp.ok) {
      console.error(
        `subscribe: failed to create draft (${createResp.status}): ${await createResp.text()}`
      )
      await pingHealthcheck(true)
      return
    }
    const created = await createResp.json()
    draftId = created.id
    console.log(`subscribe [${ts()}]: draft created id=${draftId}`)
  } catch (e) {
    console.error(`subscribe [${ts()}]: failed to create draft:`, e)
    await pingHealthcheck(true)
    return
  }

  try {
    console.log(`subscribe [${ts()}]: sending draft to ${email}`)
    const sendResp = await fetch(`${BUTTONDOWN_EMAILS_URL}/${draftId}/send-draft`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ recipients: [email] })
    })
    console.log(`subscribe [${ts()}]: send-draft response ${sendResp.status}`)
    if (!sendResp.ok) {
      console.error(
        `subscribe: failed to send draft (${sendResp.status}): ${await sendResp.text()}`
      )
      await pingHealthcheck(true)
      return
    }
  } catch (e) {
    console.error(`subscribe [${ts()}]: failed to send draft:`, e)
    await pingHealthcheck(true)
    return
  }

  // The DELETE triggers Buttondown to finalise delivery. Buttondown processes it but
  // never returns an HTTP response, so the timeout error is expected and ignored.
  // The connection must stay open long enough for Buttondown to act (~8s observed).
  console.log(`subscribe [${ts()}]: deleting draft to trigger delivery`)
  await fetch(`${BUTTONDOWN_EMAILS_URL}/${draftId}`, {
    method: 'DELETE',
    headers,
    signal: AbortSignal.timeout(12000)
  }).catch(() => {})
  console.log(`subscribe [${ts()}]: sendWelcomeEmail complete`)
  await pingHealthcheck()
}
