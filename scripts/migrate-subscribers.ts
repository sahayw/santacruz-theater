/**
 * One-off: tags every existing subscriber `auditions-events`, so they keep getting what
 * they get today once the digests send by list. Subscribers already on a list are left
 * alone, so it's safe to run again. Run once at go-live, before the first digest.
 *
 *   BUTTONDOWN_API_KEY=… npx tsx scripts/migrate-subscribers.ts           # report only
 *   BUTTONDOWN_API_KEY=… npx tsx scripts/migrate-subscribers.ts --apply   # tag them
 *
 * See docs/notifications-spec.md ("Sending").
 */

import { buttondown } from '../netlify/functions/lib/buttondown.mts'
import { listsFromTags } from '../src/lib/email-lists.ts'

const apply = process.argv.includes('--apply')
const bd = buttondown()

const subscribers = await bd.listSubscribers()
const untagged = subscribers.filter((s) => !listsFromTags(s.tags).length)
console.log(`${subscribers.length} subscribers; ${untagged.length} not on a list yet`)

if (!apply) {
  console.log('Report only — run with --apply to tag them auditions-events.')
  process.exit(0)
}

let done = 0
for (const s of untagged) {
  await bd.updateSubscriber(s.id, { tags: [...s.tags, 'auditions-events'] })
  if (++done % 25 === 0) console.log(`  ${done}/${untagged.length}`)
}
console.log(`Tagged ${done} subscribers auditions-events.`)
