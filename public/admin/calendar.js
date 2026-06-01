import { IS_DEV, apiFetch, apiPut, buildCompanyOptions } from './api.js'

const PERF_TYPES = ['', 'Preview', 'Opening', 'Closing', 'Talk-back']
const MONTH_MAP = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
}
const CURRENT_YEAR = 2026

// ── MODULE STATE (reset on each mount) ──
let runs = []
let activeRunIdx = -1
let allCompanies = []
let allShowFiles = []
let pendingCompanyId = null
let currentCompanyId = null
let currentYear = CURRENT_YEAR
let currentCompanyAbv = ''
let venuesList = []
let isDirty = false
let isAdminContext = false
let _resizeMouseMove = null
let _resizeMouseUp = null

// ── STYLES ──
const STYLES_ID = 'cal-editor-styles'

function injectStyles() {
  if (document.getElementById(STYLES_ID)) return
  const s = document.createElement('style')
  s.id = STYLES_ID
  s.textContent = CAL_CSS
  document.head.appendChild(s)
}

const CAL_CSS = `
.cal-toolbar {
  background: var(--surface);
  border-bottom: 2px solid var(--border);
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  flex-shrink: 0;
}
.cal-select {
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
.cal-toolbar-spacer { flex: 1; }
.cal-wrap {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}
.sidebar {
  width: 160px;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.sidebar-resize-handle {
  width: 5px;
  background: var(--border);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.15s;
}
.sidebar-resize-handle:hover,
.sidebar-resize-handle.dragging {
  background: var(--accent2);
}
.sidebar-header {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sidebar-label {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-mid);
}
.run-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.run-item {
  padding: 7px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.1s;
}
.run-item:hover { background: var(--bg); }
.run-item.active { background: var(--bg); border-left-color: var(--accent); }
.run-item-company {
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--ink-faint);
  margin-bottom: 1px;
}
.run-item-show { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.run-item-count { font-size: 10px; color: var(--ink-faint); font-family: 'IBM Plex Mono', monospace; }
.sidebar-empty { padding: 20px 12px; font-size: 12px; color: var(--ink-faint); text-align: center; line-height: 1.6; }
.cal-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--ink-mid);
}
.empty-state-icon { font-size: 40px; opacity: 0.2; }
.empty-state h2 { font-family: 'Libre Baskerville', serif; font-size: 18px; color: var(--ink); }
.empty-state p { font-size: 13px; color: var(--ink-mid); }
.run-editor { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.run-header {
  padding: 10px 16px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.run-header-title { font-family: 'Libre Baskerville', serif; font-size: 16px; flex: 1; }
.run-header-title small { font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; font-weight: 400; color: var(--ink-mid); margin-left: 6px; }
.run-fields {
  padding: 10px 16px;
  background: var(--bg);
  border-bottom: 2px solid var(--border);
  display: grid;
  grid-template-columns: repeat(4, 1fr) 2fr 2fr;
  gap: 8px;
  flex-shrink: 0;
}
.field-group { display: flex; flex-direction: column; gap: 3px; }
.field-label { font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-mid); }
.field-input, .field-select {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 12px;
  padding: 4px 7px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--surface);
  color: var(--ink);
  width: 100%;
}
.field-input:focus, .field-select:focus { outline: none; border-color: var(--accent2); }
.field-input.mono { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
.field-input.field-readonly {
  background: rgba(0,0,0,0.06);
  color: var(--ink-mid);
  cursor: default;
  pointer-events: none;
  border-color: var(--border);
}
.cal-venue-dropdown {
  position: fixed; z-index: 1000;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 3px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  overflow-y: auto; max-height: 180px;
}
.cal-venue-item {
  padding: 6px 10px; font-size: 12px; font-family: 'IBM Plex Sans', sans-serif;
  cursor: pointer; border-bottom: 1px solid var(--border); color: var(--ink);
}
.cal-venue-item:last-child { border-bottom: none; }
.cal-venue-item:hover { background: var(--bg); }
.desc-section {
  padding: 6px 16px 8px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.desc-toolbar { display: flex; align-items: center; gap: 6px; }
.desc-fmt-btns { display: flex; gap: 3px; }
.desc-fmt-btn {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 11px;
  width: 22px; height: 20px;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}
.desc-fmt-btn:hover { background: var(--bg); border-color: var(--ink-mid); }
.desc-expand-btn {
  margin-left: auto;
  font-size: 13px;
  width: 22px; height: 20px;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--surface);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  color: var(--ink-mid);
}
.desc-expand-btn:hover { background: var(--bg); border-color: var(--ink-mid); }
.desc-textarea {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  padding: 4px 7px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--surface);
  color: var(--ink);
  width: 100%;
  resize: none;
  overflow: hidden;
  line-height: 1.5;
  height: 26px;
  transition: height 0.15s;
}
.desc-textarea:focus { outline: none; border-color: var(--accent2); }
.desc-textarea.expanded { height: 90px; overflow-y: auto; resize: vertical; }
.perf-section { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.perf-toolbar {
  padding: 7px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.perf-toolbar-label { font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-mid); flex: 1; }
.pattern-panel {
  background: #eef6f0;
  border-bottom: 1px solid #c8e0d0;
  padding: 8px 16px;
  display: none;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.pattern-panel.open { display: flex; }
.pattern-panel label { font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: var(--green); }
.pattern-input {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 12px;
  padding: 4px 7px;
  border: 1px solid #c8e0d0;
  border-radius: 3px;
  background: #fff;
  color: var(--ink);
}
.pattern-days { display: flex; gap: 4px; }
.day-toggle {
  width: 28px; height: 24px;
  border-radius: 3px;
  border: 1px solid #c8e0d0;
  background: #fff;
  font-size: 10px; font-weight: 500;
  cursor: pointer;
  font-family: 'IBM Plex Sans', sans-serif;
  transition: all 0.1s;
}
.day-toggle.on { background: var(--green); border-color: var(--green); color: #fff; }
.paste-panel {
  background: #eef3f8;
  border-bottom: 1px solid #c8d8e8;
  padding: 8px 16px;
  display: none;
  gap: 8px;
  align-items: flex-start;
  flex-shrink: 0;
}
.paste-panel.open { display: flex; }
.paste-textarea {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  padding: 6px 8px;
  border: 1px solid #c8d8e8;
  border-radius: 3px;
  width: 360px;
  height: 72px;
  resize: vertical;
  background: #fff;
}
.paste-hint { font-size: 11px; color: var(--ink-mid); line-height: 1.6; max-width: 240px; }
.table-wrap { flex: 1; overflow-y: auto; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; min-width: 700px; }
thead th {
  background: var(--ink);
  color: #fff;
  font-size: 9px; font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 5px 8px;
  text-align: left;
  position: sticky; top: 0; z-index: 10;
  white-space: nowrap;
}
thead th.col-del  { width: 32px; }
thead th.col-date { width: 110px; }
thead th.col-time { width: 80px; }
thead th.col-type { width: 150px; }
thead th.col-disc { min-width: 180px; }
thead th.col-url  { min-width: 200px; }
tbody tr { border-bottom: 1px solid var(--border); }
tbody tr:hover { background: #faf8f5; }
tbody td { padding: 2px 4px; vertical-align: middle; }
.cell-input {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  padding: 3px 5px;
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  width: 100%;
  color: var(--ink);
}
.cell-input:focus { outline: none; border-color: var(--accent2); background: var(--surface); }
.cell-input.invalid { border-color: #c0392b !important; background: #fef2f2 !important; }
.cell-select {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 11px;
  padding: 3px 4px;
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  width: 100%;
  color: var(--ink);
}
.cell-select:focus { outline: none; border-color: var(--accent2); background: var(--surface); }
.del-btn {
  width: 22px; height: 22px;
  border: none; background: none;
  cursor: pointer;
  color: var(--ink-faint);
  font-size: 14px;
  border-radius: 3px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.1s;
}
.del-btn:hover { background: #fde; color: var(--accent); }
.cal-statusbar {
  height: 26px;
  background: var(--ink);
  color: rgba(255,255,255,0.6);
  font-size: 10px;
  font-family: 'IBM Plex Mono', monospace;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 20px;
  flex-shrink: 0;
}
.status-item { display: flex; gap: 6px; }
.status-key { color: rgba(255,255,255,0.35); }
.cal-modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}
.cal-modal-overlay.open { display: flex; }
.cal-modal {
  background: var(--surface);
  border-radius: 6px;
  width: 680px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.modal-header { padding: 14px 18px 12px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
.modal-title { font-family: 'Libre Baskerville', serif; font-size: 15px; flex: 1; }
.modal-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; padding: 12px 18px; gap: 10px; }
.modal-footer { padding: 10px 18px; border-top: 1px solid var(--border); display: flex; gap: 8px; justify-content: flex-end; }
.json-output {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  flex: 1;
  overflow-y: auto;
  background: #1c1a17;
  color: #e8e0d0;
  padding: 12px;
  border-radius: 4px;
  white-space: pre;
  min-height: 300px;
}
`

// ── HTML TEMPLATE ──
const CAL_HTML = `
<div class="cal-toolbar">
  <select class="cal-select" id="companySelect" onchange="cal.onCompanySelect()" style="display:none">
    <option value="">— Company —</option>
  </select>
  <select class="cal-select" id="yearSelect" onchange="cal.onYearSelect()" style="display:none">
    <option value="">— Year —</option>
  </select>
  <div class="cal-toolbar-spacer"></div>
  <button class="btn btn-sm" id="saveBtn" onclick="cal.saveFile()" style="border:1px solid var(--border);color:rgba(28,26,23,0.4)" disabled>Save</button>
</div>

<div class="cal-wrap">
  <div class="sidebar" id="calSidebar">
    <div class="sidebar-header">
      <span class="sidebar-label">Runs</span>
      <button class="btn btn-green btn-sm" id="newRunBtn" onclick="cal.newRun()" style="display:none">+ New</button>
    </div>
    <div class="run-list" id="runList"></div>
  </div>

  <div class="sidebar-resize-handle" id="sidebarHandle"></div>

  <div class="cal-main" id="mainPanel">
    <div class="empty-state" id="emptyState">
      <div class="empty-state-icon">🎭</div>
      <h2>No run selected</h2>
      <p>Select a run from the sidebar or create a new one.</p>
    </div>

    <div class="run-editor" id="runEditor" style="display:none">
      <div class="run-header">
        <div class="run-header-title"><span id="editorTitleText"></span><small id="editorSubtitle"></small></div>
        <button class="btn btn-sm" style="background:#fde;color:var(--accent);border:1px solid #fcc" onclick="cal.deleteRun()">Delete run</button>
      </div>

      <div class="run-fields">
        <div class="field-group">
          <label class="field-label">Company</label>
          <input class="field-input field-readonly" id="f-company" readonly tabindex="-1">
        </div>
        <div class="field-group">
          <label class="field-label">Abbrev</label>
          <input class="field-input" id="f-showAbv" placeholder="Brief title" maxlength="20" oninput="cal.runFieldChanged()">
        </div>
        <div class="field-group">
          <label class="field-label">Genre</label>
          <select class="field-select" id="f-genre" onchange="cal.runFieldChanged()">
            <option value="">-</option>
            <option>Drama</option><option>Musical</option><option>Comedy</option><option>Other</option>
          </select>
        </div>
        <div class="field-group">
          <label class="field-label">Venue</label>
          <input class="field-input" id="f-venue" placeholder="Venue name" autocomplete="off"
            oninput="cal.onVenueInput(this)" onfocus="cal.onVenueInput(this)"
            onblur="setTimeout(()=>cal.hideCalVenueDropdown(),150)"
            onkeydown="cal.venueKeyDown(event,this)">
        </div>
        <div class="field-group" style="grid-column:span 1">
          <label class="field-label">Full Show Title</label>
          <input class="field-input" id="f-show" placeholder="Full title" oninput="cal.runFieldChanged()">
        </div>
        <div class="field-group" style="grid-column:span 1">
          <label class="field-label">Price</label>
          <input class="field-input" id="f-price" placeholder="e.g. $xx-$yy" oninput="cal.runFieldChanged()">
        </div>
        <div class="field-group" style="grid-column:span 2">
          <label class="field-label">Discounts</label>
          <input class="field-input" id="f-discounts" placeholder="e.g. Senior $aa, Student $bb" oninput="cal.runFieldChanged()">
        </div>
        <div class="field-group" style="grid-column:span 2">
          <label class="field-label">Info URL</label>
          <input class="field-input mono" id="f-infoUrl" placeholder="https://..." oninput="cal.runFieldChanged()">
        </div>
        <div class="field-group" style="grid-column:span 2">
          <label class="field-label">Default Tickets URL</label>
          <input class="field-input mono" id="f-ticketsUrl" placeholder="https://..." oninput="cal.runFieldChanged()">
        </div>
      </div>

      <div class="desc-section">
        <div class="desc-toolbar">
          <label class="field-label" style="margin-bottom:0">Description</label>
          <div class="desc-fmt-btns">
            <button class="desc-fmt-btn" onclick="cal.fmtDesc('bold')" title="Bold"><strong>B</strong></button>
            <button class="desc-fmt-btn" onclick="cal.fmtDesc('italic')" title="Italic"><em>I</em></button>
          </div>
          <button class="desc-expand-btn" id="descExpandBtn" onclick="cal.toggleDescExpand()" title="Expand / collapse">↕</button>
        </div>
        <textarea class="field-input desc-textarea" id="f-description" rows="1"
          placeholder="Brief narrative — supports **bold** and *italic*"
          oninput="cal.runFieldChanged()"></textarea>
      </div>

      <div class="perf-section">
        <div class="perf-toolbar">
          <span class="perf-toolbar-label">Performances <span id="perfCount" style="color:var(--ink-faint);font-family:'IBM Plex Mono',monospace;font-size:10px"></span></span>
          <button class="btn btn-sm btn-green" onclick="cal.togglePattern()">⚡ Pattern</button>
          <button class="btn btn-sm btn-blue"  onclick="cal.togglePaste()">📋 Paste dates</button>
          <button class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)" onclick="cal.addRow()">+ Add row</button>
        </div>

        <div class="pattern-panel" id="patternPanel">
          <label>From</label>
          <input type="date" class="pattern-input" id="pat-from" style="width:130px">
          <label>To</label>
          <input type="date" class="pattern-input" id="pat-to" style="width:130px">
          <label>Days</label>
          <div class="pattern-days" id="patternDays">
            <button class="day-toggle" data-d="1">M</button>
            <button class="day-toggle" data-d="2">Tu</button>
            <button class="day-toggle" data-d="3">W</button>
            <button class="day-toggle" data-d="4">Th</button>
            <button class="day-toggle" data-d="5">F</button>
            <button class="day-toggle" data-d="6">Sa</button>
            <button class="day-toggle" data-d="0">Su</button>
          </div>
          <label>Time</label>
          <input type="time" class="pattern-input" id="pat-time" value="19:30" style="width:90px">
          <button class="btn btn-green btn-sm" onclick="cal.generatePattern()">Generate</button>
          <button class="btn btn-sm" style="background:transparent;border:1px solid #c8e0d0;color:var(--green)" onclick="cal.togglePattern()">✕</button>
        </div>

        <div class="paste-panel" id="pastePanel">
          <div style="display:flex;flex-direction:column;gap:6px">
            <label style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--accent2)">Default time for pasted dates</label>
            <input type="time" class="pattern-input" id="paste-time" value="19:30" style="width:100px;border-color:#c8d8e8">
          </div>
          <textarea class="paste-textarea" id="pasteArea" placeholder="Paste dates, one per line, e.g.:&#10;July 11 2026&#10;July 12 2026&#10;2026-07-14&#10;Saturday, July 18, 2026 at 8:00 PM"></textarea>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div class="paste-hint">Accepts most date formats. Time in line overrides default. SCS-format lines (e.g. <em>Saturday, July 18, 2026 at 8:00 PM</em>) parsed automatically.</div>
            <button class="btn btn-blue btn-sm" onclick="cal.parsePaste()">Import dates</button>
            <button class="btn btn-sm" style="background:transparent;border:1px solid #c8d8e8;color:var(--accent2)" onclick="cal.togglePaste()">Cancel</button>
          </div>
        </div>

        <div class="table-wrap">
          <table id="perfTable">
            <thead>
              <tr>
                <th class="col-del"></th>
                <th class="col-date">Date</th>
                <th class="col-time">Time</th>
                <th class="col-type">Perf Type</th>
                <th class="col-disc">Discount override</th>
                <th class="col-url">Tickets URL override</th>
              </tr>
            </thead>
            <tbody id="perfBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="cal-statusbar">
  <span class="status-item"><span class="status-key">Runs</span><span id="st-runs">0</span></span>
  <span class="status-item"><span class="status-key">Total perfs</span><span id="st-perfs">0</span></span>
  <span class="status-item"><span class="status-key">Status</span><span id="st-saved" style="color:rgba(255,255,255,0.35)">no file loaded</span></span>
</div>

<div class="cal-modal-overlay" id="exportModal">
  <div class="cal-modal">
    <div class="modal-header">
      <div class="modal-title">Export JSON</div>
      <button class="btn btn-sm" style="background:var(--bg);color:var(--ink);border:1px solid var(--border)" onclick="cal.closeExport()">✕ Close</button>
    </div>
    <div class="modal-body">
      <div class="json-output" id="jsonOutput"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-sm btn-accent" onclick="cal.downloadJSON()">Download .json</button>
    </div>
  </div>
</div>

<input type="file" id="importFile" accept=".json" style="display:none" onchange="cal.handleImport(event)">
`

// ── DATA ACCESS ──
async function loadShowsDir() {
  const resp = await fetch('/.netlify/functions/data?dir=shows')
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

async function loadCompanyFile(coId, year) {
  year = year || CURRENT_YEAR
  try {
    const data = await apiFetch(`shows/${year}/${coId}-${year}.json`)
    runs = data.runs || []
    currentCompanyId = coId
    currentYear = data.year || year
    currentCompanyAbv = allCompanies.find((c) => c.id === coId)?.abvName || coId
    isDirty = false
    activeRunIdx = runs.length > 0 ? 0 : -1
    document.getElementById('newRunBtn')?.setAttribute('style', '')
    renderSidebar()
    loadRunEditor()
    updateStatus()
    updateSaveBtn()
  } catch (e) {
    alert('Could not load company file: ' + e.message)
  }
}

function showFileControls(_visible) {
  /* buttons removed; keep for future reinstatement */
}

function updateEmptyState() {
  const el = document.getElementById('emptyState')
  if (!el) return
  if (!currentCompanyId) {
    document.getElementById('newRunBtn')?.setAttribute('style', 'display:none')
    if (isAdminContext) {
      el.innerHTML = `<div class="empty-state-icon">📅</div>
        <h2>Select a company / year</h2>
        <p>from the toolbar above to load its runs</p>`
    } else {
      el.innerHTML = `<div class="empty-state-icon">📅</div>
        <h2>Select a year</h2>
        <p>Choose a year from the toolbar above to load runs.</p>`
    }
  } else {
    el.innerHTML = `<div class="empty-state-icon">🎭</div>
      <h2>No run selected</h2>
      <p>Select a run from the sidebar or click + New.</p>`
  }
}

// ── INIT FROM CONTEXT ──
async function initFromContext(context) {
  isAdminContext = context.isAdmin
  allCompanies = context.allCompanies || []
  updateEmptyState()
  venuesList = await apiFetch('sc-theater-venues.json')
    .then((d) => d.venues || [])
    .catch(() => [])
  try {
    allShowFiles = await loadShowsDir()
  } catch (e) {
    alert('Could not list show files: ' + e.message)
    return
  }
  if (context.isAdmin) {
    const compSel = document.getElementById('companySelect')
    compSel.innerHTML = buildCompanyOptions(allCompanies)
    compSel.style.display = ''
  } else {
    pendingCompanyId = context.company.id
    currentCompanyAbv = context.company.abvName
    const years = allShowFiles.filter((f) => f.companyId === context.company.id).map((f) => f.year)
    populateYearSelect(years)
    if (years.length === 1) {
      document.getElementById('yearSelect').value = String(years[0])
      await loadCompanyFile(pendingCompanyId, years[0])
    }
  }
}

// ── COMPANY / YEAR SELECTION ──
function onCompanySelect() {
  const coId = document.getElementById('companySelect').value
  if (!coId) {
    hideYearSelect()
    clearEditor()
    return
  }
  if (isDirty && !confirm('You have unsaved changes. Discard and continue?')) {
    document.getElementById('companySelect').value = pendingCompanyId || ''
    return
  }
  pendingCompanyId = coId
  const years = allShowFiles.filter((f) => f.companyId === coId).map((f) => f.year)
  populateYearSelect(years)
  clearEditor()
}

function populateYearSelect(years) {
  const sel = document.getElementById('yearSelect')
  years = [...new Set(years)].sort((a, b) => b - a)
  sel.innerHTML =
    '<option value="">— Year —</option>' +
    years.map((y) => `<option value="${y}">${y}</option>`).join('') +
    '<option value="__new__">Add year</option>'
  sel.style.display = ''
  sel.value = ''
}

function hideYearSelect() {
  const sel = document.getElementById('yearSelect')
  sel.style.display = 'none'
  sel.value = ''
}

async function onYearSelect() {
  const val = document.getElementById('yearSelect').value
  if (!val || !pendingCompanyId) return
  if (isDirty && !confirm('You have unsaved changes. Discard and continue?')) {
    document.getElementById('yearSelect').value = currentYear || ''
    return
  }
  if (val === '__new__') {
    const existingYears = allShowFiles
      .filter((f) => f.companyId === pendingCompanyId)
      .map((f) => f.year)
    const nextYear = existingYears.length > 0 ? Math.max(...existingYears) + 1 : CURRENT_YEAR
    const abv = allCompanies.find((c) => c.id === pendingCompanyId)?.abvName || pendingCompanyId
    const file = `shows/${nextYear}/${pendingCompanyId}-${nextYear}.json`
    const payload = { company: abv, year: nextYear, runs: [] }
    try {
      await apiPut(file, payload)
    } catch (e) {
      alert('Could not create file: ' + e.message)
      document.getElementById('yearSelect').value = ''
      return
    }
    allShowFiles.push({ companyId: pendingCompanyId, year: nextYear })
    const allYears = allShowFiles.filter((f) => f.companyId === pendingCompanyId).map((f) => f.year)
    populateYearSelect(allYears)
    document.getElementById('yearSelect').value = String(nextYear)
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
  const btn = document.getElementById('saveBtn')
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
  const btn = document.getElementById('saveBtn')
  btn.disabled = true
  btn.textContent = 'Saving…'
  try {
    await apiPut(`shows/${currentYear}/${currentCompanyId}-${currentYear}.json`, {
      company: currentCompanyAbv,
      year: currentYear,
      runs
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

// ── STATUS ──
function updateStatus() {
  const stRuns = document.getElementById('st-runs')
  const stPerfs = document.getElementById('st-perfs')
  const stSaved = document.getElementById('st-saved')
  if (!stRuns) return
  stRuns.textContent = runs.length
  stPerfs.textContent = runs.reduce((s, r) => s + r.performances.length, 0)
  if (!currentCompanyId) {
    stSaved.textContent = 'no file loaded'
    stSaved.style.color = 'rgba(255,255,255,0.35)'
  } else if (isDirty) {
    stSaved.textContent = 'unsaved changes'
    stSaved.style.color = 'var(--yellow)'
  } else {
    stSaved.textContent = 'saved'
    stSaved.style.color = 'var(--green)'
  }
}

// ── SIDEBAR ──
function renderSidebar() {
  const list = document.getElementById('runList')
  if (!list) return
  if (!runs.length) {
    list.innerHTML = ''
    return
  }
  const openingDate = (r) =>
    r.performances.length ? r.performances.map((p) => p.date).sort()[0] : '9999-99-99'
  const sorted = runs
    .map((r, i) => ({ r, i }))
    .sort((a, b) => openingDate(a.r).localeCompare(openingDate(b.r)))
  list.innerHTML = sorted
    .map(
      ({ r, i }) => `
    <div class="run-item ${i === activeRunIdx ? 'active' : ''}" onclick="cal.selectRun(${i})">
      <div class="run-item-company">${r.company || '—'}</div>
      <div class="run-item-show">${r.showAbv || r.show || 'Untitled'}</div>
      <div class="run-item-count">${r.performances.length} perf${r.performances.length !== 1 ? 's' : ''}</div>
    </div>`
    )
    .join('')
  updateStatus()
}

// ── RUN SELECTION ──
function selectRun(idx) {
  activeRunIdx = idx
  renderSidebar()
  loadRunEditor()
}

function loadRunEditor() {
  if (activeRunIdx < 0 || activeRunIdx >= runs.length) {
    updateEmptyState()
    document.getElementById('emptyState').style.display = ''
    document.getElementById('runEditor').style.display = 'none'
    return
  }
  document.getElementById('emptyState').style.display = 'none'
  document.getElementById('runEditor').style.display = ''
  const r = runs[activeRunIdx]
  document.getElementById('f-company').value = r.company || ''
  document.getElementById('f-showAbv').value = r.showAbv || ''
  document.getElementById('f-show').value = r.show || ''
  document.getElementById('f-genre').value = r.genre || ''
  document.getElementById('f-venue').value = r.venue || ''
  document.getElementById('f-price').value = r.price || ''
  document.getElementById('f-discounts').value = r.discounts || ''
  document.getElementById('f-infoUrl').value = r.infoUrl || ''
  document.getElementById('f-ticketsUrl').value = r.ticketsUrl || ''
  const descTa = document.getElementById('f-description')
  descTa.value = r.description || ''
  descTa.classList.remove('expanded')
  document.getElementById('descExpandBtn').textContent = '↕'
  updateEditorTitle()
  renderPerfTable()
}

function updateEditorTitle() {
  const r = runs[activeRunIdx]
  document.getElementById('editorTitleText').textContent = r.showAbv || r.show || 'Untitled'
  document.getElementById('editorSubtitle').textContent = r.company ? ` · ${r.company}` : ''
}

function runFieldChanged() {
  if (activeRunIdx < 0) return
  const r = runs[activeRunIdx]
  r.showAbv = document.getElementById('f-showAbv').value
  r.show = document.getElementById('f-show').value
  r.genre = document.getElementById('f-genre').value
  r.venue = document.getElementById('f-venue').value
  r.price = document.getElementById('f-price').value
  r.discounts = document.getElementById('f-discounts').value
  r.infoUrl = document.getElementById('f-infoUrl').value
  r.ticketsUrl = document.getElementById('f-ticketsUrl').value
  r.description = document.getElementById('f-description').value
  updateEditorTitle()
  renderSidebar()
  markDirty()
}

// ── DESCRIPTION HELPERS ──
function toggleDescExpand() {
  const ta = document.getElementById('f-description')
  const btn = document.getElementById('descExpandBtn')
  ta.classList.toggle('expanded')
  btn.textContent = ta.classList.contains('expanded') ? '↑' : '↕'
}

function fmtDesc(type) {
  const ta = document.getElementById('f-description')
  const s = ta.selectionStart,
    e = ta.selectionEnd
  const sel = ta.value.slice(s, e)
  const m = type === 'bold' ? '**' : '*'
  let newVal, ns, ne
  if (sel) {
    newVal = ta.value.slice(0, s) + m + sel + m + ta.value.slice(e)
    ns = s + m.length
    ne = e + m.length
  } else {
    newVal = ta.value.slice(0, s) + m + m + ta.value.slice(e)
    ns = ne = s + m.length
  }
  ta.value = newVal
  ta.setSelectionRange(ns, ne)
  ta.focus()
  runFieldChanged()
}

// ── RUN CRUD ──
function newRun() {
  const run = {
    id: `run-${Date.now()}`,
    company: currentCompanyAbv,
    showAbv: '',
    show: '',
    description: '',
    genre: '',
    venue: '',
    price: '',
    discounts: '',
    infoUrl: '',
    ticketsUrl: '',
    performances: []
  }
  runs.push(run)
  activeRunIdx = runs.length - 1
  renderSidebar()
  loadRunEditor()
  document.getElementById('f-showAbv').focus()
  markDirty()
}

function deleteRun() {
  if (activeRunIdx < 0) return
  const r = runs[activeRunIdx]
  if (!confirm(`Delete "${r.showAbv || 'this run'}"? This cannot be undone.`)) return
  runs.splice(activeRunIdx, 1)
  activeRunIdx = Math.min(activeRunIdx, runs.length - 1)
  renderSidebar()
  loadRunEditor()
  markDirty()
}

function clearEditor() {
  runs = []
  currentCompanyId = null
  activeRunIdx = -1
  isDirty = false
  renderSidebar()
  updateEmptyState()
  document.getElementById('emptyState').style.display = ''
  document.getElementById('runEditor').style.display = 'none'
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
function setInvalid(id, invalid) {
  document.getElementById(id)?.classList.toggle('invalid', invalid)
}
function collectErrors() {
  const errors = []
  runs.forEach((run, ri) => {
    const label = run.show || `Run ${ri + 1}`
    run.performances.forEach((p, pi) => {
      if (!isValidDate(p.date))
        errors.push(`"${label}" — row ${pi + 1}: date "${p.date || '(empty)'}"`)
      if (!isValidTime(p.time))
        errors.push(`"${label}" — row ${pi + 1}: time "${p.time || '(empty)'}"`)
    })
  })
  return errors
}

// ── PERFORMANCE TABLE ──
function renderPerfTable() {
  if (activeRunIdx < 0) return
  const perfs = runs[activeRunIdx].performances
  document.getElementById('perfCount').textContent = `(${perfs.length})`
  document.getElementById('perfBody').innerHTML = perfs
    .map(
      (p, i) => `
    <tr id="row-${i}">
      <td><button class="del-btn" onclick="cal.deleteRow(${i})" title="Delete">×</button></td>
      <td><input class="cell-input" value="${p.date || ''}" placeholder="2026-07-11"
          onchange="cal.cellChanged(${i},'date',this.value)"
          onkeydown="cal.cellKey(event,${i},'date')"
          id="cell-${i}-date"></td>
      <td><input class="cell-input" value="${p.time || ''}" placeholder="19:30" style="width:64px"
          onchange="cal.cellChanged(${i},'time',this.value)"
          onkeydown="cal.cellKey(event,${i},'time')"
          id="cell-${i}-time"></td>
      <td>
        <select class="cell-select" onchange="cal.cellChanged(${i},'perfType',this.value)" id="cell-${i}-perfType">
          ${PERF_TYPES.map((t) => `<option value="${t}" ${p.perfType === t ? 'selected' : ''}>${t || '—'}</option>`).join('')}
        </select>
      </td>
      <td><input class="cell-input" value="${p.discounts || ''}" placeholder="(default for run)"
          onchange="cal.cellChanged(${i},'discounts',this.value)"
          style="font-family:'IBM Plex Sans',sans-serif;font-size:11px"
          id="cell-${i}-discounts"></td>
      <td><input class="cell-input" value="${p.ticketsUrl || ''}" placeholder="(default for run)"
          onchange="cal.cellChanged(${i},'ticketsUrl',this.value)"
          id="cell-${i}-ticketsUrl"></td>
    </tr>`
    )
    .join('')
  perfs.forEach((p, i) => {
    if (p.date) setInvalid(`cell-${i}-date`, !isValidDate(p.date))
    if (p.time) setInvalid(`cell-${i}-time`, !isValidTime(p.time))
  })
}

function cellChanged(idx, field, value) {
  if (field === 'date') {
    value = normalizeDate(value)
    const el = document.getElementById(`cell-${idx}-date`)
    if (el && el.value !== value) el.value = value
    if (value) setInvalid(`cell-${idx}-date`, !isValidDate(value))
  } else if (field === 'time') {
    value = value.replace('.', ':')
    const el = document.getElementById(`cell-${idx}-time`)
    if (el && el.value !== value) el.value = value
    if (value) setInvalid(`cell-${idx}-time`, !isValidTime(value))
  }
  runs[activeRunIdx].performances[idx][field] = value
  markDirty()
}

function cellKey(event, rowIdx, field) {
  const COLS = ['date', 'time', 'perfType', 'discounts', 'ticketsUrl']
  const colIdx = COLS.indexOf(field)
  if (event.key === 'Tab') {
    event.preventDefault()
    const nextCol = event.shiftKey ? colIdx - 1 : colIdx + 1
    if (nextCol >= 0 && nextCol < COLS.length) {
      const next = document.getElementById(`cell-${rowIdx}-${COLS[nextCol]}`)
      if (next) {
        next.focus()
        next.select && next.select()
      }
    } else if (!event.shiftKey && nextCol >= COLS.length) {
      const next = document.getElementById(`cell-${rowIdx + 1}-date`)
      if (next) {
        next.focus()
        next.select && next.select()
      } else addRow()
    }
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const next = document.getElementById(`cell-${rowIdx + 1}-date`)
    if (next) {
      next.focus()
      next.select && next.select()
    } else addRow()
  }
}

function addRow() {
  if (activeRunIdx < 0) return
  runs[activeRunIdx].performances.push({
    date: '',
    time: '',
    perfType: '',
    discounts: '',
    ticketsUrl: ''
  })
  renderPerfTable()
  markDirty()
  const newIdx = runs[activeRunIdx].performances.length - 1
  setTimeout(() => {
    const el = document.getElementById(`cell-${newIdx}-date`)
    if (el) {
      el.focus()
      el.select && el.select()
    }
  }, 30)
}

function deleteRow(idx) {
  runs[activeRunIdx].performances.splice(idx, 1)
  renderPerfTable()
  markDirty()
}

// ── PATTERN GENERATOR ──
function togglePattern() {
  document.getElementById('patternPanel').classList.toggle('open')
  document.getElementById('pastePanel').classList.remove('open')
}

function generatePattern() {
  const from = document.getElementById('pat-from').value
  const to = document.getElementById('pat-to').value
  const time = document.getElementById('pat-time').value || '19:30'
  const activeDays = [...document.querySelectorAll('.day-toggle.on')].map((b) =>
    parseInt(b.dataset.d)
  )
  if (!from || !to || !activeDays.length) {
    alert('Please set From date, To date, and at least one day of week.')
    return
  }
  const start = new Date(from + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')
  const perfs = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (activeDays.includes(d.getDay())) {
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      perfs.push({ date: ds, time, perfType: '', discounts: '', ticketsUrl: '' })
    }
  }
  if (!perfs.length) {
    alert('No dates matched. Check your day selection.')
    return
  }
  runs[activeRunIdx].performances.push(...perfs)
  runs[activeRunIdx].performances.sort(sortPerformances)
  renderPerfTable()
  markDirty()
  togglePattern()
}

// ── PASTE PARSER ──
function togglePaste() {
  const p = document.getElementById('pastePanel')
  p.classList.toggle('open')
  document.getElementById('patternPanel').classList.remove('open')
  if (p.classList.contains('open')) document.getElementById('pasteArea').focus()
}

function parseDate(str) {
  str = str.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  const full = str.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})(?:\s+at\s+([\d:]+\s*[AP]M))?/i)
  if (full) {
    const m = MONTH_MAP[full[1].toLowerCase()]
    if (m) {
      const dateStr = `${full[3]}-${String(m).padStart(2, '0')}-${String(parseInt(full[2])).padStart(2, '0')}`
      const timeStr = full[4] ? parseTimeStr(full[4]) : null
      return { date: dateStr, time: timeStr }
    }
  }
  const alt = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i)
  if (alt) {
    const m = MONTH_MAP[alt[2].toLowerCase()]
    if (m)
      return `${alt[3]}-${String(m).padStart(2, '0')}-${String(parseInt(alt[1])).padStart(2, '0')}`
  }
  return null
}

function parseTimeStr(t) {
  const m = t.trim().match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return null
  let h = parseInt(m[1]),
    mn = parseInt(m[2])
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`
}

function sortPerformances(a, b) {
  return a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time)
}

function parsePaste() {
  const defaultTime = document.getElementById('paste-time').value || '19:30'
  const lines = document
    .getElementById('pasteArea')
    .value.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const perfs = [],
    failed = []
  lines.forEach((line) => {
    if (/student matinee/i.test(line)) return
    const result = parseDate(line)
    if (!result) {
      failed.push(line)
      return
    }
    if (typeof result === 'object') {
      perfs.push({
        date: result.date,
        time: result.time || defaultTime,
        perfType: extractPerfType(line),
        discounts: '',
        ticketsUrl: ''
      })
    } else {
      perfs.push({ date: result, time: defaultTime, perfType: '', discounts: '', ticketsUrl: '' })
    }
  })
  if (perfs.length) {
    runs[activeRunIdx].performances.push(...perfs)
    runs[activeRunIdx].performances.sort(sortPerformances)
    renderPerfTable()
    markDirty()
  }
  if (failed.length) {
    alert(
      `Imported ${perfs.length} dates.\n\nCould not parse ${failed.length} line(s):\n${failed.join('\n')}`
    )
  } else {
    document.getElementById('pasteArea').value = ''
    togglePaste()
  }
}

function extractPerfType(line) {
  const l = line.toLowerCase()
  if (l.includes('preview')) return 'Preview'
  if (l.includes('opening')) return 'Opening'
  if (l.includes('closing')) return 'Closing'
  if (l.includes('talk-back') || l.includes('talkback')) return 'Talk-back'
  return ''
}

// ── IMPORT / EXPORT ──
function importJSON() {
  document.getElementById('importFile').click()
}

function handleImport(event) {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      if (!data || !Array.isArray(data.runs))
        throw new Error('Expected a JSON object with a top-level "runs" array.')
      let added = 0,
        replaced = 0
      data.runs.forEach((imp) => {
        const idx = imp.id ? runs.findIndex((r) => r.id === imp.id) : -1
        if (idx !== -1) {
          runs[idx] = imp
          replaced++
        } else {
          runs.push(imp)
          added++
        }
      })
      renderSidebar()
      markDirty()
      alert(`Import complete: ${replaced} run(s) updated, ${added} new run(s) added.`)
    } catch (err) {
      alert('Could not parse JSON: ' + err.message)
    }
    event.target.value = ''
  }
  reader.readAsText(file)
}

function openExport() {
  document.getElementById('exportModal').classList.add('open')
  const payload = currentCompanyId
    ? { company: currentCompanyAbv, year: currentYear, runs }
    : { runs }
  document.getElementById('jsonOutput').textContent = JSON.stringify(payload, null, 2)
}

function closeExport() {
  document.getElementById('exportModal').classList.remove('open')
}

function downloadJSON() {
  const text = document.getElementById('jsonOutput').textContent
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = currentCompanyId ? `${currentCompanyId}-${currentYear}.json` : 'sc-theater-runs.json'
  a.click()
  URL.revokeObjectURL(url)
}

// ── VENUE AUTOCOMPLETE ──
function getCalVenueDropdown() {
  let el = document.getElementById('cal-venue-dropdown')
  if (!el) {
    el = document.createElement('div')
    el.id = 'cal-venue-dropdown'
    el.className = 'cal-venue-dropdown'
    el.style.display = 'none'
    document.body.appendChild(el)
  }
  return el
}

function onVenueInput(inputEl) {
  if (!venuesList.length) return
  const query = inputEl.value.trim().toLowerCase()
  const matches = venuesList.filter((v) => !query || v.name.toLowerCase().includes(query))
  const dd = getCalVenueDropdown()
  if (!matches.length) {
    dd.style.display = 'none'
    return
  }
  dd.innerHTML = matches
    .map(
      (v) =>
        `<div class="cal-venue-item" onmousedown="cal.selectVenueForRun('${v.code}')">${v.name}</div>`
    )
    .join('')
  const rect = inputEl.getBoundingClientRect()
  dd.style.left = rect.left + 'px'
  dd.style.top = rect.bottom + 2 + 'px'
  dd.style.width = Math.max(rect.width, 200) + 'px'
  dd.style.display = 'block'
}

function hideCalVenueDropdown() {
  const dd = document.getElementById('cal-venue-dropdown')
  if (dd) dd.style.display = 'none'
}

function selectVenueForRun(code) {
  const venue = venuesList.find((v) => v.code === code)
  if (!venue) {
    hideCalVenueDropdown()
    return
  }
  const el = document.getElementById('f-venue')
  if (el) el.value = venue.name
  hideCalVenueDropdown()
  runFieldChanged()
}

function venueKeyDown(event, inputEl) {
  if (event.key === 'Escape') {
    hideCalVenueDropdown()
    return
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    const dd = document.getElementById('cal-venue-dropdown')
    if (dd && dd.style.display !== 'none' && dd.children.length === 1) {
      event.preventDefault()
      const code = dd.children[0].getAttribute('onmousedown').match(/'([^']+)'\)$/)?.[1]
      if (code) {
        selectVenueForRun(code)
        return
      }
    }
  }
}

// ── MODULE API ──
export function mount(container, context) {
  injectStyles()
  container.innerHTML = CAL_HTML
  isAdminContext = context.isAdmin
  updateEmptyState()

  // Expose handlers for inline event attributes
  window.cal = {
    onCompanySelect,
    onYearSelect,
    saveFile,
    openExport,
    closeExport,
    downloadJSON,
    importJSON,
    handleImport,
    newRun,
    selectRun,
    deleteRun,
    runFieldChanged,
    toggleDescExpand,
    fmtDesc,
    addRow,
    deleteRow,
    cellChanged,
    cellKey,
    togglePattern,
    generatePattern,
    togglePaste,
    parsePaste,
    onVenueInput,
    hideCalVenueDropdown,
    selectVenueForRun,
    venueKeyDown
  }

  // Delegated listeners that can't use inline handlers
  document.getElementById('patternDays').addEventListener('click', (e) => {
    if (e.target.classList.contains('day-toggle')) e.target.classList.toggle('on')
  })
  document.getElementById('pat-from').addEventListener('change', (e) => {
    const toEl = document.getElementById('pat-to')
    if (!e.target.value) return
    const next = new Date(e.target.value + 'T12:00:00')
    next.setDate(next.getDate() + 1)
    toEl.value = next.toISOString().slice(0, 10)
  })
  document.getElementById('exportModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('exportModal')) closeExport()
  })

  const sidebarHandle = document.getElementById('sidebarHandle')
  const calSidebar = document.getElementById('calSidebar')
  sidebarHandle.addEventListener('mousedown', (e) => {
    const startX = e.clientX
    const startW = calSidebar.offsetWidth
    sidebarHandle.classList.add('dragging')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
    _resizeMouseMove = (ev) => {
      const newW = Math.min(Math.max(startW + ev.clientX - startX, 130), 400)
      calSidebar.style.width = newW + 'px'
    }
    _resizeMouseUp = () => {
      sidebarHandle.classList.remove('dragging')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', _resizeMouseMove)
      document.removeEventListener('mouseup', _resizeMouseUp)
      _resizeMouseMove = null
      _resizeMouseUp = null
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
  _resizeMouseMove = null
  _resizeMouseUp = null
  delete window.cal
  document.getElementById('cal-venue-dropdown')?.remove()
  runs = []
  activeRunIdx = -1
  allCompanies = []
  allShowFiles = []
  pendingCompanyId = null
  currentCompanyId = null
  currentYear = CURRENT_YEAR
  currentCompanyAbv = ''
  venuesList = []
  isDirty = false
  isAdminContext = false
}
