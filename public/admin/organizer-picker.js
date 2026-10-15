// Organizer picker shared by the Calendar and Activities editors. A record filed under
// Other picks its main organizer from the organizers filed under Other; any record may add
// co-producers. New organizers are added by hand-editing data/sc-theater-companies.json —
// editors can't create them. Rules: src/lib/organizers.ts (served as /admin/organizers.js).

import { allOrganizers, otherOrganizers, OTHER_FILE } from '/admin/organizers.js'

const STYLE_ID = 'org-picker-styles'

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
.org-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.org-picker select { max-width: 100%; }
.org-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); font-size: 12px; }
.org-chip button { border: none; background: none; cursor: pointer; font-size: 13px; line-height: 1; color: var(--ink-faint); padding: 0 2px; }
.org-chip button:hover { color: var(--accent); }
.org-picker-hint { font-size: 11px; color: var(--ink-faint); }
`
  document.head.appendChild(s)
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}

/**
 * Renders the picker into `el`. `organizers` is the record's field as stored; `onChange`
 * receives the new value (undefined when empty) after every change.
 */
export function renderOrganizerPicker(el, { fileCompany, organizers, companies, onChange }) {
  injectStyles()
  const isOther = fileCompany === OTHER_FILE
  const list = [...(organizers || [])]
  const main = isOther ? list[0] || '' : fileCompany
  const coProducers = isOther ? list.slice(1) : list
  const name = (id) => companies.find((c) => c.id === id)?.name || id

  const mainSelect = isOther
    ? `<select class="field-select" data-org="main" style="width:auto">
        <option value="">— Organizer —</option>
        ${otherOrganizers(companies)
          .map((c) => `<option value="${c.id}" ${c.id === main ? 'selected' : ''}>${esc(c.name)}</option>`)
          .join('')}
      </select>`
    : ''
  const chips = coProducers
    .map(
      (id) =>
        `<span class="org-chip">${esc(name(id))}<button type="button" data-org-remove="${esc(id)}" title="Remove co-producer">×</button></span>`
    )
    .join('')
  const addable = allOrganizers(companies).filter((c) => c.id !== main && !coProducers.includes(c.id))
  const addSelect = `<select class="field-select" data-org="add" style="width:auto">
      <option value="">+ Co-producer…</option>
      ${addable.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
    </select>`
  const hint = isOther
    ? '<span class="org-picker-hint">Not listed? Add the organizer to sc-theater-companies.json.</span>'
    : ''

  el.innerHTML = `<div class="org-picker">${mainSelect}${chips}${addSelect}</div>${hint}`

  const emit = (nextMain, nextCo) => {
    const value = isOther ? [nextMain, ...nextCo].filter(Boolean) : nextCo
    onChange(value.length ? value : undefined)
    renderOrganizerPicker(el, { fileCompany, organizers: value, companies, onChange })
  }
  el.querySelector('[data-org="main"]')?.addEventListener('change', (e) => {
    emit(e.target.value, coProducers.filter((id) => id !== e.target.value))
  })
  el.querySelector('[data-org="add"]').addEventListener('change', (e) => {
    if (e.target.value) emit(main, [...coProducers, e.target.value])
  })
  el.querySelectorAll('[data-org-remove]').forEach((b) =>
    b.addEventListener('click', () => emit(main, coProducers.filter((id) => id !== b.dataset.orgRemove)))
  )
}
