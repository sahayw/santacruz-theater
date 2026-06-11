/**
 * Scheduled function — sends a daily email digest of new/updated auditions.
 *
 * Runs at 02:00 UTC daily. Schedule is the cron expression in the schedule() call below.
 * Reads auditions from GitHub, compares against the last-sent timestamp stored
 * in Netlify Blob Storage, formats a digest via email-template.mts, and sends
 * to all subscribers via the Buttondown broadcast API.
 *
 * Set DRY_RUN=true to log which records would be included without sending.
 *
 * Required env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH,
 *                    BUTTONDOWN_API_KEY, NETLIFY_SITE_ID, NETLIFY_TOKEN
 */

import { schedule } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { buildDigestHtml, type DigestAudition } from './lib/email-template.mts'
import type { AuditionsFile } from '../../src/types.ts'

const BLOB_STORE = 'audition-notifications'
const BLOB_KEY = 'last-sent'
const BUTTONDOWN_URL = 'https://api.buttondown.email/v1/emails'
const SITE_URL = 'https://santacruz.theater'

const pingHealthcheck = () => {
  if (process.env.HEALTHCHECK_URL) {
    return fetch(process.env.HEALTHCHECK_URL).catch(() => {})
  }
}

export const handler = schedule('*/5 * * * *', async () => {
  const {
    GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO,
    GITHUB_BRANCH = 'main',
    BUTTONDOWN_API_KEY,
    DRY_RUN
  } = process.env

  const isDryRun = DRY_RUN === 'true'

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    console.error('send-audition-digest: missing GitHub env vars')
    return
  }
  if (!BUTTONDOWN_API_KEY) {
    console.error('send-audition-digest: missing BUTTONDOWN_API_KEY')
    return
  }

  const { NETLIFY_SITE_ID, NETLIFY_TOKEN } = process.env
  if (!NETLIFY_SITE_ID || !NETLIFY_TOKEN) {
    console.error('send-audition-digest: missing NETLIFY_SITE_ID or NETLIFY_TOKEN (required for Blob Storage)')
    return
  }

  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }

  // ── 1. Read last-sent timestamp ──────────────────────────────────────────
  const store = getStore({ name: BLOB_STORE, siteID: NETLIFY_SITE_ID, token: NETLIFY_TOKEN })
  const lastSentStr = await store.get(BLOB_KEY)
  const lastSent = lastSentStr ? new Date(lastSentStr) : new Date(0)
  console.log(`send-audition-digest: last sent ${lastSent.toISOString()}`)

  // ── 2. Read all audition files from GitHub ───────────────────────────────
  const auditions: DigestAudition[] = []
  const nameMap: Record<string, string> = {}

  try {
    // Company names for display
    const companiesUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/sc-theater-companies.json?ref=${GITHUB_BRANCH}`
    const companiesResp = await fetch(companiesUrl, { headers: ghHeaders })
    if (companiesResp.ok) {
      const companiesData = await companiesResp.json()
      const companies: Array<{ id: string; name: string }> =
        JSON.parse(Buffer.from(companiesData.content, 'base64').toString('utf-8')).companies
      for (const c of companies) nameMap[c.id] = c.name
    }

    // Audition files
    const listUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/auditions?ref=${GITHUB_BRANCH}`
    const yearListResp = await fetch(listUrl, { headers: ghHeaders })
    if (!yearListResp.ok) {
      console.error(`send-audition-digest: failed to list auditions dir (${yearListResp.status})`)
      return
    }
    const yearDirs = await yearListResp.json()
    const fileRe = /^.+-auditions-\d{4}\.json$/

    for (const dir of (yearDirs as Array<{ type: string; url: string }>).filter(x => x.type === 'dir')) {
      const fileListResp = await fetch(dir.url, { headers: ghHeaders })
      if (!fileListResp.ok) continue
      const files = await fileListResp.json()

      for (const f of (files as Array<{ type: string; name: string; url: string }>)
        .filter(x => x.type === 'file' && fileRe.test(x.name))) {
        const fileResp = await fetch(f.url, { headers: ghHeaders })
        if (!fileResp.ok) continue
        const fileData = await fileResp.json()
        const parsed: AuditionsFile = JSON.parse(
          Buffer.from(fileData.content, 'base64').toString('utf-8')
        )
        for (const a of parsed.auditions) {
          auditions.push({
            ...a,
            company: parsed.company,
            companyName: nameMap[parsed.company] ?? parsed.company,
            year: parsed.year
          })
        }
      }
    }
  } catch (e) {
    console.error('send-audition-digest: failed to read auditions:', e)
    return
  }

  // ── 3. Classify new vs updated ───────────────────────────────────────────
  const byDate = (a: DigestAudition, b: DigestAudition) =>
    (a.auditionDates[0]?.date ?? '').localeCompare(b.auditionDates[0]?.date ?? '')

  const newAuditions = auditions
    .filter(a => new Date(a.createdAt) > lastSent)
    .sort(byDate)

  const updatedAuditions = auditions
    .filter(a => new Date(a.updatedAt) > lastSent && new Date(a.createdAt) <= lastSent)
    .sort(byDate)

  console.log(`send-audition-digest: ${newAuditions.length} new, ${updatedAuditions.length} updated`)

  if (newAuditions.length === 0 && updatedAuditions.length === 0) {
    console.log('send-audition-digest: nothing to send')
    await pingHealthcheck()
    return
  }

  for (const a of newAuditions) {
    console.log(`  NEW     ${a.production} (${a.company}) createdAt=${a.createdAt}`)
  }
  for (const a of updatedAuditions) {
    console.log(`  UPDATED ${a.production} (${a.company}) updatedAt=${a.updatedAt}`)
  }

  if (isDryRun) {
    console.log('send-audition-digest: DRY_RUN — skipping send')
    return
  }

  // ── 4. Format and send digest ────────────────────────────────────────────
  const total = newAuditions.length + updatedAuditions.length
  const subject = total === 1
    ? 'New audition notice — Santa Cruz Theater'
    : `${total} audition notices — Santa Cruz Theater`

  const html = buildDigestHtml(newAuditions, updatedAuditions, SITE_URL)

  try {
    const sendResp = await fetch(BUTTONDOWN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${BUTTONDOWN_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Buttondown-Live-Dangerously': 'true'
      },
      body: JSON.stringify({ subject, body: html, status: 'about_to_send' })
    })
    if (!sendResp.ok) {
      const err = await sendResp.text()
      console.error(`send-audition-digest: Buttondown error ${sendResp.status}: ${err}`)
      return
    }
    console.log(`send-audition-digest: sent "${subject}"`)
  } catch (e) {
    console.error('send-audition-digest: failed to send email:', e)
    return
  }

  // ── 5. Update timestamp (only on success) ────────────────────────────────
  try {
    await store.set(BLOB_KEY, new Date().toISOString())
    console.log('send-audition-digest: timestamp updated')
  } catch (e) {
    console.error('send-audition-digest: failed to update timestamp:', e)
  }

  // ── 6. Ping healthcheck monitor ──────────────────────────────────────────
  await pingHealthcheck()
})
