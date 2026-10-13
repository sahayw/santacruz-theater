const STYLE_ID = 'markdown-toolbar-styles'

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .markdown-toolbar { display: inline-flex; align-items: center; gap: 3px; }
    .markdown-toolbar button {
      min-width: 23px; height: 21px; padding: 0 5px;
      border: 1px solid var(--border); border-radius: 2px;
      background: var(--surface); color: var(--ink-mid);
      font: 500 10px 'IBM Plex Sans', sans-serif; cursor: pointer;
    }
    .markdown-toolbar button:hover { background: var(--bg); border-color: var(--ink-mid); }
    .markdown-toolbar button:focus-visible { outline: 2px solid var(--accent2); outline-offset: 1px; }
    .markdown-link-dialog {
      width: min(380px, calc(100vw - 32px)); padding: 16px;
      border: 1px solid var(--border); border-radius: 4px;
      background: var(--surface); color: var(--ink);
      box-shadow: 0 12px 36px rgba(0,0,0,0.22);
    }
    .markdown-link-dialog::backdrop { background: rgba(0,0,0,0.32); }
    .markdown-link-dialog form { display: grid; gap: 12px; }
    .markdown-link-dialog label { display: grid; gap: 5px; font-size: 12px; }
    .markdown-link-dialog input {
      min-width: 0; padding: 7px 8px; border: 1px solid var(--border);
      border-radius: 3px; background: var(--surface); color: var(--ink);
      font: 12px 'IBM Plex Mono', monospace;
    }
    .markdown-link-dialog input:focus { outline: 2px solid var(--accent2); outline-offset: 1px; }
    .markdown-link-error { color: var(--accent); font-size: 11px; }
    .markdown-link-actions { display: flex; justify-content: flex-end; gap: 6px; }
    .markdown-link-actions button {
      padding: 5px 10px; border: 1px solid var(--border); border-radius: 3px;
      background: var(--surface); color: var(--ink); font: 11px 'IBM Plex Sans', sans-serif;
      cursor: pointer;
    }
    .markdown-link-actions button[type="submit"] { background: var(--accent2); border-color: var(--accent2); color: #fff; }
  `
  document.head.append(style)
}

document.addEventListener('mousedown', (event) => {
  const button =
    event.target instanceof Element ? event.target.closest('.markdown-toolbar button') : null
  if (button) event.preventDefault()
})

document.addEventListener('click', (event) => {
  const button =
    event.target instanceof Element ? event.target.closest('.markdown-toolbar button') : null
  if (!button) return
  const textarea = document.getElementById(button.dataset.mdTarget)
  if (!(textarea instanceof HTMLTextAreaElement)) return
  applyAction(textarea, button.dataset.mdAction)
})

document.addEventListener('keydown', (event) => {
  const textarea = event.target
  if (!(textarea instanceof HTMLTextAreaElement) || !textarea.hasAttribute('data-markdown-editor'))
    return
  if (!(event.metaKey || event.ctrlKey)) return
  const key = event.key.toLowerCase()
  if (key !== 'b' && key !== 'i') return
  event.preventDefault()
  applyAction(textarea, key === 'b' ? 'bold' : 'italic')
})

export function markdownToolbar(targetId) {
  return `<div class="markdown-toolbar" role="toolbar" aria-label="Text formatting">
    <button type="button" data-md-target="${targetId}" data-md-action="bold" title="Bold" aria-label="Bold"><strong>B</strong></button>
    <button type="button" data-md-target="${targetId}" data-md-action="italic" title="Italic" aria-label="Italic"><em>I</em></button>
    <button type="button" data-md-target="${targetId}" data-md-action="link" title="Insert link" aria-label="Insert link">Link</button>
    <button type="button" data-md-target="${targetId}" data-md-action="list" title="Bulleted list" aria-label="Bulleted list">List</button>
  </div>`
}

function applyAction(textarea, action) {
  if (action === 'bold' || action === 'italic') {
    const marker = action === 'bold' ? '**' : '*'
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selection = textarea.value.slice(start, end)
    textarea.setRangeText(`${marker}${selection}${marker}`, start, end, 'select')
    textarea.setSelectionRange(start + marker.length, start + marker.length + selection.length)
    finishEdit(textarea)
    return
  }

  if (action === 'link') {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selection = textarea.value.slice(start, end)
    openLinkDialog(textarea, start, end, selection)
    return
  }

  if (action === 'list') toggleList(textarea)
}

function openLinkDialog(textarea, start, end, selection) {
  const dialog = document.createElement('dialog')
  dialog.className = 'markdown-link-dialog'
  dialog.innerHTML = `<form>
    <label>Link URL<input type="url" name="url" placeholder="https://example.com" required></label>
    <div class="markdown-link-error" aria-live="polite" hidden></div>
    <div class="markdown-link-actions">
      <button type="button" data-md-cancel>Cancel</button>
      <button type="submit">Insert link</button>
    </div>
  </form>`
  const form = dialog.querySelector('form')
  const input = dialog.querySelector('input')
  const error = dialog.querySelector('.markdown-link-error')
  document.body.append(dialog)
  dialog.showModal()
  input.focus()

  const close = () => {
    dialog.close()
    dialog.remove()
    textarea.focus()
  }
  dialog.querySelector('[data-md-cancel]').addEventListener('click', close)
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    close()
  })
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    let url
    try {
      url = new URL(input.value.trim())
    } catch {
      error.textContent = 'Enter a valid http:// or https:// URL.'
      error.hidden = false
      return
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      error.textContent = 'Use an http:// or https:// URL.'
      error.hidden = false
      return
    }
    const label = selection || 'link text'
    textarea.setRangeText(`[${label}](${url.href})`, start, end, 'select')
    textarea.setSelectionRange(start + 1, start + 1 + label.length)
    close()
    finishEdit(textarea)
  })
}

function toggleList(textarea) {
  const value = textarea.value
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const nextLineBreak = value.indexOf('\n', end)
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak
  const original = value.slice(lineStart, lineEnd)
  const lines = original.split('\n')
  const nonblank = lines.filter((line) => line.trim())
  const remove = nonblank.length > 0 && nonblank.every((line) => /^\s*[-*+]\s+/.test(line))
  const updated = lines
    .map((line) => {
      if (!line.trim()) return line
      if (remove) return line.replace(/^([ \t]*)[-*+]\s+/, '$1')
      return /^\s*[-*+]\s+/.test(line) ? line : `- ${line}`
    })
    .join('\n')

  textarea.setRangeText(updated, lineStart, lineEnd, 'select')
  if (start === end) {
    const currentLine = lines[0] || ''
    const prefixLength = remove ? currentLine.match(/^([ \t]*)[-*+]\s+/)?.[0].length || 0 : 2
    const caret = lineStart + Math.max(0, start - lineStart + prefixLength * (remove ? -1 : 1))
    textarea.setSelectionRange(caret, caret)
  }
  finishEdit(textarea)
}

function finishEdit(textarea) {
  textarea.focus()
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}
