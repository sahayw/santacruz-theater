# ICS Calendar Feeds — Spec

Status: **approved design, not yet implemented.** Revised 2026-10-14 from the
original August draft. Replaces the Google Calendar sync, which was removed
in `bda183f`. That commit's parent still has the old event-building code for
reference.

## Goal

Publish standards-compliant iCalendar (RFC 5545) feeds of performances and
activity sessions, so people can subscribe from Apple Calendar, Google
Calendar, Outlook or any other client, or download a one-off snapshot. The
site's JSON data stays the only source of truth. No calendar service is
written to.

## Decisions

| Decision             | Choice                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Google Calendar copy | Dropped for good. No Google publisher, now or later.                                                                                     |
| Generation           | **Build time.** Static `.ics` files in `dist/`, written by Astro endpoints. No Netlify Functions.                                        |
| Caching              | Netlify's CDN: ETag / `If-None-Match` → 304 on static files. No caching code.                                                            |
| Company filter       | A pre-built file per company (`/runs/company/{id}.ics`), not a query parameter.                                                          |
| `/events` page       | Keeps its name. The `/events` → `/activities` rename is separate work, not part of this.                                                 |
| Event identity       | New persisted occurrence ids: `perf-<epoch-ms>` on `Performance` and `session-<epoch-ms>` on `ActivityDate`.                             |
| Serializer           | Hand-written in `src/lib/ics.ts` (~150 lines) and checked with an independent parser (`ical.js`). See [Open questions](#open-questions). |
| Tests                | vitest, run inside `npm run check`, on fixture data only.                                                                                |

## Terminology

- **Run**: a company's scheduled set of performances of a work (`Run`). The
  public feed namespace uses "runs". Internal names (`data/shows/`,
  `getShows()`, `check-shows.ts`) still say "show" and are **not** renamed.
- **Performance**: one date/time in a run.
- **Activity**: an audition or event (`Activity`). **Session**: one
  `ActivityDate` within it.
- **Calendar event**: one published `VEVENT`. This is unrelated to
  `Activity.type === 'event'`.

## Feeds

| Path                     | Contents                                                | `X-WR-CALNAME`                                           |
| ------------------------ | ------------------------------------------------------- | -------------------------------------------------------- |
| `/runs.ics`              | every run's performances                                | Santa Cruz Theater — Performances                        |
| `/runs/company/{id}.ics` | one company's performances (only companies with ≥1 run) | Santa Cruz Theater — Performances (&lt;company name&gt;) |
| `/runs/{id}.ics`         | one run's performances                                  | &lt;show title&gt; — &lt;company abbreviation&gt;        |
| `/activities.ics`        | sessions of every audition and event                    | Santa Cruz Theater — Auditions & Events                  |
| `/auditions.ics`         | sessions of auditions only                              | Santa Cruz Theater — Auditions                           |
| `/activities/{id}.ics`   | one activity's sessions                                 | &lt;activity title&gt;                                   |

`{id}` is the bare epoch from the record id, with the prefix stripped (`run-`,
`activity-`). This matches the existing `/events?id=` deep-link convention.
Company ids are used as-is. There is no `/events.ics`: non-audition events
alone aren't a useful subscription.

**Which events are included**

- **Window**: the composite and company feeds include occurrences dated from
  30 days before the build onward, matching the old sync. Per-record feeds
  include all of that record's occurrences, whatever their age.
- **Closed activities**: their sessions are left out of every feed. A closed
  activity's own feed is a valid, empty calendar.
- **Undated activities** (virtual auditions, events by request): these have no
  sessions, so they produce no calendar events.
- **Deleted records**: the per-record file disappears and returns 404. Clients
  keep or drop the last copy according to their own rules. Records are rarely
  deleted, since `closed` is the usual way to retire one.
- **Removed occurrences**: these simply vanish from the feed. Subscribed
  clients replace the whole calendar on each refresh, so the event disappears.
  No `STATUS:CANCELLED` is published, because we keep no deletion history.

**Freshness**: feeds are rebuilt on every deploy, which includes every editor
Save. Clients poll on their own schedule. Google polls roughly every 8–24
hours and offers no way to speed that up. The UI must not promise faster
updates.

## Occurrence ids

`Performance.id` (`perf-<epoch-ms>`) and `ActivityDate.id`
(`session-<epoch-ms>`) are persisted in the data files.

- Ids are never derived from date, time, array position or the parent id. They
  are never regenerated.
- The generator lives in `src/lib/occurrence-ids.ts`. It's served to `/admin`
  through the existing `browser-module.ts` pattern, as
  `src/pages/admin/occurrence-ids.js.ts`.
- The generator is **monotonic**: if `Date.now()` isn't greater than the last
  id it issued, it uses `last + 1`. The pattern generator and the paste
  importer create many rows in one go, and this keeps their ids unique.
- **Editors** (`calendar.js`, `activities.js`):
  - Every new row gets an id: Add row, pattern generator and paste importer in
    the calendar editor; Add row and the new-activity default row in the
    activities editor.
  - On **load**, before snapshots are taken, the editors also give an id to
    any row without one. Because this runs before the snapshot, adding ids
    doesn't count as a change. It doesn't mark the file dirty or bump an
    activity's `updatedAt`, so the digest doesn't report a spurious update.
    The ids are written with the user's next real save.
  - `isEmptyDateRow` must ignore `id`.
- **Migration**: `scripts/migrate-occurrence-ids.ts` is a one-off script, run
  with `npx tsx`. It isn't an npm script. It assigns ids to every row that
  lacks one and leaves everything else alone. In particular it **never touches
  `updatedAt`**: the digest reads that field, and touching it would send
  "updated" emails for every activity. Running it a second time changes
  nothing.
- **Validation**:
  - `check-shows.ts` and `check-activities.ts` fail the build if an id is
    missing, malformed, or duplicated anywhere across all files.
  - This lives in the check scripts, not `data-rules.ts`. Per the header of
    `data-rules.ts`, id formats are structural checks that editors guarantee
    by construction.
- **Release race**: an editor page opened _before_ the deploy and saved
  _after_ it would write rows without ids, which fails the build. Recovery is
  to reload the editor and save, or to re-run the migration. Releasing at a
  quiet moment avoids it.
- Also check for any code that identifies a performance by run + date + time,
  and switch it to the id where that makes sense.

## Calendar event model

`src/lib/calendar-model.ts` contains pure functions with no Astro, DOM or `fs`
use, so they can be unit-tested directly.

```ts
interface CalendarEvent {
  uid: string; // `${occurrenceId}@santacruz.theater`
  kind: "performance" | "audition" | "event";
  sourceId: string; // the occurrence id
  parentId: string; // Run.id / Activity.id
  company: string;
  summary: string;
  description: string; // plain text
  location: string;
  url: string;
  start: { date: string; time: string }; // wall-clock, America/Los_Angeles
  end: { date: string; time: string };
  lastModified?: string; // ISO instant
}
```

Rules carried over from the old sync:

- **Performances**
  - Summary: `{showAbv || show} — {company name}`.
  - End time: start + 2 hours, since performances have no end time.
  - Location: `run.venue`, looked up by name or code in
    `sc-theater-venues.json` and formatted as `Name · Address`. If there's no
    match, the raw text is used.
- **Sessions**
  - Summary: `Audition: {title} — {org}` or `Event: {title} — {org}`. `{org}`
    is `organizerName` when the company is `other`, otherwise the company name.
  - End time: `endTime` if set, otherwise start + 2 hours.
  - Location: `ActivityDate.location` (the address, or the name looked up as a
    venue). Otherwise the company's `primaryVenue`.
- **Description**: plain text. Markdown is converted with a new `mdToPlain()`
  in `src/lib/audition-format.ts`, kept beside `renderMd()` so Markdown
  handling stays in one module:
  - bold and italic markers are removed;
  - `[text](url)` becomes `text (url)`;
  - `- item` becomes `• item`.
- **Description contents**
  - Performances: perf type (Opening, Preview, and so on), the run
    description, price, discounts and the tickets link.
  - Auditions: a summary of the roles, then the session notes.
  - Events: the description (or brief description), then the session notes.
- **URL property**
  - Performances: `https://santacruz.theater/runs?id={id}`. This page arrives
    in phase C; see [Phases](#phases).
  - Sessions: `https://santacruz.theater/events?id={id}`.

## ICS output (`src/lib/ics.ts`)

- `VCALENDAR` contains:
  - `VERSION:2.0`
  - `PRODID:-//santacruz.theater//Calendar Feeds//EN`
  - `CALSCALE:GREGORIAN`
  - `METHOD:PUBLISH`
  - `X-WR-CALNAME`
  - `X-WR-TIMEZONE:America/Los_Angeles`
  - advisory refresh hints: `REFRESH-INTERVAL;VALUE=DURATION:PT12H` and
    `X-PUBLISHED-TTL:PT12H`
- One fixed `VTIMEZONE` for America/Los_Angeles, using the US daylight-saving
  rules in force since 2007.
- `DTSTART;TZID=America/Los_Angeles:YYYYMMDDTHHMMSS`, and the same form for
  `DTEND`.
- Text values: escape `\` `;` `,` and newlines.
- Lines are folded at 75 **octets**, not characters, without splitting a
  UTF-8 multibyte sequence. Line endings are CRLF.
- Events are sorted by start time, then uid, so unchanged data gives
  byte-identical output.
- **`DTSTAMP` / `LAST-MODIFIED` never use the build time.** Otherwise every
  event would look changed on every deploy.
  - Activities: `activity.updatedAt`.
  - Runs: a new optional `Run.updatedAt`, set by the calendar editor on Save
    for runs that changed, the same way `activities.js` does it. If it's
    missing, the creation time is taken from the epoch in `run.id`.
  - `SEQUENCE` is omitted. Subscribed clients ignore it, and a value that
    doesn't always increase would be worse than none.
- Content-Type: `text/calendar; charset=utf-8`, set by a `[[headers]]` rule
  for `/*.ics` in `netlify.toml`.

## Build-time endpoints

Astro static endpoints (`GET` + `getStaticPaths`), each a thin wrapper around
`calendar-model.ts` + `ics.ts`:

```
src/pages/runs.ics.ts
src/pages/runs/[id].ics.ts
src/pages/runs/company/[company].ics.ts
src/pages/activities.ics.ts
src/pages/activities/[id].ics.ts
src/pages/auditions.ics.ts
```

`src/lib/data.ts` gains venue and company loaders as needed (`getVenues()`,
`getCompanies()`).

## Website UI (phase C)

**Add to Calendar** is one button that opens a small dialog. Every action uses
the same feed URL:

- **Apple / Outlook**: a `webcal://` link.
- **Google Calendar**: `https://calendar.google.com/calendar/r?cid=<encoded https URL>`.
- **Copy link**: the plain `https://…ics` URL, for any other client.
- **Download .ics**: a `download` anchor. This gives a one-off snapshot that
  won't update.

The dialog must make the difference between subscribing (stays updated) and
downloading (a one-off copy) clear. It should also mention that Google can
take up to a day to pick up changes.

The button appears in these places:

- **`/calendar`**: next to the filter bar.
  - The dialog has its own Company selector. It is _not_ tied to the page's
    live filters, and offers the same companies as `#filterCompany`.
  - "All" builds `/runs.ics`; a company builds `/runs/company/{id}.ics`.
  - Genre and time-of-day are not offered as feed filters.
- **The calendar's per-date show card**: uses that run's `/runs/{id}.ics`.
- **`/runs?id={id}`**: uses `/runs/{id}.ics`.
- **`/events`**: near the email-subscribe banner, with two choices: All
  (`/activities.ics`) or Auditions only (`/auditions.ics`).
- **`/events?id={id}`**: uses `/activities/{id}.ics`.

**New `/runs` page** (`src/pages/runs.astro`):

- It works like `/events`: an index, client-side filtering, and a `?id=` deep
  link.
- `?id=` shows the run's **full** performance schedule. Each row shows any
  per-performance perf type, discounts or ticket link that differs from the
  run's.
- It is **not** in the nav or on the home page. It exists as the target of
  feed `URL` properties.

**Calendar editor Preview** is extended to show the run's full schedule,
matching `/runs?id=`.

## Testing

**Unit tests** (vitest, `tests/`, fixtures in `tests/fixtures/`, run by
`npm run check`). Fixtures are fixed sample files, so editor saves can never
break these tests.

- **Id generator**: ids are monotonic within one generator, and a burst of
  1,000 ids is unique.
- **Migration**:
  - every row gets an id;
  - a second run makes no changes;
  - `updatedAt` and all other fields are byte-for-byte unchanged.
- **Event model**:
  - summary, location (venue lookup and fallbacks), end time and URL for each
    kind;
  - the UID stays the same after a date or time edit;
  - feed filtering: runs only, activities only, auditions only, single
    record, single company, the 30-day window, closed activities.
- **ICS**:
  - escaping and multi-line descriptions;
  - folding with multibyte characters;
  - CRLF line endings;
  - output is byte-identical across repeated runs;
  - a changed source record changes only its own event;
  - each output parses with `ical.js`;
  - events on either side of the DST changes (1 Nov 2026, 14 Mar 2027)
    convert to the correct UTC instant.
- **`mdToPlain()`**: bold, italic, links and lists.

**Build checks**

- `check-shows.ts` / `check-activities.ts`: occurrence ids are present,
  well-formed and unique.
- `scripts/check-feeds.ts` runs after `astro build`. It parses every
  `dist/**/*.ics` file with `ical.js`, so real data with odd characters is
  checked on every deploy.

**Migration equivalence (one-time)**

- Build `dist/` before and after the migration and diff the two. Ids aren't
  rendered anywhere, so the diff must be empty, apart from `/admin` assets if
  those changed.

**Manual (per phase, on a Netlify deploy preview, which Google can reach)**

- Subscribe in Apple Calendar, Google Calendar and Outlook.
- Edit a performance time: the event should move, not duplicate.
- Delete a performance: the event should disappear.
- Check the times on a date after the daylight-saving change.

## Phases

Each phase is merged to the `ics-feeds` branch, and then to `dev`, once you've
tested it. Phases B and C are released to `main` together. Phase B's
performance `URL`s point at `/runs`, which only exists after phase C.

| Phase | Work                                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A     | vitest setup; `occurrence-ids.ts` and its admin route; editor assignment and load-time backfill; `Run.updatedAt` in the calendar editor; migration script; check-script rules; types; docs. Can be released alone. |
| B     | `mdToPlain()`, `calendar-model.ts`, `ics.ts`, the endpoints, the `netlify.toml` header, `check-feeds.ts`, tests; checked with real clients on a deploy preview (unlinked).                                         |
| C     | `/runs` page, the Add to Calendar dialog and its placements, the editor Preview's full schedule.                                                                                                                   |
| D     | Final docs pass (`implementation.md`, `feature-guide.md`, CLAUDE.md); drop the old `ICS spec` stash.                                                                                                               |

Every phase updates `docs/implementation.md` §3 (schemas) and
`docs/feature-guide.md` for whatever it ships, per CLAUDE.md.

## Open questions

1. **Serializer: hand-written or a library?** The recommendation is
   hand-written.
   - The parts that need care are escaping, folding, a fixed `VTIMEZONE` and
     deterministic ordering. These come to about 150 lines, are fully
     unit-tested and are checked with `ical.js`.
   - The library option is `ical-generator`. It is maintained, but it needs
     its timestamp default overridden and a timezone plugin to produce
     `VTIMEZONE`.
2. **`Run.updatedAt`.** This adds a field to the run schema, so a run's
   `LAST-MODIFIED` reflects real edits. The alternative is to use only the
   creation time from the id, which would not change when a run is edited.
