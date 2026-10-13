# Implementation Reference

How the system is built. For what it does, see
[`feature-guide.md`](feature-guide.md); for the Google Calendar mirror
specifically, see [`google-calendar-sync.md`](google-calendar-sync.md)
(kept separate — still under active development).

## Contents

1. [Stack & architecture](#1-stack--architecture)
2. [Repository layout](#2-repository-layout)
3. [Data files & schemas](#3-data-files--schemas)
4. [Data flow](#4-data-flow)
5. [The `/admin` SPA](#5-the-admin-spa)
6. [Shared front-end logic](#6-shared-front-end-logic)
7. [Netlify functions](#7-netlify-functions)
8. [Email notifications](#8-email-notifications)
9. [Validation scripts](#9-validation-scripts)
10. [Local development](#10-local-development)
11. [Environment variables](#11-environment-variables)
12. [Build, deploy & branch workflow](#12-build-deploy--branch-workflow)
13. [Design notes](#13-design-notes)

---

## 1. Stack & architecture

Astro 6, static output, TypeScript strict mode, no UI framework — plain
Astro components and vanilla client-side JS. Deployed to Netlify. All
public-page data is compiled at **build time** from JSON files in `data/`;
there is no runtime database. The `/admin` editors write back to those same
JSON files (via GitHub in production, directly on disk in local dev — see
[§4](#4-data-flow)), and every write triggers a Netlify rebuild, which is
the site's only publish mechanism.

The site is a hub-and-spoke: `/` links to four sections (`/calendar`,
`/companies`, `/events`, `/services`) plus `/about`; `SiteNav.astro` is
shared across all of them.

## 2. Repository layout

```
src/
  components/     calendar.astro (calendar UI), SiteNav.astro
  layouts/        page layout wrappers
  pages/          file-based routes — index, calendar, companies, events,
                  subscribe, services, about, admin/audition-format.js.ts
  lib/
    data.ts             build-time data loading (import.meta.glob)
    audition-format.ts  shared formatting — Astro + functions + browser
  types.ts        shared TypeScript interfaces
  styles/         global CSS
data/             canonical data files — see §3
public/
  admin/          the editor SPA (served at /admin)
  images/companies/, images/services/   locally stored images
netlify/
  functions/      serverless functions — see §7
scripts/          check-json.ts, check-shows.ts, check-activities.ts,
                  sync-branches.sh, release.sh
docs/             feature-guide.md, implementation.md (this file),
                  google-calendar-sync.md
astro.config.mjs  minimal — one dev-server redirect, see §10
netlify.toml      build command, included_files, headers
```

## 3. Data files & schemas

This section is the canonical source for every data shape in the system —
if a field's meaning is unclear elsewhere, it's defined here.

### Companies — `data/sc-theater-companies.json`

Hand-editable. Top-level shape: `{ "companies": [ <CompanyEntry>, ... ] }`.

| Field          | Type                  | Notes                                                             |
| -------------- | --------------------- | ----------------------------------------------------------------- |
| `id`           | `string`              | kebab-case slug, e.g. `"scs"`                                     |
| `abvName`      | `string`              | short label used in selectors and chips                           |
| `name`         | `string`              | full company name                                                 |
| `primaryVenue` | `string?`             | display string                                                    |
| `venueCode`    | `string?`             | code from the venue list, or a custom string                      |
| `website`      | `string?`             |                                                                   |
| `logo`         | `string?`             | local path, e.g. `/images/companies/scs-logo.png`                 |
| `logoDark`     | `boolean?`            | `true` if the logo needs a dark card background                   |
| `editors`      | `{email,datasets}[]?` | grants each email access to the listed dataset keys               |
| `adminOnly`    | `boolean?`            | `true` for the sentinel entries below; excluded from `/companies` |

The first entry (`id: "admin"`, `adminOnly: true`) is a sentinel — its
`editors` array is who has site-wide admin access, not a real company. An
`id: "other"` sentinel (`adminOnly: true`) holds runs/activities for
companies with no individual listing; editable by admins only, no
corresponding public Companies entry.

**Entry order determines display order** in company filter dropdowns (no
sort is applied) — keep `admin` first, `other` last. The `/admin` editor's
own selectors (`buildCompanyOptions()` in `api.js`) sort independently by
`abvName`, `other` last, so JSON order doesn't affect them.

### Venues — `data/sc-theater-venues.json`

Each entry: `{ code, name, address, website }`. Drives venue autocomplete in
both the Calendar and Activities editors. `Run.venue` (below) stores the
venue **name** from this list, or `"Other"` for an unlisted venue.

### Shows — `data/shows/<year>/<company-id>-<year>.json`

One file per company per year. Top-level: `{ company, year, runs: [<Run>] }`.

#### `Run`

| Field          | Type            | Notes                                                                                                           |
| -------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| `id`           | `string`        | `"run-<timestamp>"`, editor-assigned                                                                            |
| `company`      | `string`        | the company's `abvName`                                                                                         |
| `showAbv`      | `string`        | short label for calendar chips                                                                                  |
| `show`         | `string`        | full title                                                                                                      |
| `description`  | `string?`       | supports bold, italic, `[text](https://url)` links, and `-` bullet lists                                        |
| `genre`        | `Genre[]`       | up to 2 of `Drama \| Musical \| Comedy \| Other`; legacy single-string values coerced to a 1-item array on read |
| `venue`        | `string`        | name from the venue list, or free text                                                                          |
| `price`        | `string`        | e.g. `"$72-$92"`                                                                                                |
| `discounts`    | `string`        | default, overridable per performance                                                                            |
| `infoUrl`      | `string`        |                                                                                                                 |
| `ticketsUrl`   | `string`        | default, overridable per performance                                                                            |
| `performances` | `Performance[]` | ordered                                                                                                         |

#### `Performance`

`{ date: "YYYY-MM-DD", time: "HH:MM" (24h), perfType: "" | Preview | Opening
| Closing | Talk-back, discounts, ticketsUrl }` — non-empty `discounts` /
`ticketsUrl` override the run's default.

`getPerformances()` in `src/lib/data.ts` flattens every run's performances
into a sorted `PerformanceEvent[]` (run metadata merged onto each
performance, overrides resolved), sorted by date then time.

### Activities — `data/activities/<year>/<company-id>-activities-<year>.json`

One file per company per year. Top-level: `{ company, year, activities:
[<Activity>] }`. Covers both auditions and other events under one schema.

#### `Activity`

| Field                            | Type                    | Notes                                                                                 |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `id`                             | `string`                | `"activity-<timestamp>"`, editor-assigned                                             |
| `type`                           | `'audition' \| 'event'` | set at creation, immutable in the editor                                              |
| `title`                          | `string`                | production name or event title                                                        |
| `briefDescription`               | `string?`               | **event only** — collapsed-card blurb                                                 |
| `description`                    | `string?`               | **event only** — expanded description; supports bold, italic, links, and bullet lists |
| `genre`                          | `Genre[]`               | **audition only**                                                                     |
| `dates`                          | `ActivityDate[]`        | ordered sessions, each with its own location                                          |
| `organizerName` / `organizerUrl` | `string?`               | used when `company` is `"other"`                                                      |
| `rolesAvailable`                 | `AuditionRole[]?`       | **audition only**, suppressed when empty                                              |
| `prep`                           | `AuditionPrep?`         | **audition only** — `{ acting?, singing?, dance?, bring? }`                           |
| `virtualSubmission`              | `boolean?`              | **audition only** — see below                                                         |
| `datesByRequest`                 | `boolean?`              | **event only** — allows no scheduled dates; remains upcoming until closed             |
| `closed`                         | `boolean?`              | either type — see below                                                               |
| `rehearsalStart` / `openingDate` | `string?`               | **audition only**, `YYYY-MM-DD`                                                       |
| `productionId`                   | `string?`               | **audition only** — soft ref to a `Run.id`, not exposed in the editor                 |
| `cost`                           | `string?`               | **event only**                                                                        |
| `registerUrl`                    | `string?`               | **event only**                                                                        |
| `contact`                        | `ActivityContact?`      | `{ name?, email?, phone? }`                                                           |
| `noticeUrl`                      | `string?`               | primary info link                                                                     |
| `productionUrl`                  | `string?`               | **audition only**                                                                     |
| `notes`                          | `string?`               | **audition only** — full-width; supports bold, italic, links, and bullet lists        |
| `createdAt` / `updatedAt`        | `string`                | ISO 8601                                                                              |

`virtualSubmission: true` lifts the "must have at least one date" rule for
an audition (in both the editor and `check-activities.ts`) and makes the
record always "upcoming" (see [§8](#8-email-notifications) and the `/events`
filter logic) regardless of dates — an optional deadline row is still
allowed and, if present, is shown normally. `datesByRequest: true` allows an
event to omit scheduled dates; it displays "On request" and remains upcoming
until closed. `closed: true` (either type) excludes a record from "upcoming"
without deleting it, and is reversible from the editor. See
[§6](#6-shared-front-end-logic) for the full "upcoming" rule.

#### `ActivityDate`

`{ date: "YYYY-MM-DD", startTime: "HH:MM", endTime?: "HH:MM", notes?,
location?: { name, address? } }`. Location is per-date, since sessions of
one activity can be at different venues.

#### `AuditionRole`

`{ role: string, type: 'lead'|'supporting'|'ensemble', gender:
'female'|'male'|'any', ageRange?: string, voicePart?: string (Musical
only), description?: string }`.

#### Data access

`getActivities()` in `src/lib/data.ts` compiles every
`data/activities/**/*.json` file via `import.meta.glob` into a flat, sorted
`ActivityEvent[]` (activity + `company` + `year`).

### Services

`data/sc-theater-service-categories.json` (hand-editable hierarchy) +
`data/sc-theater-services.json` (flat listings file, edited via `/admin`).

#### `ServiceCategory` / `ServiceSubcategory`

Category: `{ id, label, subcategories: ServiceSubcategory[] }`.
Subcategory: `{ id, label, description? }` — `description`, when set, is
the pill text shown on listing cards (falls back to `label`). Listings
store only leaf-level subcategory ids, never a top-level category id.

#### `ServiceListing`

| Field                     | Type             | Notes                                                           |
| ------------------------- | ---------------- | --------------------------------------------------------------- |
| `id`                      | `string`         | `"service-<timestamp>"`                                         |
| `name`                    | `string`         |                                                                 |
| `categories`              | `string[]`       | one or more subcategory ids                                     |
| `contact`                 | `ServiceContact` | `{ name?, tel?, email?, address? }` — at least `tel` or `email` |
| `photo`                   | `string?`        | local path under `public/images/services/`                      |
| `url`                     | `string?`        |                                                                 |
| `description`             | `string?`        | supports bold, italic, links, and bullet lists                  |
| `active`                  | `boolean`        | `false` hides it from public pages without deleting it          |
| `createdAt` / `updatedAt` | `string`         | ISO 8601                                                        |

`getServiceCategories()` / `getServices()` in `src/lib/data.ts` import both
files at build time.

### `Genre`

Hard-coded: `Drama | Musical | Comedy | Other`. Up to 2 per record via a
multi-select (selecting a third deselects the oldest). Stored as an array;
legacy single-string values are coerced to a 1-item array on read.

---

## 4. Data flow

**Build time**: `src/lib/data.ts` globs every JSON file under `data/` via
Vite's `import.meta.glob` and exposes typed accessors (`getPerformances()`,
`getActivities()`, `getServiceCategories()`, `getServices()`). Astro pages
call these directly; there is no client-side data fetching on the public
site.

**Editor writes**: `public/admin/*.js` talk to `netlify/functions/data.mjs`
(JSON files) and `upload-image.mjs` (service photos) over
`/.netlify/functions/*`.

- **In production**: both functions read/write via the **GitHub Contents
  API** and require a valid Netlify Identity JWT on writes
  (`context.clientContext.user`, populated automatically by Netlify — no
  manual validation needed). Every write is a commit, which triggers the
  rebuild that publishes it.
- **Under `netlify dev`** (`process.env.NETLIFY_DEV === 'true'`): both
  functions switch to a **local filesystem mode** instead — every
  GET/PUT/`?dir=` request reads and writes the working-tree `data/` (or
  `public/images/services/`) directly, no GitHub API call and no Identity
  check. PUT bodies are written verbatim, byte-identical to what a
  production commit would contain, so an unwanted local save is just
  `git checkout` away. See [§10](#10-local-development).

**Function-side reads**: `netlify/functions/lib/activities-data.mts` (used
by the email functions) and the Google Calendar sync's `lib/shows-data.mts`
/ `lib/venues-data.mts` / `lib/company-data.mts` read the same `data/`
files directly via Node `fs` at request time — not through GitHub, not
through `import.meta.glob` (which is Vite-only and doesn't work inside
esbuild-bundled functions). For these files to exist in the deployed
function bundle they're listed under `[functions].included_files` in
`netlify.toml`. This means function reads are current as of the last
deploy, not real-time — acceptable lag for data that changes at most a few
times a day.

## 5. The `/admin` SPA

- `public/admin/index.html` — login overlay (production only — `localhost`
  skips auth entirely, full admin access, all tiles visible), the hub
  (dataset tiles), routing.
- `public/admin/api.js` — shared `apiFetch` / `apiPut` / `apiUploadImage` /
  `resolveUserAccess()` / `buildCompanyOptions()`.
- `public/admin/calendar.js`, `activities.js`, `services.js` — one ES module
  per editor, each exporting `mount(container, context)` / `unmount()`.

**Auth**: the Netlify Identity widget is pinned to
`https://santacruz.theater/.netlify/identity` (`APIUrl`) so sign-in works
correctly regardless of which Netlify URL actually served the page
(prevents 400s on preview/branch deploys). After login,
`resolveUserAccess(email, companies)` looks the email up across every
`CompanyEntry.editors` array (checking the `admin` sentinel first) and
returns which datasets that person may edit; the hub renders one tile per
match. The Identity widget is also loaded on the home page
(`src/pages/index.astro`) so invite and password-reset links, which arrive
as `#invite_token` / `#recovery_token` URL fragments, are processed
correctly — the personal Netlify plan doesn't support custom email
templates that could point those links elsewhere.

Each editor module follows the same shape: a company/year selector (admin
sees a company dropdown; a scoped editor goes straight to their company's
years), a resizable record sidebar that's blank until a file loads, a
record form with Preview/Restore/Delete (Activities also has Close/Reopen),
and a Save that PUTs the whole file.

## 6. Shared front-end logic

**Date/time normalization** — implemented per-editor (`normalizeDate()` /
`normalizeTime()` in `activities.js`; `parseDate()` for the Calendar
editor's paste panel; the accepted-format tables are user-facing and live
in [feature-guide.md §7](feature-guide.md#7-shared-editing-conventions)).
Validation (impossible dates, out-of-range hours/minutes, dates outside
`currentYear ± 1`) highlights the offending cell immediately; a full
required-field + date-count scan runs on Save and blocks it with a
specific error list. The Calendar editor requires every performance to
have a date; the Activities editor requires every record to have at least
one date row except `virtualSubmission` auditions and `datesByRequest`
events — `collectErrors()` in `activities.js` and `scripts/check-activities.ts`
both apply those exceptions, and must be kept in sync if the rule ever changes.

**The "upcoming" rule** — defined once conceptually, implemented in three
places that must agree: `closed` is never upcoming; virtual auditions with
no scheduled dates and events with `datesByRequest` and no scheduled dates
are always upcoming; otherwise upcoming means the latest `dates[].date` is ≥
today. Implementations: the `/events` client-side
filter (`src/pages/events.astro`), `isUpcoming()` in
`netlify/functions/lib/activities-data.mts` (digest + welcome email), and
the editor's own Preview modal.

**`src/lib/audition-format.ts`** — pure functions, no Astro or DOM
dependency: `fmt12`, `fmtTimeRange`, `fmtFullDate`, `fmtShortDate`,
`fmtAudDateRange`, `rolesSum`, `renderMd` (HTML-escapes, then converts
bold, italic, `[text](https://url)` links, and unordered bullet lists). This
is the single source of truth for rich-text display across activities,
calendar entries, and services, consumed by:

- `src/pages/events.astro` — imported directly at build time
- `netlify/functions/send-digest.mts` — resolved via esbuild bundling
- `netlify/functions/sync-calendar-background.mts` — also esbuild-bundled;
  wraps `renderMd()` in a local `mdToHtml()` that additionally turns
  literal newlines into `<br>`, since Calendar's HTML description field
  otherwise collapses multi-line notes
- `public/admin/activities.js` — imports it at runtime from
  `/admin/audition-format.js`, a browser ES module generated by
  `src/pages/admin/audition-format.js.ts` (Vite `?raw` + two regexes strip
  TypeScript syntax from the source). Never hand-maintain a duplicate file
  at `public/admin/audition-format.js`.
- `public/admin/calendar.js` and `public/admin/services.js` — use the same
  generated browser module for Preview rendering.
- `src/pages/services.astro` and the client script in
  `src/components/calendar.astro` — import the same formatter directly.

**Card display has four rendering paths that must be kept in sync** when
changing what an activity card shows: (1) the public `events.astro`
template, (2) the deep-link view (reuses the same Astro HTML —
automatic), (3) `buildPreviewHtml()` in `activities.js`, (4)
`netlify/functions/lib/email-template.mts`. Rich-text fields must use
`renderMd()` in both Preview and public display; do not add local Markdown
renderers. The shared admin toolbar in `public/admin/markdown-editor.js`
provides bold, italic, link, and bullet-list controls and Ctrl/Cmd+B/I
shortcuts for every rich-text textarea.

**Layout note**: both the public detail grid (`.detail-grid` in
`events.astro`) and the editor's Preview modal (`.pv-detail-grid` in
`activities.js`) are 2-column grids whose right column is conditionally
rendered (roles / description). Each has a
`:not(:has(.detail-right))`-style rule collapsing to one full-width column
when that column is absent — needed for anything with no roles, most
visibly a virtual-submission audition.

## 7. Netlify functions

New functions use the **v2 interface**
(`export default async (req: Request) => ...` + `export const config`) —
`subscribe.mts` and `sync-calendar-trigger.mts` / `sync-calendar-background.mts`
follow this. `send-digest.mts` and `data.mjs` are legacy-style
(`export const handler = schedule(...)`) and are not being migrated
proactively.

| Function                                                            | Purpose                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `data.mjs`                                                          | data read/write endpoint — see [§4](#4-data-flow) for its two modes             |
| `upload-image.mjs`                                                  | services-editor photo upload — same two-mode pattern                            |
| `fetch-page.mjs`                                                    | page-fetch proxy (currently unused by any active editor feature)                |
| `subscribe.mts`                                                     | Buttondown subscription handler + welcome email — see §8                        |
| `send-digest.mts`                                                   | scheduled daily digest — see §8                                                 |
| `sync-calendar-trigger.mts` / `sync-calendar-background.mts`        | Google Calendar sync — see [`google-calendar-sync.md`](google-calendar-sync.md) |
| `lib/email-template.mts`                                            | inline-styled digest + welcome email HTML                                       |
| `lib/activities-data.mts`                                           | shared local activity data loading — see §8                                     |
| `lib/shows-data.mts`, `lib/venues-data.mts`, `lib/company-data.mts` | fs-based loaders for the calendar sync                                          |
| `lib/google-calendar.mts`                                           | Google Calendar API client                                                      |

## 8. Email notifications

Subscribers get a one-off **welcome email** on signing up and a
**daily digest** afterward. Delivered via **Buttondown**, which handles
subscriber management, unsubscribe compliance, and delivery; subscribers
are added with `type: "regular"` (no double opt-in).

### Data access

`netlify/functions/lib/activities-data.mts` is the single source of truth
for reading activity data in serverless functions — reads
`data/activities/**/*.json` and the companies file directly via Node `fs`
(see [§4](#4-data-flow) on why, and the `included_files` requirement).
Exports `loadAllActivities()`, `isUpcoming()` (the shared "upcoming" rule,
[§6](#6-shared-front-end-logic)), `getUpcomingActivities()` /
`getUpcomingAuditions()` / `getUpcomingEvents()`, and
`classifyForDigest(activities, lastSent)`. Both email functions import from
it; don't duplicate this logic or reintroduce GitHub API calls for it.

### Subscription — `subscribe.mts`

Netlify Functions v2. Accepts `{ email }`, POSTs to Buttondown's
subscribers endpoint, and returns a message for each outcome (201 new,
409/422 already subscribed, 400/5xx error). The submit button disables
while in flight. On 201, `context.waitUntil()` schedules the welcome-email
flow after the HTTP response is already sent — the visitor waits only the
~2.5s subscriber POST, not the full welcome-email send. Widget appears on
`/events` (hidden in deep-link/not-found modes) and on `/subscribe`.

### Welcome email

Two Buttondown calls: `POST /v1/emails` creates a disposable email
(`status: "transactional"`) with the rendered HTML, then
`POST /v1/subscribers/{id_or_email}/emails/{email_id}` sends it to just the
new subscriber — this avoids draft-preview headers and Buttondown's
per-draft recipient limit. If the create call fails, the send is skipped.
Both calls have 8s timeouts. Failure logs the response body and pings
`SUBSCRIBE_HEALTHCHECK_URL/fail`; success pings the base URL. None of this
changes the user-facing response, since the subscription itself already
succeeded by the time this runs. Template: `buildWelcomeHtml(auditions,
events, baseUrl)` in `email-template.mts` — two headed sections (Upcoming
Auditions, Upcoming Events), each with a fallback line when empty.

### Scheduled digest — `send-digest.mts`

Runs at `0 2 * * *` (02:00 UTC, set in `netlify.toml`):

1. Read `last-sent` from Netlify Blob Storage (store `audition-notifications`,
   key `last-sent`; missing key → treat everything as new).
2. `loadAllActivities()` + `classifyForDigest()` →
   `{ newAuditions, updatedAuditions, newEvents, updatedEvents }` — **new**
   if `createdAt` > last-sent; **updated** if `updatedAt` > last-sent and
   `createdAt` ≤ last-sent.
3. All four empty → exit without touching the timestamp (still pings the
   healthcheck).
4. `EMAIL_DIGEST_DRY_RUN=true` → log what would send, touch nothing else.
5. POST to Buttondown (`status: "about_to_send"`).
6. Write the new timestamp only on success.
7. Ping `DIGEST_HEALTHCHECK_URL`.

**Why `createdAt`/`updatedAt` in the JSON, not file mtime**: git doesn't
preserve `mtime` on checkout and Netlify resets filesystem timestamps at
deploy time, so the JSON fields are the only reliable change signal. The
editor must keep writing `createdAt` on create and `updatedAt` on every
save that actually changed something — its dirty-check snapshots a record
on load and only advances `updatedAt` if the saved state differs, so
opening and re-saving a record unchanged doesn't generate a spurious
"Updated" entry.

**Why Blob Storage needs explicit credentials**: Netlify injects a
short-lived Blobs token automatically for on-demand functions but not for
scheduled ones — `getStore()` needs `siteID` + `token` supplied explicitly
via `NETLIFY_SITE_ID` / `NETLIFY_TOKEN`. The `schedule()` wrapper still
validates the invocation is a legitimate scheduler event; it doesn't inject
the Blobs context.

### Testing the digest

Prerequisites: Netlify CLI authenticated (`netlify login`) and linked
(`netlify link`).

```bash
# Negative test — should find nothing after a recent successful run
netlify functions:invoke send-digest --live

# Dry run — preview without sending or advancing the timestamp
netlify env:set EMAIL_DIGEST_DRY_RUN true
netlify deploy --trigger
netlify functions:invoke send-digest --live

# Real send — reset the timestamp, then invoke live
netlify env:unset EMAIL_DIGEST_DRY_RUN
netlify blobs:set audition-notifications last-sent "1970-01-01T00:00:00.000Z"
netlify deploy --trigger
netlify functions:invoke send-digest --live

# Inspect / manipulate the stored timestamp
netlify blobs:get audition-notifications last-sent
netlify blobs:set audition-notifications last-sent "2026-06-01T00:00:00.000Z"
netlify blobs:delete audition-notifications last-sent   # next run treats everything as new

# Logs
netlify functions:log send-digest --live
```

Configure the Healthchecks.io (or equivalent) check with a 24h period and
~2h grace, to allow for scheduling jitter — a missing ping always means
something went wrong, since it fires on every successful run including
"nothing to send."

| Symptom                           | Likely cause                                      |
| --------------------------------- | ------------------------------------------------- |
| `MissingBlobsEnvironmentError`    | `NETLIFY_SITE_ID` / `NETLIFY_TOKEN` not set       |
| `missing BUTTONDOWN_API_KEY`      | key not set or not deployed yet                   |
| Buttondown 401                    | API key invalid/revoked                           |
| Buttondown 429                    | rate limited; retries next scheduled run          |
| No healthcheck ping on success    | `DIGEST_HEALTHCHECK_URL` not set                  |
| Same records reappear next digest | Blob Storage write failed after send — check logs |

## 9. Validation scripts

`scripts/check-json.ts` (syntax), `check-shows.ts`, `check-activities.ts`
(schema + cross-field rules, including the virtual-submission dates
exception). Run together via `npm run check`, which also runs as the first
step of `npm run build` (Netlify's build command).

## 10. Local development

`npm run dev` **is** `netlify dev` (localhost:8888) — it serves the real
Netlify Functions, not just the Astro dev server, so the `/admin` editors
work fully offline. There's no separate `astro dev` / `astro preview`
script; use `npx astro dev` directly for the lighter server without
functions (the editor won't load or save data there — see below).

`data.mjs` and `upload-image.mjs` detect `NETLIFY_DEV=true` and switch to
the local filesystem mode described in [§4](#4-data-flow) — no GitHub API,
no Identity JWT, PUT bodies written verbatim. `astro.config.mjs` carries
exactly one Vite dev-server plugin: a redirect from `/admin` to `/admin/`,
needed because the Astro dev server that `netlify dev` proxies to serves
`index.html` at the bare `/admin` path, which breaks the editor SPA's
relative `import './api.js'` module references (production's default
pretty-URL redirect handles this automatically, so it's only a dev-server
gap). Everything else that a similar dev-proxy setup once did — serving
`public/admin/*.js`, mirroring `data.mjs` / `fetch-page.mjs` locally — is
now handled by `netlify dev` itself or by the functions' own local-fs mode,
so those plugins were removed.

For a full test of the deployed path (real Identity login, commit-to-branch,
rebuild), push a branch and use its Netlify branch-deploy URL.

## 11. Environment variables

Set in Netlify → Site configuration → Environment variables.

| Variable                             | Required | Used by                            | Purpose                                                                                                                       |
| ------------------------------------ | -------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`                       | yes      | `data.mjs`, `upload-image.mjs`     | fine-grained PAT, Contents read/write                                                                                         |
| `GITHUB_OWNER`                       | yes      | same                               | repository owner                                                                                                              |
| `GITHUB_REPO`                        | yes      | same                               | repository name                                                                                                               |
| `GITHUB_BRANCH`                      | no       | same                               | branch to commit to (default `main`)                                                                                          |
| `BUTTONDOWN_API_KEY`                 | yes      | `subscribe.mts`, `send-digest.mts` | Buttondown API key                                                                                                            |
| `NETLIFY_SITE_ID`                    | yes      | `send-digest.mts`                  | not auto-injected for scheduled functions                                                                                     |
| `NETLIFY_TOKEN`                      | yes      | `send-digest.mts`                  | Blob Storage access for scheduled functions                                                                                   |
| `EMAIL_DIGEST_DRY_RUN`               | no       | `send-digest.mts`                  | `true` → log without sending or advancing the timestamp                                                                       |
| `DIGEST_HEALTHCHECK_URL`             | no       | `send-digest.mts`                  | pinged on every successful run (sent or nothing-to-send)                                                                      |
| `SUBSCRIBE_HEALTHCHECK_URL`          | no       | `subscribe.mts`                    | pinged on welcome-email success (base URL) or failure (`{url}/fail`)                                                          |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`       | yes\*    | `sync-calendar-background.mts`     | \*required once the calendar sync is live                                                                                     |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | yes\*    | same                               | stored with literal `\n`                                                                                                      |
| `GOOGLE_SHOWS_CALENDAR_ID`           | yes\*    | same                               |                                                                                                                               |
| `GOOGLE_ACTIVITIES_CALENDAR_ID`      | yes\*    | same                               |                                                                                                                               |
| `CALENDAR_SYNC_DRY_RUN`              | no       | same                               | logs planned changes without writing                                                                                          |
| `CALENDAR_SYNC_HEALTHCHECK_URL`      | no       | same                               | pinged only when something changed or failed — a no-op run doesn't ping, so silence alone can't be trusted to mean "all good" |

## 12. Build, deploy & branch workflow

Netlify's build command is `npm run build` (= `npm run check` then `astro
build`); it watches `main` and deploys on every push. `netlify.toml` also
carries `[functions].included_files` (see §4) and response headers.

**Branches**: bug fixes and small enhancements branch from `main` and
merge back to `main` when verified; major features branch from `dev` and
merge back to `dev`. No PRs — merge directly, always confirm the current
branch before committing. Never commit directly to `main` or `dev`.

**Live editor writes land on `main`** — `data.mjs` commits straight to
production. `npm run sync` (`scripts/sync-branches.sh`) fast-forwards local
`main` and `dev` to their remotes and merges `main` into `dev`, so those
edits reach `dev`; run it at the start of a feature branch. `npm run
release` (`scripts/release.sh`) runs `sync` first, then merges `dev` into
`main` and pushes (the production deploy trigger), then back-merges `main`
into `dev` — it lists the commits it's about to ship and prompts before
pushing (`npm run release -- -y` skips the prompt).

If `main` and `dev` have diverged on a data file (two different people's
`/admin` edits landing on different branches independently), the merge
conflicts rather than silently picking one side — resolve by keeping
whichever side has the newer `updatedAt`, or merge the underlying array
changes by hand if both are genuine, real edits.

## 13. Design notes

### Colour system

All CSS custom properties live in the `:root` block of
`src/components/calendar.astro`; matching JS colour maps are defined right
after the `PERFORMANCES` constant in the same file's `<script>` block.
There's no separate design-token file.

**Base tokens** (not company-specific): `--bg` `#f7f4ef` (page background),
`--surface` `#ffffff` (cards/panels), `--ink` `#1a1612` (header fill,
primary text), `--ink-muted` `#6b6259` (secondary text), `--border`
`#e0d9d0` (all dividing lines).

**Company colours** exist at three saturation tiers, each with its own CSS
variable prefix and JS lookup function (with a neutral-grey fallback for
any company not in the map):

| Tier   | Variables | S / L             | Function         | Used for                                                                                                                                   |
| ------ | --------- | ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Fill   | `--col-*` | ~35–40% / ~82–83% | `companyColor()` | annual-view day-cell backgrounds, drill-down performance-bar backgrounds (further softened with `filter: saturate(0.78) brightness(1.02)`) |
| Dot    | `--dot-*` | ~30–35% / ~56–62% | `dotColor()`     | small identification dots — annual hover-panel rows, footer legend squares                                                                 |
| Accent | `--acc-*` | ~55–65% / ~42–48% | `accentColor()`  | vivid identity signal — show-chip bar stripe, show-card company badge                                                                      |

Only SCS, AT, MCT, and Renegade have named colour sets; everything else
falls back to the neutral grey in each tier. Current hues: SCS 7° (rose),
MCT 116° (green), Renegade 188° (teal), AT 225° (blue) — SCS and AT sit
near-complementary to stay distinguishable at small sizes. `--col-multi` /
`--dot-multi` cover "more than one company on this date" in the annual
view.

**Adding a company colour**: add three `--col-*` / `--dot-*` / `--acc-*`
custom properties to `:root`; add matching entries to the `COMPANY_COLORS`,
`COMPANY_DOTS`, `COMPANY_ACCS` JS maps (keyed by the company string as it
appears in the data) and a `LEGEND_ENTRIES` item; add the full name to
`COMPANY_NAMES`. Pick a hue not already in use — ~60° (amber), ~270°
(purple), and ~305° (orchid) are open.

### Home page spacing (`src/pages/index.astro`)

Desktop/tablet spare vertical space (viewport height minus content) splits
across three flex spacers in a **3:2:1** ratio: above the hero text, hero
text to cards, and below the cards/footer row (the middle spacer has a
16px floor so it never fully collapses). The ratio is set via the `flex`
values on `.page-content::before`, `.hero-cards-gap`, and
`.page-content::after`. Below 600px the proportional spacers collapse to
zero and spacing reverts to fixed padding.
