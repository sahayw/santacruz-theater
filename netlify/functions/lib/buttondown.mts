/**
 * A small Buttondown API client for the subscribe, preferences and digest functions.
 *
 * Buttondown documents only one per-endpoint limit (creating subscribers, 100 an hour) and
 * no rate-limit headers, so a 429 is retried after a pause. Tag filters on emails take tag
 * ids, not names — see tagIds(). Subscribers take tag names, but a name Buttondown hasn't
 * seen becomes a colourless tag the dashboard doesn't list, so the subscriber calls create
 * any missing tag first.
 *
 * Required env var: BUTTONDOWN_API_KEY
 */

const API = 'https://api.buttondown.email/v1'
const TAG_COLOUR = '#3b82f6'

export interface Subscriber {
  id: string
  email_address: string
  type: string // 'regular', 'unsubscribed', 'unactivated', …
  tags: string[] // tag names
  metadata: Record<string, unknown>
}

export class ButtondownError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`Buttondown ${status}: ${body.slice(0, 300)}`)
  }
}

/** Buttondown subscriber ids are UUIDs — checked before one goes into a URL. */
export const isSubscriberId = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

export const isEmailAddress = (s: unknown): s is string =>
  typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function buttondown(apiKey = process.env.BUTTONDOWN_API_KEY) {
  if (!apiKey) throw new Error('missing BUTTONDOWN_API_KEY')

  async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 10000) {
    for (let attempt = 0; ; attempt++) {
      const resp = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
        method,
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Buttondown-Live-Dangerously': 'true'
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      if (resp.status === 429 && attempt < 3) {
        await sleep(5000 * (attempt + 1))
        continue
      }
      const text = await resp.text()
      if (!resp.ok) throw new ButtondownError(resp.status, text)
      return (text ? JSON.parse(text) : undefined) as T
    }
  }

  const sub = (idOrEmail: string) => `/subscribers/${encodeURIComponent(idOrEmail)}`

  /** Tag ids by name, creating any tag that doesn't exist yet (Buttondown requires a colour). */
  async function tagIds(names: string[]) {
    const ids: Record<string, string> = {}
    let next: string | null = '/tags'
    while (next) {
      const page: { results: { id: string; name: string }[]; next: string | null } = await call(
        'GET',
        next
      )
      for (const t of page.results) ids[t.name] = t.id
      next = page.next
    }
    for (const name of names)
      if (!ids[name])
        ids[name] = (
          await call<{ id: string }>('POST', '/tags', { name, color: TAG_COLOUR, description: '' })
        ).id
    return ids
  }

  return {
    /** Creates a subscriber; `null` when the address already exists (subscribed or not). */
    async createSubscriber(email: string, tags: string[], metadata: Record<string, unknown>) {
      await tagIds(tags)
      try {
        return await call<Subscriber>('POST', '/subscribers', {
          email_address: email,
          type: 'regular',
          tags,
          metadata
        })
      } catch (e) {
        if (e instanceof ButtondownError && (e.status === 400 || e.status === 409)) {
          if (/exist|already|collision|unsubscrib/i.test(e.body)) return null
        }
        throw e
      }
    },

    /** One subscriber by id or email address; `null` if there's none. */
    async getSubscriber(idOrEmail: string) {
      try {
        return await call<Subscriber>('GET', sub(idOrEmail))
      } catch (e) {
        if (e instanceof ButtondownError && e.status === 404) return null
        throw e
      }
    },

    /** Replaces the given fields (tags replace the whole tag list). */
    async updateSubscriber(
      id: string,
      fields: Partial<Pick<Subscriber, 'tags' | 'metadata' | 'type'>>
    ) {
      if (fields.tags) await tagIds(fields.tags)
      return call<Subscriber>('PATCH', sub(id), fields)
    },

    /** Every subscriber of `type` (carrying `tag`, if given), following pagination. */
    async listSubscribers(tag?: string, type = 'regular') {
      const all: Subscriber[] = []
      let next: string | null =
        `/subscribers?type=${encodeURIComponent(type)}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`
      while (next) {
        const page: { results: Subscriber[]; next: string | null } = await call('GET', next)
        all.push(...page.results)
        next = page.next
      }
      return all
    },

    tagIds,

    /**
     * Creates an email. `about_to_send` broadcasts it (to `filters`' subscribers);
     * `transactional` only creates it, for sendTo(); `draft` saves it unsent.
     */
    createEmail(email: {
      subject: string
      body: string
      status: 'about_to_send' | 'transactional' | 'draft'
      filters?: unknown
    }) {
      return call<{ id: string }>('POST', '/emails', email, 20000)
    },

    /** Sends an already-created email to one subscriber. */
    sendTo(subscriberIdOrEmail: string, emailId: string) {
      return call<unknown>('POST', `${sub(subscriberIdOrEmail)}/emails/${emailId}`)
    }
  }
}

export type Buttondown = ReturnType<typeof buttondown>

/** A Buttondown email filter: every condition must hold. */
export function allOf(...filters: { field: string; operator: string; value: string }[]) {
  return { filters, groups: [], predicate: 'and' }
}
