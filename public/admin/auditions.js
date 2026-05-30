const STYLES_ID = 'aud-editor-styles'

function injectStyles() {
  if (document.getElementById(STYLES_ID)) return
  const s = document.createElement('style')
  s.id = STYLES_ID
  s.textContent = AUD_CSS
  document.head.appendChild(s)
}

const AUD_CSS = `
.aud-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px;
  font-family: 'IBM Plex Sans', sans-serif;
}
.aud-icon { font-size: 48px; line-height: 1; opacity: 0.25; }
.aud-heading {
  font-family: 'Libre Baskerville', serif;
  font-size: 22px;
  color: #1c1a17;
}
.aud-sub { font-size: 13px; color: #6b6359; text-align: center; line-height: 1.6; max-width: 320px; }
.aud-badge {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 12px;
  border-radius: 12px;
  background: #f5f2ed;
  border: 1px solid #ddd8cf;
  color: #b0a898;
}
`

const AUD_HTML = `
<div class="aud-wrap">
  <div class="aud-icon">🎤</div>
  <h2 class="aud-heading">Auditions Editor</h2>
  <p class="aud-sub">Manage audition listings for Santa Cruz County theater companies.</p>
  <span class="aud-badge">Coming soon</span>
</div>
`

export function mount(container) {
  injectStyles()
  container.innerHTML = AUD_HTML
}

export function unmount() {}
