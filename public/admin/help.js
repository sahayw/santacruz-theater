// Editor help: a slide-over panel opened from the topbar Help button, and small "?"
// tooltips beside non-obvious fields. Both read the content below. Panel text is Markdown
// rendered by the shared renderMd() (bold, italic, links, bulleted lists).
import { renderMd } from '/admin/audition-format.js'

// Panel contexts: 'calendar' (runs), 'activities' (auditions and events), 'service'. Each
// section lists the contexts it applies to; the common sections come first.
const SHARED = ['calendar', 'activities']
const SECTIONS = [
  {
    id: 'orgs',
    title: 'Companies, organizers and venues',
    for: SHARED,
    md: `- Records are filed under a company, or under **Other** for smaller organizations, one file per year. For **Other**, an **Organizer** must be selected.
- Known venues should be selected from the pull-down list. **Other venue…** allows entry of a venue not on the list.`
  },
  {
    id: 'dates',
    title: 'Dates and times',
    for: SHARED,
    md: `- A record with no dates is not displayed. A run can be saved without dates; an audition or event needs at least one, unless marked Virtual Audition or **Dates by request**.
- Dates may be typed, chosen using date picker, or copy/pasted. Acceptable formats: 2026-10-30, 10/30/2026 or Oct 30, 2026.
- Time formats: 7pm, 7.30 and 19:30, also bare hour such as 7 or 12. With no am/pm, 1.00–11.00 taken as **PM**, and 12.00 is noon.
- The first date for a record determines the correct year file. Input against the wrong year cannot be saved - use the Year pull-down next to the Company name to add a new year.
- Rows with no dates are ignored.
- Matinee and evening pairs on the same day trigger a check to ensure the pattern is intended.`
  },
  {
    id: 'removing',
    title: 'Removing dates and records',
    for: SHARED,
    md: `- Deleting a saved row or record that still has upcoming dates asks whether to **notify subscribers** of the cancellation or **delete without notification**. Past dates and unsaved rows delete without asking.`
  },
  {
    id: 'saving',
    title: 'Saving',
    for: [...SHARED, 'service'],
    md: (context) =>
      `- ${
        context === 'service'
          ? 'Save publishes the full services file (every listing).'
          : 'Save publishes a complete file (every record for that company and year).'
      } The site rebuilds and is live in a few minutes.
- **Preview** shows the record as it would appear on publication - use it to check data before publishing. **Restore** reverts to the last saved version.`
  },
  {
    id: 'run',
    title: 'Show records',
    for: ['calendar'],
    md: `- The abbreviation (20 characters or fewer) is the show's name on calendar pages.
- If several companies are involved in a production, add the others as **co-producers**.
- **Pattern** generates performances from a date range, weekdays and a time. **Paste** turns lines like Friday, June 5 at 7:30pm into rows.
- Each performance has a permanent hidden id, so changing its date or time moves it in subscribers' calendars rather than creating a new one.
- A run without dates can be linked from an audition record - for situations where auditions are scheduled before performance calendar is finalized. These records will not be displayed in the calendar.`
  },
  {
    id: 'audition',
    title: 'Audition',
    for: ['activities'],
    md: `- Select the **Production**; the audition inherits its title, genre, opening and info link. If the show isn't on file, use **Add production…**, then return and save.
- A virtual audition needs no date.
- **Close** hides an audition without deleting it; **Reopen** restores it (for use with Virtual Auditions).`
  },
  {
    id: 'event',
    title: 'Event',
    for: ['activities'],
    md: `- At least one date is required unless **Dates by request** is selected.
- At least one contact route: email, phone, Notice URL or Register URL is required.`
  },
  {
    id: 'activity-dates',
    title: 'Activity dates',
    for: ['activities'],
    md: `- Times are optional.
- A new row copies the previous row's time, venue and location.`
  },
  {
    id: 'service',
    title: 'Service listing',
    for: ['service'],
    md: `- A listing needs a name, at least one subcategory, and a phone or email.
- **Active** off hides a listing without deleting it.`
  }
]

// Tooltip text for each field-level "?".
const TIPS = {
  abbrev: 'Short name used in calendar entries. 20 characters or fewer.',
  organizer: 'Who is putting this on. If not in the list request addition.',
  coproducers: 'Other companies involved in the production.',
  production: 'Links to a Show record. Used to provide Title, Genre, Opening and Info link.',
  datesByRequest: 'No dates specified. Needs a contact route.',
  venue: 'Selecting from the list fills the address. "Other venue…" allows one-off entry.',
  pattern: 'Generate or paste many performances at once. Review before saving.',
  date: 'Pick, type or paste a date: e.g. 2026-10-30, 10/30/2026 or Oct 30, 2026.',
  time: '7pm, 7.30, 19:30 or just 7. With no am/pm, 1.00–11.00 means PM and 12.00 is noon.',
  richtext: 'Supports bold, italic, links and bullet lists. Ctrl/Cmd+B and Ctrl/Cmd+I also work.'
}

const STYLE_ID = 'editor-help-styles'
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .help-tip {
      display: inline-flex; align-items: center; justify-content: center;
      width: 14px; height: 14px; margin-left: 4px; padding: 0; vertical-align: middle;
      border: 1px solid var(--ink-faint); border-radius: 50%;
      background: var(--surface); color: var(--ink-mid);
      font: 500 9px/1 'IBM Plex Sans', sans-serif; text-transform: none; letter-spacing: 0;
      cursor: help;
    }
    .help-tip:hover, .help-tip.help-tip--open { border-color: var(--accent2); color: var(--accent2); }
    .help-tip:focus-visible { outline: 2px solid var(--accent2); outline-offset: 1px; }
    .help-pop {
      position: fixed; z-index: 40; max-width: 260px; padding: 7px 10px;
      border: 1px solid var(--border); border-radius: 4px; background: #efece6; color: var(--ink);
      font: 400 11px/1.45 'IBM Plex Sans', sans-serif; text-transform: none; letter-spacing: 0;
      box-shadow: 0 4px 14px rgba(0,0,0,0.15); pointer-events: none;
    }
    .help-pop[hidden] { display: none; }
    .help-panel {
      position: fixed; top: 52px; right: 12px; z-index: 20;
      width: min(300px, calc(100vw - 24px)); max-height: min(70vh, calc(100vh - 64px)); overflow-y: auto;
      padding: 10px 14px 14px; border: 1px solid var(--border); border-radius: 6px;
      background: var(--surface); box-shadow: 0 8px 28px rgba(0,0,0,0.18);
      font-size: 11px; line-height: 1.45;
    }
    .help-panel[hidden] { display: none; }
    .help-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .help-panel-title { font: 700 13px 'Libre Baskerville', serif; }
    .help-panel h3 {
      margin: 12px 0 2px; font: 500 10px 'IBM Plex Sans', sans-serif;
      text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-mid);
    }
  `
  document.head.append(style)
}

const attr = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** A "?" button for a field label. Hover (or click, on touch) shows the tip beside it. */
export function helpTip(key) {
  const text = TIPS[key]
  if (!text) return ''
  return `<button type="button" class="help-tip" data-help-tip="${key}" aria-label="${attr(text)}">?</button>`
}

/** A Help button for an editor's record header; `context` is a panel context (see SECTIONS). */
export function helpButton(context, id = '') {
  return `<button type="button" class="btn btn-sm" ${id ? `id="${id}" ` : ''}data-help-open="${context}" style="background:var(--bg);border:1px solid var(--border)">ⓘ Help</button>`
}

// ── Field tips ──
let pop = null
let popOwner = null
let popPinned = false
let popTimer = null

function showTip(btn) {
  if (!pop) {
    pop = document.createElement('div')
    pop.className = 'help-pop'
    pop.setAttribute('role', 'tooltip')
    document.body.append(pop)
  }
  popOwner?.classList.remove('help-tip--open')
  popOwner = btn
  btn.classList.add('help-tip--open')
  pop.textContent = TIPS[btn.dataset.helpTip]
  pop.hidden = false
  const r = btn.getBoundingClientRect()
  const w = pop.offsetWidth
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`
  pop.style.top = `${r.bottom + 6}px`
}

function hideTip() {
  clearTimeout(popTimer)
  if (pop) pop.hidden = true
  popOwner?.classList.remove('help-tip--open')
  popOwner = null
  popPinned = false
}

// ── Contextual panel ──
let panel = null
let panelContext = null

function renderPanel(context) {
  panel.innerHTML = `
    <div class="help-panel-head">
      <span class="help-panel-title">Help</span>
      <button type="button" class="btn btn-ghost btn-sm" data-help-close>Close</button>
    </div>
    ${SECTIONS.filter((s) => s.for.includes(context))
      .map(
        (s) => `<h3>${s.title}</h3>${renderMd(typeof s.md === 'function' ? s.md(context) : s.md)}`
      )
      .join('')}`
}

export function openHelp(context) {
  if (!panel) {
    panel = document.createElement('aside')
    panel.className = 'help-panel'
    panel.setAttribute('aria-label', 'Editor help')
    document.body.append(panel)
  }
  if (panelContext !== context) renderPanel(context)
  panelContext = context
  panel.hidden = false
  panel.scrollTop = 0
}

export function closeHelp() {
  if (panel) panel.hidden = true
}

// One set of listeners for the page, added when the first editor imports this module.
document.addEventListener('click', (e) => {
  const tip = e.target.closest?.('[data-help-tip]')
  if (tip) {
    // Click pins the tip (the only way to see it on touch); a second click closes it
    if (popPinned && popOwner === tip) hideTip()
    else {
      showTip(tip)
      popPinned = true
      popTimer = setTimeout(hideTip, 3000) // touch has no mouse-out; dismiss on its own
    }
    return
  }
  hideTip()
  const opener = e.target.closest?.('[data-help-open]')
  if (opener) {
    if (panel && !panel.hidden && panelContext === opener.dataset.helpOpen) closeHelp()
    else openHelp(opener.dataset.helpOpen)
    return
  }
  if (e.target.closest?.('[data-help-close]')) closeHelp()
  else if (panel && !panel.hidden && !panel.contains(e.target)) closeHelp() // click away
})
document.addEventListener('mouseover', (e) => {
  const tip = e.target.closest?.('[data-help-tip]')
  if (tip && !popPinned) showTip(tip)
})
document.addEventListener('mouseout', (e) => {
  if (e.target.closest?.('[data-help-tip]') && !popPinned) hideTip()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideTip()
    closeHelp()
  }
})
