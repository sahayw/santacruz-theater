// Genre checkboxes shared by the Calendar and Activities editors: one compact row instead
// of a tall multi-select. At most `max` can be ticked; ticking another drops the
// longest-ticked one.

const GENRES = ['Drama', 'Musical', 'Comedy', 'Other']
const STYLE_ID = 'genre-boxes-styles'

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
.genre-boxes { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; min-height: 26px; font-size: 12px; }
.genre-boxes label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap; }
`
  document.head.appendChild(s)
}

/** Markup for the checkbox row; `onchange` is the inline handler, e.g. "cal.genreChanged(this)". */
export function genreBoxesHtml(id, onchange) {
  injectStyles()
  return `<div class="genre-boxes" id="${id}">${GENRES.map(
    (g) => `<label><input type="checkbox" value="${g}" onchange="${onchange}">${g}</label>`
  ).join('')}</div>`
}

export function getGenres(id) {
  return [...document.querySelectorAll(`#${id} input:checked`)].map((b) => b.value)
}

export function setGenres(id, genres) {
  document.querySelectorAll(`#${id} input`).forEach((b) => {
    b.checked = genres.includes(b.value)
  })
}

/**
 * After `box` changes: keeps at most `max` ticked (dropping the oldest of `previous`) and
 * returns the genres now ticked, in ticking order.
 */
export function limitGenres(id, box, previous, max) {
  let next = previous.filter((g) => g !== box.value)
  if (box.checked) next.push(box.value)
  if (next.length > max) next = next.slice(-max)
  setGenres(id, next)
  return next
}
