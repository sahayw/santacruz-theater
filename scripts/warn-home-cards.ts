/**
 * Post-build warning (never fails the build): the home page cards grow to fit their text,
 * but a description that wraps to more than MAX_LINES lines on a narrow phone makes the
 * card tall. Estimates the wrapped line count of each .card-desc in dist/index.html from
 * its character count at the narrowest supported width, and warns when it could go over.
 * Run by `npm run build` after `astro build`.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_LINES = 5
// ~320px screen less page and card padding, at 13px body text (~6.2px per character)
const CHARS_PER_LINE = 42

const root = resolve(fileURLToPath(import.meta.url), '../..')
const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8')

for (const [, inner] of html.matchAll(/<p class="card-desc"[^>]*>([\s\S]*?)<\/p>/g)) {
  // A <br> starts a new line; everything else wraps
  const lines = inner
    .split(/<br\s*\/?>/)
    .map((part) =>
      part
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .reduce((n, part) => n + Math.max(1, Math.ceil(part.length / CHARS_PER_LINE)), 0)
  if (lines > MAX_LINES) {
    const text = inner
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    console.warn(
      `⚠ Home page card text may wrap to ~${lines} lines on a narrow phone (limit ${MAX_LINES}): "${text}"`
    )
  }
}
