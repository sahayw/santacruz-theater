/**
 * Image upload endpoint — commits image files to public/images/services/ via GitHub API.
 *
 * PUT  /.netlify/functions/upload-image
 *      Body: { filename: "jane-smith.jpg", content: "<base64>" }
 *      Requires a valid Netlify Identity JWT in the Authorization: Bearer header.
 *      Commits the image to public/images/services/<filename> in GitHub,
 *      which triggers a Netlify rebuild so the image becomes available at
 *      /images/services/<filename>.
 *
 * Required env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH
 */

const FILENAME_RE = /^[\w-]+\.(jpg|jpeg|png|webp)$/i

export const handler = async (event, context) => {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, BRANCH } = process.env
  const GITHUB_BRANCH = BRANCH || process.env.GITHUB_BRANCH || 'main'

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return { statusCode: 500, body: 'Server misconfiguration: missing GitHub env vars' }
  }

  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const user = context.clientContext?.user
  if (!user) {
    return { statusCode: 401, body: 'Unauthorized — please log in' }
  }

  let body
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body || ''
    body = JSON.parse(raw)
  } catch {
    return { statusCode: 400, body: 'Request body is not valid JSON' }
  }

  const { filename, content } = body

  if (!filename || !FILENAME_RE.test(filename)) {
    return {
      statusCode: 400,
      body: 'Invalid filename — must use only letters, numbers, hyphens with a .jpg, .jpeg, .png, or .webp extension'
    }
  }

  if (!content || typeof content !== 'string') {
    return { statusCode: 400, body: 'Missing image content' }
  }

  const ghHeaders = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }

  const apiPath = `public/images/services/${filename}`
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${apiPath}`

  try {
    // Fetch current SHA if file exists (required by GitHub API for updates)
    const getResp = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders })
    if (!getResp.ok && getResp.status !== 404) {
      return { statusCode: getResp.status, body: 'Failed to check existing file' }
    }
    const sha = getResp.status === 404 ? undefined : (await getResp.json()).sha

    const putResp = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Upload image ${filename} via editor [${user.email}]`,
        content,
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
