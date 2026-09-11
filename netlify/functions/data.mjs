/**
 * Data file endpoint — reads and writes show/company/activity JSON files.
 *
 * GET  /.netlify/functions/data?file=shows/2026/scs-2026.json
 *      Returns the file content. No auth required (data is public).
 * GET  /.netlify/functions/data?dir=shows            (or dir=activities)
 *      Returns [{ companyId, year }, ...] for every data file found.
 * PUT  /.netlify/functions/data?file=shows/2026/scs-2026.json
 *      Body: full file JSON. Requires a valid Netlify Identity JWT in the
 *      Authorization: Bearer header. Commits the file to GitHub, which
 *      triggers a Netlify rebuild.
 *
 * LOCAL DEV: under `netlify dev` (NETLIFY_DEV=true) every read and write goes
 * straight to the local `data/` tree — no GitHub API, no auth. Editor changes
 * land on disk so they can be exercised offline and reviewed with `git diff`
 * before pushing. Use http://localhost:8888/admin (the netlify dev port), not
 * the bare Astro port.
 *
 * Required env vars (production only): GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH
 */

import { promises as fs } from 'node:fs'
import { join, dirname, sep } from 'node:path'

const FILE_RE = /^[\w-]+(\/[\w-]+)*\.json$/

const LOCAL_FS = process.env.NETLIFY_DEV === 'true'
const DATA_ROOT = join(process.cwd(), 'data')

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  }
}

// ── LOCAL FILESYSTEM MODE (netlify dev) ──────────────────────────────────────
async function localHandler(event) {
  // ── DIR LISTING ──
  const dirParam = event.queryStringParameters?.dir
  if (dirParam === 'shows' || dirParam === 'activities') {
    const baseDir = join(DATA_ROOT, dirParam)
    const nameRe =
      dirParam === 'activities'
        ? /^(.+)-activities-(\d{4})\.json$/
        : /^(.+)-(\d{4})\.json$/
    let yearDirs
    try {
      yearDirs = await fs.readdir(baseDir, { withFileTypes: true })
    } catch {
      return jsonResponse(200, [])
    }
    const result = []
    for (const d of yearDirs) {
      if (!d.isDirectory()) continue
      let files
      try {
        files = await fs.readdir(join(baseDir, d.name))
      } catch {
        continue
      }
      for (const name of files) {
        const m = name.match(nameRe)
        if (m) result.push({ companyId: m[1], year: parseInt(m[2], 10) })
      }
    }
    return jsonResponse(200, result)
  }

  const fileParam = event.queryStringParameters?.file
  if (!fileParam || !FILE_RE.test(fileParam)) {
    return { statusCode: 400, body: 'Invalid or missing file parameter' }
  }
  const abs = join(DATA_ROOT, fileParam)
  if (!abs.startsWith(DATA_ROOT + sep)) {
    return { statusCode: 400, body: 'Invalid file parameter' }
  }

  // ── GET ──
  if (event.httpMethod === 'GET') {
    try {
      const content = await fs.readFile(abs, 'utf-8')
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: content
      }
    } catch (e) {
      if (e.code === 'ENOENT') return { statusCode: 404, body: `Not found: data/${fileParam}` }
      return { statusCode: 500, body: e.message }
    }
  }

  // ── PUT ──
  if (event.httpMethod === 'PUT') {
    const bodyText = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body || ''
    try {
      JSON.parse(bodyText)
    } catch {
      return { statusCode: 400, body: 'Request body is not valid JSON' }
    }
    try {
      await fs.mkdir(dirname(abs), { recursive: true })
      await fs.writeFile(abs, bodyText, 'utf-8')
      console.log(`[data] local dev write → data/${fileParam}`)
      return { statusCode: 200, body: 'OK (local dev: wrote to data/ on disk, not committed)' }
    } catch (e) {
      return { statusCode: 500, body: e.message }
    }
  }

  return { statusCode: 405, body: 'Method not allowed' }
}

export const handler = async (event, context) => {
  if (LOCAL_FS) return localHandler(event)

  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, BRANCH } = process.env
  const GITHUB_BRANCH = BRANCH || process.env.GITHUB_BRANCH || 'main'

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return { statusCode: 500, body: 'Server misconfiguration: missing GitHub env vars' }
  }

  const ghHeaders = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }

  // ── DIR LISTING ──
  const dirParam = event.queryStringParameters?.dir
  if (dirParam === 'shows' || dirParam === 'activities') {
    try {
      const listUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/${dirParam}?ref=${GITHUB_BRANCH}`
      const yearListResp = await fetch(listUrl, { headers: ghHeaders })
      if (!yearListResp.ok)
        return { statusCode: yearListResp.status, body: `Failed to list ${dirParam} directory` }
      const yearDirs = await yearListResp.json()
      const result = []
      // activities files: <company>-activities-<year>.json; shows files: <company>-<year>.json
      const fileRe = dirParam === 'activities'
        ? /^(.+)-activities-(\d{4})\.json$/
        : /^(.+)-(\d{4})\.json$/
      for (const d of yearDirs.filter((x) => x.type === 'dir')) {
        const fileListResp = await fetch(d.url, { headers: ghHeaders })
        if (!fileListResp.ok) continue
        const files = await fileListResp.json()
        for (const f of files.filter((x) => x.type === 'file')) {
          const m = f.name.match(fileRe)
          if (m) result.push({ companyId: m[1], year: parseInt(m[2], 10) })
        }
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      }
    } catch (e) {
      return { statusCode: 500, body: e.message }
    }
  }

  const fileParam = event.queryStringParameters?.file
  if (!fileParam || !FILE_RE.test(fileParam)) {
    return { statusCode: 400, body: 'Invalid or missing file parameter' }
  }

  const apiPath = `data/${fileParam}`
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${apiPath}`

  // ── GET ──
  if (event.httpMethod === 'GET') {
    try {
      const resp = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders })
      if (!resp.ok) return { statusCode: resp.status, body: `GitHub API error: ${resp.status}` }
      const data = await resp.json()
      const content = Buffer.from(data.content, 'base64').toString('utf-8')
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: content
      }
    } catch (e) {
      return { statusCode: 500, body: e.message }
    }
  }

  // ── PUT ──
  if (event.httpMethod === 'PUT') {
    // Require Netlify Identity — context.clientContext.user is populated
    // automatically by Netlify when a valid Identity JWT is in the Authorization header.
    const user = context.clientContext?.user
    if (!user) {
      return { statusCode: 401, body: 'Unauthorized — please log in' }
    }

    const bodyText = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body || ''

    try {
      JSON.parse(bodyText)
    } catch {
      return { statusCode: 400, body: 'Request body is not valid JSON' }
    }

    try {
      // Fetch current SHA (required by GitHub API for updates; omit for new files)
      const getResp = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders })
      if (!getResp.ok && getResp.status !== 404)
        return { statusCode: getResp.status, body: 'Failed to fetch current file SHA' }
      const sha = getResp.status === 404 ? undefined : (await getResp.json()).sha

      const encoded = Buffer.from(bodyText).toString('base64')
      const putResp = await fetch(apiUrl, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Update ${fileParam} via editor [${user.email}]`,
          content: encoded,
          sha,
          branch: GITHUB_BRANCH
        })
      })

      if (!putResp.ok) {
        const errText = await putResp.text()
        return { statusCode: putResp.status, body: `GitHub commit failed: ${errText}` }
      }

      return { statusCode: 200, body: 'OK' }
    } catch (e) {
      return { statusCode: 500, body: e.message }
    }
  }

  return { statusCode: 405, body: 'Method not allowed' }
}
