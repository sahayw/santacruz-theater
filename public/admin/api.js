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

// Date pickers can't normally be copied from or pasted into; this adds both for every
// <input type="date"> (including ones rendered later) without losing the picker.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function parseDateText(text) {
  const s = text.trim()
  let y, m, d
  let match
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/))) {
    ;[, y, m, d] = match
  } else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) {
    ;[, m, d, y] = match
    if (y.length === 2) y = '20' + y
  } else if (
    (match = s.match(
      /^(?:[a-z]+,?\s+)?([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i
    ))
  ) {
    m = MONTHS.indexOf(match[1].toLowerCase()) + 1
    ;[, , d, y] = match
  } else {
    return null
  }
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const dt = new Date(iso + 'T00:00:00Z')
  return Number(m) >= 1 && !isNaN(dt) && dt.toISOString().slice(0, 10) === iso ? iso : null
}

if (typeof document !== 'undefined') {
  const applyPastedDate = (el, text) => {
    const iso = parseDateText(text)
    if (!iso) return
    el.value = iso
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const isSafari = /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent)
  document.documentElement.classList.toggle('date-safari', isSafari)
  const isDateInput = (el) => el instanceof HTMLInputElement && el.type === 'date'

  // Chrome has no native undo for date fields, and pasted values bypass it anyway, so keep a
  // per-field history of values and restore the previous one on Cmd/Ctrl+Z.
  const dateHistory = new WeakMap()
  const lastDateValue = new WeakMap()
  let undoing = false
  document.addEventListener('focusin', (e) => {
    if (isDateInput(e.target) && !lastDateValue.has(e.target)) {
      lastDateValue.set(e.target, e.target.value)
    }
  })
  document.addEventListener(
    'change',
    (e) => {
      const el = e.target
      if (undoing || !isDateInput(el)) return
      const stack = dateHistory.get(el) || []
      stack.push(lastDateValue.get(el) ?? '')
      dateHistory.set(el, stack)
      lastDateValue.set(el, el.value)
    },
    true
  )
  const undoDate = (el) => {
    const stack = dateHistory.get(el)
    if (!stack?.length) return
    el.value = stack.pop()
    lastDateValue.set(el, el.value)
    undoing = true
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    undoing = false
  }

  // Date fields don't reliably fire copy/paste events, so the shortcuts are handled on keydown.
  document.addEventListener('keydown', (e) => {
    const el = e.target
    if (!isDateInput(el) || !(e.metaKey || e.ctrlKey) || e.altKey) return
    const key = e.key.toLowerCase()
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undoDate(el)
    } else if (key === 'c' && el.value) {
      e.preventDefault()
      navigator.clipboard?.writeText(el.value).catch(() => {})
    } else if (key === 'v' && navigator.clipboard?.readText) {
      e.preventDefault()
      navigator.clipboard
        .readText()
        .then((text) => applyPastedDate(el, text))
        .catch(() => {})
    }
  })
  document.addEventListener('paste', (e) => {
    if (!isDateInput(e.target)) return
    e.preventDefault()
    applyPastedDate(e.target, e.clipboardData.getData('text'))
  })
  // A click anywhere on a date field focuses the field as a whole and opens the picker,
  // instead of landing in the month, day or year segment. Esc closes the picker natively.
  document.addEventListener('mousedown', (e) => {
    const el = e.target
    if (!(el instanceof HTMLInputElement) || el.type !== 'date' || el.disabled || el.readOnly)
      return
    if (!isSafari || e.button !== 0) return
    e.preventDefault()
    el.focus()
    try {
      el.showPicker()
    } catch {}
  })
  // Safari's picker ignores Esc; refocusing the field dismisses it and keeps the field selected.
  document.addEventListener('keydown', (e) => {
    const el = e.target
    if (!isSafari || e.key !== 'Escape' || !isDateInput(el)) return
    el.blur()
    el.focus()
  })
  document.addEventListener('copy', (e) => {
    const el = e.target
    if (!isDateInput(el) || !el.value) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', el.value)
  })
}
