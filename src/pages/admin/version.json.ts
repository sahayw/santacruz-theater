// /admin/version.json — a fingerprint of the editor's code: everything under public/admin
// plus the src/lib modules it loads. Data saves rebuild the site but don't change it, so
// only a code release does. The editor compares it with the one it loaded and asks for a
// reload when they differ (public/admin/api.js), so an old tab can't save with old code.
import type { APIRoute } from 'astro'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SOURCES = ['public/admin', 'src/lib', 'src/pages/admin']

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]))
    .sort()
}

export const GET: APIRoute = () => {
  const hash = createHash('sha256')
  for (const file of SOURCES.flatMap(filesUnder)) hash.update(file).update(readFileSync(file))
  return new Response(JSON.stringify({ version: hash.digest('hex').slice(0, 16) }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
