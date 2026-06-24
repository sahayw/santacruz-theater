import { IS_DEV, apiFetch, apiPut, apiUploadImage } from './api.js'

const STYLES_ID = 'svc-editor-styles'
const FILE_PATH = 'sc-theater-services.json'
const CATS_PATH = 'sc-theater-service-categories.json'

// ── MODULE STATE ──
let listings = []
let activeIdx = -1
let categories = []
let subPillMap = {}
let snapshots = new Map()
let fileLoaded = false
let pendingUpload = null
let _resizeMouseMove = null
let _resizeMouseUp = null

// ── STYLES ──
function injectStyles() {
  if (document.getElementById(STYLES_ID)) return
  const s = document.createElement('style')
  s.id = STYLES_ID
  s.textContent = SVC_CSS
  document.head.appendChild(s)
}

const SVC_CSS = `
.svc-toolbar {
  background: var(--surface);
  border-bottom: 2px solid var(--border);
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  flex-shrink: 0;
}
.svc-toolbar-spacer { flex: 1; }

.svc-wrap {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.svc-sidebar {
  width: 200px;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.svc-resize-handle {
  width: 5px;
  background: var(--border);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.15s;
}
.svc-resize-handle:hover,
.svc-resize-handle.dragging { background: var(--accent2); }
.svc-sidebar-header {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.svc-sidebar-label {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-mid);
}
.svc-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.svc-list-item {
  padding: 7px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.1s;
}
.svc-list-item:hover  { background: var(--bg); }
.svc-list-item.active { background: var(--bg); border-left-color: var(--sidebar-active); }
.svc-item-meta { font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-faint); margin-bottom: 1px; }
.svc-item-name { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.svc-list-empty { padding: 20px 12px; font-size: 12px; color: var(--ink-faint); text-align: center; line-height: 1.6; }

.svc-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.svc-empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px; color: var(--ink-mid);
}
.svc-empty-icon { font-size: 40px; opacity: 0.2; }
.svc-empty-state h2 { font-family: 'Libre Baskerville', serif; font-size: 18px; color: var(--ink); }
.svc-empty-state p  { font-size: 13px; color: var(--ink-mid); }

.svc-form { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.svc-form-header {
  padding: 10px 16px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.svc-form-title { font-family: 'Libre Baskerville', serif; font-size: 16px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.svc-active-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--ink-mid);
  flex-shrink: 0;
}
.svc-active-toggle input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--green);
}

.svc-fields {
  padding: 10px 16px;
  background: var(--bg);
  border-bottom: 2px solid var(--border);
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  flex-shrink: 0;
}
.svc-field-group { display: flex; flex-direction: column; gap: 3px; }
.svc-field-label {
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--ink-mid);
}
.svc-field-input, .svc-field-select {
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 12px; padding: 4px 7px;
  border: 1px solid var(--border); border-radius: 3px;
  background: var(--surface); color: var(--ink); width: 100%;
}
.svc-field-input:focus, .svc-field-select:focus { outline: none; border-color: var(--accent2); }
.svc-field-input.mono { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }

.svc-scroll-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* ── CATEGORIES WIDGET ── */
.svc-cats-section {
  padding: 8px 16px 10px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.svc-cats-head {
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--ink-mid); margin-bottom: 8px;
}
.svc-cats-grid {
  column-count: 3;
  column-gap: 20px;
}
.svc-cat-parent-row {
  break-inside: avoid;
}
.svc-cat-parent-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  break-inside: avoid;
}
.svc-cat-parent-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  color: var(--ink);
  cursor: pointer;
  padding: 2px 0;
}
.svc-cat-parent-label input[type="checkbox"] {
  width: 12px; height: 12px;
  cursor: pointer; accent-color: var(--accent2); flex-shrink: 0;
}
.svc-cat-subs {
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.svc-cat-sub-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--ink-mid);
  cursor: pointer;
  padding: 1px 0;
}
.svc-cat-sub-label input[type="checkbox"] {
  width: 11px; height: 11px;
  cursor: pointer; accent-color: var(--accent2); flex-shrink: 0;
}

/* ── CONTACT + DESCRIPTION ── */
.svc-contact-section {
  padding: 8px 16px 10px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 24px;
}
.svc-contact-col { display: flex; flex-direction: column; gap: 4px; }
.svc-contact-head {
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--ink-mid); margin-bottom: 2px;
  grid-column: 1 / -1;
}
.svc-contact-row { display: flex; align-items: center; gap: 6px; }
.svc-contact-label {
  font-size: 10px; font-weight: 500; color: var(--ink-mid);
  min-width: 44px; flex-shrink: 0;
}
.svc-contact-row .svc-field-input { border-color: var(--border); background: var(--surface); }

.svc-desc-section {
  padding: 8px 16px 10px;
  background: var(--bg);
  display: flex; flex-direction: column; gap: 4px;
}
.svc-desc-head {
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--ink-mid);
}
.svc-desc-textarea {
  font-family: 'IBM Plex Mono', monospace; font-size: 12px;
  padding: 4px 7px; border: 1px solid var(--border); border-radius: 3px;
  background: var(--surface); color: var(--ink);
  width: 100%; resize: vertical; min-height: 80px;
  line-height: 1.5;
}
.svc-desc-textarea:focus { outline: none; border-color: var(--accent2); }

.svc-statusbar {
  height: 26px; background: var(--ink); color: rgba(255,255,255,0.6);
  font-size: 10px; font-family: 'IBM Plex Mono', monospace;
  display: flex; align-items: center; padding: 0 16px; gap: 20px; flex-shrink: 0;
}
.svc-status-item { display: flex; gap: 6px; }
.svc-status-key  { color: rgba(255,255,255,0.35); }

/* ── PHOTO WIDGET ── */
.svc-photo-section {
  padding: 8px 16px 10px;
  background: var(--bg);
  border-bottom: 2px solid var(--border);
  flex-shrink: 0;
}
.svc-photo-head {
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--ink-mid); margin-bottom: 8px;
}
.svc-photo-preview-row { display: flex; align-items: flex-start; gap: 12px; }
.svc-photo-thumb {
  width: 72px; height: 72px; object-fit: cover;
  border-radius: 4px; border: 1px solid var(--border);
  flex-shrink: 0; background: var(--surface);
}
.svc-photo-info { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.svc-photo-path { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-mid); word-break: break-all; }
.svc-photo-actions { display: flex; gap: 6px; }
.svc-photo-pending-note { font-size: 10px; color: var(--yellow); font-style: italic; }
.svc-photo-filename { max-width: 260px; }

/* ── SERVICE PREVIEW ── */
.spv-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999;
  display: flex; align-items: center; justify-content: center;
}
.spv-modal {
  background: #fff; border-radius: 8px; max-width: 640px; width: 94vw;
  max-height: 88vh; overflow: auto;
}
.spv-modal-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid #e0d9d0; position: sticky; top: 0; background: #fff;
}
.spv-modal-label { font-weight: 600; font-size: 13px; color: #1a1612; }
.spv-close {
  background: none; border: none; cursor: pointer; color: #6b6259;
  font-size: 20px; width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center; border-radius: 4px;
}
.spv-close:hover { color: #1a1612; }
.spv-body { padding: 20px; }
.spv-card {
  background: #ffffff; border: 1px solid #c8a96e;
  border-radius: 6px; overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,0.07);
}
.spv-summary { display: flex; align-items: flex-start; gap: 16px; padding: 14px 16px; }
.spv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.spv-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.spv-name {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 16px; font-weight: 600; color: #1a1612; line-height: 1.25;
}
.spv-pill {
  font-size: 11px; font-weight: 500; padding: 2px 8px;
  border-radius: 10px; background: #f0ece6; color: #6b6259;
  letter-spacing: 0.02em; flex-shrink: 0;
}
.spv-contact-row { display: flex; align-items: flex-start; gap: 12px; margin-top: 2px; }
.spv-photo { width: 80px; height: 80px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.spv-contact-info { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.spv-contact-name { font-weight: 500; color: #1a1612; }
.spv-contact-link { color: #4f5ce0; text-decoration: none; font-size: 12px; }
.spv-contact-link:hover { text-decoration: underline; }
.spv-contact-address { font-size: 12px; color: #6b6259; }
.spv-aside { flex-shrink: 0; padding-top: 2px; }
.spv-chevron {
  display: block; width: 8px; height: 8px;
  border-right: 2px solid #9c9189; border-bottom: 2px solid #9c9189;
  transform: rotate(-135deg);
}
.spv-detail {
  background: #f7f4ef; border-top: 1px solid #e0d9d0;
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.spv-desc { font-size: 13px; color: #1a1612; line-height: 1.6; white-space: pre-wrap; }
.spv-desc a { color: #4f5ce0; text-decoration: none; }
.spv-desc a:hover { text-decoration: underline; }
.spv-url-row { display: flex; }
.spv-action-link { font-size: 13px; font-weight: 500; color: #4f5ce0; text-decoration: none; }
.spv-action-link:hover { color: #2c3e9a; text-decoration: underline; }
`

// ── HTML TEMPLATE ──
const SVC_HTML = `
<div class="svc-toolbar">
  <div class="svc-toolbar-spacer"></div>
  <button class="btn btn-sm" id="svcSaveBtn" onclick="svcEd.saveFile()"
    style="border:1px solid var(--border);color:rgba(28,26,23,0.4)" disabled>Save</button>
</div>

<div class="svc-wrap">
  <div class="svc-sidebar" id="svcSidebar">
    <div class="svc-sidebar-header">
      <span class="svc-sidebar-label">Services</span>
      <button class="btn btn-green btn-sm" id="svcNewBtn" onclick="svcEd.newListing()" style="display:none">+ New</button>
    </div>
    <div class="svc-list" id="svcList"></div>
  </div>

  <div class="svc-resize-handle" id="svcResizeHandle"></div>

  <div class="svc-main">
    <div class="svc-empty-state" id="svcEmptyState">
      <div class="svc-empty-icon">🔧</div>
      <h2>No listing selected</h2>
      <p>Select a listing or create a new one.</p>
    </div>

    <div class="svc-form" id="svcForm" style="display:none">

      <!-- ── FIXED HEADER ── -->
      <div class="svc-form-header">
        <div class="svc-form-title" id="svcFormTitle">New Listing</div>
        <label class="svc-active-toggle">
          <input type="checkbox" id="sf-active" onchange="svcEd.fieldChanged()"> Active
        </label>
        <button class="btn btn-sm" id="svcRestoreBtn"
          style="background:var(--bg);border:1px solid var(--border);display:none"
          onclick="svcEd.restoreListing()">Restore</button>
        <button class="btn btn-sm" id="svcPreviewBtn"
          style="background:var(--bg);border:1px solid var(--border)"
          onclick="svcEd.openPreview()">Preview</button>
        <button class="btn btn-sm" style="background:#fde;color:var(--accent);border:1px solid #fcc"
          onclick="svcEd.deleteListing()">Delete</button>
      </div>

      <!-- ── TOP FIELDS ── -->
      <div class="svc-fields">
        <div class="svc-field-group" style="grid-column:span 4">
          <label class="svc-field-label">Name</label>
          <input class="svc-field-input" id="sf-name" placeholder="Company or individual name" oninput="svcEd.fieldChanged()">
        </div>
        <div class="svc-field-group" style="grid-column:span 2">
          <label class="svc-field-label">URL</label>
          <input class="svc-field-input mono" id="sf-url" placeholder="https://…" oninput="svcEd.fieldChanged()">
        </div>
      </div>

      <!-- ── PHOTO ── -->
      <div class="svc-photo-section">
        <div class="svc-photo-head">Photo</div>
        <div id="svc-photo-wrap"></div>
      </div>

      <!-- ── SCROLLABLE BODY ── -->
      <div class="svc-scroll-body">

        <!-- Categories -->
        <div class="svc-cats-section">
          <div class="svc-cats-head">Categories</div>
          <div class="svc-cats-grid" id="svcCatsGrid"></div>
        </div>

        <!-- Contact -->
        <div class="svc-contact-section">
          <div class="svc-contact-head">Contact</div>
          <div class="svc-contact-col">
            <div class="svc-contact-row">
              <span class="svc-contact-label">Name</span>
              <input class="svc-field-input" id="sf-contact-name" placeholder="Contact person" oninput="svcEd.fieldChanged()">
            </div>
            <div class="svc-contact-row">
              <span class="svc-contact-label">Tel</span>
              <input class="svc-field-input mono" id="sf-contact-tel" placeholder="831-555-0100" oninput="svcEd.fieldChanged()">
            </div>
          </div>
          <div class="svc-contact-col">
            <div class="svc-contact-row">
              <span class="svc-contact-label">Email</span>
              <input class="svc-field-input mono" id="sf-contact-email" placeholder="name@example.com" oninput="svcEd.fieldChanged()">
            </div>
            <div class="svc-contact-row">
              <span class="svc-contact-label">Address</span>
              <input class="svc-field-input" id="sf-contact-address" placeholder="Street address" oninput="svcEd.fieldChanged()">
            </div>
          </div>
        </div>

        <!-- Description -->
        <div class="svc-desc-section">
          <div class="svc-desc-head">Description — supports **bold**, *italic*, and [link text](https://url)</div>
          <textarea class="svc-desc-textarea" id="sf-desc" rows="8"
            placeholder="Full description…" oninput="svcEd.fieldChanged()"></textarea>
        </div>

      </div><!-- /.svc-scroll-body -->
    </div><!-- /.svc-form -->
  </div><!-- /.svc-main -->
</div><!-- /.svc-wrap -->

<div class="svc-statusbar">
  <div class="svc-status-item"><span class="svc-status-key">listings</span><span id="sst-count">0</span></div>
  <div class="svc-status-item"><span class="svc-status-key">status</span><span id="sst-saved">no file loaded</span></div>
</div>

<div class="spv-overlay" id="svcPreviewOverlay" style="display:none" onclick="svcEd.closePreviewOutside(event)">
  <div class="spv-modal">
    <div class="spv-modal-hd">
      <span class="spv-modal-label">Preview</span>
      <button class="spv-close" onclick="svcEd.closePreview()">×</button>
    </div>
    <div class="spv-body" id="svcPreviewBody"></div>
  </div>
</div>
`

// ── CATEGORIES WIDGET ──
function buildCatsGrid() {
  const grid = document.getElementById('svcCatsGrid')
  if (!grid) return
  grid.innerHTML = categories
    .map(
      (cat) => `
    <div class="svc-cat-parent-row">
      <label class="svc-cat-parent-label">
        <input type="checkbox" data-parent="${cat.id}" onchange="svcEd.parentCatChanged('${cat.id}', this)">
        ${esc(cat.label)}
      </label>
      <div class="svc-cat-subs">
        ${cat.subcategories
          .map(
            (sub) => `
          <label class="svc-cat-sub-label">
            <input type="checkbox" data-sub="${sub.id}" data-parent="${cat.id}" onchange="svcEd.subCatChanged('${cat.id}')">
            ${esc(sub.label)}
          </label>
        `
          )
          .join('')}
      </div>
    </div>
  `
    )
    .join('')
}

function setCatsFromListing(selectedIds) {
  const selected = new Set(selectedIds || [])
  for (const cat of categories) {
    const subs = cat.subcategories
    const subBoxes = Array.from(
      document.querySelectorAll(`input[data-sub][data-parent="${cat.id}"]`)
    )
    subBoxes.forEach((cb) => {
      cb.checked = selected.has(cb.dataset.sub)
    })
    updateParentCheckbox(cat.id)
  }
}

function updateParentCheckbox(parentId) {
  const parentCb = document.querySelector(`input[data-parent="${parentId}"]:not([data-sub])`)
  if (!parentCb) return
  const cat = categories.find((c) => c.id === parentId)
  if (!cat) return
  const subBoxes = Array.from(
    document.querySelectorAll(`input[data-sub][data-parent="${parentId}"]`)
  )
  const checkedCount = subBoxes.filter((cb) => cb.checked).length
  parentCb.indeterminate = checkedCount > 0 && checkedCount < subBoxes.length
  parentCb.checked = checkedCount === subBoxes.length && subBoxes.length > 0
}

function getSelectedCats() {
  return Array.from(document.querySelectorAll('input[data-sub]:checked')).map(
    (cb) => cb.dataset.sub
  )
}

// ── UTILITIES ──
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function updatePhotoWidget() {
  const wrap = document.getElementById('svc-photo-wrap')
  if (!wrap) return
  const l = activeIdx >= 0 ? listings[activeIdx] : null
  if (pendingUpload) {
    wrap.innerHTML = `
      <div class="svc-photo-preview-row">
        <img src="${esc(pendingUpload.dataUrl)}" class="svc-photo-thumb" alt="Preview">
        <div class="svc-photo-info">
          <div class="svc-field-group">
            <label class="svc-field-label">Filename</label>
            <input class="svc-field-input mono svc-photo-filename" id="sf-photo-filename"
              value="${esc(pendingUpload.filename)}" oninput="svcEd.photoFilenameChanged(this.value)">
          </div>
          <div class="svc-photo-actions">
            <button class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)"
              onclick="document.getElementById('sf-photo-input').click()">Change file</button>
            <button class="btn btn-sm" style="background:#fde;color:var(--accent);border:1px solid #fcc"
              onclick="svcEd.photoCancelClicked()">Cancel</button>
          </div>
          <div class="svc-photo-pending-note">Will be uploaded on Save</div>
        </div>
      </div>
      <input type="file" id="sf-photo-input" accept="image/jpeg,image/png,image/webp"
        style="display:none" onchange="svcEd.photoPicked(this)">`
  } else if (l?.photo) {
    const thumbSrc = l._photoDataUrl || l.photo
    wrap.innerHTML = `
      <div class="svc-photo-preview-row">
        <img src="${esc(thumbSrc)}" class="svc-photo-thumb" alt="Photo">
        <div class="svc-photo-info">
          <div class="svc-photo-actions">
            <button class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)"
              onclick="document.getElementById('sf-photo-input').click()">Change</button>
            <button class="btn btn-sm" style="background:#fde;color:var(--accent);border:1px solid #fcc"
              onclick="svcEd.photoRemoveClicked()">Remove</button>
          </div>
        </div>
      </div>
      <input type="file" id="sf-photo-input" accept="image/jpeg,image/png,image/webp"
        style="display:none" onchange="svcEd.photoPicked(this)">`
  } else {
    wrap.innerHTML = `
      <button class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)"
        onclick="document.getElementById('sf-photo-input').click()">Choose image…</button>
      <input type="file" id="sf-photo-input" accept="image/jpeg,image/png,image/webp"
        style="display:none" onchange="svcEd.photoPicked(this)">`
  }
}

function photoPicked(input) {
  const file = input.files?.[0]
  if (!file) return
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    alert('Please choose a JPG, PNG, or WebP image.')
    input.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target.result
    const base64 = dataUrl.split(',')[1]
    const l = activeIdx >= 0 ? listings[activeIdx] : null
    const stem = l?.name ? slugify(l.name) : 'photo'
    const finalExt = ext === 'jpeg' ? 'jpg' : ext
    pendingUpload = { filename: `${stem}.${finalExt}`, dataUrl, base64 }
    updatePhotoWidget()
    markDirty()
  }
  reader.readAsDataURL(file)
}

function photoFilenameChanged(val) {
  if (!pendingUpload) return
  pendingUpload.filename = val.trim()
}

function photoCancelClicked() {
  pendingUpload = null
  updatePhotoWidget()
  markDirty()
}

function photoRemoveClicked() {
  if (!confirm('Remove photo from this listing?')) return
  listings[activeIdx].photo = undefined
  pendingUpload = null
  updatePhotoWidget()
  markDirty()
  renderSidebar()
}

function snapshot(listing) {
  const { updatedAt, ...rest } = listing
  return JSON.stringify(rest)
}

function refreshSnapshots() {
  snapshots = new Map(listings.map((l) => [l.id, snapshot(l)]))
}

// ── DIRTY TRACKING ──
function computeIsDirty() {
  if (!fileLoaded) return false
  if (pendingUpload !== null) return true
  if (listings.length !== snapshots.size) return true
  for (const l of listings) {
    const snap = snapshots.get(l.id)
    if (!snap) return true
    if (snap !== snapshot(l)) return true
  }
  return false
}

function markDirty() {
  updateStatus()
  updateSaveBtn()
  updateRestoreBtn()
}

function updateSaveBtn() {
  const btn = document.getElementById('svcSaveBtn')
  if (!btn) return
  const can = fileLoaded && computeIsDirty()
  btn.disabled = !can
  btn.style.background = can ? 'var(--yellow)' : 'transparent'
  btn.style.color = can ? '#1c1a17' : 'rgba(28,26,23,0.4)'
  btn.style.borderColor = can ? 'var(--yellow)' : 'var(--border)'
}

function updateRestoreBtn() {
  const btn = document.getElementById('svcRestoreBtn')
  if (!btn || activeIdx < 0) return
  const l = listings[activeIdx]
  const isNew = !snapshots.has(l?.id)
  const isDirty = l && !isNew && snapshots.get(l.id) !== snapshot(l)
  btn.style.display = isDirty ? '' : 'none'
}

function updateStatus() {
  const ec = document.getElementById('sst-count')
  const es = document.getElementById('sst-saved')
  if (!ec) return
  ec.textContent = listings.length
  if (!fileLoaded) {
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
  const list = document.getElementById('svcList')
  if (!list) return
  if (!listings.length) {
    list.innerHTML = '<div class="svc-list-empty">No listings yet.<br>Click + New to add one.</div>'
    return
  }
  list.innerHTML = listings
    .map(
      (l, i) => `
      <div class="svc-list-item ${i === activeIdx ? 'active' : ''}" onclick="svcEd.selectListing(${i})">
        <div class="svc-item-meta">${l.active ? 'Active' : 'Inactive'}</div>
        <div class="svc-item-name">${esc(l.name || 'Untitled')}</div>
      </div>`
    )
    .join('')
  updateStatus()
}

// ── FORM ──
function populateForm(idx) {
  const l = listings[idx]
  if (!l) return
  document.getElementById('svcFormTitle').textContent = l.name || 'Untitled'
  document.getElementById('sf-active').checked = !!l.active
  document.getElementById('sf-name').value = l.name || ''
  document.getElementById('sf-url').value = l.url || ''
  updatePhotoWidget()
  document.getElementById('sf-contact-name').value = l.contact?.name || ''
  document.getElementById('sf-contact-tel').value = l.contact?.tel || ''
  document.getElementById('sf-contact-email').value = l.contact?.email || ''
  document.getElementById('sf-contact-address').value = l.contact?.address || ''
  document.getElementById('sf-desc').value = l.description || ''
  setCatsFromListing(l.categories || [])
  updateRestoreBtn()
}

function readForm() {
  if (activeIdx < 0) return
  const l = listings[activeIdx]
  l.name = document.getElementById('sf-name').value.trim()
  l.active = document.getElementById('sf-active').checked
  l.url = document.getElementById('sf-url').value.trim() || undefined
  l.description = document.getElementById('sf-desc').value.trim() || undefined
  l.categories = getSelectedCats()
  l.contact = {
    name: document.getElementById('sf-contact-name').value.trim() || undefined,
    tel: document.getElementById('sf-contact-tel').value.trim() || undefined,
    email: document.getElementById('sf-contact-email').value.trim() || undefined,
    address: document.getElementById('sf-contact-address').value.trim() || undefined
  }
  document.getElementById('svcFormTitle').textContent = l.name || 'Untitled'
}

// ── ACTIONS ──
function selectListing(idx) {
  if (idx === activeIdx) return
  pendingUpload = null
  activeIdx = idx
  const form = document.getElementById('svcForm')
  const empty = document.getElementById('svcEmptyState')
  form.style.display = idx >= 0 ? '' : 'none'
  if (empty) empty.style.display = idx >= 0 ? 'none' : ''
  if (idx >= 0) populateForm(idx)
  renderSidebar()
}

function newListing() {
  if (computeIsDirty() && activeIdx >= 0) {
    if (!confirm('You have unsaved changes. Discard and continue?')) return
  }
  const now = new Date().toISOString()
  const id = `service-${Date.now()}`
  listings.push({
    id,
    name: '',
    categories: [],
    contact: {},
    active: true,
    createdAt: now,
    updatedAt: now
  })
  selectListing(listings.length - 1)
  markDirty()
  renderSidebar()
  document.getElementById('sf-name')?.focus()
}

function deleteListing() {
  if (activeIdx < 0) return
  const l = listings[activeIdx]
  if (!confirm(`Delete "${l.name || 'this listing'}"? This cannot be undone.`)) return
  listings.splice(activeIdx, 1)
  snapshots.delete(l.id)
  pendingUpload = null
  const newIdx = Math.min(activeIdx, listings.length - 1)
  activeIdx = -1
  selectListing(newIdx)
  markDirty()
  renderSidebar()
}

function restoreListing() {
  if (activeIdx < 0) return
  const l = listings[activeIdx]
  const snap = snapshots.get(l.id)
  if (!snap) return
  const restored = JSON.parse(snap)
  restored.updatedAt = l.updatedAt
  listings[activeIdx] = restored
  pendingUpload = null
  populateForm(activeIdx)
  markDirty()
  renderSidebar()
}

function fieldChanged() {
  if (activeIdx < 0) return
  readForm()
  markDirty()
  renderSidebar()
}

function parentCatChanged(parentId, checkbox) {
  const subBoxes = Array.from(
    document.querySelectorAll(`input[data-sub][data-parent="${parentId}"]`)
  )
  subBoxes.forEach((cb) => {
    cb.checked = checkbox.checked
  })
  checkbox.indeterminate = false
  fieldChanged()
}

function subCatChanged(parentId) {
  updateParentCheckbox(parentId)
  fieldChanged()
}

// ── VALIDATION ──
function collectErrors() {
  const errors = []
  for (const l of listings) {
    if (!l.name) errors.push(`Listing ${l.id}: Name is required`)
    if (!l.categories.length) errors.push(`"${l.name || l.id}": At least one category is required`)
    if (!l.contact?.tel && !l.contact?.email) {
      errors.push(`"${l.name || l.id}": Contact must have at least a phone or email`)
    }
  }
  return errors
}

// ── PERSISTENCE ──
async function loadFile() {
  let data
  try {
    data = await apiFetch(FILE_PATH)
  } catch (e) {
    alert('Could not load services file: ' + e.message)
    return
  }
  listings = data.listings || []
  fileLoaded = true
  refreshSnapshots()
  document.getElementById('svcNewBtn').style.display = ''
  renderSidebar()
  updateSaveBtn()
  updateStatus()
}

async function saveFile() {
  if (!fileLoaded) return
  if (!IS_DEV && !window.netlifyIdentity?.currentUser()) {
    alert('Please log in to save.')
    return
  }
  const errors = collectErrors()
  if (errors.length) {
    alert('Cannot save — fix these issues:\n\n' + errors.join('\n'))
    return
  }
  const btn = document.getElementById('svcSaveBtn')
  btn.disabled = true

  if (pendingUpload) {
    const filename =
      document.getElementById('sf-photo-filename')?.value.trim() || pendingUpload.filename
    if (!/^[\w-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
      alert(
        'Invalid filename. Use only letters, numbers, hyphens and a .jpg, .png, or .webp extension.'
      )
      updateSaveBtn()
      return
    }
    btn.textContent = 'Uploading…'
    try {
      await apiUploadImage(filename, pendingUpload.base64)
      listings[activeIdx].photo = `/images/services/${filename}`
      listings[activeIdx]._photoDataUrl = pendingUpload.dataUrl
      pendingUpload = null
      updatePhotoWidget()
    } catch (e) {
      alert('Image upload failed: ' + e.message)
      btn.textContent = 'Save'
      updateSaveBtn()
      return
    }
  }

  btn.textContent = 'Saving…'
  try {
    const now = new Date().toISOString()
    const cleanListings = listings.map((l) => {
      const { updatedAt, ...rest } = l
      const snap = snapshots.get(l.id)
      const changed = !snap || snap !== JSON.stringify(rest)
      return { ...l, updatedAt: changed ? now : l.updatedAt }
    })
    await apiPut(FILE_PATH, { listings: cleanListings })
    cleanListings.forEach((cl, i) => {
      listings[i].updatedAt = cl.updatedAt
    })
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

// ── PREVIEW ──
function renderDesc(raw) {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
}

function openPreview() {
  if (activeIdx < 0) return
  const l = listings[activeIdx]
  const photoSrc = pendingUpload ? pendingUpload.dataUrl : (l._photoDataUrl || l.photo || null)

  const pillsHtml = (l.categories || [])
    .map((catId) => `<span class="spv-pill">${esc(subPillMap[catId] ?? catId)}</span>`)
    .join('')

  const contactHtml = [
    l.contact?.name    ? `<span class="spv-contact-name">${esc(l.contact.name)}</span>` : '',
    l.contact?.tel     ? `<a href="tel:${esc(l.contact.tel)}" class="spv-contact-link">${esc(l.contact.tel)}</a>` : '',
    l.contact?.email   ? `<a href="mailto:${esc(l.contact.email)}" class="spv-contact-link">${esc(l.contact.email)}</a>` : '',
    l.contact?.address ? `<span class="spv-contact-address">${esc(l.contact.address)}</span>` : '',
  ].filter(Boolean).join('')

  const descHtml = l.description ? `<div class="spv-desc">${renderDesc(l.description)}</div>` : ''
  const urlHtml  = l.url ? `<div class="spv-url-row"><a href="${esc(l.url)}" class="spv-action-link" target="_blank" rel="noopener">More info →</a></div>` : ''

  document.getElementById('svcPreviewBody').innerHTML = `
    <div class="spv-card">
      <div class="spv-summary">
        <div class="spv-main">
          <div class="spv-name-row">
            <span class="spv-name">${esc(l.name || 'Untitled')}</span>
            ${pillsHtml}
          </div>
          <div class="spv-contact-row">
            ${photoSrc ? `<img class="spv-photo" src="${esc(photoSrc)}" alt="">` : ''}
            <div class="spv-contact-info">${contactHtml}</div>
          </div>
        </div>
        <div class="spv-aside"><span class="spv-chevron"></span></div>
      </div>
      ${descHtml || urlHtml ? `<div class="spv-detail">${descHtml}${urlHtml}</div>` : ''}
    </div>`
  document.getElementById('svcPreviewOverlay').style.display = ''
}

function closePreview() {
  document.getElementById('svcPreviewOverlay').style.display = 'none'
}

function closePreviewOutside(e) {
  if (e.target === document.getElementById('svcPreviewOverlay')) closePreview()
}

// ── MODULE API ──
export function mount(container, context) {
  injectStyles()
  container.innerHTML = SVC_HTML

  window.svcEd = {
    selectListing,
    newListing,
    deleteListing,
    restoreListing,
    fieldChanged,
    parentCatChanged,
    subCatChanged,
    saveFile,
    photoPicked,
    photoFilenameChanged,
    photoCancelClicked,
    photoRemoveClicked,
    openPreview,
    closePreview,
    closePreviewOutside
  }

  const handle = document.getElementById('svcResizeHandle')
  const sidebar = document.getElementById('svcSidebar')
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

  // Load categories then services data
  apiFetch(CATS_PATH)
    .then((data) => {
      categories = data.categories || []
      subPillMap = {}
      for (const cat of categories) {
        for (const sub of cat.subcategories) {
          subPillMap[sub.id] = sub.description ?? sub.label
        }
      }
      buildCatsGrid()
      return loadFile()
    })
    .catch((e) => alert('Could not load category data: ' + e.message))

  updateStatus()
  updateSaveBtn()
}

export function unmount() {
  if (_resizeMouseMove) document.removeEventListener('mousemove', _resizeMouseMove)
  if (_resizeMouseUp) document.removeEventListener('mouseup', _resizeMouseUp)
  _resizeMouseMove = _resizeMouseUp = null
  delete window.svcEd
  listings = []
  snapshots = new Map()
  activeIdx = -1
  categories = []
  subPillMap = {}
  fileLoaded = false
  pendingUpload = null
}
