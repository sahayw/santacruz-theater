// Organizer fields shared by the Calendar and Activities editors. A record filed under
// Other picks its organizer from the organizers filed under Other (`mainEl`). Productions
// may also add co-producers (`coEl`, shown as "None" until one is added); auditions and
// events have no co-producers. New organizers are added by hand-editing
// data/sc-theater-companies.json — editors can't create them. Rules:
// src/lib/organizers.ts (served as /admin/organizers.js).

import { allOrganizers, otherOrganizers, OTHER_FILE } from '/admin/organizers.js'

const STYLE_ID = 'org-picker-styles'

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
.org-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 26px; }
.org-picker select { width: auto; max-width: 100%; }
.org-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); font-size: 12px; }
.org-chip button { border: none; background: none; cursor: pointer; font-size: 13px; line-height: 1; color: var(--ink-faint); padding: 0 2px; }
.org-chip button:hover { color: var(--accent); }
.org-none { font-size: 12px; color: var(--ink-faint); }
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
 * Renders the organizer select into `mainEl` (records filed under Other only; pass null
 * otherwise) and, when `coEl` is given, the co-producer chips. `organizers` is the
 * record's field as stored; `onChange` receives the new value (undefined when empty).
 * `selectClass` is the editor's select class.
 */
export function renderOrganizerFields({
  mainEl,
  coEl,
  fileCompany,
  organizers,
  companies,
  selectClass,
  onChange
}) {
  injectStyles()
  const isOther = fileCompany === OTHER_FILE
  const list = [...(organizers || [])]
  const main = isOther ? list[0] || '' : fileCompany
  const coProducers = isOther ? list.slice(1) : list
  const name = (id) => companies.find((c) => c.id === id)?.name || id
  const rerender = (value) =>
    renderOrganizerFields({
      mainEl,
      coEl,
      fileCompany,
      organizers: value,
      companies,
      selectClass,
      onChange
    })
  const emit = (nextMain, nextCo) => {
    const value = (isOther ? [nextMain, ...nextCo] : nextCo).filter(Boolean)
    onChange(value.length ? value : undefined)
    rerender(value)
  }

  if (mainEl && isOther) {
    mainEl.innerHTML = `<select class="${selectClass}" data-org="main">
        <option value="">— Choose —</option>
        ${otherOrganizers(companies)
          .map(
            (c) =>
              `<option value="${c.id}" ${c.id === main ? 'selected' : ''}>${esc(c.name)}</option>`
          )
          .join('')}
      </select>`
    mainEl.querySelector('select').addEventListener('change', (e) =>
      emit(
        e.target.value,
        coProducers.filter((id) => id !== e.target.value)
      )
    )
  }

  if (coEl) {
    const addable = allOrganizers(companies).filter(
      (c) => c.id !== main && !coProducers.includes(c.id)
    )
    coEl.innerHTML = `<div class="org-picker">
        ${
          coProducers.length
            ? coProducers
                .map(
                  (id) =>
                    `<span class="org-chip">${esc(name(id))}<button type="button" data-org-remove="${esc(id)}" title="Remove co-producer">×</button></span>`
                )
                .join('')
            : '<span class="org-none">None</span>'
        }
        <select class="${selectClass}" data-org="add">
          <option value="">+ Add…</option>
          ${addable.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>`
    coEl.querySelector('[data-org="add"]').addEventListener('change', (e) => {
      if (e.target.value) emit(main, [...coProducers, e.target.value])
    })
    coEl.querySelectorAll('[data-org-remove]').forEach((b) =>
      b.addEventListener('click', () =>
        emit(
          main,
          coProducers.filter((id) => id !== b.dataset.orgRemove)
        )
      )
    )
  }
}
