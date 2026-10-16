/**
 * Reads and changes a subscriber's email choices for /subscribe/manage. The subscriber id
 * (`s`) is the bearer token — the same one Buttondown's own unsubscribe link carries.
 *
 * GET  /.netlify/functions/preferences?s=<subscriber id>
 *      → { email, lists, excluded }
 * POST { action: "update", s, lists, excluded }  — lists must not be empty
 * POST { action: "unsubscribe", s }
 * POST { action: "send-link", email }  — emails the address its link if it's on file; the
 *      reply is the same either way, so it never says whether an address is subscribed
 *
 * Required env var: BUTTONDOWN_API_KEY
 */

import type { Config, Context } from '@netlify/functions'
import { buttondown, isEmailAddress, isSubscriberId } from './lib/buttondown.mts'
import { loadCompanies } from './lib/company-data.mts'
import {
  choicesOf,
  json,
  readChoices,
  sendManageLink,
  subscriberFields
} from './lib/subscriptions.mts'

const NOT_FOUND = "That link doesn't work any more. Enter your email address and we'll send a new one."
const FAILED = 'Something went wrong — please try again shortly.'

export default async (req: Request, context: Context) => {
  try {
    const bd = buttondown()
    const companies = loadCompanies()

    if (req.method === 'GET') {
      const s = new URL(req.url).searchParams.get('s')
      const sub = isSubscriberId(s) ? await bd.getSubscriber(s) : null
      if (!sub) return json(404, { message: NOT_FOUND })
      return json(200, { email: sub.email_address, ...choicesOf(sub, companies) })
    }
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json(400, { message: 'Invalid request body' })
    }

    if (body.action === 'send-link') {
      const email = typeof body.email === 'string' ? body.email.trim() : ''
      if (!isEmailAddress(email)) return json(400, { message: 'Please enter a valid email address.' })
      context.waitUntil(
        bd
          .getSubscriber(email)
          .then((s) => s && sendManageLink(bd, s))
          .catch((e) => console.error('preferences: send-link failed:', e))
      )
      return json(200, {
        message: "If that address is subscribed, we've sent it a link to your choices."
      })
    }

    const sub = isSubscriberId(body.s) ? await bd.getSubscriber(body.s) : null
    if (!sub) return json(404, { message: NOT_FOUND })

    if (body.action === 'unsubscribe') {
      await bd.updateSubscriber(sub.id, { type: 'unsubscribed' })
      console.log(`preferences: ${sub.id} unsubscribed`)
      return json(200, { message: "You're unsubscribed. You won't get any more emails from us." })
    }

    if (body.action === 'update') {
      const choices = readChoices(body, companies)
      if (!choices.lists.length) return json(400, { message: 'Choose at least one kind of email.' })
      await bd.updateSubscriber(sub.id, {
        ...subscriberFields(choices, sub),
        ...(sub.type === 'unsubscribed' ? { type: 'regular' } : {})
      })
      console.log(`preferences: ${sub.id} lists=${choices.lists} excluded=${choices.excluded}`)
      return json(200, { message: 'Saved — your choices are updated.', ...choices })
    }

    return json(400, { message: 'Unknown action' })
  } catch (e) {
    console.error('preferences: failed:', e)
    return json(500, { message: FAILED })
  }
}

export const config: Config = {
  path: '/.netlify/functions/preferences'
}
