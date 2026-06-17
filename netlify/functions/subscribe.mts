/**
 * Subscription endpoint — adds a subscriber to the Buttondown mailing list, then sends
 * them a one-off welcome email listing current upcoming auditions.
 *
 * POST /.netlify/functions/subscribe
 * Body: { "email": "user@example.com" }
 *
 * Required env var: BUTTONDOWN_API_KEY
 * Optional env var: SUBSCRIBE_HEALTHCHECK_URL — pinged if the welcome email fails to send
 */

import { buildWelcomeHtml } from './lib/email-template.mts'
import { loadAllAuditions, getUpcomingAuditions } from './lib/auditions-data.mts'

const BUTTONDOWN_SUBSCRIBERS_URL = 'https://api.buttondown.email/v1/subscribers'
const BUTTONDOWN_EMAILS_URL = 'https://api.buttondown.email/v1/emails'
const SITE_URL = 'https://santacruz.theater'

export const handler = async (event: {
  httpMethod: string
  isBase64Encoded: boolean
  body: string | null
}) => {
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
    const resp = await fetch(BUTTONDOWN_SUBSCRIBERS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BUTTONDOWN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email_address: email, type: 'regular' })
    })

    if (resp.status === 201) {
      await sendWelcomeEmail(email, BUTTONDOWN_API_KEY)
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
  } catch {
    return json(500, 'Something went wrong — please try again shortly.')
  }
}

const pingHealthcheck = () => {
  if (process.env.SUBSCRIBE_HEALTHCHECK_URL) {
    return fetch(process.env.SUBSCRIBE_HEALTHCHECK_URL).catch(() => {})
  }
}

async function sendWelcomeEmail(email: string, apiKey: string) {
  const headers = {
    'Authorization': `Token ${apiKey}`,
    'Content-Type': 'application/json'
  }

  let draftId: string | undefined
  try {
    const auditions = getUpcomingAuditions(loadAllAuditions())
    const html = buildWelcomeHtml(auditions, SITE_URL)

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
    if (!createResp.ok) {
      console.error(
        `subscribe: failed to create welcome draft (${createResp.status}): ${await createResp.text()}`
      )
      await pingHealthcheck()
      return
    }
    const created = await createResp.json()
    draftId = created.id
  } catch (e) {
    console.error('subscribe: failed to create welcome draft:', e)
    await pingHealthcheck()
    return
  }

  try {
    const sendResp = await fetch(`${BUTTONDOWN_EMAILS_URL}/${draftId}/send-draft`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ recipients: [email] })
    })
    if (!sendResp.ok) {
      console.error(
        `subscribe: failed to send welcome draft (${sendResp.status}): ${await sendResp.text()}`
      )
      await pingHealthcheck()
    }
  } catch (e) {
    console.error('subscribe: failed to send welcome draft:', e)
    await pingHealthcheck()
  } finally {
    try {
      const delResp = await fetch(`${BUTTONDOWN_EMAILS_URL}/${draftId}`, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(8000)
      })
      if (!delResp.ok && delResp.status !== 404) {
        console.error(`subscribe: failed to delete welcome draft ${draftId} (${delResp.status})`)
        await pingHealthcheck()
      }
    } catch (e) {
      console.error(`subscribe: failed to delete welcome draft ${draftId}:`, e)
      await pingHealthcheck()
    }
  }
}

function json(status: number, message: string) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  }
}
