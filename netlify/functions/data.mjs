/**
 * Data file endpoint — reads and writes show/company JSON files via GitHub API.
 *
 * GET  /.netlify/functions/data?file=shows/2026/scs-2026.json
 *      Returns the file content. No auth required (data is public).
 *
 * PUT  /.netlify/functions/data?file=shows/2026/scs-2026.json
 *      Body: full file JSON. Requires a valid Netlify Identity JWT in the
 *      Authorization: Bearer header. Commits the file to GitHub, which
 *      triggers a Netlify rebuild.
 *
 * Required env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH
 */

const FILE_RE = /^[\w-]+(\/[\w-]+)*\.json$/

export const handler = async (event, context) => {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH = 'main' } = process.env

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return { statusCode: 500, body: 'Server misconfiguration: missing GitHub env vars' }
  }

  const ghHeaders = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }

  // ── DIR LISTING ──
  if (event.queryStringParameters?.dir === 'shows') {
    try {
      const listUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/shows?ref=${GITHUB_BRANCH}`
      const yearListResp = await fetch(listUrl, { headers: ghHeaders })
      if (!yearListResp.ok)
        return { statusCode: yearListResp.status, body: 'Failed to list shows directory' }
      const yearDirs = await yearListResp.json()
      const result = []
      for (const d of yearDirs.filter((x) => x.type === 'dir')) {
        const fileListResp = await fetch(d.url, { headers: ghHeaders })
        if (!fileListResp.ok) continue
        const files = await fileListResp.json()
        for (const f of files.filter((x) => x.type === 'file')) {
          const m = f.name.match(/^(.+)-(\d{4})\.json$/)
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
