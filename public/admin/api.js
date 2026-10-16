export const IS_DEV = ['localhost', '127.0.0.1'].includes(window.location.hostname)

let _identityUser = null

export function getIdentityUser() {
  return _identityUser
}
export function setIdentityUser(u) {
  _identityUser = u
}

export async function apiFetch(file) {
  const resp = await fetch(`/.netlify/functions/data?file=${encodeURIComponent(file)}`)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

// ── Out-of-date editor ──
// /admin/version.json fingerprints the editor's code (src/pages/admin/version.json.ts).
// If it changes while a tab is open, the tab is running old code: it's asked to reload
// when it regains focus, and can't save until it does. An unreachable version file
// never blocks anything; the save function checks every save anyway.

async function fetchVersion() {
  try {
    const resp = await fetch('/admin/version.json', { cache: 'no-store' })
    return resp.ok ? (await resp.json()).version : null
  } catch {
    return null
  }
}

const loadedVersion = fetchVersion()

async function editorIsCurrent() {
  const [then, now] = await Promise.all([loadedVersion, fetchVersion()])
  return !then || !now || then === now
}

function showReloadBanner() {
  if (document.getElementById('editor-outdated')) return
  const bar = document.createElement('div')
  bar.id = 'editor-outdated'
  bar.setAttribute('role', 'alert')
  bar.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:10000;display:flex;gap:12px;align-items:center;' +
    'justify-content:center;flex-wrap:wrap;padding:10px 16px;background:#8f2f22;color:#fff;' +
    "font:14px 'DM Sans',sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25)"
  bar.textContent = 'The editor has been updated. Reload to use the new version before saving.'
  const btn = document.createElement('button')
  btn.textContent = 'Reload'
  btn.style.cssText =
    'font:inherit;font-weight:600;padding:4px 14px;border-radius:4px;border:none;cursor:pointer;' +
    'background:#fff;color:#8f2f22'
  btn.addEventListener('click', () => location.reload())
  bar.append(btn)
  document.body.append(bar)
}

async function checkForUpdate() {
  if (!(await editorIsCurrent())) showReloadBanner()
}
window.addEventListener('focus', checkForUpdate)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate()
})

export async function apiPut(file, payload) {
  if (!(await editorIsCurrent())) {
    showReloadBanner()
    throw new Error(
      'the editor has been updated since this page was opened. Reload the page, then make your changes again.'
    )
  }
  const hdrs = { 'Content-Type': 'application/json' }
  if (_identityUser) {
    hdrs['Authorization'] = `Bearer ${await _identityUser.jwt()}`
  }
  const resp = await fetch(`/.netlify/functions/data?file=${encodeURIComponent(file)}`, {
    method: 'PUT',
    headers: hdrs,
    body: JSON.stringify(payload, null, 2)
  })
  if (!resp.ok) {
    const msg = await resp.text()
    throw new Error(msg || `HTTP ${resp.status}`)
  }
}

/**
 * Deletes one record from a data file straight away: re-reads the file as saved,
 * removes the record with `id` from `data[key]`, and writes it back. Other unsaved
 * edits in the editor are untouched (they're saved, or not, by the next Save).
 */
export async function deleteRecordFromFile(file, key, id) {
  const data = await apiFetch(file)
  const records = data[key] || []
  const kept = records.filter((r) => r.id !== id)
  if (kept.length === records.length) return // not in the saved file — nothing to do
  await apiPut(file, { ...data, [key]: kept })
}

export async function apiUploadImage(filename, base64) {
  const hdrs = { 'Content-Type': 'application/json' }
  if (_identityUser) {
    hdrs['Authorization'] = `Bearer ${await _identityUser.jwt()}`
  }
  const resp = await fetch('/.netlify/functions/upload-image', {
    method: 'PUT',
    headers: hdrs,
    body: JSON.stringify({ filename, content: base64 })
  })
  if (!resp.ok) {
    const msg = await resp.text()
    throw new Error(msg || `HTTP ${resp.status}`)
  }
}

export async function loadCompanies() {
  const data = await apiFetch('sc-theater-companies.json')
  return data.companies || []
}

// Returns sorted <option> HTML for a company <select>: the companies with data files of
// their own, then 'Other' (the shared file for organizers without their own). Excludes
// the admin sentinel and the organizers filed under Other. Used by both editors.
export function buildCompanyOptions(allCompanies) {
  const sorted = (allCompanies || [])
    .filter((c) => c.id !== 'admin' && !c.filedUnderOther)
    .sort((a, b) => {
      if (a.id === 'other') return 1
      if (b.id === 'other') return -1
      return (a.abvName || a.name).localeCompare(b.abvName || b.name)
    })
  return (
    '<option value="">— Company —</option>' +
    sorted.map((c) => `<option value="${c.id}">${c.abvName || c.name}</option>`).join('')
  )
}

// Returns { isAdmin, datasets, company } or null if no access.
// datasets: which dataset keys this user may edit, e.g. ['calendar', 'auditions']
// company: the matching CompanyEntry for non-admin users; null for admin
export function resolveUserAccess(email, companies) {
  const adminEntry = companies.find((c) => c.id === 'admin')
  if (adminEntry?.editors) {
    const match = adminEntry.editors.find((e) => e.email === email)
    if (match) return { isAdmin: true, datasets: match.datasets, company: null }
  }
  for (const co of companies) {
    if (co.id === 'admin') continue
    const match = co.editors?.find((e) => e.email === email)
    if (match) return { isAdmin: false, datasets: match.datasets, company: co }
  }
  return null
}
