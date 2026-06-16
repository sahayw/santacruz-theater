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

export async function apiPut(file, payload) {
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

export async function loadCompanies() {
  const data = await apiFetch('sc-theater-companies.json')
  return data.companies || []
}

// Returns sorted <option> HTML for a company <select>, excluding the admin sentinel.
// 'Other' is always last. Used by both calendar and auditions editors.
export function buildCompanyOptions(allCompanies) {
  const sorted = (allCompanies || [])
    .filter((c) => c.id !== 'admin')
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
