/**
 * Subscription endpoint — adds a subscriber to the Buttondown mailing list.
 *
 * POST /.netlify/functions/subscribe
 * Body: { "email": "user@example.com" }
 *
 * Required env var: BUTTONDOWN_API_KEY
 */

const BUTTONDOWN_URL = 'https://api.buttondown.email/v1/subscribers'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const { BUTTONDOWN_API_KEY } = process.env
  if (!BUTTONDOWN_API_KEY) {
    return { statusCode: 500, body: 'Server misconfiguration: missing BUTTONDOWN_API_KEY' }
  }

  let email
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body || ''
    email = JSON.parse(body).email?.trim()
  } catch {
    return { statusCode: 400, body: 'Invalid request body' }
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, 'Please enter a valid email address.')
  }

  try {
    const resp = await fetch(BUTTONDOWN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BUTTONDOWN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email_address: email, type: 'regular' })
    })

    if (resp.status === 201) return json(200, 'Thanks — check your inbox to confirm your subscription.')
    if (resp.status === 422) return json(422, 'That address is already subscribed.')
    if (resp.status === 400) return json(400, 'Please enter a valid email address.')
    return json(500, 'Something went wrong — please try again shortly.')
  } catch {
    return json(500, 'Something went wrong — please try again shortly.')
  }
}

function json(status, message) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  }
}
