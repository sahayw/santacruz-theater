import { IS_DEV, apiFetch, apiPut, buildCompanyOptions } from './api.js'

const ROLE_TYPES = ['lead', 'supporting', 'ensemble']
const ROLE_GENDERS = ['any', 'female', 'male']
const CURRENT_YEAR = 2026
const STYLES_ID = 'aud-editor-styles'

// ── MODULE STATE (reset on each mount) ──
let auditions = []
let activeAudIdx = -1
let allCompanies = []
let allAudFiles = []
let pendingCompanyId = null
let currentCompanyId = null
let currentYear = CURRENT_YEAR
let currentCompanyAbv = ''
let isDirty = false
let isAdminContext = false
let venuesList = []
let _resizeMouseMove = null
let _resizeMouseUp = null

// ── STYLES ──
function injectStyles() {
  if (document.getElementById(STYLES_ID)) return
  const s = document.createElement('style')
  s.id = STYLES_ID
  s.textContent = AUD_CSS
  document.head.appendChild(s)
}

const AUD_CSS = `
.aud-toolbar {
  background: var(--surface);
  border-bottom: 2px solid var(--border);
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  flex-shrink: 0;
}
.aud-cal-select {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  max-width: 190px;
}
.aud-toolbar-spacer { flex: 1; }
.aud-wrap {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}
.aud-sidebar {
  width: 160px;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.aud-resize-handle {
  width: 5px;
  background: var(--border);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.15s;
}
.aud-resize-handle:hover,
.aud-resize-handle.dragging { background: var(--accent2); }
.aud-sidebar-header {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.aud-sidebar-label {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-mid);
}
.aud-list       { flex: 1; overflow-y: auto; padding: 4px 0; }
.aud-list-item  {
  padding: 7px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.1s;
}
.aud-list-item:hover  { background: var(--bg); }
.aud-list-item.active { background: var(--bg); border-left-color: var(--accent); }
.aud-item-genre { font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-faint); margin-bottom: 1px; }
.aud-item-title { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.aud-item-count { font-size: 10px; color: var(--ink-faint); font-family: 'IBM Plex Mono', monospace; }
.aud-list-empty { padding: 20px 12px; font-size: 12px; color: var(--ink-faint); text-align: center; line-height: 1.6; }
.aud-main       { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.aud-empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px; color: var(--ink-mid);
}
.aud-empty-icon { font-size: 40px; opacity: 0.2; }
.aud-empty-state h2 { font-family: 'Libre Baskerville', serif; font-size: 18px; color: var(--ink); }
.aud-empty-state p  { font-size: 13px; color: var(--ink-mid); }

/* Form shell — header fixed, body scrolls */
.aud-form { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.aud-form-header {
  padding: 10px 16px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.aud-form-title { font-family: 'Libre Baskerville', serif; font-size: 16px; flex: 1; }
.aud-form-title small { font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; font-weight: 400; color: var(--ink-mid); margin-left: 6px; }

/* Fields grid — also fixed (part of header) */
.aud-fields {
  padding: 10px 16px;
  background: var(--bg);
  border-bottom: 2px solid var(--border);
  display: grid;
  grid-template-columns: repeat(4, 1fr) 2fr 2fr;
  gap: 8px;
  flex-shrink: 0;
}
.aud-field-group { display: flex; flex-direction: column; gap: 3px; }
.aud-field-label {
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--ink-mid);
}
.aud-field-input, .aud-field-select {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 12px; padding: 4px 7px;
  border: 1px solid var(--border); border-radius: 3px;
  background: var(--surface); color: var(--ink); width: 100%;
}
.aud-field-input:focus, .aud-field-select:focus { outline: none; border-color: var(--accent2); }
.aud-field-input.mono { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
.aud-field-input.invalid { border-color: #c0392b !important; background: #fef2f2 !important; }
.aud-field-readonly {
  background: rgba(0,0,0,0.06); color: var(--ink-mid);
  cursor: default; pointer-events: none;
}

/* Scrollable body — everything after the fixed header */
.aud-scroll-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* Section chrome shared by dates, roles, prep, notes */
.aud-section {
  border-bottom: 1px solid var(--border);
}
.aud-section-toolbar {
  padding: 7px 16px;
  background: var(--surface); border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 8px; position: sticky; top: 0; z-index: 5;
}
.aud-section-label {
  font-size: 10px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--ink-mid); flex: 1;
}
.aud-table-wrap { overflow-x: auto; }
.aud-table { width: 100%; border-collapse: collapse; }
.aud-table thead th {
  background: var(--ink); color: #fff;
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.08em; padding: 5px 8px; text-align: left;
  position: sticky; top: 0; z-index: 4; white-space: nowrap;
}
.aud-table thead th.col-del   { width: 32px; }
.aud-table thead th.col-date  { width: 100px; }
.aud-table thead th.col-stime { width: 60px; }
.aud-table thead th.col-etime { width: 60px; }
.aud-table thead th.col-locn  { width: 150px; }
.aud-table thead th.col-loca  { width: 160px; }
.aud-table thead th.col-type  { width: 100px; }
.aud-table thead th.col-gend  { width: 80px; }
.aud-table thead th.col-age   { width: 90px; }
.aud-table thead th.col-voice { width: 100px; }
.aud-table tbody tr { border-bottom: 1px solid var(--border); }
.aud-table tbody tr:hover { background: #faf8f5; }
.aud-table tbody td { padding: 2px 4px; vertical-align: middle; }
.aud-cell-input {
  font-family: 'IBM Plex Mono', monospace; font-size: 11px;
  padding: 3px 5px; border: 1px solid transparent; border-radius: 2px;
  background: transparent; width: 100%; color: var(--ink);
}
.aud-cell-input:focus { outline: none; border-color: var(--accent2); background: var(--surface); }
.aud-cell-input.invalid { border-color: #c0392b !important; background: #fef2f2 !important; }
.aud-cell-select {
  font-family: 'IBM Plex Sans', sans-serif; font-size: 11px;
  padding: 3px 4px; border: 1px solid transparent; border-radius: 2px;
  background: transparent; width: 100%; color: var(--ink);
}
.aud-cell-select:focus { outline: none; border-color: var(--accent2); background: var(--surface); }
.aud-del-btn {
  width: 22px; height: 22px; border: none; background: none;
  cursor: pointer; color: var(--ink-faint); font-size: 14px;
  border-radius: 3px; display: flex; align-items: center; justify-content: center;
  transition: all 0.1s;
}
.aud-del-btn:hover { background: #fde; color: var(--accent); }

/* Dates table */
.aud-dates-section .aud-table { min-width: 700px; }

/* Roles table */
.aud-roles-section .aud-table { min-width: 600px; }

/* Prep + Contact */
.aud-prep-contact {
  padding: 8px 16px;
  background: var(--bg);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 24px;
}
.aud-prep-col, .aud-contact-col { display: flex; flex-direction: column; gap: 4px; }
.aud-prep-head {
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--ink-mid); margin-bottom: 2px;
}
.aud-prep-row { display: flex; align-items: center; gap: 6px; }
.aud-prep-label {
  font-size: 10px; font-weight: 500; color: var(--ink-mid);
  min-width: 44px; flex-shrink: 0;
}
.aud-prep-row .aud-cell-input { border-color: var(--border); background: var(--surface); }
.aud-bring-row {
  grid-column: 1 / -1;
  display: flex; align-items: flex-start; gap: 6px;
}
.aud-bring-row .aud-prep-label { padding-top: 4px; }
.aud-bring-row textarea {
  font-family: 'IBM Plex Mono', monospace; font-size: 11px;
  padding: 3px 6px; border: 1px solid var(--border); border-radius: 3px;
  background: var(--surface); color: var(--ink);
  flex: 1; resize: none; height: 44px; line-height: 1.5;
}
.aud-bring-row textarea:focus { outline: none; border-color: var(--accent2); }

/* Notes */
.aud-notes-section {
  padding: 8px 16px 10px;
  background: var(--bg);
  display: flex; flex-direction: column; gap: 4px;
}
.aud-notes-toolbar { display: flex; align-items: center; gap: 6px; }
.aud-expand-btn {
  margin-left: auto;
  font-size: 13px; width: 22px; height: 20px;
  border: 1px solid var(--border); border-radius: 2px;
  background: var(--surface); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  padding: 0; line-height: 1; color: var(--ink-mid);
}
.aud-expand-btn:hover { background: var(--bg); border-color: var(--ink-mid); }
.aud-notes-textarea {
  font-family: 'IBM Plex Mono', monospace; font-size: 12px;
  padding: 4px 7px; border: 1px solid var(--border); border-radius: 3px;
  background: var(--surface); color: var(--ink);
  width: 100%; resize: none; overflow: hidden;
  line-height: 1.5; height: 26px; transition: height 0.15s;
}
.aud-notes-textarea:focus { outline: none; border-color: var(--accent2); }
.aud-notes-textarea.expanded { height: 90px; overflow-y: auto; resize: vertical; }

/* Status bar */
.aud-statusbar {
  height: 26px; background: var(--ink); color: rgba(255,255,255,0.6);
  font-size: 10px; font-family: 'IBM Plex Mono', monospace;
  display: flex; align-items: center; padding: 0 16px; gap: 20px; flex-shrink: 0;
}
.aud-status-item { display: flex; gap: 6px; }
.aud-status-key  { color: rgba(255,255,255,0.35); }

/* Venue autocomplete dropdown */
.aud-venue-dropdown {
  position: fixed;
  z-index: 1000;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  overflow-y: auto;
  max-height: 220px;
}
.aud-venue-item {
  padding: 6px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.aud-venue-item:last-child { border-bottom: none; }
.aud-venue-item:hover { background: var(--bg); }
.aud-venue-item-name { font-size: 12px; font-family: 'IBM Plex Sans', sans-serif; color: var(--ink); }
.aud-venue-item-addr { font-size: 10px; font-family: 'IBM Plex Mono', monospace; color: var(--ink-faint); margin-top: 2px; }
`

// ── HTML TEMPLATE ──
const AUD_HTML = `
<div class="aud-toolbar">
  <select class="aud-cal-select" id="audCompanySelect" onchange="aud.onCompanySelect()" style="display:none">
    <option value="">— Company —</option>
  </select>
  <select class="aud-cal-select" id="audYearSelect" onchange="aud.onYearSelect()" style="display:none">
    <option value="">— Year —</option>
  </select>
  <div class="aud-toolbar-spacer"></div>
  <button class="btn btn-sm" id="audSaveBtn" onclick="aud.saveFile()"
    style="border:1px solid var(--border);color:rgba(28,26,23,0.4)" disabled>Save</button>
</div>

<div class="aud-wrap">
  <div class="aud-sidebar" id="audSidebar">
    <div class="aud-sidebar-header">
      <span class="aud-sidebar-label">Auditions</span>
      <button class="btn btn-green btn-sm" id="newAudBtn" onclick="aud.newAudition()" style="display:none">+ New</button>
    </div>
    <div class="aud-list" id="audList"></div>
  </div>

  <div class="aud-resize-handle" id="audResizeHandle"></div>

  <div class="aud-main">
    <div class="aud-empty-state" id="audEmptyState">
      <div class="aud-empty-icon">🎤</div>
      <h2>No audition selected</h2>
      <p>Select an audition or create a new one.</p>
    </div>

    <div class="aud-form" id="audForm" style="display:none">

      <!-- ── FIXED HEADER ── -->
      <div class="aud-form-header">
        <div class="aud-form-title">
          <span id="audTitleText"></span><small id="audSubtitle"></small>
        </div>
        <button class="btn btn-sm" style="background:#fde;color:var(--accent);border:1px solid #fcc"
          onclick="aud.deleteAudition()">Delete</button>
      </div>

      <div class="aud-fields">
        <div class="aud-field-group">
          <label class="aud-field-label">Company</label>
          <input class="aud-field-input aud-field-readonly" id="af-company" readonly tabindex="-1">
        </div>
        <div class="aud-field-group">
          <label class="aud-field-label">Genre</label>
          <select class="aud-field-select" id="af-genre" onchange="aud.fieldChanged()">
            <option value="">-</option>
            <option>Drama</option><option>Musical</option><option>Comedy</option><option>Other</option>
          </select>
        </div>
        <div class="aud-field-group">
          <label class="aud-field-label">Rehearsal Start</label>
          <input class="aud-field-input mono" id="af-rehearsal" placeholder="YYYY-MM-DD" oninput="aud.fieldChanged()" onblur="aud.normalizeHeaderDate('af-rehearsal')">
        </div>
        <div class="aud-field-group">
          <label class="aud-field-label">Opening Date</label>
          <input class="aud-field-input mono" id="af-opening" placeholder="YYYY-MM-DD" oninput="aud.fieldChanged()" onblur="aud.normalizeHeaderDate('af-opening')">
        </div>
        <div class="aud-field-group" style="grid-column:span 2">
          <label class="aud-field-label">Production Title</label>
          <input class="aud-field-input" id="af-production" placeholder="Full production title" oninput="aud.fieldChanged()">
        </div>
        <div class="aud-field-group" style="grid-column:span 3">
          <label class="aud-field-label">Audition Notice URL</label>
          <input class="aud-field-input mono" id="af-notice-url" placeholder="https://…" oninput="aud.fieldChanged()">
        </div>
        <div class="aud-field-group" style="grid-column:span 3">
          <label class="aud-field-label">Production URL</label>
          <input class="aud-field-input mono" id="af-prod-url" placeholder="https://…" oninput="aud.fieldChanged()">
        </div>
      </div>

      <!-- ── SCROLLABLE BODY ── -->
      <div class="aud-scroll-body">

        <!-- 1. Audition dates -->
        <div class="aud-section aud-dates-section">
          <div class="aud-section-toolbar">
            <span class="aud-section-label">Audition Dates
              <span id="audDatesCount" style="color:var(--ink-faint);font-family:'IBM Plex Mono',monospace;font-size:10px"></span>
            </span>
            <button class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)"
              onclick="aud.addDateRow()">+ Add row</button>
          </div>
          <div class="aud-table-wrap">
            <table class="aud-table" id="audDatesTable">
              <thead>
                <tr>
                  <th class="col-del"></th>
                  <th class="col-date">Date</th>
                  <th class="col-stime">Start</th>
                  <th class="col-etime">End</th>
                  <th class="col-locn">Location</th>
                  <th class="col-loca">Address</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody id="audDatesBody"></tbody>
            </table>
          </div>
        </div>

        <!-- 2. Roles available -->
        <div class="aud-section aud-roles-section">
          <div class="aud-section-toolbar">
            <span class="aud-section-label">Roles Available
              <span id="audRolesCount" style="color:var(--ink-faint);font-family:'IBM Plex Mono',monospace;font-size:10px"></span>
            </span>
            <button class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)"
              onclick="aud.addRoleRow()">+ Add row</button>
          </div>
          <div class="aud-table-wrap">
            <table class="aud-table" id="audRolesTable">
              <thead><tr id="audRolesHead"></tr></thead>
              <tbody id="audRolesBody"></tbody>
            </table>
          </div>
        </div>

        <!-- 3. Prepare / Contact -->
        <div class="aud-section aud-prep-contact">
          <div class="aud-prep-col">
            <div class="aud-prep-head">Prepare</div>
            <div class="aud-prep-row">
              <label class="aud-prep-label">Acting</label>
              <input class="aud-cell-input" id="af-prep-acting" placeholder="e.g. Cold read from script" oninput="aud.fieldChanged()">
            </div>
            <div class="aud-prep-row" id="aud-singing-row">
              <label class="aud-prep-label">Singing</label>
              <input class="aud-cell-input" id="af-prep-singing" placeholder="e.g. 16–32 bars in style" oninput="aud.fieldChanged()">
            </div>
            <div class="aud-prep-row" id="aud-dance-row">
              <label class="aud-prep-label">Dance</label>
              <input class="aud-cell-input" id="af-prep-dance" placeholder="e.g. Basic tap" oninput="aud.fieldChanged()">
            </div>
          </div>
          <div class="aud-contact-col">
            <div class="aud-prep-head">Contact</div>
            <div class="aud-prep-row">
              <label class="aud-prep-label">Name</label>
              <input class="aud-cell-input" id="af-contact-name" oninput="aud.fieldChanged()">
            </div>
            <div class="aud-prep-row">
              <label class="aud-prep-label">Email</label>
              <input class="aud-cell-input" id="af-contact-email" oninput="aud.fieldChanged()">
            </div>
            <div class="aud-prep-row">
              <label class="aud-prep-label">Phone</label>
              <input class="aud-cell-input" id="af-contact-phone" oninput="aud.fieldChanged()">
            </div>
          </div>
          <div class="aud-bring-row">
            <label class="aud-prep-label">Bring</label>
            <textarea id="af-prep-bring"
              placeholder="One item per line, e.g.:&#10;Headshot and résumé&#10;List of conflicts"
              oninput="aud.fieldChanged()"></textarea>
          </div>
        </div>

        <!-- 4. Notes -->
        <div class="aud-section aud-notes-section">
          <div class="aud-notes-toolbar">
            <label class="aud-field-label" style="margin-bottom:0">Notes</label>
            <button class="aud-expand-btn" id="audNotesExpandBtn" onclick="aud.toggleNotesExpand()" title="Expand">↕</button>
          </div>
          <textarea class="aud-notes-textarea" id="af-notes" rows="1"
            placeholder="Additional information for auditioners"
            oninput="aud.fieldChanged()"></textarea>
        </div>

      </div><!-- /.aud-scroll-body -->
    </div><!-- /.aud-form -->
  </div><!-- /.aud-main -->
</div><!-- /.aud-wrap -->

<div class="aud-statusbar">
  <span class="aud-status-item"><span class="aud-status-key">Auditions</span><span id="ast-count">0</span></span>
  <span class="aud-status-item"><span class="aud-status-key">Total roles</span><span id="ast-roles">0</span></span>
  <span class="aud-status-item"><span class="aud-status-key">Status</span><span id="ast-saved" style="color:rgba(255,255,255,0.35)">no file loaded</span></span>
</div>
`

// ── HELPERS ──
function esc(v) {
  return (v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
function isMusical() {
  return document.getElementById('af-genre')?.value === 'Musical'
}

// ── DATA ACCESS ──
async function loadAuditionsDir() {
  const resp = await fetch('/.netlify/functions/data?dir=auditions')
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

async function loadCompanyFile(coId, year) {
  year = year || CURRENT_YEAR
  try {
    const data = await apiFetch(`auditions/${year}/${coId}-auditions-${year}.json`)
    auditions = data.auditions || []
    currentCompanyId = coId
    currentYear = data.year || year
    currentCompanyAbv = allCompanies.find((c) => c.id === coId)?.abvName || coId
    isDirty = false
    activeAudIdx = auditions.length > 0 ? 0 : -1
    document.getElementById('newAudBtn')?.setAttribute('style', '')
    renderSidebar()
    loadAudEditor()
    updateStatus()
    updateSaveBtn()
  } catch (e) {
    alert('Could not load auditions file: ' + e.message)
  }
}

// ── EMPTY STATE ──
function updateEmptyState() {
  const el = document.getElementById('audEmptyState')
  if (!el) return
  if (!currentCompanyId) document.getElementById('newAudBtn')?.setAttribute('style', 'display:none')
  el.innerHTML = !currentCompanyId
    ? isAdminContext
      ? `<div class="aud-empty-icon">🎤</div><h2>Select a company / year</h2><p>from the toolbar above to load auditions</p>`
      : `<div class="aud-empty-icon">🎤</div><h2>Select a year</h2><p>Choose a year from the toolbar above.</p>`
    : `<div class="aud-empty-icon">🎤</div><h2>No audition selected</h2><p>Select an audition or click + New.</p>`
}

// ── INIT FROM CONTEXT ──
async function initFromContext(context) {
  isAdminContext = context.isAdmin
  allCompanies = context.allCompanies || []
  updateEmptyState()
  try {
    allAudFiles = await loadAuditionsDir()
  } catch (e) {
    alert('Could not list audition files: ' + e.message)
    return
  }
  venuesList = await apiFetch('sc-theater-venues.json')
    .then((d) => d.venues || [])
    .catch(() => [])
  if (context.isAdmin) {
    const compSel = document.getElementById('audCompanySelect')
    compSel.innerHTML = buildCompanyOptions(allCompanies)
    compSel.style.display = ''
  } else {
    pendingCompanyId = context.company.id
    currentCompanyAbv = context.company.abvName
    const years = allAudFiles.filter((f) => f.companyId === context.company.id).map((f) => f.year)
    populateYearSelect(years)
    if (years.length === 1) {
      document.getElementById('audYearSelect').value = String(years[0])
      await loadCompanyFile(pendingCompanyId, years[0])
    }
  }
}

// ── COMPANY / YEAR SELECTION ──
async function onCompanySelect() {
  const coId = document.getElementById('audCompanySelect').value
  if (!coId) {
    hideYearSelect()
    clearEditor()
    return
  }
  if (isDirty && !confirm('You have unsaved changes. Discard and continue?')) {
    document.getElementById('audCompanySelect').value = pendingCompanyId || ''
    return
  }
  pendingCompanyId = coId
  currentCompanyAbv = allCompanies.find((c) => c.id === coId)?.abvName || coId
  const years = allAudFiles.filter((f) => f.companyId === coId).map((f) => f.year)
  if (years.length > 0) {
    populateYearSelect(years)
    const hasFuture = years.some((y) => y > CURRENT_YEAR)
    if (!hasFuture && years.includes(CURRENT_YEAR)) {
      document.getElementById('audYearSelect').value = String(CURRENT_YEAR)
      await loadCompanyFile(coId, CURRENT_YEAR)
    } else {
      clearEditor()
    }
  } else {
    clearEditor()
    await autoCreateFirstFile(coId)
  }
}

async function autoCreateFirstFile(coId) {
  const abv = allCompanies.find((c) => c.id === coId)?.abvName || coId
  try {
    await apiPut(`auditions/${CURRENT_YEAR}/${coId}-auditions-${CURRENT_YEAR}.json`, {
      company: abv,
      year: CURRENT_YEAR,
      auditions: []
    })
  } catch (e) {
    alert('Could not create file: ' + e.message)
    return
  }
  allAudFiles.push({ companyId: coId, year: CURRENT_YEAR })
  populateYearSelect([CURRENT_YEAR])
  document.getElementById('audYearSelect').value = String(CURRENT_YEAR)
  await loadCompanyFile(coId, CURRENT_YEAR)
}

function populateYearSelect(years) {
  const sel = document.getElementById('audYearSelect')
  years = [...new Set(years)].sort((a, b) => b - a)
  sel.innerHTML =
    '<option value="">— Year —</option>' +
    years.map((y) => `<option value="${y}">${y}</option>`).join('') +
    '<option value="__new__">Add year</option>'
  sel.style.display = ''
  sel.value = ''
}

function hideYearSelect() {
  const sel = document.getElementById('audYearSelect')
  sel.style.display = 'none'
  sel.value = ''
}

async function onYearSelect() {
  const val = document.getElementById('audYearSelect').value
  if (!val || !pendingCompanyId) return
  if (isDirty && !confirm('You have unsaved changes. Discard and continue?')) {
    document.getElementById('audYearSelect').value = currentYear || ''
    return
  }
  if (val === '__new__') {
    const existingYears = allAudFiles
      .filter((f) => f.companyId === pendingCompanyId)
      .map((f) => f.year)
    const nextYear = existingYears.length ? Math.max(...existingYears) + 1 : CURRENT_YEAR
    const abv = allCompanies.find((c) => c.id === pendingCompanyId)?.abvName || pendingCompanyId
    try {
      await apiPut(`auditions/${nextYear}/${pendingCompanyId}-auditions-${nextYear}.json`, {
        company: abv,
        year: nextYear,
        auditions: []
      })
    } catch (e) {
      alert('Could not create file: ' + e.message)
      document.getElementById('audYearSelect').value = ''
      return
    }
    allAudFiles.push({ companyId: pendingCompanyId, year: nextYear })
    populateYearSelect(
      allAudFiles.filter((f) => f.companyId === pendingCompanyId).map((f) => f.year)
    )
    document.getElementById('audYearSelect').value = String(nextYear)
    await loadCompanyFile(pendingCompanyId, nextYear)
    return
  }
  await loadCompanyFile(pendingCompanyId, parseInt(val, 10))
}

// ── PERSISTENCE ──
function markDirty() {
  if (!currentCompanyId) return
  isDirty = true
  updateStatus()
  updateSaveBtn()
}

function updateSaveBtn() {
  const btn = document.getElementById('audSaveBtn')
  if (!btn) return
  const can = isDirty && !!currentCompanyId
  btn.disabled = !can
  btn.style.background = can ? 'var(--yellow)' : 'transparent'
  btn.style.color = can ? '#1c1a17' : 'rgba(28,26,23,0.4)'
  btn.style.borderColor = can ? 'var(--yellow)' : 'var(--border)'
}

async function saveFile() {
  if (!currentCompanyId) return
  if (!IS_DEV && !window.netlifyIdentity?.currentUser()) {
    alert('Please log in to save.')
    return
  }
  const errors = collectErrors()
  if (errors.length) {
    alert('Cannot save — fix these issues:\n\n' + errors.join('\n'))
    return
  }
  const btn = document.getElementById('audSaveBtn')
  btn.disabled = true
  btn.textContent = 'Saving…'
  try {
    const cleanAuditions = auditions.map((a) => ({
      ...a,
      auditionDates: (a.auditionDates || []).filter((d) => !isEmptyDateRow(d))
    }))
    await apiPut(`auditions/${currentYear}/${currentCompanyId}-auditions-${currentYear}.json`, {
      company: currentCompanyAbv,
      year: currentYear,
      auditions: cleanAuditions
    })
    isDirty = false
    btn.textContent = 'Saved ✓'
    btn.style.background = 'var(--green)'
    btn.style.color = '#fff'
    btn.style.borderColor = 'var(--green)'
    updateStatus()
    setTimeout(() => {
      btn.textContent = 'Save'
      updateSaveBtn()
    }, 2500)
  } catch (e) {
    alert('Save failed: ' + e.message)
    btn.textContent = 'Save'
    updateSaveBtn()
  }
}

// ── STATUS BAR ──
function updateStatus() {
  const ec = document.getElementById('ast-count')
  const er = document.getElementById('ast-roles')
  const es = document.getElementById('ast-saved')
  if (!ec) return
  ec.textContent = auditions.length
  er.textContent = auditions.reduce((s, a) => s + (a.rolesAvailable?.length || 0), 0)
  if (!currentCompanyId) {
    es.textContent = 'no file loaded'
    es.style.color = 'rgba(255,255,255,0.35)'
  } else if (isDirty) {
    es.textContent = 'unsaved changes'
    es.style.color = 'var(--yellow)'
  } else {
    es.textContent = 'saved'
    es.style.color = 'var(--green)'
  }
}

// ── SIDEBAR ──
function renderSidebar() {
  const list = document.getElementById('audList')
  if (!list) return
  if (!auditions.length) {
    list.innerHTML = ''
    return
  }
  const firstDate = (a) => a.auditionDates?.[0]?.date || '9999-99-99'
  const sorted = auditions
    .map((a, i) => ({ a, i }))
    .sort((x, y) => firstDate(x.a).localeCompare(firstDate(y.a)))
  list.innerHTML = sorted
    .map(
      ({ a, i }) => `
    <div class="aud-list-item ${i === activeAudIdx ? 'active' : ''}" onclick="aud.selectAud(${i})">
      <div class="aud-item-genre">${a.genre || '—'}</div>
      <div class="aud-item-title">${a.production || 'Untitled'}</div>
      ${(a.rolesAvailable?.length || 0) > 0 ? `<div class="aud-item-count">${a.rolesAvailable.length} role${a.rolesAvailable.length !== 1 ? 's' : ''}</div>` : ''}
    </div>`
    )
    .join('')
  updateStatus()
}

// ── AUDITION SELECTION ──
function selectAud(idx) {
  activeAudIdx = idx
  renderSidebar()
  loadAudEditor()
}

function loadAudEditor() {
  const emptyEl = document.getElementById('audEmptyState')
  const formEl = document.getElementById('audForm')
  if (activeAudIdx < 0 || activeAudIdx >= auditions.length) {
    updateEmptyState()
    emptyEl.style.display = ''
    formEl.style.display = 'none'
    return
  }
  emptyEl.style.display = 'none'
  formEl.style.display = ''
  const a = auditions[activeAudIdx]

  document.getElementById('af-company').value = currentCompanyAbv || ''
  document.getElementById('af-genre').value = a.genre || ''
  document.getElementById('af-rehearsal').value = a.rehearsalStart || ''
  document.getElementById('af-opening').value = a.openingDate || ''
  document.getElementById('af-production').value = a.production || ''
  document.getElementById('af-notice-url').value = a.auditionNoticeUrl || ''
  document.getElementById('af-prod-url').value = a.productionUrl || ''

  const notesTa = document.getElementById('af-notes')
  notesTa.value = a.notes || ''
  notesTa.classList.remove('expanded')
  document.getElementById('audNotesExpandBtn').textContent = '↕'

  document.getElementById('af-prep-acting').value = a.prep?.acting || ''
  document.getElementById('af-prep-singing').value = a.prep?.singing || ''
  document.getElementById('af-prep-dance').value = a.prep?.dance || ''
  document.getElementById('af-prep-bring').value = a.prep?.bring?.join('\n') || ''
  document.getElementById('af-contact-name').value = a.contact?.name || ''
  document.getElementById('af-contact-email').value = a.contact?.email || ''
  document.getElementById('af-contact-phone').value = a.contact?.phone || ''

  updateEditorTitle()
  updateMusicLayout()
  renderDatesTable()
  renderRolesTable()
}

function updateEditorTitle() {
  const a = auditions[activeAudIdx]
  document.getElementById('audTitleText').textContent = a.production || 'Untitled'
  document.getElementById('audSubtitle').textContent = a.genre ? ` · ${a.genre}` : ''
}

// ── MUSICAL-ONLY FIELD VISIBILITY ──
function updateMusicLayout() {
  const musical = isMusical()
  const singRow = document.getElementById('aud-singing-row')
  const danceRow = document.getElementById('aud-dance-row')
  if (singRow) singRow.style.display = musical ? '' : 'none'
  if (danceRow) danceRow.style.display = musical ? '' : 'none'
  renderRolesTable()
}

// ── FIELD SYNC (form → data) ──
function fieldChanged() {
  if (activeAudIdx < 0) return
  const a = auditions[activeAudIdx]

  a.production = document.getElementById('af-production').value
  a.genre = document.getElementById('af-genre').value
  a.rehearsalStart = document.getElementById('af-rehearsal').value || undefined
  a.openingDate = document.getElementById('af-opening').value || undefined
  a.auditionNoticeUrl = document.getElementById('af-notice-url').value || undefined
  a.productionUrl = document.getElementById('af-prod-url').value || undefined
  a.notes = document.getElementById('af-notes').value || undefined

  const bring = document
    .getElementById('af-prep-bring')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const musical = a.genre === 'Musical'
  const prep = {
    acting: document.getElementById('af-prep-acting').value || undefined,
    singing: musical ? document.getElementById('af-prep-singing').value || undefined : undefined,
    dance: musical ? document.getElementById('af-prep-dance').value || undefined : undefined,
    bring: bring.length ? bring : undefined
  }
  a.prep = prep.acting || prep.singing || prep.dance || prep.bring ? prep : undefined

  const contact = {
    name: document.getElementById('af-contact-name').value || undefined,
    email: document.getElementById('af-contact-email').value || undefined,
    phone: document.getElementById('af-contact-phone').value || undefined
  }
  a.contact = contact.name || contact.email || contact.phone ? contact : undefined

  a.updatedAt = new Date().toISOString()
  updateEditorTitle()
  updateMusicLayout()
  renderSidebar()
  markDirty()
}

// ── NOTES EXPAND ──
function toggleNotesExpand() {
  const ta = document.getElementById('af-notes')
  const btn = document.getElementById('audNotesExpandBtn')
  ta.classList.toggle('expanded')
  btn.textContent = ta.classList.contains('expanded') ? '↑' : '↕'
}

// ── AUDITION CRUD ──
function newAudition() {
  const now = new Date().toISOString()
  auditions.push({
    id: `audition-${Date.now()}`,
    production: '',
    genre: '',
    auditionDates: [],
    rolesAvailable: [],
    createdAt: now,
    updatedAt: now
  })
  activeAudIdx = auditions.length - 1
  renderSidebar()
  loadAudEditor()
  document.getElementById('af-production').focus()
  markDirty()
}

function deleteAudition() {
  if (activeAudIdx < 0) return
  const a = auditions[activeAudIdx]
  if (!confirm(`Delete "${a.production || 'this audition'}"? This cannot be undone.`)) return
  auditions.splice(activeAudIdx, 1)
  activeAudIdx = Math.min(activeAudIdx, auditions.length - 1)
  renderSidebar()
  loadAudEditor()
  markDirty()
}

function clearEditor() {
  auditions = []
  currentCompanyId = null
  activeAudIdx = -1
  isDirty = false
  renderSidebar()
  updateEmptyState()
  document.getElementById('audEmptyState').style.display = ''
  document.getElementById('audForm').style.display = 'none'
  updateStatus()
  updateSaveBtn()
}

// ── VALIDATION ──
function normalizeDate(v) {
  if (!v) return v
  const parts = v
    .trim()
    .replace(/[/.]/g, '-')
    .split('-')
    .map((s) => s.trim())
  if (parts.length !== 3) return v
  let [y, m, d] = parts
  if (y.length === 2) y = '20' + y
  if (y.length !== 4 || isNaN(Number(y)) || isNaN(Number(m)) || isNaN(Number(d))) return v
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}
function isValidDate(v) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}
function isValidTime(v) {
  if (!v) return false
  const norm = v.replace('.', ':')
  if (!/^\d{1,2}:\d{2}$/.test(norm)) return false
  const [h, m] = norm.split(':').map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}
function setAudInvalid(id, invalid) {
  document.getElementById(id)?.classList.toggle('invalid', invalid)
}
function isEmptyDateRow(d) {
  return !d.date && !d.startTime && !d.endTime
}
function normalizeHeaderDate(id) {
  const el = document.getElementById(id)
  if (!el) return
  const norm = normalizeDate(el.value)
  if (norm !== el.value) {
    el.value = norm
    fieldChanged()
  }
  setAudInvalid(id, !!el.value && !isValidDate(el.value))
}
function collectErrors() {
  const errors = []
  auditions.forEach((a, ai) => {
    const label = a.production || `Audition ${ai + 1}`
    const nonEmptyDates = (a.auditionDates || []).filter((d) => !isEmptyDateRow(d))
    if (nonEmptyDates.length === 0) {
      errors.push(`"${label}": no audition dates`)
    } else {
      nonEmptyDates.forEach((d, di) => {
        if (!isValidDate(d.date))
          errors.push(`"${label}" — date row ${di + 1}: date "${d.date || '(empty)'}"`)
        if (!isValidTime(d.startTime))
          errors.push(`"${label}" — date row ${di + 1}: start time "${d.startTime || '(empty)'}"`)
        if (!isValidTime(d.endTime))
          errors.push(`"${label}" — date row ${di + 1}: end time "${d.endTime || '(empty)'}"`)
      })
    }
  })
  return errors
}

// ── AUDITION DATES TABLE ──
function renderDatesTable() {
  if (activeAudIdx < 0) return
  hideVenueDropdown()
  const dates = auditions[activeAudIdx].auditionDates || []
  document.getElementById('audDatesCount').textContent = `(${dates.length})`
  document.getElementById('audDatesBody').innerHTML = dates
    .map(
      (d, i) => `
    <tr>
      <td><button class="aud-del-btn" onclick="aud.deleteDateRow(${i})" title="Delete">×</button></td>
      <td><input class="aud-cell-input" value="${esc(d.date)}" placeholder="2026-06-13"
          onchange="aud.dateCellChanged(${i},'date',this.value)"
          onkeydown="aud.dateCellKey(event,${i},'date')" id="dc-${i}-date"></td>
      <td><input class="aud-cell-input" value="${esc(d.startTime)}" placeholder="19:00"
          onchange="aud.dateCellChanged(${i},'startTime',this.value)"
          onkeydown="aud.dateCellKey(event,${i},'startTime')" id="dc-${i}-startTime"></td>
      <td><input class="aud-cell-input" value="${esc(d.endTime)}" placeholder="21:30"
          onchange="aud.dateCellChanged(${i},'endTime',this.value)"
          onkeydown="aud.dateCellKey(event,${i},'endTime')" id="dc-${i}-endTime"></td>
      <td><input class="aud-cell-input" value="${esc(d.location?.name)}" placeholder="Veterans Memorial Bldg"
          onchange="aud.dateCellChanged(${i},'locName',this.value)"
          oninput="aud.onLocNameInput(${i},this)"
          onfocus="aud.onLocNameInput(${i},this)"
          onblur="setTimeout(()=>aud.hideVenueDropdown(),150)"
          onkeydown="aud.dateCellKey(event,${i},'locName')" id="dc-${i}-locName"></td>
      <td><input class="aud-cell-input" value="${esc(d.location?.address)}" placeholder="123 Main St, City"
          onchange="aud.dateCellChanged(${i},'locAddr',this.value)"
          onkeydown="aud.dateCellKey(event,${i},'locAddr')" id="dc-${i}-locAddr"></td>
      <td><input class="aud-cell-input" value="${esc(d.notes)}" placeholder="e.g. Open call"
          onchange="aud.dateCellChanged(${i},'notes',this.value)"
          onkeydown="aud.dateCellKey(event,${i},'notes')" id="dc-${i}-notes"></td>
    </tr>`
    )
    .join('')
  dates.forEach((d, i) => {
    if (d.date) setAudInvalid(`dc-${i}-date`, !isValidDate(d.date))
    if (d.startTime) setAudInvalid(`dc-${i}-startTime`, !isValidTime(d.startTime))
    if (d.endTime) setAudInvalid(`dc-${i}-endTime`, !isValidTime(d.endTime))
  })
}

function normalizeTime(v) {
  return v ? v.replace('.', ':') : v
}

function dateCellChanged(idx, field, value) {
  const d = auditions[activeAudIdx].auditionDates[idx]
  if (field === 'locName') {
    if (!d.location) d.location = { name: '' }
    d.location.name = value
    // Clear address if the new name doesn't match any known venue
    const knownVenue = venuesList.find((v) => v.name === value)
    if (!knownVenue) {
      d.location.address = undefined
      const addrEl = document.getElementById(`dc-${idx}-locAddr`)
      if (addrEl) addrEl.value = ''
    }
    if (!value && !d.location.address) d.location = undefined
  } else if (field === 'locAddr') {
    if (!d.location) d.location = { name: '' }
    d.location.address = value || undefined
  } else if (field === 'startTime' || field === 'endTime') {
    value = normalizeTime(value)
    const tel = document.getElementById(`dc-${idx}-${field}`)
    if (tel && tel.value !== value) tel.value = value
    d[field] = value
    if (value) setAudInvalid(`dc-${idx}-${field}`, !isValidTime(value))
  } else if (field === 'date') {
    value = normalizeDate(value)
    const del = document.getElementById(`dc-${idx}-date`)
    if (del && del.value !== value) del.value = value
    d.date = value || undefined
    if (value) setAudInvalid(`dc-${idx}-date`, !isValidDate(value))
  } else {
    d[field] = value || (field === 'notes' ? undefined : value)
  }
  markDirty()
}

const DATE_COLS = ['date', 'startTime', 'endTime', 'locName', 'locAddr', 'notes']
function dateCellKey(event, rowIdx, field) {
  if (field === 'locName' && event.key === 'Escape') {
    hideVenueDropdown()
    return
  }
  // Tab or Enter on the location name field: if exactly one venue matches, select it
  if (field === 'locName' && (event.key === 'Tab' || event.key === 'Enter')) {
    const dd = document.getElementById('aud-venue-dropdown')
    if (dd && dd.style.display !== 'none' && dd.children.length === 1) {
      event.preventDefault()
      const code = dd.children[0].getAttribute('onmousedown').match(/'([^']+)'\)$/)?.[1]
      if (code) {
        selectVenueItem(rowIdx, code)
        return
      }
    }
  }
  const col = DATE_COLS.indexOf(field)
  if (event.key === 'Tab') {
    event.preventDefault()
    hideVenueDropdown()
    const next = event.shiftKey ? col - 1 : col + 1
    if (next >= 0 && next < DATE_COLS.length) {
      document.getElementById(`dc-${rowIdx}-${DATE_COLS[next]}`)?.focus()
    } else if (!event.shiftKey) {
      const n = document.getElementById(`dc-${rowIdx + 1}-date`)
      n ? n.focus() : addDateRow()
    }
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const n = document.getElementById(`dc-${rowIdx + 1}-date`)
    n ? n.focus() : addDateRow()
  }
}

function addDateRow() {
  if (activeAudIdx < 0) return
  auditions[activeAudIdx].auditionDates.push({ date: '', startTime: '', endTime: '' })
  renderDatesTable()
  markDirty()
  const idx = auditions[activeAudIdx].auditionDates.length - 1
  setTimeout(() => document.getElementById(`dc-${idx}-date`)?.focus(), 30)
}

function deleteDateRow(idx) {
  auditions[activeAudIdx].auditionDates.splice(idx, 1)
  renderDatesTable()
  markDirty()
}

// ── ROLES TABLE ──
function getRoleCols() {
  return isMusical()
    ? ['role', 'type', 'gender', 'ageRange', 'voicePart', 'description']
    : ['role', 'type', 'gender', 'ageRange', 'description']
}

function renderRolesTable() {
  if (activeAudIdx < 0) return
  const musical = isMusical()
  const roles = auditions[activeAudIdx].rolesAvailable || []
  document.getElementById('audRolesCount').textContent = `(${roles.length})`

  document.getElementById('audRolesHead').innerHTML = `
    <th class="col-del"></th>
    <th>Role</th>
    <th class="col-type">Type</th>
    <th class="col-gend">Gender</th>
    <th class="col-age">Age Range</th>
    ${musical ? '<th class="col-voice">Voice Part</th>' : ''}
    <th>Description</th>`

  document.getElementById('audRolesBody').innerHTML = roles
    .map(
      (r, i) => `
    <tr>
      <td><button class="aud-del-btn" onclick="aud.deleteRoleRow(${i})" title="Delete">×</button></td>
      <td><input class="aud-cell-input" value="${esc(r.role)}" placeholder="Character name"
          onchange="aud.roleCellChanged(${i},'role',this.value)"
          onkeydown="aud.roleCellKey(event,${i},'role')" id="rc-${i}-role"></td>
      <td><select class="aud-cell-select" onchange="aud.roleCellChanged(${i},'type',this.value)" id="rc-${i}-type">
        ${ROLE_TYPES.map((t) => `<option value="${t}" ${r.type === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select></td>
      <td><select class="aud-cell-select" onchange="aud.roleCellChanged(${i},'gender',this.value)" id="rc-${i}-gender">
        ${ROLE_GENDERS.map((g) => `<option value="${g}" ${r.gender === g ? 'selected' : ''}>${g}</option>`).join('')}
      </select></td>
      <td><input class="aud-cell-input" value="${esc(r.ageRange)}" placeholder="30s, 18+"
          onchange="aud.roleCellChanged(${i},'ageRange',this.value)"
          onkeydown="aud.roleCellKey(event,${i},'ageRange')" id="rc-${i}-ageRange"></td>
      ${
        musical
          ? `<td><input class="aud-cell-input" value="${esc(r.voicePart)}" placeholder="Soprano"
          onchange="aud.roleCellChanged(${i},'voicePart',this.value)"
          onkeydown="aud.roleCellKey(event,${i},'voicePart')" id="rc-${i}-voicePart"></td>`
          : ''
      }
      <td><input class="aud-cell-input" value="${esc(r.description)}" placeholder="Optional casting note"
          onchange="aud.roleCellChanged(${i},'description',this.value)"
          onkeydown="aud.roleCellKey(event,${i},'description')" id="rc-${i}-description"></td>
    </tr>`
    )
    .join('')
}

function roleCellChanged(idx, field, value) {
  const r = auditions[activeAudIdx].rolesAvailable[idx]
  r[field] = field === 'type' || field === 'gender' ? value : value || undefined
  markDirty()
}

function roleCellKey(event, rowIdx, field) {
  const cols = getRoleCols()
  const col = cols.indexOf(field)
  if (event.key === 'Tab') {
    event.preventDefault()
    const next = event.shiftKey ? col - 1 : col + 1
    if (next >= 0 && next < cols.length) {
      document.getElementById(`rc-${rowIdx}-${cols[next]}`)?.focus()
    } else if (!event.shiftKey) {
      const n = document.getElementById(`rc-${rowIdx + 1}-role`)
      n ? n.focus() : addRoleRow()
    }
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const n = document.getElementById(`rc-${rowIdx + 1}-role`)
    n ? n.focus() : addRoleRow()
  }
}

function addRoleRow() {
  if (activeAudIdx < 0) return
  auditions[activeAudIdx].rolesAvailable.push({ role: '', type: 'lead', gender: 'any' })
  renderRolesTable()
  markDirty()
  const idx = auditions[activeAudIdx].rolesAvailable.length - 1
  setTimeout(() => document.getElementById(`rc-${idx}-role`)?.focus(), 30)
}

function deleteRoleRow(idx) {
  auditions[activeAudIdx].rolesAvailable.splice(idx, 1)
  renderRolesTable()
  markDirty()
}

// ── VENUE AUTOCOMPLETE ──
function getVenueDropdown() {
  let el = document.getElementById('aud-venue-dropdown')
  if (!el) {
    el = document.createElement('div')
    el.id = 'aud-venue-dropdown'
    el.className = 'aud-venue-dropdown'
    el.style.display = 'none'
    document.body.appendChild(el)
  }
  return el
}

function onLocNameInput(rowIdx, inputEl) {
  if (!venuesList.length) return
  const query = inputEl.value.trim().toLowerCase()
  const matches = venuesList.filter((v) => !query || v.name.toLowerCase().includes(query))
  const dd = getVenueDropdown()
  if (!matches.length) {
    dd.style.display = 'none'
    return
  }
  dd.innerHTML = matches
    .map(
      (v) => `
    <div class="aud-venue-item" onmousedown="aud.selectVenueItem(${rowIdx},'${v.code}')">
      <div class="aud-venue-item-name">${esc(v.name)}</div>
      ${v.address ? `<div class="aud-venue-item-addr">${esc(v.address)}</div>` : ''}
    </div>`
    )
    .join('')
  const rect = inputEl.getBoundingClientRect()
  dd.style.left = rect.left + 'px'
  dd.style.top = rect.bottom + 2 + 'px'
  dd.style.width = Math.max(rect.width, 240) + 'px'
  dd.style.display = 'block'
}

function hideVenueDropdown() {
  const dd = document.getElementById('aud-venue-dropdown')
  if (dd) dd.style.display = 'none'
}

function selectVenueItem(rowIdx, code) {
  const venue = venuesList.find((v) => v.code === code)
  if (!venue) {
    hideVenueDropdown()
    return
  }
  const d = auditions[activeAudIdx].auditionDates[rowIdx]
  if (!d.location) d.location = {}
  d.location.name = venue.name
  d.location.address = venue.address || undefined
  const nameEl = document.getElementById(`dc-${rowIdx}-locName`)
  const addrEl = document.getElementById(`dc-${rowIdx}-locAddr`)
  if (nameEl) nameEl.value = venue.name
  if (addrEl) addrEl.value = venue.address || ''
  hideVenueDropdown()
  markDirty()
  document.getElementById(`dc-${rowIdx}-notes`)?.focus()
}

// ── MODULE API ──
export function mount(container, context) {
  injectStyles()
  container.innerHTML = AUD_HTML
  isAdminContext = context.isAdmin
  updateEmptyState()

  window.aud = {
    onCompanySelect,
    onYearSelect,
    saveFile,
    newAudition,
    selectAud,
    deleteAudition,
    fieldChanged,
    toggleNotesExpand,
    addDateRow,
    deleteDateRow,
    dateCellChanged,
    dateCellKey,
    addRoleRow,
    deleteRoleRow,
    roleCellChanged,
    roleCellKey,
    onLocNameInput,
    hideVenueDropdown,
    selectVenueItem,
    normalizeHeaderDate
  }

  const handle = document.getElementById('audResizeHandle')
  const sidebar = document.getElementById('audSidebar')
  handle.addEventListener('mousedown', (e) => {
    const startX = e.clientX,
      startW = sidebar.offsetWidth
    handle.classList.add('dragging')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
    _resizeMouseMove = (ev) => {
      sidebar.style.width = Math.min(Math.max(startW + ev.clientX - startX, 130), 400) + 'px'
    }
    _resizeMouseUp = () => {
      handle.classList.remove('dragging')
      document.body.style.cursor = document.body.style.userSelect = ''
      document.removeEventListener('mousemove', _resizeMouseMove)
      document.removeEventListener('mouseup', _resizeMouseUp)
      _resizeMouseMove = _resizeMouseUp = null
    }
    document.addEventListener('mousemove', _resizeMouseMove)
    document.addEventListener('mouseup', _resizeMouseUp)
  })

  initFromContext(context)
  updateStatus()
  updateSaveBtn()
}

export function unmount() {
  if (_resizeMouseMove) document.removeEventListener('mousemove', _resizeMouseMove)
  if (_resizeMouseUp) document.removeEventListener('mouseup', _resizeMouseUp)
  _resizeMouseMove = _resizeMouseUp = null
  document.getElementById('aud-venue-dropdown')?.remove()
  delete window.aud
  auditions = []
  activeAudIdx = -1
  allCompanies = []
  allAudFiles = []
  pendingCompanyId = currentCompanyId = null
  currentYear = CURRENT_YEAR
  currentCompanyAbv = ''
  isDirty = false
  isAdminContext = false
  venuesList = []
}
