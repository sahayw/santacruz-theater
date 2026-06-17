/**
 * Subscription endpoint — adds a subscriber to the Buttondown mailing list, then triggers
 * the send-welcome-email-background function to send a welcome email asynchronously.
 *
 * POST /.netlify/functions/subscribe
 * Body: { "email": "user@example.com" }
 *
 * Required env var: BUTTONDOWN_API_KEY
 * Optional env var: SUBSCRIBE_HEALTHCHECK_URL — used by the background function, not here
 */

const BUTTONDOWN_SUBSCRIBERS_URL = 'https://api.buttondown.email/v1/subscribers'

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
      body: JSON.stringify({ email_address: email, type: 'regular' })
    })
    console.log(`subscribe [${ts()}]: subscriber POST response ${resp.status}`)

    if (resp.status === 201) {
      console.log(
        `subscribe [${ts()}]: subscriber created, triggering welcome email background function`
      )
      const deployUrl = process.env.DEPLOY_URL ?? ''
      await fetch(`${deployUrl}/.netlify/functions/send-welcome-email-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
        body: JSON.stringify({ email })
      }).catch((e) =>
        console.error(`subscribe [${ts()}]: failed to invoke background function:`, e)
      )
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
  } catch {
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
