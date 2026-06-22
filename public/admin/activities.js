import { IS_DEV, apiFetch, apiPut, buildCompanyOptions } from './api.js'
import { fmt12, fmtTimeRange, fmtFullDate, fmtShortDate, fmtAudDateRange, rolesSum } from '/admin/audition-format.js'

const ROLE_TYPES = ['lead', 'supporting', 'ensemble']
const ROLE_GENDERS = ['any', 'female', 'male']
const CURRENT_YEAR = 2026
const STYLES_ID = 'act-editor-styles'

// ── MODULE STATE ──
let activities = []
let activeActIdx = -1
let allCompanies = []
let allActFiles = []
let pendingCompanyId = null
let currentCompanyId = null
let currentYear = CURRENT_YEAR
let currentCompanyAbv = ''
let isAdminContext = false
let venuesList = []
let actSnapshots = new Map()
let prevActGenreVals = []
let _resizeMouseMove = null
let _resizeMouseUp = null

// ── STYLES ──
function injectStyles() {
  if (document.getElementById(STYLES_ID)) return
  const s = document.createElement('style')
  s.id = STYLES_ID
  s.textContent = ACT_CSS
  document.head.appendChild(s)
}

const ACT_CSS = `
.act-toolbar {
  background: var(--surface);
  border-bottom: 2px solid var(--border);
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  flex-shrink: 0;
}
.act-cal-select {
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
.act-toolbar-spacer { flex: 1; }
.act-wrap {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}
.act-sidebar {
  width: 160px;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.act-resize-handle {
  width: 5px;
  background: var(--border);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.15s;
}
.act-resize-handle:hover,
.act-resize-handle.dragging { background: var(--accent2); }
.act-sidebar-header {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.act-new-btns { display: flex; gap: 4px; }
.act-new-btns .btn { flex: 1; font-size: 11px; }
.act-sidebar-label {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-mid);
}
.act-list       { flex: 1; overflow-y: auto; padding: 4px 0; }
.act-list-item  {
  padding: 7px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.1s;
}
.act-list-item:hover  { background: var(--bg); }
.act-list-item.active { background: var(--bg); border-left-color: var(--sidebar-active); }
.act-item-meta { font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-faint); margin-bottom: 1px; }
.act-item-title { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.act-list-empty { padding: 20px 12px; font-size: 12px; color: var(--ink-faint); text-align: center; line-height: 1.6; }
.act-main       { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.act-empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px; color: var(--ink-mid);
}
.act-empty-icon { font-size: 40px; opacity: 0.2; }
.act-empty-state h2 { font-family: 'Libre Baskerville', serif; font-size: 18px; color: var(--ink); }
.act-empty-state p  { font-size: 13px; color: var(--ink-mid); }

.act-form { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.act-form-header {
  padding: 10px 16px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.act-form-title { font-family: 'Libre Baskerville', serif; font-size: 16px; flex: 1; }
.act-form-title small { font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; font-weight: 400; color: var(--ink-mid); margin-left: 6px; }

.act-fields {
  padding: 10px 16px;
  background: var(--bg);
  border-bottom: 2px solid var(--border);
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  flex-shrink: 0;
}
.act-field-group { display: flex; flex-direction: column; gap: 3px; }
.act-field-label {
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--ink-mid);
}
.act-field-input, .act-field-select {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 12px; padding: 4px 7px;
  border: 1px solid var(--border); border-radius: 3px;
  background: var(--surface); color: var(--ink); width: 100%;
}
.act-field-input:focus, .act-field-select:focus { outline: none; border-color: var(--accent2); }
.act-field-select-multi { padding: 2px; height: auto; }
.act-field-input.mono { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
.act-field-input.invalid { border-color: #c0392b !important; background: #fef2f2 !important; }
.act-field-readonly {
  background: rgba(0,0,0,0.06); color: var(--ink-mid);
  cursor: default; pointer-events: none;
}
.act-fields-conditional { display: contents; }
.act-fields-conditional.hidden { display: none; }

.act-scroll-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.act-section {
  border-bottom: 1px solid var(--border);
}
.act-section-toolbar {
  padding: 7px 16px;
  background: var(--surface); border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 8px; position: sticky; top: 0; z-index: 5;
}
.act-section-label {
  font-size: 10px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--ink-mid); flex: 1;
}
.act-table-wrap { overflow-x: auto; }
.act-table { width: 100%; border-collapse: collapse; }
.act-table thead th {
  background: var(--ink); color: #fff;
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.08em; padding: 5px 8px; text-align: left;
  position: sticky; top: 0; z-index: 4; white-space: nowrap;
}
.act-table thead th.col-del   { width: 32px; }
.act-table thead th.col-date  { width: 100px; }
.act-table thead th.col-stime { width: 60px; }
.act-table thead th.col-etime { width: 60px; }
.act-table thead th.col-locn  { width: 150px; }
.act-table thead th.col-loca  { width: 160px; }
.act-table thead th.col-type  { width: 100px; }
.act-table thead th.col-gend  { width: 80px; }
.act-table thead th.col-age   { width: 90px; }
.act-table thead th.col-voice { width: 100px; }
.act-table tbody tr { border-bottom: 1px solid var(--border); }
.act-table tbody tr:hover { background: #faf8f5; }
.act-table tbody td { padding: 2px 4px; vertical-align: middle; }
.act-cell-input {
  font-family: 'IBM Plex Mono', monospace; font-size: 11px;
  padding: 3px 5px; border: 1px solid transparent; border-radius: 2px;
  background: transparent; width: 100%; color: var(--ink);
}
.act-cell-input:focus { outline: none; border-color: var(--accent2); background: var(--surface); }
.act-cell-input.invalid { border-color: #c0392b !important; background: #fef2f2 !important; }
.act-date-errors {
  margin: 4px 0 0; padding: 5px 10px; border-radius: 3px;
  background: #fef2f2; border: 1px solid #f8d0d0;
  font-size: 11px; color: #b91c1c; line-height: 1.6;
}
.act-date-errors ul { margin: 0; padding: 0 0 0 14px; }
.act-date-errors li { margin: 0; }
.act-cell-select {
  font-family: 'IBM Plex Sans', sans-serif; font-size: 11px;
  padding: 3px 4px; border: 1px solid transparent; border-radius: 2px;
  background: transparent; width: 100%; color: var(--ink);
}
.act-cell-select:focus { outline: none; border-color: var(--accent2); background: var(--surface); }
.act-del-btn {
  width: 22px; height: 22px; border: none; background: none;
  cursor: pointer; color: var(--ink-faint); font-size: 14px;
  border-radius: 3px; display: flex; align-items: center; justify-content: center;
  transition: all 0.1s;
}
.act-del-btn:hover { background: #fde; color: var(--accent); }

.act-dates-section .act-table { min-width: 700px; }
.act-roles-section .act-table { min-width: 600px; }

.act-prep-contact {
  padding: 8px 16px;
  background: var(--bg);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 24px;
}
.act-prep-col, .act-contact-col { display: flex; flex-direction: column; gap: 4px; }
.act-prep-head {
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--ink-mid); margin-bottom: 2px;
}
.act-prep-row { display: flex; align-items: center; gap: 6px; }
.act-prep-label {
  font-size: 10px; font-weight: 500; color: var(--ink-mid);
  min-width: 44px; flex-shrink: 0;
}
.act-prep-row .act-cell-input { border-color: var(--border); background: var(--surface); }
.act-bring-row {
  grid-column: 1 / -1;
  display: flex; align-items: flex-start; gap: 6px;
}
.act-bring-row .act-prep-label { padding-top: 4px; }
.act-bring-row textarea {
  font-family: 'IBM Plex Mono', monospace; font-size: 11px;
  padding: 3px 6px; border: 1px solid var(--border); border-radius: 3px;
  background: var(--surface); color: var(--ink);
  flex: 1; resize: none; height: 44px; line-height: 1.5;
}
.act-bring-row textarea:focus { outline: none; border-color: var(--accent2); }

.act-desc-section {
  padding: 8px 16px 10px;
  background: var(--bg);
  display: flex; flex-direction: column; gap: 4px;
}
.act-desc-toolbar { display: flex; align-items: center; gap: 6px; }
.act-desc-textarea {
  font-family: 'IBM Plex Mono', monospace; font-size: 12px;
  padding: 4px 7px; border: 1px solid var(--border); border-radius: 3px;
  background: var(--surface); color: var(--ink);
  width: 100%; resize: none; overflow: hidden;
  line-height: 1.5; min-height: 26px;
}
.act-desc-textarea:focus { outline: none; border-color: var(--accent2); }
.act-desc-textarea.expanded { height: 90px; overflow-y: auto; resize: vertical; }

.act-notes-section {
  padding: 8px 16px 10px;
  background: var(--bg);
  display: flex; flex-direction: column; gap: 4px;
}
.act-notes-toolbar { display: flex; align-items: center; gap: 6px; }
.act-expand-btn {
  margin-left: auto;
  font-size: 13px; width: 22px; height: 20px;
  border: 1px solid var(--border); border-radius: 2px;
  background: var(--surface); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  padding: 0; line-height: 1; color: var(--ink-mid);
}
.act-expand-btn:hover { background: var(--bg); border-color: var(--ink-mid); }
.act-notes-textarea {
  font-family: 'IBM Plex Mono', monospace; font-size: 12px;
  padding: 4px 7px; border: 1px solid var(--border); border-radius: 3px;
  background: var(--surface); color: var(--ink);
  width: 100%; resize: none; overflow: hidden;
  line-height: 1.5; min-height: 26px;
}
.act-notes-textarea:focus { outline: none; border-color: var(--accent2); }
.act-notes-textarea.expanded { height: 90px; overflow-y: auto; resize: vertical; }

.act-statusbar {
  height: 26px; background: var(--ink); color: rgba(255,255,255,0.6);
  font-size: 10px; font-family: 'IBM Plex Mono', monospace;
  display: flex; align-items: center; padding: 0 16px; gap: 20px; flex-shrink: 0;
}
.act-status-item { display: flex; gap: 6px; }
.act-status-key  { color: rgba(255,255,255,0.35); }

.act-venue-dropdown {
  position: fixed;
  z-index: 1000;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  overflow-y: auto;
  max-height: 220px;
}
.act-venue-item {
  padding: 6px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.act-venue-item:last-child { border-bottom: none; }
.act-venue-item:hover { background: var(--bg); }
.act-venue-item-name { font-size: 12px; font-family: 'IBM Plex Sans', sans-serif; color: var(--ink); }
.act-venue-item-addr { font-size: 10px; font-family: 'IBM Plex Mono', monospace; color: var(--ink-faint); margin-top: 2px; }

.act-preview-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 40px 20px 40px; overflow-y: auto;
}
.act-preview-modal {
  background: #f0ede8; border-radius: 8px;
  width: 100%; max-width: 820px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.35);
  overflow: hidden; flex-shrink: 0;
}
.act-preview-modal-hd {
  background: #2e2a26; padding: 9px 14px;
  display: flex; align-items: center; justify-content: space-between;
}
.act-preview-modal-label {
  font-size: 11px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.08em; color: rgba(255,255,255,0.5);
  font-family: 'IBM Plex Sans', sans-serif;
}
.act-preview-close {
  width: 24px; height: 24px; border: none; background: none;
  cursor: pointer; color: rgba(255,255,255,0.55); font-size: 20px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  border-radius: 3px; padding: 0;
}
.act-preview-close:hover { color: #fff; background: rgba(255,255,255,0.1); }
.act-preview-modal-body { padding: 20px; }

.pv-card {
  background: #fff; border: 1px solid #c8a96e; border-radius: 6px;
  overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.07);
}
.pv-summary {
  display: flex; align-items: center; gap: 16px; padding: 14px 16px;
}
.pv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.pv-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pv-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.pv-title { font-family: 'Playfair Display', Georgia, serif; font-size: 16px; font-weight: 600; color: #1a1612; line-height: 1.25; }
.pv-genre-badge { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 10px; flex-shrink: 0; letter-spacing: 0.02em; }
.pv-type-badge { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 7px; border-radius: 8px; flex-shrink: 0; background: #e8f4f0; color: #1a6b50; }
.pv-brief-row { font-size: 12px; color: #9c9189; }
.pv-meta-row { font-size: 12px; color: #6b6259; }
.pv-roles-row { font-size: 12px; color: #9c9189; }
.pv-aside { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; min-width: 80px; }
.pv-date-range { font-size: 13px; font-weight: 500; color: #1a1612; white-space: nowrap; }
.pv-past-pip {
  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
  color: #9c9189; background: rgba(0,0,0,0.06); padding: 2px 7px; border-radius: 8px;
}
.pv-detail { background: #f7f4ef; border-top: 1px solid #e0d9d0; padding: 20px 16px 16px; font-family: 'DM Sans', system-ui, sans-serif; }
.pv-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px 32px; margin-bottom: 16px; }
.pv-detail-left, .pv-detail-right { min-width: 0; }
.pv-section { margin-bottom: 16px; }
.pv-section:last-child { margin-bottom: 0; }
.pv-section-head { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #6b6259; margin-bottom: 8px; }
.pv-date-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; margin-bottom: 5px; font-size: 13px; }
.pv-date-label { font-weight: 500; color: #1a1612; white-space: nowrap; }
.pv-time-label { color: #6b6259; white-space: nowrap; }
.pv-date-note { font-size: 11px; color: #9c9189; font-style: italic; }
.pv-date-location { width: 100%; font-size: 12px; color: #6b6259; margin-top: 1px; }
.pv-location-name { font-weight: 500; }
.pv-sub { font-size: 12px; color: #6b6259; line-height: 1.5; }
.pv-prep-row { display: flex; gap: 6px; font-size: 13px; margin-bottom: 5px; line-height: 1.45; }
.pv-prep-row:last-child { margin-bottom: 0; }
.pv-prep-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #6b6259; white-space: nowrap; padding-top: 2px; flex-shrink: 0; min-width: 48px; }
.pv-contact-section .pv-section-head { margin-bottom: 4px; }
.pv-contact-name { font-size: 13px; color: #1a1612; margin-bottom: 2px; }
.pv-link-inline { font-size: 12px; color: #4f5ce0; text-decoration: none; }
.pv-link-inline:hover { text-decoration: underline; }
.pv-roles-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pv-roles-table th { text-align: left; font-size: 11px; font-weight: 600; color: #6b6259; padding: 0 10px 5px 0; border-bottom: 1px solid #e0d9d0; white-space: nowrap; }
.pv-roles-table td { padding: 6px 10px 6px 0; border-bottom: 1px solid #e0d9d0; vertical-align: top; line-height: 1.4; }
.pv-roles-table tr:last-child td { border-bottom: none; }
.pv-roles-table tr.has-desc td { border-bottom: none; padding-bottom: 2px; }
.pv-role-name { font-weight: 500; color: #1a1612; }
.pv-role-lead { color: #6c3bb5; font-weight: 500; }
.pv-role-supporting { color: #6b6259; }
.pv-role-ensemble { color: #9c9189; font-style: italic; }
.pv-role-age, .pv-role-voice { color: #6b6259; white-space: nowrap; }
.pv-role-desc { display: block; font-size: 11px; color: #6b6259; font-style: italic; line-height: 1.4; max-width: 80%; }
.pv-notes-full { font-size: 13px; color: #6b6259; line-height: 1.6; padding: 12px 0 8px; border-top: 1px solid #e0d9d0; margin-top: 4px; font-style: italic; white-space: pre-wrap; }
.pv-links-row { display: flex; gap: 16px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid #e0d9d0; margin-top: 4px; }
.pv-action-link { font-size: 13px; font-weight: 500; color: #4f5ce0; text-decoration: none; }
.pv-action-link:hover { color: #2c3e9a; text-decoration: underline; }
`

// ── HTML TEMPLATE ──
const ACT_HTML = `
<div class="act-toolbar">
  <select class="act-cal-select" id="actCompanySelect" onchange="act.onCompanySelect()" style="display:none">
    <option value="">— Company —</option>
  </select>
  <select class="act-cal-select" id="actYearSelect" onchange="act.onYearSelect()" style="display:none">
    <option value="">— Year —</option>
  </select>
  <div class="act-toolbar-spacer"></div>
  <button class="btn btn-sm" id="actSaveBtn" onclick="act.saveFile()"
    style="border:1px solid var(--border);color:rgba(28,26,23,0.4)" disabled>Save</button>
</div>

<div class="act-wrap">
  <div class="act-sidebar" id="actSidebar">
    <div class="act-sidebar-header">
      <span class="act-sidebar-label">Activities</span>
      <div class="act-new-btns" id="actNewBtns" style="display:none">
        <button class="btn btn-green btn-sm" onclick="act.newAudition()">+ Audition</button>
        <button class="btn btn-sm" style="border:1px solid var(--border)" onclick="act.newEvent()">+ Event</button>
      </div>
    </div>
    <div class="act-list" id="actList"></div>
  </div>

  <div class="act-resize-handle" id="actResizeHandle"></div>

  <div class="act-main">
    <div class="act-empty-state" id="actEmptyState">
      <div class="act-empty-icon">🎭</div>
      <h2>No activity selected</h2>
      <p>Select an activity or create a new one.</p>
    </div>

    <div class="act-form" id="actForm" style="display:none">

      <!-- ── FIXED HEADER ── -->
      <div class="act-form-header">
        <div class="act-form-title">
          <span id="actTitleText"></span><small id="actSubtitle"></small>
        </div>
        <button class="btn btn-sm" id="actPreviewBtn"
          style="background:var(--bg);border:1px solid var(--border)"
          onclick="act.openPreview()">Preview</button>
        <button class="btn btn-sm" id="actRestoreBtn"
          style="background:var(--bg);border:1px solid var(--border)"
          onclick="act.restoreActivity()">Restore</button>
        <button class="btn btn-sm" style="background:#fde;color:var(--accent);border:1px solid #fcc"
          onclick="act.deleteActivity()">Delete</button>
      </div>

      <div class="act-fields">
        <!-- Row 1: always visible -->
        <div class="act-field-group">
          <label class="act-field-label">Company</label>
          <input class="act-field-input act-field-readonly" id="af-company" readonly tabindex="-1">
        </div>
        <div class="act-field-group" id="afTitleGroup" style="grid-column:span 4">
          <label class="act-field-label">Title</label>
          <input class="act-field-input" id="af-title" placeholder="Production or event title" oninput="act.fieldChanged()">
        </div>
        <div class="act-field-group" id="afGenreGroup" style="grid-column:6;grid-row:span 3">
          <label class="act-field-label">Genre</label>
          <select class="act-field-select act-field-select-multi" id="af-genre" multiple size="4" onchange="act.genreChanged()">
            <option>Drama</option><option>Musical</option><option>Comedy</option><option>Other</option>
          </select>
        </div>

        <!-- Audition-only fields (rows 2-3, cols 1-5; col 6 is Genre spanning all rows) -->
        <div class="act-fields-conditional" id="actAuditionFields">
          <div class="act-field-group" style="grid-column:span 2">
            <label class="act-field-label">Rehearsal Start</label>
            <input class="act-field-input mono" id="af-rehearsal" placeholder="YYYY-MM-DD" oninput="act.fieldChanged()" onblur="act.normalizeHeaderDate('af-rehearsal')">
          </div>
          <div class="act-field-group" style="grid-column:span 3">
            <label class="act-field-label">Notice URL</label>
            <input class="act-field-input mono" id="af-notice-url" placeholder="https://…" oninput="act.fieldChanged()">
          </div>
          <div class="act-field-group" style="grid-column:span 2">
            <label class="act-field-label">Opening Date</label>
            <input class="act-field-input mono" id="af-opening" placeholder="YYYY-MM-DD" oninput="act.fieldChanged()" onblur="act.normalizeHeaderDate('af-opening')">
          </div>
          <div class="act-field-group" style="grid-column:span 3">
            <label class="act-field-label">Production URL</label>
            <input class="act-field-input mono" id="af-prod-url" placeholder="https://…" oninput="act.fieldChanged()">
          </div>
        </div>

        <!-- Event-only fields (no genre col, so span full 6 cols) -->
        <div class="act-fields-conditional hidden" id="actEventFields">
          <div class="act-field-group" style="grid-column:span 4">
            <label class="act-field-label">Brief Description</label>
            <input class="act-field-input" id="af-brief-desc" placeholder="One-line summary for card header" oninput="act.fieldChanged()">
          </div>
          <div class="act-field-group" style="grid-column:span 2">
            <label class="act-field-label">Cost</label>
            <input class="act-field-input" id="af-cost" placeholder="Free, $20…" oninput="act.fieldChanged()">
          </div>
          <div class="act-field-group" style="grid-column:span 3">
            <label class="act-field-label">Notice URL</label>
            <input class="act-field-input mono" id="af-event-notice-url" placeholder="https://…" oninput="act.fieldChanged()">
          </div>
          <div class="act-field-group" style="grid-column:span 3">
            <label class="act-field-label">Register URL</label>
            <input class="act-field-input mono" id="af-register-url" placeholder="https://…" oninput="act.fieldChanged()">
          </div>
        </div>

        <!-- Other-company fields (visible when company = other) -->
        <div class="act-fields-conditional hidden" id="actOtherFields">
          <div class="act-field-group" style="grid-column:span 3">
            <label class="act-field-label">Organizer Name</label>
            <input class="act-field-input" id="af-org-name" placeholder="Organization or individual" oninput="act.fieldChanged()">
          </div>
          <div class="act-field-group" style="grid-column:span 3">
            <label class="act-field-label">Organizer URL</label>
            <input class="act-field-input mono" id="af-org-url" placeholder="https://…" oninput="act.fieldChanged()">
          </div>
        </div>
      </div>

      <!-- ── SCROLLABLE BODY ── -->
      <div class="act-scroll-body">

        <!-- 1. Dates -->
        <div class="act-section act-dates-section">
          <div class="act-section-toolbar">
            <span class="act-section-label"><span id="actDatesLabel">Dates</span>
              <span id="actDatesCount" style="color:var(--ink-faint);font-family:'IBM Plex Mono',monospace;font-size:10px"></span>
            </span>
            <button class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)"
              onclick="act.addDateRow()">+ Add row</button>
          </div>
          <div class="act-table-wrap">
            <table class="act-table" id="actDatesTable">
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
              <tbody id="actDatesBody"></tbody>
            </table>
          </div>
          <div id="actDateErrors" class="act-date-errors" style="display:none"></div>
        </div>

        <!-- 2. Roles (audition only) -->
        <div class="act-section act-roles-section" id="actRolesSection">
          <div class="act-section-toolbar">
            <span class="act-section-label">Roles Available
              <span id="actRolesCount" style="color:var(--ink-faint);font-family:'IBM Plex Mono',monospace;font-size:10px"></span>
            </span>
            <button class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)"
              onclick="act.addRoleRow()">+ Add row</button>
          </div>
          <div class="act-table-wrap">
            <table class="act-table" id="actRolesTable">
              <thead><tr id="actRolesHead"></tr></thead>
              <tbody id="actRolesBody"></tbody>
            </table>
          </div>
        </div>

        <!-- 3. Prepare / Contact -->
        <div class="act-section act-prep-contact">
          <div class="act-prep-col" id="actPrepCol">
            <div class="act-prep-head">Prepare</div>
            <div class="act-prep-row">
              <label class="act-prep-label">Acting</label>
              <input class="act-cell-input" id="af-prep-acting" placeholder="e.g. Cold read from script" oninput="act.fieldChanged()">
            </div>
            <div class="act-prep-row" id="act-singing-row">
              <label class="act-prep-label">Singing</label>
              <input class="act-cell-input" id="af-prep-singing" placeholder="e.g. 16–32 bars in style" oninput="act.fieldChanged()">
            </div>
            <div class="act-prep-row" id="act-dance-row">
              <label class="act-prep-label">Dance</label>
              <input class="act-cell-input" id="af-prep-dance" placeholder="e.g. Basic tap" oninput="act.fieldChanged()">
            </div>
          </div>
          <div class="act-contact-col">
            <div class="act-prep-head">Contact</div>
            <div class="act-prep-row">
              <label class="act-prep-label">Name</label>
              <input class="act-cell-input" id="af-contact-name" oninput="act.fieldChanged()">
            </div>
            <div class="act-prep-row">
              <label class="act-prep-label">Email</label>
              <input class="act-cell-input" id="af-contact-email" oninput="act.fieldChanged()">
            </div>
            <div class="act-prep-row">
              <label class="act-prep-label">Phone</label>
              <input class="act-cell-input" id="af-contact-phone" oninput="act.fieldChanged()">
            </div>
          </div>
          <div class="act-bring-row" id="actBringRow">
            <label class="act-prep-label">Bring</label>
            <textarea id="af-prep-bring"
              placeholder="One item per line, e.g.:&#10;Headshot and résumé&#10;List of conflicts"
              oninput="act.fieldChanged()"></textarea>
          </div>
        </div>

        <!-- 4. Description (events only) -->
        <div class="act-section act-desc-section" id="actDescSection">
          <div class="act-desc-toolbar">
            <label class="act-field-label" style="margin-bottom:0">Description</label>
            <button class="act-expand-btn" id="actDescExpandBtn" onclick="act.toggleDescExpand()" title="Expand">↕</button>
          </div>
          <textarea class="act-desc-textarea" id="af-description" rows="1"
            placeholder="Optional full description (supports **bold** and *italic*)"
            oninput="act.autoResizeTextarea(this); act.fieldChanged()"></textarea>
        </div>

        <!-- 5. Notes (auditions only) -->
        <div class="act-section act-notes-section" id="actNotesSection">
          <div class="act-notes-toolbar">
            <label class="act-field-label" style="margin-bottom:0">Notes</label>
            <button class="act-expand-btn" id="actNotesExpandBtn" onclick="act.toggleNotesExpand()" title="Expand">↕</button>
          </div>
          <textarea class="act-notes-textarea" id="af-notes" rows="1"
            placeholder="Additional notes shown at bottom of card"
            oninput="act.autoResizeTextarea(this); act.fieldChanged()"></textarea>
        </div>

      </div><!-- /.act-scroll-body -->
    </div><!-- /.act-form -->
  </div><!-- /.act-main -->
</div><!-- /.act-wrap -->

<div class="act-statusbar">
  <span class="act-status-item"><span class="act-status-key">Activities</span><span id="ast-count">0</span></span>
  <span class="act-status-item"><span class="act-status-key">Status</span><span id="ast-saved" style="color:rgba(255,255,255,0.35)">no file loaded</span></span>
</div>

<div class="act-preview-overlay" id="actPreviewOverlay" style="display:none" onclick="act.closePreviewOutside(event)">
  <div class="act-preview-modal">
    <div class="act-preview-modal-hd">
      <span class="act-preview-modal-label">Preview</span>
      <button class="act-preview-close" onclick="act.closePreview()">×</button>
    </div>
    <div class="act-preview-modal-body" id="actPreviewBody"></div>
  </div>
</div>
`

// ── HELPERS ──
function esc(v) {
  return (v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
function isMusical() {
  const sel = document.getElementById('af-genre')
  return sel ? Array.from(sel.selectedOptions).some((o) => o.value === 'Musical') : false
}
function currentType() {
  return activeActIdx >= 0 ? (activities[activeActIdx].type || 'audition') : 'audition'
}

// ── SNAPSHOT HELPERS ──
function makeActivitySnapshot(a) {
  const clean = { ...a, dates: (a.dates || []).filter((d) => !isEmptyDateRow(d)) }
  const { updatedAt, ...rest } = clean
  return JSON.stringify(rest)
}

function refreshSnapshots() {
  actSnapshots = new Map()
  activities.forEach((a) => actSnapshots.set(a.id, makeActivitySnapshot(a)))
}

// ── DATA ACCESS ──
async function loadActivitiesDir() {
  const resp = await fetch('/.netlify/functions/data?dir=activities')
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

async function loadCompanyFile(coId, year) {
  year = year || CURRENT_YEAR
  try {
    const data = await apiFetch(`activities/${year}/${coId}-activities-${year}.json`)
    activities = data.activities || []
    currentCompanyId = coId
    currentYear = data.year || year
    currentCompanyAbv = allCompanies.find((c) => c.id === coId)?.abvName || coId
    activeActIdx = activities.length > 0 ? 0 : -1
    refreshSnapshots()
    document.getElementById('actNewBtns')?.setAttribute('style', '')
    renderSidebar()
    loadActEditor()
    updateStatus()
    updateSaveBtn()
  } catch (e) {
    alert('Could not load activities file: ' + e.message)
  }
}

// ── EMPTY STATE ──
function updateEmptyState() {
  const el = document.getElementById('actEmptyState')
  if (!el) return
  if (!currentCompanyId) document.getElementById('actNewBtns')?.setAttribute('style', 'display:none')
  el.innerHTML = !currentCompanyId
    ? isAdminContext
      ? `<div class="act-empty-icon">🎭</div><h2>Select a company / year</h2><p>from the toolbar above to load activities</p>`
      : `<div class="act-empty-icon">🎭</div><h2>Select a year</h2><p>Choose a year from the toolbar above.</p>`
    : `<div class="act-empty-icon">🎭</div><h2>No activity selected</h2><p>Select an activity or click + New.</p>`
}

// ── INIT FROM CONTEXT ──
async function initFromContext(context) {
  isAdminContext = context.isAdmin
  allCompanies = context.allCompanies || []
  updateEmptyState()
  try {
    allActFiles = await loadActivitiesDir()
  } catch (e) {
    alert('Could not list activity files: ' + e.message)
    return
  }
  venuesList = await apiFetch('sc-theater-venues.json')
    .then((d) => d.venues || [])
    .catch(() => [])
  if (context.isAdmin) {
    const compSel = document.getElementById('actCompanySelect')
    compSel.innerHTML = buildCompanyOptions(allCompanies)
    compSel.style.display = ''
  } else {
    pendingCompanyId = context.company.id
    currentCompanyAbv = context.company.abvName
    const years = allActFiles.filter((f) => f.companyId === context.company.id).map((f) => f.year)
    populateYearSelect(years)
    if (years.length === 1) {
      document.getElementById('actYearSelect').value = String(years[0])
      await loadCompanyFile(pendingCompanyId, years[0])
    }
  }
}

// ── COMPANY / YEAR SELECTION ──
async function onCompanySelect() {
  const coId = document.getElementById('actCompanySelect').value
  if (!coId) {
    hideYearSelect()
    clearEditor()
    return
  }
  if (computeIsDirty() && !confirm('You have unsaved changes. Discard and continue?')) {
    document.getElementById('actCompanySelect').value = pendingCompanyId || ''
    return
  }
  pendingCompanyId = coId
  currentCompanyAbv = allCompanies.find((c) => c.id === coId)?.abvName || coId
  const years = allActFiles.filter((f) => f.companyId === coId).map((f) => f.year)
  if (years.length > 0) {
    populateYearSelect(years)
    const hasFuture = years.some((y) => y > CURRENT_YEAR)
    if (!hasFuture && years.includes(CURRENT_YEAR)) {
      document.getElementById('actYearSelect').value = String(CURRENT_YEAR)
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
  try {
    await apiPut(`activities/${CURRENT_YEAR}/${coId}-activities-${CURRENT_YEAR}.json`, {
      company: coId,
      year: CURRENT_YEAR,
      activities: []
    })
  } catch (e) {
    alert('Could not create file: ' + e.message)
    return
  }
  allActFiles.push({ companyId: coId, year: CURRENT_YEAR })
  populateYearSelect([CURRENT_YEAR])
  document.getElementById('actYearSelect').value = String(CURRENT_YEAR)
  await loadCompanyFile(coId, CURRENT_YEAR)
}

function populateYearSelect(years) {
  const sel = document.getElementById('actYearSelect')
  years = [...new Set(years)].sort((a, b) => b - a)
  sel.innerHTML =
    '<option value="">— Year —</option>' +
    years.map((y) => `<option value="${y}">${y}</option>`).join('') +
    '<option value="__new__">Add year</option>'
  sel.style.display = ''
  sel.value = ''
}

function hideYearSelect() {
  const sel = document.getElementById('actYearSelect')
  sel.style.display = 'none'
  sel.value = ''
}

async function onYearSelect() {
  const val = document.getElementById('actYearSelect').value
  if (!val || !pendingCompanyId) return
  if (computeIsDirty() && !confirm('You have unsaved changes. Discard and continue?')) {
    document.getElementById('actYearSelect').value = currentYear || ''
    return
  }
  if (val === '__new__') {
    const existingYears = allActFiles
      .filter((f) => f.companyId === pendingCompanyId)
      .map((f) => f.year)
    const nextYear = existingYears.length ? Math.max(...existingYears) + 1 : CURRENT_YEAR
    try {
      await apiPut(`activities/${nextYear}/${pendingCompanyId}-activities-${nextYear}.json`, {
        company: pendingCompanyId,
        year: nextYear,
        activities: []
      })
    } catch (e) {
      alert('Could not create file: ' + e.message)
      document.getElementById('actYearSelect').value = ''
      return
    }
    allActFiles.push({ companyId: pendingCompanyId, year: nextYear })
    populateYearSelect(
      allActFiles.filter((f) => f.companyId === pendingCompanyId).map((f) => f.year)
    )
    document.getElementById('actYearSelect').value = String(nextYear)
    await loadCompanyFile(pendingCompanyId, nextYear)
    return
  }
  await loadCompanyFile(pendingCompanyId, parseInt(val, 10))
}

// ── PERSISTENCE ──
function computeIsDirty() {
  if (activities.length !== actSnapshots.size) return true
  for (const a of activities) {
    const snap = actSnapshots.get(a.id)
    if (!snap) return true
    const clean = { ...a, dates: (a.dates || []).filter((d) => !isEmptyDateRow(d)) }
    const { updatedAt, ...rest } = clean
    if (snap !== JSON.stringify(rest)) return true
  }
  return false
}

function markDirty() {
  if (!currentCompanyId) return
  updateStatus()
  updateSaveBtn()
  updateRestoreBtn()
}

function updateSaveBtn() {
  const btn = document.getElementById('actSaveBtn')
  if (!btn) return
  const can = !!currentCompanyId && computeIsDirty()
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
  const btn = document.getElementById('actSaveBtn')
  btn.disabled = true
  btn.textContent = 'Saving…'
  try {
    const now = new Date().toISOString()
    const cleanActivities = activities.map((a) => {
      const cleaned = { ...a, dates: (a.dates || []).filter((d) => !isEmptyDateRow(d)) }
      const { updatedAt, ...rest } = cleaned
      const snap = actSnapshots.get(a.id)
      const changed = !snap || snap !== JSON.stringify(rest)
      return { ...cleaned, updatedAt: changed ? now : a.updatedAt }
    })
    await apiPut(`activities/${currentYear}/${currentCompanyId}-activities-${currentYear}.json`, {
      company: currentCompanyId,
      year: currentYear,
      activities: cleanActivities
    })
    cleanActivities.forEach((ca, i) => { activities[i].updatedAt = ca.updatedAt })
    refreshSnapshots()
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
  const es = document.getElementById('ast-saved')
  if (!ec) return
  ec.textContent = activities.length
  if (!currentCompanyId) {
    es.textContent = 'no file loaded'
    es.style.color = 'rgba(255,255,255,0.35)'
  } else if (computeIsDirty()) {
    es.textContent = 'unsaved changes'
    es.style.color = 'var(--yellow)'
  } else {
    es.textContent = 'saved'
    es.style.color = 'var(--green)'
  }
}

// ── SIDEBAR ──
function renderSidebar() {
  const list = document.getElementById('actList')
  if (!list) return
  if (!activities.length) {
    list.innerHTML = ''
    return
  }
  const firstDate = (a) => a.dates?.[0]?.date || '9999-99-99'
  const sorted = activities
    .map((a, i) => ({ a, i }))
    .sort((x, y) => firstDate(x.a).localeCompare(firstDate(y.a)))
  list.innerHTML = sorted
    .map(
      ({ a, i }) => `
    <div class="act-list-item ${i === activeActIdx ? 'active' : ''}" onclick="act.selectAct(${i})">
      <div class="act-item-meta">${a.type === 'event' ? 'Event' : 'Audition'}${(Array.isArray(a.genre) ? a.genre : []).length ? ' · ' + (Array.isArray(a.genre) ? a.genre : []).join('/') : ''}</div>
      <div class="act-item-title">${a.title || 'Untitled'}</div>
    </div>`
    )
    .join('')
  updateStatus()
}

// ── ACTIVITY SELECTION ──
function selectAct(idx) {
  activeActIdx = idx
  renderSidebar()
  loadActEditor()
}

function loadActEditor() {
  const emptyEl = document.getElementById('actEmptyState')
  const formEl = document.getElementById('actForm')
  if (activeActIdx < 0 || activeActIdx >= activities.length) {
    updateEmptyState()
    emptyEl.style.display = ''
    formEl.style.display = 'none'
    return
  }
  emptyEl.style.display = 'none'
  formEl.style.display = ''
  const a = activities[activeActIdx]

  document.getElementById('af-company').value = currentCompanyAbv || ''

  const genreSel = document.getElementById('af-genre')
  const genreArr = Array.isArray(a.genre) ? a.genre : (a.genre ? [a.genre] : [])
  Array.from(genreSel.options).forEach((o) => { o.selected = genreArr.includes(o.value) })
  prevActGenreVals = genreArr

  document.getElementById('af-title').value = a.title || ''
  document.getElementById('af-rehearsal').value = a.rehearsalStart || ''
  document.getElementById('af-opening').value = a.openingDate || ''
  document.getElementById('af-notice-url').value = a.type !== 'event' ? (a.noticeUrl || '') : ''
  document.getElementById('af-prod-url').value = a.productionUrl || ''
  document.getElementById('af-brief-desc').value = a.briefDescription || ''
  document.getElementById('af-cost').value = a.cost || ''
  document.getElementById('af-event-notice-url').value = a.type === 'event' ? (a.noticeUrl || '') : ''
  document.getElementById('af-register-url').value = a.registerUrl || ''
  document.getElementById('af-org-name').value = a.organizerName || ''
  document.getElementById('af-org-url').value = a.organizerUrl || ''

  document.getElementById('af-prep-acting').value = a.prep?.acting || ''
  document.getElementById('af-prep-singing').value = a.prep?.singing || ''
  document.getElementById('af-prep-dance').value = a.prep?.dance || ''
  document.getElementById('af-prep-bring').value = a.prep?.bring?.join('\n') || ''
  document.getElementById('af-contact-name').value = a.contact?.name || ''
  document.getElementById('af-contact-email').value = a.contact?.email || ''
  document.getElementById('af-contact-phone').value = a.contact?.phone || ''

  const descTa = document.getElementById('af-description')
  descTa.value = a.description || ''
  descTa.classList.remove('expanded')
  document.getElementById('actDescExpandBtn').textContent = '↕'
  autoResizeTextarea(descTa)

  const notesTa = document.getElementById('af-notes')
  notesTa.value = a.notes || ''
  notesTa.classList.remove('expanded')
  document.getElementById('actNotesExpandBtn').textContent = '↕'
  autoResizeTextarea(notesTa)

  updateEditorTitle()
  updateTypeLayout()
  updateMusicLayout()
  renderDatesTable()
  renderRolesTable()
  updateRestoreBtn()
}

function updateEditorTitle() {
  const a = activities[activeActIdx]
  document.getElementById('actTitleText').textContent = a.title || 'Untitled'
  const genreLabel = (Array.isArray(a.genre) ? a.genre : a.genre ? [a.genre] : []).join(' / ')
  const typeLabel = a.type === 'event' ? 'Event' : 'Audition'
  document.getElementById('actSubtitle').textContent = ` · ${typeLabel}${genreLabel ? ' · ' + genreLabel : ''}`
}

function updateRestoreBtn() {
  const restoreBtn = document.getElementById('actRestoreBtn')
  const deleteBtn = restoreBtn?.nextElementSibling
  if (!restoreBtn || !deleteBtn) return
  const a = activeActIdx >= 0 ? activities[activeActIdx] : null
  const snap = a ? actSnapshots.get(a.id) : null
  const restoreActive = !!(snap && snap !== makeActivitySnapshot(a))
  restoreBtn.style.display = restoreActive ? '' : 'none'
  deleteBtn.style.display = restoreActive ? 'none' : ''
}

// ── TYPE / MUSICAL FIELD VISIBILITY ──
function updateTypeLayout() {
  const type = currentType()
  const audFields = document.getElementById('actAuditionFields')
  const evFields = document.getElementById('actEventFields')
  const rolesSection = document.getElementById('actRolesSection')
  const prepCol = document.getElementById('actPrepCol')
  const bringRow = document.getElementById('actBringRow')
  const datesLabel = document.getElementById('actDatesLabel')
  const genreGroup = document.getElementById('afGenreGroup')
  const titleGroup = document.getElementById('afTitleGroup')
  const descSection = document.getElementById('actDescSection')
  const notesSection = document.getElementById('actNotesSection')

  if (type === 'event') {
    audFields?.classList.add('hidden')
    evFields?.classList.remove('hidden')
    rolesSection && (rolesSection.style.display = 'none')
    prepCol && (prepCol.style.display = 'none')
    bringRow && (bringRow.style.display = 'none')
    if (datesLabel) datesLabel.textContent = 'Dates'
    if (genreGroup) genreGroup.style.display = 'none'
    if (titleGroup) titleGroup.style.gridColumn = 'span 5'
    if (descSection) descSection.style.display = ''
    if (notesSection) notesSection.style.display = 'none'
  } else {
    audFields?.classList.remove('hidden')
    evFields?.classList.add('hidden')
    rolesSection && (rolesSection.style.display = '')
    prepCol && (prepCol.style.display = '')
    bringRow && (bringRow.style.display = '')
    if (datesLabel) datesLabel.textContent = 'Audition Dates'
    if (genreGroup) genreGroup.style.display = ''
    if (titleGroup) titleGroup.style.gridColumn = 'span 4'
    if (descSection) descSection.style.display = 'none'
    if (notesSection) notesSection.style.display = ''
  }

  const otherFields = document.getElementById('actOtherFields')
  if (otherFields) {
    otherFields.classList.toggle('hidden', currentCompanyId !== 'other')
  }

  // Re-measure now that the correct textarea is visible
  const descTa = document.getElementById('af-description')
  const notesTa = document.getElementById('af-notes')
  if (type === 'event') {
    if (descTa) autoResizeTextarea(descTa)
  } else {
    if (notesTa) autoResizeTextarea(notesTa)
  }
}

function updateMusicLayout() {
  const musical = isMusical()
  const singRow = document.getElementById('act-singing-row')
  const danceRow = document.getElementById('act-dance-row')
  if (singRow) singRow.style.display = musical ? '' : 'none'
  if (danceRow) danceRow.style.display = musical ? '' : 'none'
  renderRolesTable()
}

// ── FIELD SYNC ──
const MAX_GENRES = 2


function genreChanged() {
  const sel = document.getElementById('af-genre')
  const current = Array.from(sel.selectedOptions).map((o) => o.value)
  if (current.length > MAX_GENRES) {
    const added = current.filter((v) => !prevActGenreVals.includes(v))
    const keptPrev = prevActGenreVals.filter((v) => current.includes(v)).slice(-(MAX_GENRES - added.length))
    const kept = [...keptPrev, ...added].slice(0, MAX_GENRES)
    Array.from(sel.options).forEach((o) => { o.selected = kept.includes(o.value) })
    prevActGenreVals = kept
  } else {
    prevActGenreVals = current
  }
  fieldChanged()
}

function fieldChanged() {
  if (activeActIdx < 0) return
  const a = activities[activeActIdx]
  const type = a.type || 'audition'

  a.title = document.getElementById('af-title').value

  if (type === 'event') {
    a.genre = []
    a.description = document.getElementById('af-description').value || undefined
    a.notes = undefined
  } else {
    a.genre = Array.from(document.getElementById('af-genre').selectedOptions).map((o) => o.value)
    a.notes = document.getElementById('af-notes').value || undefined
    a.description = undefined
  }

  if (type === 'audition') {
    a.rehearsalStart = document.getElementById('af-rehearsal').value || undefined
    a.openingDate = document.getElementById('af-opening').value || undefined
    a.noticeUrl = document.getElementById('af-notice-url').value || undefined
    a.productionUrl = document.getElementById('af-prod-url').value || undefined
    a.briefDescription = undefined
    a.cost = undefined
    a.registerUrl = undefined

    const bring = document.getElementById('af-prep-bring').value.split('\n').map((s) => s.trim()).filter(Boolean)
    const musical = a.genre.includes('Musical')
    const prep = {
      acting: document.getElementById('af-prep-acting').value || undefined,
      singing: musical ? document.getElementById('af-prep-singing').value || undefined : undefined,
      dance: musical ? document.getElementById('af-prep-dance').value || undefined : undefined,
      bring: bring.length ? bring : undefined
    }
    a.prep = prep.acting || prep.singing || prep.dance || prep.bring ? prep : undefined
  } else {
    a.briefDescription = document.getElementById('af-brief-desc').value || undefined
    a.cost = document.getElementById('af-cost').value || undefined
    a.noticeUrl = document.getElementById('af-event-notice-url').value || undefined
    a.registerUrl = document.getElementById('af-register-url').value || undefined
    a.rehearsalStart = undefined
    a.openingDate = undefined
    a.productionUrl = undefined
    a.prep = undefined
    a.rolesAvailable = undefined
  }

  if (currentCompanyId === 'other') {
    a.organizerName = document.getElementById('af-org-name').value || undefined
    a.organizerUrl = document.getElementById('af-org-url').value || undefined
  }

  const contact = {
    name: document.getElementById('af-contact-name').value || undefined,
    email: document.getElementById('af-contact-email').value || undefined,
    phone: document.getElementById('af-contact-phone').value || undefined
  }
  a.contact = contact.name || contact.email || contact.phone ? contact : undefined

  updateEditorTitle()
  updateMusicLayout()
  renderSidebar()
  markDirty()
}

// ── TEXTAREA EXPAND ──
function toggleDescExpand() {
  const ta = document.getElementById('af-description')
  const btn = document.getElementById('actDescExpandBtn')
  ta.classList.toggle('expanded')
  btn.textContent = ta.classList.contains('expanded') ? '↑' : '↕'
}

function toggleNotesExpand() {
  const ta = document.getElementById('af-notes')
  const btn = document.getElementById('actNotesExpandBtn')
  ta.classList.toggle('expanded')
  btn.textContent = ta.classList.contains('expanded') ? '↑' : '↕'
}

function autoResizeTextarea(el) {
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

// ── ACTIVITY CRUD ──
function newAudition() {
  const now = new Date().toISOString()
  activities.push({
    id: `activity-${Date.now()}`,
    type: 'audition',
    title: '',
    genre: [],
    dates: [{ date: '', startTime: '' }],
    rolesAvailable: [],
    createdAt: now,
    updatedAt: now
  })
  activeActIdx = activities.length - 1
  renderSidebar()
  loadActEditor()
  document.getElementById('af-title').focus()
  markDirty()
}

function newEvent() {
  const now = new Date().toISOString()
  activities.push({
    id: `activity-${Date.now()}`,
    type: 'event',
    title: '',
    genre: [],
    dates: [{ date: '', startTime: '' }],
    createdAt: now,
    updatedAt: now
  })
  activeActIdx = activities.length - 1
  renderSidebar()
  loadActEditor()
  document.getElementById('af-title').focus()
  markDirty()
}

function restoreActivity() {
  if (activeActIdx < 0) return
  const a = activities[activeActIdx]
  const snap = actSnapshots.get(a.id)
  if (!snap) return
  if (!confirm(`Restore "${a.title || 'this activity'}" to its last saved state? Unsaved changes will be lost.`)) return
  activities[activeActIdx] = { ...JSON.parse(snap), updatedAt: a.updatedAt }
  loadActEditor()
  updateStatus()
  updateSaveBtn()
}

function deleteActivity() {
  if (activeActIdx < 0) return
  const a = activities[activeActIdx]
  if (!confirm(`Delete "${a.title || 'this activity'}"? This cannot be undone.`)) return
  activities.splice(activeActIdx, 1)
  activeActIdx = Math.min(activeActIdx, activities.length - 1)
  renderSidebar()
  loadActEditor()
  markDirty()
}

function clearEditor() {
  activities = []
  actSnapshots = new Map()
  currentCompanyId = null
  activeActIdx = -1
  renderSidebar()
  updateEmptyState()
  document.getElementById('actEmptyState').style.display = ''
  document.getElementById('actForm').style.display = 'none'
  updateStatus()
  updateSaveBtn()
}

// ── VALIDATION ──
const MONTH_MAP = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}
function normalizeDate(v) {
  if (!v) return v
  const s = v.trim()
  if (/[A-Za-z]/.test(s)) {
    let month = null, day = null, year = null
    const tokens = s.split(/[\s,]+/).map((t) => t.replace(/\.$/, '').trim()).filter(Boolean)
    for (const token of tokens) {
      const low = token.toLowerCase()
      if (MONTH_MAP[low] !== undefined) { month = MONTH_MAP[low]; continue }
      if (/^\d+$/.test(token)) {
        const n = parseInt(token, 10)
        if (token.length === 4 || n > 31) { year = n; continue }
        if (day === null) { day = n; continue }
      }
    }
    if (month !== null && day !== null) {
      if (year === null) year = currentYear
      if (String(year).length === 2) year = 2000 + year
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  const parts = s.replace(/[/.]/g, '-').split('-').map((p) => p.trim()).filter(Boolean)
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
  if (!(dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d)) return false
  return y >= currentYear - 1 && y <= currentYear + 1
}
function isValidTime(v) {
  if (!v) return false
  const norm = v.replace('.', ':')
  if (!/^\d{1,2}:\d{2}$/.test(norm)) return false
  const [h, m] = norm.split(':').map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}
function setActInvalid(id, invalid) {
  document.getElementById(id)?.classList.toggle('invalid', invalid)
}
function isEmptyDateRow(d) {
  return !d.date && !d.startTime
}
function normalizeHeaderDate(id) {
  const el = document.getElementById(id)
  if (!el) return
  const norm = normalizeDate(el.value)
  if (norm !== el.value) {
    el.value = norm
    fieldChanged()
  }
  setActInvalid(id, !!el.value && !isValidDate(el.value))
}
function collectErrors() {
  const errors = []
  activities.forEach((a, ai) => {
    const label = a.title || `Activity ${ai + 1}`
    const nonEmptyDates = (a.dates || []).filter((d) => !isEmptyDateRow(d))
    if (nonEmptyDates.length === 0) {
      errors.push(`"${label}": no dates`)
    } else {
      nonEmptyDates.forEach((d, di) => {
        if (!isValidDate(d.date))
          errors.push(`"${label}" — date row ${di + 1}: date "${d.date || '(empty)'}"`)
        if (!isValidTime(d.startTime))
          errors.push(`"${label}" — date row ${di + 1}: start time "${d.startTime || '(empty)'}"`)
        if (d.endTime && !isValidTime(d.endTime))
          errors.push(`"${label}" — date row ${di + 1}: end time "${d.endTime}"`)
      })
    }
    const firstDate = (a.dates || []).find((d) => isValidDate(d.date))?.date
    if (firstDate) {
      const yr = parseInt(firstDate.slice(0, 4), 10)
      if (yr !== currentYear)
        errors.push(`"${label}": first date ${firstDate} is in ${yr} — use the year selector to edit the ${yr} file`)
    }
  })
  return errors
}

// ── DATES TABLE ──
function updateDateErrors() {
  const el = document.getElementById('actDateErrors')
  if (!el) return
  if (activeActIdx < 0) { el.style.display = 'none'; return }
  const dates = activities[activeActIdx].dates || []
  const msgs = []
  dates.forEach((d, i) => {
    if (!d.date) return
    const v = d.date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      msgs.push(`Row ${i + 1}: "${v}" — unrecognized date. Accepted: YYYY-MM-DD, "Oct 30", "Fri Oct 30", "Oct 30 2026"`)
      return
    }
    const [y, m, dv] = v.split('-').map(Number)
    const dt = new Date(y, m - 1, dv)
    if (!(dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === dv)) {
      msgs.push(`Row ${i + 1}: "${v}" — not a valid calendar date`)
    } else if (y < currentYear - 1 || y > currentYear + 1) {
      msgs.push(`Row ${i + 1}: "${v}" — year ${y} is not valid for this ${currentYear} file`)
    }
  })
  if (!msgs.length) { el.style.display = 'none'; return }
  el.innerHTML = msgs.length === 1
    ? `⚠ ${esc(msgs[0])}`
    : `⚠ Date issues:<ul>${msgs.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
  el.style.display = ''
}

function renderDatesTable() {
  if (activeActIdx < 0) return
  hideVenueDropdown()
  const dates = activities[activeActIdx].dates || []
  document.getElementById('actDatesCount').textContent = `(${dates.length})`
  document.getElementById('actDatesBody').innerHTML = dates
    .map(
      (d, i) => `
    <tr>
      <td><button class="act-del-btn" onclick="act.deleteDateRow(${i})" title="Delete">×</button></td>
      <td><input class="act-cell-input" value="${esc(d.date)}" placeholder="2026-06-13"
          onchange="act.dateCellChanged(${i},'date',this.value)"
          onkeydown="act.dateCellKey(event,${i},'date')" id="dc-${i}-date"></td>
      <td><input class="act-cell-input" value="${esc(d.startTime)}" placeholder="7pm"
          onchange="act.dateCellChanged(${i},'startTime',this.value)"
          onkeydown="act.dateCellKey(event,${i},'startTime')" id="dc-${i}-startTime"></td>
      <td><input class="act-cell-input" value="${esc(d.endTime || '')}" placeholder="9pm"
          onchange="act.dateCellChanged(${i},'endTime',this.value)"
          onkeydown="act.dateCellKey(event,${i},'endTime')" id="dc-${i}-endTime"></td>
      <td><input class="act-cell-input" value="${esc(d.location?.name)}" placeholder="Venue name"
          onchange="act.dateCellChanged(${i},'locName',this.value)"
          oninput="act.onLocNameInput(${i},this)"
          onfocus="act.onLocNameInput(${i},this)"
          onblur="setTimeout(()=>act.hideVenueDropdown(),150)"
          onkeydown="act.dateCellKey(event,${i},'locName')" id="dc-${i}-locName"></td>
      <td><input class="act-cell-input" value="${esc(d.location?.address)}" placeholder="123 Main St, City"
          onchange="act.dateCellChanged(${i},'locAddr',this.value)"
          onkeydown="act.dateCellKey(event,${i},'locAddr')" id="dc-${i}-locAddr"></td>
      <td><input class="act-cell-input" value="${esc(d.notes)}" placeholder="e.g. Open call"
          onchange="act.dateCellChanged(${i},'notes',this.value)"
          onkeydown="act.dateCellKey(event,${i},'notes')" id="dc-${i}-notes"></td>
    </tr>`
    )
    .join('')
  dates.forEach((d, i) => {
    if (d.date) setActInvalid(`dc-${i}-date`, !isValidDate(d.date))
    if (d.startTime) setActInvalid(`dc-${i}-startTime`, !isValidTime(d.startTime))
    if (d.endTime) setActInvalid(`dc-${i}-endTime`, !isValidTime(d.endTime))
  })
  updateDateErrors()
}

function normalizeTime(v) {
  if (!v) return v
  const s = v.trim()
  const ap = s.match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)$/i)
  if (ap) {
    let h = parseInt(ap[1], 10)
    const mins = ap[2] || '00'
    if (ap[3].toLowerCase() === 'am') {
      if (h === 12) h = 0
    } else {
      if (h !== 12) h += 12
    }
    return `${String(h).padStart(2, '0')}:${mins}`
  }
  const norm = s.replace('.', ':')
  if (!/^\d{1,2}:\d{2}$/.test(norm)) return v
  let [hStr, mins] = norm.split(':')
  let h = parseInt(hStr, 10)
  if (h >= 1 && h <= 11) h += 12
  return `${String(h).padStart(2, '0')}:${mins}`
}

function dateCellChanged(idx, field, value) {
  const d = activities[activeActIdx].dates[idx]
  if (field === 'locName') {
    if (!d.location) d.location = { name: '' }
    d.location.name = value
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
    d[field] = value || undefined
    if (value) setActInvalid(`dc-${idx}-${field}`, !isValidTime(value))
  } else if (field === 'date') {
    value = normalizeDate(value)
    const del = document.getElementById(`dc-${idx}-date`)
    if (del && del.value !== value) del.value = value
    d.date = value || undefined
    if (value) setActInvalid(`dc-${idx}-date`, !isValidDate(value))
    updateDateErrors()
  } else {
    d[field] = value || undefined
  }
  markDirty()
}

const DATE_COLS = ['date', 'startTime', 'endTime', 'locName', 'locAddr', 'notes']
function dateCellKey(event, rowIdx, field) {
  if (field === 'locName' && event.key === 'Escape') {
    hideVenueDropdown()
    return
  }
  if (field === 'locName' && (event.key === 'Tab' || event.key === 'Enter')) {
    const dd = document.getElementById('act-venue-dropdown')
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
      if (n) { n.focus() } else {
        const el = document.getElementById(`dc-${rowIdx}-${field}`)
        if (el) dateCellChanged(rowIdx, field, el.value)
        addDateRow()
      }
    }
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const n = document.getElementById(`dc-${rowIdx + 1}-date`)
    if (n) { n.focus() } else {
      const el = document.getElementById(`dc-${rowIdx}-${field}`)
      if (el) dateCellChanged(rowIdx, field, el.value)
      addDateRow()
    }
  }
}

function addDateRow() {
  if (activeActIdx < 0) return
  const dates = activities[activeActIdx].dates
  const prev = dates.length > 0 ? dates[dates.length - 1] : null
  const newRow = { date: '', startTime: '' }
  if (prev?.startTime) newRow.startTime = prev.startTime
  if (prev?.endTime) newRow.endTime = prev.endTime
  if (prev?.location) newRow.location = { ...prev.location }
  dates.push(newRow)
  renderDatesTable()
  markDirty()
  const idx = dates.length - 1
  setTimeout(() => document.getElementById(`dc-${idx}-date`)?.focus(), 30)
}

function deleteDateRow(idx) {
  activities[activeActIdx].dates.splice(idx, 1)
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
  if (activeActIdx < 0) return
  const a = activities[activeActIdx]
  if (a.type === 'event') return
  const musical = isMusical()
  const roles = a.rolesAvailable || []
  document.getElementById('actRolesCount').textContent = `(${roles.length})`

  document.getElementById('actRolesHead').innerHTML = `
    <th class="col-del"></th>
    <th>Role</th>
    <th class="col-type">Type</th>
    <th class="col-gend">Gender</th>
    <th class="col-age">Age Range</th>
    ${musical ? '<th class="col-voice">Voice Part</th>' : ''}
    <th>Description</th>`

  document.getElementById('actRolesBody').innerHTML = roles
    .map(
      (r, i) => `
    <tr>
      <td><button class="act-del-btn" onclick="act.deleteRoleRow(${i})" title="Delete">×</button></td>
      <td><input class="act-cell-input" value="${esc(r.role)}" placeholder="Character name"
          onchange="act.roleCellChanged(${i},'role',this.value)"
          onkeydown="act.roleCellKey(event,${i},'role')" id="rc-${i}-role"></td>
      <td><select class="act-cell-select" onchange="act.roleCellChanged(${i},'type',this.value)" id="rc-${i}-type">
        ${ROLE_TYPES.map((t) => `<option value="${t}" ${r.type === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select></td>
      <td><select class="act-cell-select" onchange="act.roleCellChanged(${i},'gender',this.value)" id="rc-${i}-gender">
        ${ROLE_GENDERS.map((g) => `<option value="${g}" ${r.gender === g ? 'selected' : ''}>${g}</option>`).join('')}
      </select></td>
      <td><input class="act-cell-input" value="${esc(r.ageRange)}" placeholder="30s, 18+"
          onchange="act.roleCellChanged(${i},'ageRange',this.value)"
          onkeydown="act.roleCellKey(event,${i},'ageRange')" id="rc-${i}-ageRange"></td>
      ${
        musical
          ? `<td><input class="act-cell-input" value="${esc(r.voicePart)}" placeholder="Soprano"
          onchange="act.roleCellChanged(${i},'voicePart',this.value)"
          onkeydown="act.roleCellKey(event,${i},'voicePart')" id="rc-${i}-voicePart"></td>`
          : ''
      }
      <td><input class="act-cell-input" value="${esc(r.description)}" placeholder="Optional casting note"
          onchange="act.roleCellChanged(${i},'description',this.value)"
          onkeydown="act.roleCellKey(event,${i},'description')" id="rc-${i}-description"></td>
    </tr>`
    )
    .join('')
}

function roleCellChanged(idx, field, value) {
  const r = activities[activeActIdx].rolesAvailable[idx]
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
  if (activeActIdx < 0) return
  if (!activities[activeActIdx].rolesAvailable) activities[activeActIdx].rolesAvailable = []
  activities[activeActIdx].rolesAvailable.push({ role: '', type: 'lead', gender: 'any' })
  renderRolesTable()
  markDirty()
  const idx = activities[activeActIdx].rolesAvailable.length - 1
  setTimeout(() => document.getElementById(`rc-${idx}-role`)?.focus(), 30)
}

function deleteRoleRow(idx) {
  activities[activeActIdx].rolesAvailable.splice(idx, 1)
  renderRolesTable()
  markDirty()
}

// ── VENUE AUTOCOMPLETE ──
function getVenueDropdown() {
  let el = document.getElementById('act-venue-dropdown')
  if (!el) {
    el = document.createElement('div')
    el.id = 'act-venue-dropdown'
    el.className = 'act-venue-dropdown'
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
    <div class="act-venue-item" onmousedown="act.selectVenueItem(${rowIdx},'${v.code}')">
      <div class="act-venue-item-name">${esc(v.name)}</div>
      ${v.address ? `<div class="act-venue-item-addr">${esc(v.address)}</div>` : ''}
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
  const dd = document.getElementById('act-venue-dropdown')
  if (dd) dd.style.display = 'none'
}

function selectVenueItem(rowIdx, code) {
  const venue = venuesList.find((v) => v.code === code)
  if (!venue) { hideVenueDropdown(); return }
  const d = activities[activeActIdx].dates[rowIdx]
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

// ── PREVIEW ──
const PV_DOT_COLORS = {
  scs: '#ce8481', at: '#7b8bc4', mct: '#71c75f',
  renegade: '#5dadbe', cabrillo: '#c8a96e', abt: '#a57bc4'
}
const PV_GENRE_STYLES = {
  Musical: 'background:#dce4fb;color:#2c3e9a',
  Drama:   'background:#fbe5e1;color:#8c3a2e',
  Comedy:  'background:#dff4d6;color:#2d6020',
  Other:   'background:#f0ece6;color:#6b6259'
}

function openPreview() {
  if (activeActIdx < 0) return
  const a = activities[activeActIdx]
  const companyName = allCompanies.find((c) => c.id === currentCompanyId)?.name || currentCompanyAbv
  const dotColor = PV_DOT_COLORS[currentCompanyId] || '#cbcbcb'
  const genreArr = Array.isArray(a.genre) ? a.genre : (a.genre ? [a.genre] : [])
  const TODAY = new Date().toISOString().slice(0, 10)
  const latestD = [...(a.dates || [])].sort((x, y) => y.date.localeCompare(x.date))[0]?.date ?? ''
  const isPast = latestD && latestD < TODAY
  const showVoice = genreArr.includes('Musical')
  const isEvent = a.type === 'event'
  const displayName = (currentCompanyId === 'other' && a.organizerName) ? a.organizerName : companyName

  const _filteredDates = (a.dates || []).filter((d) => d.date)
  const _pvLocs = _filteredDates.map((d) => d.location?.name).filter(Boolean)
  const _pvShared = _pvLocs.length > 0 && _pvLocs.every((n) => n === _pvLocs[0])
    ? _filteredDates.find((d) => d.location)?.location
    : null
  const datesHtml = (_filteredDates.map((ad, i, arr) => {
    const seenBefore = !_pvShared && i > 0 && arr.slice(0, i).some((p) => p.location?.name === ad.location?.name)
    return `<div class="pv-date-row">
      <span class="pv-date-label">${fmtFullDate(ad.date)}</span>
      <span class="pv-time-label">${fmtTimeRange(ad.startTime, ad.endTime || '')}</span>
      ${ad.notes ? `<span class="pv-date-note">${esc(ad.notes)}</span>` : ''}
      ${!_pvShared && ad.location ? `<div class="pv-date-location">
        <span class="pv-location-name">${esc(ad.location.name)}</span>
        ${!seenBefore && ad.location.address ? `<span class="pv-sub"> · ${esc(ad.location.address)}</span>` : ''}
      </div>` : ''}
    </div>`
  }).join('') +
  (_pvShared ? `<div class="pv-date-location" style="margin-top:4px">
    <span class="pv-location-name">${esc(_pvShared.name)}</span>
    ${_pvShared.address ? `<span class="pv-sub"> · ${esc(_pvShared.address)}</span>` : ''}
  </div>` : '')
  ) || '<div class="pv-sub">No dates set</div>'

  let leftColHtml = `<section class="pv-section"><h4 class="pv-section-head">${isEvent ? 'Dates' : 'Audition dates'}</h4>${datesHtml}</section>`

  if (!isEvent && a.prep) {
    const rows = []
    if (a.prep.acting)        rows.push(`<div class="pv-prep-row"><span class="pv-prep-label">Acting</span><span>${esc(a.prep.acting)}</span></div>`)
    if (a.prep.singing)       rows.push(`<div class="pv-prep-row"><span class="pv-prep-label">Singing</span><span>${esc(a.prep.singing)}</span></div>`)
    if (a.prep.dance)         rows.push(`<div class="pv-prep-row"><span class="pv-prep-label">Dance</span><span>${esc(a.prep.dance)}</span></div>`)
    if (a.prep.bring?.length) rows.push(`<div class="pv-prep-row"><span class="pv-prep-label">Bring</span><span>${esc(a.prep.bring.join(', '))}</span></div>`)
    if (rows.length) leftColHtml += `<section class="pv-section"><h4 class="pv-section-head">Prepare</h4>${rows.join('')}</section>`
  }

  if (isEvent && a.cost) {
    leftColHtml += `<section class="pv-section"><h4 class="pv-section-head">Cost</h4><div class="pv-sub">${esc(a.cost)}</div></section>`
  }

  if (isEvent && a.registerUrl) {
    leftColHtml += `<section class="pv-section"><h4 class="pv-section-head">Register</h4><div><a href="${esc(a.registerUrl)}" class="pv-link-inline" target="_blank" rel="noopener">Register here →</a></div></section>`
  }

  if (a.contact && (a.contact.name || a.contact.email || a.contact.phone)) {
    leftColHtml += `<section class="pv-section pv-contact-section"><h4 class="pv-section-head">Contact</h4>
      ${a.contact.name  ? `<div class="pv-contact-name">${esc(a.contact.name)}</div>` : ''}
      ${a.contact.email ? `<div><a href="mailto:${esc(a.contact.email)}" class="pv-link-inline">${esc(a.contact.email)}</a></div>` : ''}
      ${a.contact.phone ? `<div class="pv-sub">${esc(a.contact.phone)}</div>` : ''}
    </section>`
  }

  let rightColHtml = ''
  if (!isEvent && a.rolesAvailable?.length) {
    const typeLabel = (t) => t === 'lead' ? 'Lead' : t === 'supporting' ? 'Supp.' : 'Ensemble'
    const rows = a.rolesAvailable.map((r) => `
      <tr class="${r.description ? 'has-desc' : ''}">
        <td class="pv-role-name">${esc(r.role)}</td>
        <td class="pv-role-${r.type}">${typeLabel(r.type)}</td>
        <td class="pv-role-age">${esc(r.ageRange || '')}</td>
        ${showVoice ? `<td class="pv-role-voice">${esc(r.voicePart || '')}</td>` : ''}
        <td>${r.description ? `<span class="pv-role-desc">${esc(r.description)}</span>` : ''}</td>
      </tr>`).join('')
    rightColHtml = `<section class="pv-section"><h4 class="pv-section-head">Roles available</h4>
      <table class="pv-roles-table"><thead><tr>
        <th>Role</th><th>Type</th><th>Age</th>${showVoice ? '<th>Voice</th>' : ''}<th>Description</th>
      </tr></thead><tbody>${rows}</tbody></table></section>`
  }

  if (isEvent && a.description) {
    rightColHtml = `<section class="pv-section"><h4 class="pv-section-head">About</h4><div class="pv-sub" style="font-size:13px;line-height:1.55;white-space:pre-wrap">${esc(a.description)}</div></section>`
  }

  const metaRow = `${esc(displayName)}${!isEvent && a.openingDate ? ` · Opens ${fmtShortDate(a.openingDate)}` : ''}${!isEvent && a.rehearsalStart ? ` · Rehearsals start ${fmtShortDate(a.rehearsalStart)}` : ''}`
  const rolesRow = isEvent ? (a.briefDescription ? esc(a.briefDescription) : '') : rolesSum(a.rolesAvailable)

  const linksHtml = (a.noticeUrl || a.productionUrl) ? `<div class="pv-links-row">
    ${a.noticeUrl     ? `<a href="${esc(a.noticeUrl)}" class="pv-action-link" target="_blank" rel="noopener">${isEvent ? 'More info →' : 'Audition notice →'}</a>` : ''}
    ${!isEvent && a.productionUrl ? `<a href="${esc(a.productionUrl)}" class="pv-action-link" target="_blank" rel="noopener">Production info →</a>` : ''}
  </div>` : ''

  document.getElementById('actPreviewBody').innerHTML = `
    <div class="pv-card">
      <div class="pv-summary">
        <div class="pv-main">
          <div class="pv-title-row">
            <span class="pv-dot" style="background:${dotColor}"></span>
            <span class="pv-title">${esc(a.title || 'Untitled')}</span>
            ${isEvent ? '<span class="pv-type-badge">Event</span>' : ''}
            ${!isEvent ? genreArr.map((g) => `<span class="pv-genre-badge" style="${PV_GENRE_STYLES[g] || ''}">${esc(g)}</span>`).join('') : ''}
          </div>
          ${isEvent && a.briefDescription ? `<div class="pv-brief-row">${esc(a.briefDescription)}</div>` : ''}
          <div class="pv-meta-row">${metaRow}</div>
          ${!isEvent ? `<div class="pv-roles-row">${rolesRow}</div>` : ''}
        </div>
        <div class="pv-aside">
          ${isPast ? '<span class="pv-past-pip">Past</span>' : ''}
          <span class="pv-date-range">${fmtAudDateRange(a.dates)}</span>
        </div>
      </div>
      <div class="pv-detail">
        <div class="pv-detail-grid">
          <div class="pv-detail-left">${leftColHtml}</div>
          ${rightColHtml ? `<div class="pv-detail-right">${rightColHtml}</div>` : ''}
        </div>
        ${a.notes ? `<div class="pv-notes-full">${esc(a.notes)}</div>` : ''}
        ${linksHtml}
      </div>
    </div>`
  document.getElementById('actPreviewOverlay').style.display = ''
}

function closePreview() {
  document.getElementById('actPreviewOverlay').style.display = 'none'
}

function closePreviewOutside(e) {
  if (e.target === document.getElementById('actPreviewOverlay')) closePreview()
}

// ── MODULE API ──
export function mount(container, context) {
  injectStyles()
  container.innerHTML = ACT_HTML
  isAdminContext = context.isAdmin
  updateEmptyState()

  window.act = {
    onCompanySelect,
    onYearSelect,
    saveFile,
    newAudition,
    newEvent,
    selectAct,
    restoreActivity,
    deleteActivity,
    genreChanged,
    fieldChanged,
    toggleDescExpand,
    toggleNotesExpand,
    autoResizeTextarea,
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
    normalizeHeaderDate,
    openPreview,
    closePreview,
    closePreviewOutside
  }

  const handle = document.getElementById('actResizeHandle')
  const sidebar = document.getElementById('actSidebar')
  handle.addEventListener('mousedown', (e) => {
    const startX = e.clientX, startW = sidebar.offsetWidth
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
  document.getElementById('act-venue-dropdown')?.remove()
  closePreview()
  delete window.act
  activities = []
  actSnapshots = new Map()
  activeActIdx = -1
  allCompanies = []
  allActFiles = []
  pendingCompanyId = currentCompanyId = null
  currentYear = CURRENT_YEAR
  currentCompanyAbv = ''
  isAdminContext = false
  venuesList = []
}
