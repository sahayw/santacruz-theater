/// <reference types="vite/client" />
import type { APIRoute } from 'astro'
import source from '../../lib/audition-format.ts?raw'

export const GET: APIRoute = () => {
  const js = source
    // Remove TypeScript import lines
    .replace(/^import type .+\n?/gm, '')
    // Remove ": TypeName" and ": TypeName[]" type annotations from function parameter lists.
    // Safe because audition-format.ts has no type annotations inside function bodies.
    .replace(/:\s*[A-Za-z]\w*(?:\[\])?(?=[,\)\s])/g, '')
  return new Response(js, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
  })
}
