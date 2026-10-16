/**
 * Subscription endpoint — adds a subscriber with their chosen lists, then sends them one
 * welcome email with a section per list. An address that's already on file is emailed a
 * link to its choices instead; the reply is the same either way, so it never says
 * whether an address is subscribed.
 *
 * Netlify Functions v2. context.waitUntil() sends the email after the response returns.
 *
 * POST /.netlify/functions/subscribe
 * Body: { "email": "user@example.com", "lists": ["performances", "auditions-events"],
 *         "excluded": ["at"] }   — lists defaults to ["auditions-events"]
 *
 * Required env var: BUTTONDOWN_API_KEY
 * Optional env var: SUBSCRIBE_HEALTHCHECK_URL — base URL; pinged on success, {url}/fail on error
 */

import type { Config, Context } from '@netlify/functions'
import { buttondown, isEmailAddress } from './lib/buttondown.mts'
import { siteUrl } from './lib/site.mts'
import { loadCompanies } from './lib/company-data.mts'
import {
  json,
  readChoices,
  sendManageLink,
  sendWelcome,
  subscriberFields
} from './lib/subscriptions.mts'

const DONE = "Thanks! Check your inbox — we've sent you an email."
const FAILED = 'Something went wrong — please try again shortly.'

const pingHealthcheck = (fail = false) => {
  const base = process.env.SUBSCRIBE_HEALTHCHECK_URL
  if (!base) return Promise.resolve()
  return fetch(fail ? `${base}/fail` : base).catch(() => {})
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let body: { email?: unknown; lists?: unknown; excluded?: unknown }
  try {
    body = await req.json()
  } catch {
    return json(400, { message: 'Invalid request body' })
  }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!isEmailAddress(email)) return json(400, { message: 'Please enter a valid email address.' })
  const choices = readChoices(
    { lists: body.lists ?? ['auditions-events'], excluded: body.excluded },
    loadCompanies()
  )
  if (!choices.lists.length) return json(400, { message: 'Choose at least one kind of email.' })

  try {
    const bd = buttondown()
    const { tags, metadata } = subscriberFields(choices)
    const created = await bd.createSubscriber(email, tags, metadata)
    if (created) {
      console.log(
        `subscribe: created ${created.id} lists=${choices.lists} excluded=${choices.excluded}`
      )
      context.waitUntil(
        sendWelcome(bd, created, choices, siteUrl(req, context)).then(
          () => pingHealthcheck(),
          (e) => {
            console.error('subscribe: welcome email failed:', e)
            return pingHealthcheck(true)
          }
        )
      )
    } else {
      console.log('subscribe: address already on file — sending its manage link')
      context.waitUntil(
        bd
          .getSubscriber(email)
          .then((s) => s && sendManageLink(bd, s, siteUrl(req, context)))
          .catch((e) => console.error('subscribe: manage-link email failed:', e))
      )
    }
    return json(200, { message: DONE })
  } catch (e) {
    console.error('subscribe: failed:', e)
    await pingHealthcheck(true)
    return json(500, { message: FAILED })
  }
}

export const config: Config = {
  path: '/.netlify/functions/subscribe'
}
