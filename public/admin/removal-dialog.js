/**
 * Asks what a deletion means to subscribers. Resolves to 'notify' (announce the
 * cancellation), 'silent' (a data-entry correction, no email) or 'keep' (don't delete).
 */
export function askRemoval(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:10000'
    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" style="background:#fff;border-radius:8px;padding:20px;max-width:420px;box-shadow:0 8px 30px rgba(0,0,0,.3)">
        <p style="margin:0 0 16px;white-space:pre-line"></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn btn-sm" data-choice="keep">Keep</button>
          <button class="btn btn-sm" data-choice="silent">Delete without notification</button>
          <button class="btn btn-sm" data-choice="notify" style="background:var(--accent);color:#fff">Notify cancellation</button>
        </div>
      </div>`
    overlay.querySelector('p').textContent = message
    const done = (choice) => {
      document.removeEventListener('keydown', onKey)
      overlay.remove()
      resolve(choice)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') done('keep')
    }
    overlay.addEventListener('click', (e) => {
      const choice = e.target.closest?.('[data-choice]')?.dataset.choice
      if (choice) done(choice)
    })
    document.addEventListener('keydown', onKey)
    document.body.appendChild(overlay)
    overlay.querySelector('[data-choice="keep"]').focus()
  })
}
