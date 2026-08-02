/**
 * Google Calendar API client helper, for the Google Calendar sync function.
 *
 * Auth: a service account JWT (no domain-wide delegation — calendars are owned by a
 * real Google account and shared with the service account email). See
 * docs/google-calendar-sync.md for the manual setup steps.
 *
 * Required env vars: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 * (stored with literal \n; unescaped here).
 */

import { createHash } from 'node:crypto'
import { JWT, gaxios } from 'google-auth-library'

const { GaxiosError } = gaxios
type GaxiosOptions = gaxios.GaxiosOptions
type GaxiosResponse<T> = gaxios.GaxiosResponse<T>

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'
const MANAGED_MARKER = 'sctheaterManaged=true'
const MAX_RETRIES = 5
const BASE_DELAY_MS = 500
// Reasons Google returns for 403s that are worth retrying (quota/rate-limit related).
// A 403 for insufficient permissions (e.g. calendar not shared with the service
// account) is not transient and should surface immediately instead of being retried.
const RETRYABLE_403_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'])

export interface CalendarEventBody {
  summary: string
  description?: string
  location?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  extendedProperties: { private: Record<string, string> }
}

export interface ContentHashFields {
  summary: string
  description?: string
  location?: string
  start: string
  end: string
}

let cachedClient: JWT | null = null

export function getAuthorizedClient(): JWT {
  if (cachedClient) return cachedClient

  const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY } = process.env
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error('google-calendar: missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  }

  // Tolerate a stray wrapping pair of literal double-quotes, e.g. from pasting the
  // "private_key": "..." field of the downloaded JSON key straight into Netlify
  // including the JSON string's own quote delimiters.
  const key = GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n')

  cachedClient = new JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key,
    scopes: ['https://www.googleapis.com/auth/calendar']
  })
  return cachedClient
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function errorReason(e: gaxios.GaxiosError): string | undefined {
  const data = e.response?.data as { error?: { errors?: Array<{ reason?: string }> } } | undefined
  return data?.error?.errors?.[0]?.reason
}

function isRetryable(e: unknown): boolean {
  if (!(e instanceof GaxiosError)) return false
  const status = e.response?.status
  if (status === 429) return true
  if (status === 403) return RETRYABLE_403_REASONS.has(errorReason(e) ?? '')
  return false
}

async function requestWithRetry<T>(client: JWT, opts: GaxiosOptions, attempt = 0): Promise<GaxiosResponse<T>> {
  try {
    return await client.request<T>(opts)
  } catch (e) {
    if (isRetryable(e) && attempt < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 250
      console.warn(`google-calendar: retryable error on ${opts.method} ${opts.url}, attempt ${attempt + 1}/${MAX_RETRIES}, waiting ${Math.round(delay)}ms`)
      await sleep(delay)
      return requestWithRetry<T>(client, opts, attempt + 1)
    }
    throw e
  }
}

function statusOf(e: unknown): number | undefined {
  return e instanceof GaxiosError ? e.response?.status : undefined
}

/**
 * Lists events tagged sctheaterManaged=true in the given window, returning a map of
 * event id -> stored sctheaterContentHash, for diffing against the freshly computed
 * desired set.
 */
export async function listManagedEvents(calendarId: string, timeMin: string, timeMax: string): Promise<Map<string, string>> {
  const client = getAuthorizedClient()
  const result = new Map<string, string>()
  let pageToken: string | undefined

  interface EventsListResponse {
    nextPageToken?: string
    items?: Array<{ id?: string; extendedProperties?: { private?: Record<string, string> } }>
  }

  do {
    const res = await requestWithRetry<EventsListResponse>(client, {
      url: `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      method: 'GET',
      params: {
        privateExtendedProperty: MANAGED_MARKER,
        singleEvents: true,
        showDeleted: false,
        timeMin,
        timeMax,
        maxResults: 2500,
        fields: 'nextPageToken,items(id,extendedProperties)',
        ...(pageToken ? { pageToken } : {})
      }
    })

    for (const item of res.data.items ?? []) {
      const hash = item.extendedProperties?.private?.sctheaterContentHash
      if (item.id && hash) result.set(item.id, hash)
    }
    pageToken = res.data.nextPageToken
  } while (pageToken)

  return result
}

/**
 * Inserts a new event with an explicit id. Falls back to update on 409, which happens
 * specifically when this id was previously deleted: Google never truly deletes an
 * event, deleteEvent() leaves a status:"cancelled" tombstone at that id, invisible to
 * listManagedEvents (showDeleted=false) but still occupying the id — so reconcile()
 * sees it as "missing" and routes it here as an insert. Without explicitly setting
 * status back to "confirmed" in the fallback PATCH, the event stays cancelled/invisible
 * forever and this id would show as "insert" again on every future run.
 */
export async function insertEvent(calendarId: string, id: string, eventBody: CalendarEventBody): Promise<void> {
  const client = getAuthorizedClient()
  const body = { ...eventBody, status: 'confirmed' as const }
  try {
    await requestWithRetry(client, {
      url: `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      method: 'POST',
      data: { id, ...body }
    })
  } catch (e) {
    if (statusOf(e) === 409) {
      await requestWithRetry(client, {
        url: `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`,
        method: 'PATCH',
        data: body
      })
      return
    }
    throw e
  }
}

/**
 * Updates an event already known to exist (its id came back from listManagedEvents,
 * so it's a real, currently-visible event) — a direct PATCH, no insert-then-fallback
 * needed. Using insertEvent() for known updates would waste a guaranteed-to-fail POST
 * on every single one, roughly doubling real request volume for update-heavy runs.
 */
export async function updateEvent(calendarId: string, id: string, eventBody: CalendarEventBody): Promise<void> {
  const client = getAuthorizedClient()
  const body = { ...eventBody, status: 'confirmed' as const }
  await requestWithRetry(client, {
    url: `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`,
    method: 'PATCH',
    data: body
  })
}

/** Deletes an event by id; tolerates 404/410 (already gone). */
export async function deleteEvent(calendarId: string, id: string): Promise<void> {
  const client = getAuthorizedClient()
  try {
    await requestWithRetry(client, {
      url: `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`,
      method: 'DELETE'
    })
  } catch (e) {
    const status = statusOf(e)
    if (status === 404 || status === 410) return
    throw e
  }
}

/** Stable SHA-1 hex digest over the fields the sync controls, for change detection. */
export function computeContentHash(fields: ContentHashFields): string {
  const stable = JSON.stringify({
    summary: fields.summary,
    description: fields.description ?? '',
    location: fields.location ?? '',
    start: fields.start,
    end: fields.end
  })
  return createHash('sha1').update(stable).digest('hex')
}
