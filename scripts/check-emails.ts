/**
 * Renders every email (scripts/email-samples.ts: live data plus edge cases) and checks the
 * HTML for what breaks in email clients: leftover template values ("undefined", "NaN"),
 * <style> or <script> (inline styles only), unbalanced tags, a body wider
 * than 580px, links that aren't absolute or a Buttondown token, and a size that Gmail would
 * clip (over ~100 KB). Run by `npm run check`.
 */
import { pathToFileURL } from 'node:url'
import { buildSamples } from './email-samples.ts'

const MAX_BYTES = 100 * 1024
const TOKENS = ['{{ subscriber.id }}', '{{ unsubscribe_url }}']
const PAIRED = ['div', 'table', 'tr', 'td', 'span', 'a', 'ul', 'li', 'b', 'strong', 'em', 'i']

/** Problems found in one rendered email; empty when it's fine. */
export function emailProblems(html: string): string[] {
  const problems: string[] = []
  const text = html.replace(/<[^>]*>/g, ' ')
  for (const bad of ['undefined', 'NaN', '[object', 'null'])
    if (new RegExp(`\\b${bad.replace('[', '\\[')}`).test(text)) problems.push(`shows "${bad}"`)
  if (/<style|<script/i.test(html)) problems.push('uses <style> or <script>')
  if (!html.includes('max-width:580px')) problems.push('is not capped at 580px')
  if (Buffer.byteLength(html) > MAX_BYTES)
    problems.push(`is ${Math.round(Buffer.byteLength(html) / 1024)} KB — Gmail clips over ~100 KB`)
  for (const m of html.matchAll(/\{\{[^}]*\}\}/g))
    if (!TOKENS.includes(m[0])) problems.push(`has an unknown token ${m[0]}`)
  for (const m of html.matchAll(/href="([^"]*)"/g)) {
    const url = m[1].replace(/&amp;/g, '&')
    if (!/^https:\/\//.test(url) && !TOKENS.some((t) => url.includes(t)) && !/^mailto:/.test(url))
      problems.push(`has a link that isn't absolute: "${url}"`)
  }
  for (const tag of PAIRED) {
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length
    const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length
    if (open !== close) problems.push(`has ${open} <${tag}> but ${close} </${tag}>`)
  }
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const samples = buildSamples()
  let failed = 0
  for (const { name, html } of samples)
    for (const p of emailProblems(html)) {
      console.error(`✖ ${name}: ${p}`)
      failed++
    }
  if (failed) process.exit(1)
  console.log(`✔ ${samples.length} sample emails render cleanly`)
}
