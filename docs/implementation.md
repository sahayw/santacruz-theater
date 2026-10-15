# Implementation Reference

How the system is built. For what it does, see
[`feature-guide.md`](feature-guide.md).

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

- Astro 6, static output, TypeScript strict, no UI framework — Astro
  components plus vanilla client JS. Hosted on Netlify.
- **No runtime database.** Public pages are compiled at build time from JSON
  in `data/`.
- `/admin` editors write those JSON files back (GitHub in production, disk in
  local dev — [§4](#4-data-flow)). Each write triggers a rebuild, the site's
  only publish mechanism.
- Routes: `/` hub → `/calendar`, `/companies`, `/events`, `/services`,
  `/about`, `/subscribe`. `SiteNav.astro` is shared.

## 2. Repository layout

```
src/
  components/     calendar.astro (calendar UI), SiteNav.astro,
                  AddToCalendar.astro (feed dialog, §6)
  layouts/        page layout wrappers
  pages/          routes — index, calendar, companies, events, runs, subscribe,
                  services, about, admin/*.js.ts (shared modules for /admin, §6),
                  [...feed].ics.ts (calendar feeds, §6),
                  missing-details.json.ts (§6)
  lib/
    data.ts             build-time data loading (import.meta.glob)
    audition-format.ts  shared formatting — Astro, functions, browser
    data-rules.ts       shared validation rules + missing-details gaps — editors + check scripts
    organizers.ts       who organizes a record; organizer rules (§6)
    venues.ts           venue codes and one-off locations → places (§6)
    occurrence-ids.ts   perf-/session- id generator + backfill (§6)
    calendar-model.ts   runs/activities → calendar events + feeds (§6)
    ics.ts              RFC 5545 serializer for the feeds (§6)
    browser-module.ts   serves a src/lib module to /admin (§6)
  types.ts        shared TypeScript interfaces
  styles/         global CSS
data/             canonical data files (§3)
public/
  admin/          editor SPA, served at /admin
  images/companies/, images/services/   locally stored images
netlify/functions/  serverless functions (§7)
scripts/          check-json.ts, check-reference.ts, check-shows.ts,
                  check-activities.ts, check-services.ts, check-markdown.ts,
                  check-feeds.ts (post-build),
                  migrate-occurrence-ids.ts, migrate-organizers-venues.ts (one-off),
                  sync-branches.sh, release.sh
tests/            vitest unit tests + fixtures/ (§9)
docs/             feature-guide.md, implementation.md, ics-spec.md,
                  notifications-spec.md (design records)
astro.config.mjs  one dev-server redirect (§10)
netlify.toml      build command, included_files, headers
```

## 3. Data files & schemas

The canonical definition of every data shape.

### Companies — `data/sc-theater-companies.json`

Hand-edited (there's no editor for it). `{ "companies": [<CompanyEntry>] }`.
The single list of **organizers**: companies with their own data files, plus
smaller organizers whose records are filed under Other
([`notifications-spec.md`](notifications-spec.md)).

| Field             | Type                  | Notes                                                                     |
| ----------------- | --------------------- | ------------------------------------------------------------------------- |
| `id`              | `string`              | kebab-case slug, e.g. `"scs"`; permanent (saved choices and links use it) |
| `abvName`         | `string`              | short label: chips, calendar entries, selectors; ≤ 12 chars (warning)     |
| `name`            | `string`              | full name                                                                 |
| `primaryVenue`    | `string?`             | venue code; a session with no venue falls back to it                      |
| `website`         | `string?`             |                                                                           |
| `logo`            | `string?`             | local path, e.g. `/images/companies/scs-logo.png`                         |
| `logoDark`        | `boolean?`            | logo needs a dark card background                                         |
| `logoFill`        | `boolean?`            | logo fills its card                                                       |
| `editors`         | `{email,datasets}[]?` | grants each email the listed dataset keys                                 |
| `adminOnly`       | `boolean?`            | sentinel entries (`admin`, `other`); never organizers                     |
| `filedUnderOther` | `boolean?`            | no data files of its own; its records live in `other-<year>` files        |
| `major`           | `boolean?`            | offered as a checkbox in subscriptions; has a calendar colour             |
| `majorCode`       | `number?`             | 1, 2, 4, 8…; permanent (a former major keeps it); numbers filtered feeds  |
| `colour`          | `string?`             | majors only, hex                                                          |
| `onCompaniesPage` | `boolean?`            | listed on `/companies`                                                    |

**Sentinels** (`adminOnly: true`):

- `admin` — must be first. Its `editors` are site-wide admins.
- `other` — must be last. Not an organizer: the bucket for the
  `other-<year>` data files of organizers marked `filedUnderOther`.
  Admin-edited only.

**Adding an organizer** (hand edit): add an entry with `id`, `abvName`,
`name`, `website?` and `filedUnderOther: true`. Editors pick it from a list;
they can't create one. **Promoting** one to its own files: remove
`filedUnderOther`, move its records into `<id>-<year>.json` files, keep the
`id`.

**Entry order is display order** in public company filters (no sort). The
editor's selectors (`buildCompanyOptions()` in `api.js`) list companies with
their own files, sorted by `abvName`, then `other`; `filedUnderOther`
organizers aren't in it.

### Venues — `data/sc-theater-venues.json`

Hand-edited. `{ code, name, address?, website? }[]`. Productions refer to a
venue by `code` (`Run.venue`); audition/event sessions by `ActivityDate.venue`,
or give a one-off `location`. Either may add a `room` ("Second Stage"), shown
as "Venue, Room". Codes are permanent.

### Shows — `data/shows/<year>/<company-id>-<year>.json`

One file per company per year: `{ company, year, runs: [<Run>] }`.

#### `Run`

| Field          | Type            | Notes                                                        |
| -------------- | --------------- | ------------------------------------------------------------ |
| `id`           | `string`        | `"run-<timestamp>"`, editor-assigned                         |
| `company`      | `string`        | the file's company id (`"other"` for the catch-all file)     |
| `showAbv`      | `string`        | chip label; required, ≤ 20 chars                             |
| `show`         | `string`        | full title; required                                         |
| `description`  | `string?`       | Markdown ([`renderMd`](#6-shared-front-end-logic))           |
| `genre`        | `Genre[]`       | see [Genre](#genre)                                          |
| `organizers`   | `string[]?`     | organizer ids, main first — see below                        |
| `venue`        | `string`        | venue code; required, must be listed                         |
| `room`         | `string?`       | space within the venue                                       |
| `price`        | `string`        | e.g. `"$72-$92"`; empty → warning                            |
| `discounts`    | `string`        | default; overridable per performance                         |
| `infoUrl`      | `string`        | empty → warning                                              |
| `ticketsUrl`   | `string`        | default; overridable per performance                         |
| `performances` | `Performance[]` | ordered; empty → warning (run never appears on the calendar) |
| `updatedAt`    | `string?`       | ISO 8601; set by the editor on Save when the run changed     |

#### `Performance`

`{ id: "perf-<timestamp>", date: "YYYY-MM-DD", time: "HH:MM" (24h), perfType:
"" | Preview | Opening | Closing | Talk-back, discounts, ticketsUrl }` —
non-empty `discounts` / `ticketsUrl` override the run's. `id` is a stable
[occurrence id](#occurrence-ids--srcliboccurrence-idsts).

`getPerformances()` (`src/lib/data.ts`) flattens all runs into a
`PerformanceEvent[]` (each carrying its performance `id`) with run fields
merged and overrides resolved, sorted by date then time. Each carries its
`organizers`, `organizerName`, `organizerLabel`, the venue's display name in
`venue` and its code in `venueCode`.

**Organizers**: a record in a company's own file is organized by that
company; a run may list co-producers in `organizers`. A record in an
`other-<year>` file must list its organizers, main first, and the main one
must be `filedUnderOther`. Auditions and events have exactly one organizer —
`organizers` only under Other, with one id. `recordOrganizerIds()`
([§6](#organizers-and-venues--srcliborganizersts-srclibvenuests)) turns
either into the full list.

### Activities — `data/activities/<year>/<company-id>-activities-<year>.json`

One file per company per year: `{ company, year, activities: [<Activity>] }`.
Auditions and events share one schema.

#### `Activity`

| Field                            | Type                    | Applies to | Notes                                                      |
| -------------------------------- | ----------------------- | ---------- | ---------------------------------------------------------- |
| `id`                             | `string`                | both       | `"activity-<timestamp>"`, editor-assigned                  |
| `type`                           | `'audition' \| 'event'` | both       | set at creation; immutable                                 |
| `title`                          | `string`                | both       | required                                                   |
| `dates`                          | `ActivityDate[]`        | both       | ordered sessions                                           |
| `contact`                        | `ActivityContact?`      | both       | `{ name?, email?, phone? }`                                |
| `noticeUrl`                      | `string?`               | both       | primary info link                                          |
| `organizers`                     | `string[]?`             | both       | organizer ids, main first — see [Organizers](#run)         |
| `closed`                         | `boolean?`              | both       | excluded from upcoming; reversible                         |
| `createdAt` / `updatedAt`        | `string`                | both       | ISO 8601 — drive the digest ([§8](#8-email-notifications)) |
| `genre`                          | `Genre[]`               | audition   |                                                            |
| `rehearsalStart` / `openingDate` | `string?`               | audition   | `YYYY-MM-DD`                                               |
| `productionUrl`                  | `string?`               | audition   |                                                            |
| `rolesAvailable`                 | `AuditionRole[]?`       | audition   | hidden publicly when empty                                 |
| `prep`                           | `AuditionPrep?`         | audition   | `{ acting?, singing?, dance?, bring? }`                    |
| `notes`                          | `string?`               | audition   | Markdown                                                   |
| `virtualSubmission`              | `boolean?`              | audition   | dates optional; always upcoming until closed               |
| `productionId`                   | `string?`               | audition   | a `Run.id` (any year); validated; Production picker        |
| `briefDescription`               | `string?`               | event      | collapsed-card blurb                                       |
| `description`                    | `string?`               | event      | Markdown, expanded card                                    |
| `cost`                           | `string?`               | event      |                                                            |
| `registerUrl`                    | `string?`               | event      |                                                            |
| `datesByRequest`                 | `boolean?`              | event      | dates optional; shows "On request"; upcoming until closed  |

Validation rules (required dates, event contact route, etc.) are in the
[rule reference](#rule-reference); the upcoming rule is in
[§6](#6-shared-front-end-logic).

#### `ActivityDate`

`{ id: "session-<timestamp>", date: "YYYY-MM-DD", startTime: "HH:MM",
endTime?: "HH:MM", notes?, venue?, location?: { name, address? }, room? }` —
place is per session: `venue` is a listed venue code; `location` is a one-off
place not in the list (never both). With neither, feeds fall back to the main
organizer's `primaryVenue`. `id` is a stable
[occurrence id](#occurrence-ids--srcliboccurrence-idsts).

#### `AuditionRole`

`{ role, type: 'lead'|'supporting'|'ensemble', gender: 'female'|'male'|'any',
ageRange?, voicePart? (Musical only), description? }`

`getActivities()` (`src/lib/data.ts`) globs every activities file into a
sorted `ActivityEvent[]`: activity + `company` (the file's) + `year` +
`organizerIds`, `organizerName`, `organizerEntries`, and each date's
resolved `place`.

### Services

- `data/sc-theater-service-categories.json` — hand-edited hierarchy.
- `data/sc-theater-services.json` — flat listings, edited via `/admin`.

**Category**: `{ id, label, subcategories: [{ id, label, description? }] }`.
A subcategory's `description`, if set, is its pill text (else `label`).
Listings reference **subcategory ids only**; `check-services.ts` fails the
build on an unknown id, so renaming or removing a subcategory means
updating its listings in the same change.

#### `ServiceListing`

| Field                     | Type             | Notes                                                          |
| ------------------------- | ---------------- | -------------------------------------------------------------- |
| `id`                      | `string`         | `"service-<timestamp>"`                                        |
| `name`                    | `string`         |                                                                |
| `categories`              | `string[]`       | one or more subcategory ids                                    |
| `contact`                 | `ServiceContact` | `{ name?, tel?, email?, address? }`; `tel` or `email` required |
| `photo`                   | `string?`        | under `public/images/services/`                                |
| `url`                     | `string?`        |                                                                |
| `description`             | `string?`        | Markdown                                                       |
| `active`                  | `boolean`        | `false` hides it publicly                                      |
| `createdAt` / `updatedAt` | `string`         | ISO 8601                                                       |

The editor holds `_`-prefixed fields in memory only (e.g. `_photoDataUrl`)
and strips them on save; `check-services.ts` rejects any in the file.

`getServiceCategories()` / `getServices()` (`src/lib/data.ts`) load both
files at build.

### `Genre`

`Drama | Musical | Comedy | Other`, hard-coded. Stored as an array, max 2
(the multi-select drops the oldest on a third pick). Legacy single strings
are coerced to a 1-item array on read.

---

## 4. Data flow

**Build**: `src/lib/data.ts` globs `data/` with `import.meta.glob` and exposes
typed accessors. Pages call them directly; the public site does no client
data fetching.

**Editor writes**: `public/admin/*.js` → `/.netlify/functions/data.mjs` (JSON)
and `upload-image.mjs` (service photos). Both have two modes:

| Mode                                     | Storage                                                      | Auth                                                                                |
| ---------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Production                               | GitHub Contents API — each write is a commit, which rebuilds | Netlify Identity JWT on writes (`context.clientContext.user`, populated by Netlify) |
| `netlify dev` (`NETLIFY_DEV === 'true'`) | working-tree `data/` / `public/images/services/`             | none                                                                                |

Local PUT bodies are byte-identical to what production would commit, so an
unwanted local save is undone with `git checkout`. See
[§10](#10-local-development).

**Function reads**: `lib/activities-data.mts` and `lib/company-data.mts`
(email; activities, companies and venues) read `data/` with Node `fs` — `import.meta.glob` is Vite-only and
doesn't work in esbuild-bundled functions. The files reach the bundle via
`[functions].included_files` in `netlify.toml`, so function reads reflect the
last deploy, not live edits.

## 5. The `/admin` SPA

Editors can hand off to each other: `window.openEditor(key, intent)` (in
`index.html`) unmounts the current editor and mounts `key` with `intent` in
its context. The Activities editor's **Add production…** passes
`{ addRun: { company, year, show, organizers, returnTo } }`; the Calendar
editor's `startAddRun()` opens (or creates) that file and starts a new show.
`returnTo` carries the audition as entered so far. After the show is saved,
the Calendar editor offers to go back, passing `{ resumeActivity }`; the
Activities editor's `resumeActivity()` restores the draft, linked and titled.

Both editors ignore a new record nothing has been entered in when deciding
whether there are unsaved changes, and discard it when you move away.

| File                                          | Role                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `index.html`                                  | login overlay, dataset hub, routing. On `localhost`, auth is skipped: full admin access.   |
| `api.js`                                      | `apiFetch` / `apiPut` / `apiUploadImage` / `resolveUserAccess()` / `buildCompanyOptions()` |
| `calendar.js`, `activities.js`, `services.js` | one ES module per editor, exporting `mount(container, context)` / `unmount()`              |
| `organizer-picker.js`                         | organizer select (records filed under Other) and co-producer chips (shows only)            |
| `genre-boxes.js`                              | the genre checkbox row (at most `MAX_GENRES`)                                              |
| `markdown-editor.js`                          | shared rich-text toolbar and shortcuts                                                     |

**Auth**

- The Identity widget's `APIUrl` is pinned to
  `https://santacruz.theater/.netlify/identity`, so sign-in works from any
  deploy URL (avoids 400s on branch/preview deploys).
- `resolveUserAccess(email, companies)` checks the `admin` sentinel, then
  every `CompanyEntry.editors`, and returns the permitted datasets; the hub
  shows one tile per dataset.
- The widget also loads on `/` (`src/pages/index.astro`) to handle
  `#invite_token` / `#recovery_token` links — the personal Netlify plan can't
  customize email templates to point elsewhere.

**Editor shape** (all three): company/year selector (admins get a company
dropdown) → resizable record sidebar → record form with
Preview/Restore/Delete (Activities adds Close/Reopen) → Save PUTs the whole
file. The Calendar and Activities editors give every new performance or
session row an occurrence id, and backfill missing ones on load
([§6](#occurrence-ids--srcliboccurrence-idsts)). On Save, the Calendar editor
stamps `updatedAt` on runs changed since load, as Activities does for
activities.

## 6. Shared front-end logic

### Validation rules

Every record-level rule lives in `src/lib/data-rules.ts`:
`runIssues(run, fileYear, refs)`, `activityIssues(activity, fileYear,
fileCompany, refs)`, `listingIssues(listing)`, each returning `{ errors,
warnings }`. `refs` is `{ companies, venues, runIds? }` — the reference lists
the record is checked against (`runIds` omitted = skip the `productionId`
check).

- **Editors** (`collectIssues()` on Save): errors block; warnings ask "Save
  anyway?" for records changed since load.
- **Check scripts** (`check-shows/activities/services.ts`): errors fail the
  build; warnings print.

**Change a rule in `data-rules.ts` only**, then update the
[rule reference](#rule-reference) and
[feature-guide §7](feature-guide.md#whats-required).

Date/time _input_ normalization is per-editor (`normalizeDate()` /
`normalizeTime()` in `activities.js`; `parseDate()` in the Calendar paste
panel). Accepted formats are documented in
[feature-guide §7](feature-guide.md#7-editing-conventions).

### Serving `src/lib` modules to `/admin`

`src/pages/admin/*.js.ts` routes import a module with `?raw` and pass it to
`browserModuleResponse()` (`src/lib/browser-module.ts`), which transpiles it
with TypeScript's `transpileModule` at build. Any TypeScript syntax works;
type-only imports are dropped. A runtime import of a sibling module
(`./organizers.ts`) is rewritten to `./organizers.js`, so that module needs
its own route too (`data-rules` imports `organizers` and `venues`). Never
hand-maintain a copy under `public/admin/`.

### Organizers and venues — `src/lib/organizers.ts`, `src/lib/venues.ts`

Pure functions shared by pages, feeds, functions and `/admin`
(`/admin/organizers.js`, `/admin/venues.js`).

- `recordOrganizerIds(fileCompany, organizers)` — a record's organizer ids,
  main first. Use it everywhere a record's organizer is shown or matched;
  never read `company` directly for display ("other" is not an organizer).
- `organizerName()` / `organizerLabel()` — "A & B" / "A / B".
  `organizerEntries()`, `majors()`, `otherOrganizers()`, `allOrganizers()`
  for pickers. `organizerErrors()` is the organizer rule.
- `runPlace(run, venues)` / `sessionPlace(date, venues)` — the venue or
  one-off location as `{ name, address }`, room included.
- `public/admin/organizer-picker.js` is the editors' shared picker: the main
  organizer for records filed under Other, co-producer chips for all.

### Missing details — `/missing-details.json`

`runGaps(run)` / `activityGaps(activity, primaryVenue)` in `data-rules.ts`
list what an upcoming production or open activity lacks: `dates`,
`tickets`, `price`, `info`, `description`, `location`. Production gaps are
also the editor's warnings. `src/pages/missing-details.json.ts` publishes
every record with gaps at build time — `{ generated, records: [{ kind, id,
title, organizers, file, firstDate?, missing }] }` — for the external
alerting agent (not part of this repo). Change the gap rules in
`data-rules.ts` only.

### Occurrence ids — `src/lib/occurrence-ids.ts`

Every `Performance` (`perf-<epoch-ms>`) and `ActivityDate`
(`session-<epoch-ms>`) has a persisted id. It never changes when the row's
date or time is edited, and it is the identity behind calendar feed UIDs
([`ics-spec.md`](ics-spec.md)). Ids are never derived from date, time or
array position.

- `createIdGenerator(prefix)` is monotonic within one generator. If the clock
  hasn't moved past the last id issued, it uses `last + 1`, so the pattern
  generator and paste importer can create many rows at once.
- `ensurePerformanceIds()` / `ensureSessionIds()` add ids only to rows
  without one, placing `id` first in the object.
  - The editors call them on load, **before** taking snapshots, so backfilled
    ids don't mark the file dirty or bump `updatedAt`. That matters because
    the digest reads `updatedAt`. The ids are written on the next real save.
  - `scripts/migrate-occurrence-ids.ts` (`npx tsx …`) applies the same helpers
    to every data file. It never touches `updatedAt`, keeps each file's
    trailing-newline style, and is idempotent.
- `check-shows.ts` / `check-activities.ts` fail the build on a missing,
  malformed or duplicate id ([§9](#9-validation-scripts)).

### Formatting — `src/lib/audition-format.ts`

Pure functions, no Astro/DOM dependency: `fmt12`, `fmtTimeRange`,
`fmtFullDate`, `fmtShortDate`, `fmtAudDateRange`, `rolesSum`, and
**`renderMd`** — HTML-escapes, then renders bold, italic,
`[text](https://url)` links, and `-` bullet lists. The only Markdown
renderer; don't add others. **`mdToPlain`** is its plain-text counterpart
for the calendar feeds: it removes emphasis markers, keeps only a link's
text (calendar apps would show raw URLs in full), and writes bullets as
`• item`. Change the two together.

| Consumer                                                           | How it gets the module                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `events.astro`, `services.astro`, `calendar.astro` (client script) | direct import                                                                  |
| `send-digest.mts`                                                  | esbuild bundle                                                                 |
| `activities.js`, `calendar.js`, `services.js` (Preview)            | `/admin/audition-format.js`, served by `src/pages/admin/audition-format.js.ts` |

### The "upcoming" rule

- `closed` → never upcoming.
- Virtual audition, or `datesByRequest` event, with no dates → upcoming.
- Otherwise → latest `dates[].date` ≥ today.

Implemented in **three places that must agree**: the `/events` client filter
(`src/pages/events.astro`), `isUpcoming()` in
`netlify/functions/lib/activities-data.mts` (emails), and the editor Preview.

### Activity card rendering paths

A change to what an activity card shows must be checked in all four:

1. `events.astro` template
2. the `?id=` deep-link view (same HTML — automatic)
3. `buildPreviewHtml()` in `activities.js`
4. `netlify/functions/lib/email-template.mts`

Exception: the per-session **Add to my calendar** links and **Download all
dates** exist only on the web paths (1–2). They open a dialog that the
Preview and emails don't have.

**Layout**: the public `.detail-grid` and Preview `.pv-detail-grid` are
two-column grids with an optional right column (roles / description). Each
has a `:not(:has(.detail-right))`-style rule that collapses to one column
when it's absent (e.g. a virtual audition with no roles).

### Calendar feeds

Static iCalendar (RFC 5545) files, generated at build time and served by
Netlify's CDN, which handles ETag/304. There's no function and no
calendar-service API. The design and its rationale are in
[`ics-spec.md`](ics-spec.md).

| File                     | Contents                              | Use          |
| ------------------------ | ------------------------------------- | ------------ |
| `/runs.ics`              | all performances                      | subscription |
| `/runs/company/{id}.ics` | one company's performances            | subscription |
| `/activities.ics`        | sessions of all auditions and events  | subscription |
| `/auditions.ics`         | audition sessions only                | subscription |
| `/activities/{id}.ics`   | one activity's sessions ("all dates") | download     |
| `/performances/{id}.ics` | one performance                       | download     |
| `/sessions/{id}.ics`     | one activity session                  | download     |

`{id}` is the bare epoch from the record's or occurrence's id, with the
prefix stripped.

- **`src/lib/calendar-model.ts`** (pure) turns runs and activities into
  `CalendarEvent`s, and `buildFeeds()` groups them into the feeds above.
  - **Window**: subscriptions keep events from 12 months before the build
    onward (`HISTORY_MONTHS`). Download files aren't windowed.
  - **`Feed.subscribable`**: true only for the four kinds of subscription.
    `ics.ts` adds the refresh hints (`REFRESH-INTERVAL`, `X-PUBLISHED-TTL`)
    only to those.
  - **Closed and undated activities**: a closed activity publishes no events.
    Its `activities/{id}.ics` exists but is empty, and it has no session
    files. Undated sessions are skipped.
  - **Event fields**:
    - UID: `{occurrence id}@santacruz.theater`.
    - Times: wall-clock America/Los_Angeles. With no end time, an event
      lasts 2 hours.
    - Location: the venue code (or a session's one-off location) resolved by
      `runPlace()` / `sessionPlace()`, room included. Sessions with neither
      fall back to the main organizer's `primaryVenue`.
    - Page link: `/runs?id=` or `/events?id=`. It appears only as the
      description's last line. There's no `URL` property, which Apple would
      show as a second, duplicate link.
    - Description: plain text, via `mdToPlain`. It contains no third-party
      URLs; it ends with one short `Details & tickets: …/runs?id=` (or
      `Details: …`) line pointing at our page. The dialog's Google add-event
      link turns that line into a real link, since Google renders HTML there.
- **`src/lib/ics.ts`** is a hand-written serializer. It escapes text, folds
  lines at 75 octets (never inside a UTF-8 sequence), uses CRLF and a fixed
  America/Los_Angeles `VTIMEZONE`, and orders events by start, then UID.
  - `DTSTAMP` / `LAST-MODIFIED` come from the record's `updatedAt`, or from
    a run's id timestamp if it has none. They are **never** the build time.
  - As a result, unchanged data produces byte-identical files, and calendar
    apps see no phantom changes.
- **`src/pages/[...feed].ics.ts`** is a single catch-all static endpoint that
  writes every feed. `netlify.toml` sets
  `Content-Type: text/calendar; charset=utf-8` for `/*.ics`.
- **UI — `src/components/AddToCalendar.astro`**: a single native `<dialog>`
  per page, with three modes chosen by the trigger's attribute.
  - **Subscribe**: `data-ics-feed` + `data-ics-name`, or `data-ics-choices`
    (a JSON list of `{label, feed, name}`) + `data-ics-choice-label` for a
    picker. It shows a `webcal://` link, Google's
    `calendar.google.com/calendar/r?cid=<webcal URL>` link, and a copyable
    `https` URL.
  - **One event**: `data-ics-event="performances/{id}"` or
    `"sessions/{id}"`.
    - The dialog fetches that event's own `.ics` file and parses it (a small
      reader for this exact format) to show the summary, date and location.
    - It builds Google's add-event link
      (`calendar/render?action=TEMPLATE&…&ctz=America/Los_Angeles`) from the
      same file, so the event details are defined in one place: the model.
    - **Apple / Outlook** downloads the file.
  - **All dates**: `data-ics-download="activities/{id}"` + `data-ics-name`.
    It lists the file's dates and offers a download only.
  - **Shared behaviour**:
    - Clicks are delegated from `document`, so triggers in client-rendered
      markup (the calendar's show cards) work.
    - URLs come from `location.origin`, so branch deploys use their own
      files.
    - Subscription names come from `FEED_NAMES` in `calendar-model.ts`.
  - **Usage tracking**: each action sends a Plausible custom event. Plausible
    loads only in production builds (`BaseHead.astro`), and the call is a
    no-op where it isn't loaded.
    - `Calendar subscribe` — props `calendar` (feed name) and `app`
      (`Apple / Outlook`, `Google`, `Copy link`);
    - `Calendar add event` — props `event` (summary) and `app`;
    - `Calendar download all dates` — props `activity` and `app`.

    These measure interest, not subscribers. The feeds are static files, and
    Google and Outlook.com fetch them once on behalf of all their users, so
    subscribers can't be counted reliably. To see the events in Plausible,
    each event name must be added as a custom-event goal in the dashboard.

- **Placements**:
  - **`calendar.astro`**:
    - a bar button with a company picker, hidden unless
      `body.scroll-mode` (week view);
    - per-card **All dates** / **Add to my calendar** links. These need
      `PerformanceEvent.id`.
  - **`events.astro`**:
    - the banner picker;
    - a per-session-row button for open activities, which the client script
      hides for past dates;
    - **Download all dates** in the links row for open activities with two
      or more dated sessions.
  - **`runs.astro`**: a per-performance-row button, hidden for past rows.
- **`/runs` (`src/pages/runs.astro`)**: lists runs that have performances
  (index / filter / `?id=` deep link, like `/events`) with the full schedule.
  It's deliberately not in `SiteNav`. It is the page link in performance
  events, and the calendar's **All dates** link.
- **Checks**:
  - Unit tests (`tests/calendar-model.test.ts`, `tests/ics.test.ts`) run on
    fixtures and parse the output with `ical.js`, including daylight-saving
    boundaries.
  - `scripts/check-feeds.ts` runs after `astro build` and checks every real
    feed in `dist/` the same way ([§9](#9-validation-scripts)).

## 7. Netlify functions

New functions use the **v2 interface** (`export default async (req: Request)
=> …` + `export const config`). `data.mjs` and `send-digest.mts` are legacy
style and aren't being migrated proactively.

| Function                  | Purpose                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| `data.mjs`                | data read/write — two modes ([§4](#4-data-flow))                    |
| `upload-image.mjs`        | service photo upload — same two modes                               |
| `fetch-page.mjs`          | page-fetch proxy (unused by current editors)                        |
| `subscribe.mts`           | Buttondown subscribe + welcome email ([§8](#8-email-notifications)) |
| `send-digest.mts`         | daily digest ([§8](#8-email-notifications))                         |
| `lib/email-template.mts`  | inline-styled welcome + digest HTML                                 |
| `lib/activities-data.mts` | fs-based activity loading and classification                        |
| `lib/company-data.mts`    | fs-based company/organizer and venue lists                          |

## 8. Email notifications

Welcome email on signup, then a daily digest. Delivered by **Buttondown**
(subscribers, unsubscribe, delivery); subscribers are added as
`type: "regular"` — no double opt-in.

### Data access — `lib/activities-data.mts`

The only place functions read activity data (via `fs` — [§4](#4-data-flow)).
Exports `loadAllActivities()`, `isUpcoming()`, `getUpcomingActivities()` /
`getUpcomingAuditions()` / `getUpcomingEvents()`, and
`classifyForDigest(activities, lastSent)`. Don't duplicate it or reintroduce
GitHub API reads.

### Subscribe — `subscribe.mts`

- Accepts `{ email }` and POSTs to Buttondown. Responses: 201 new; 409/422
  already subscribed; 400/5xx error.
- On 201, `context.waitUntil()` sends the welcome email after responding, so
  the visitor waits only for the subscribe call (~2.5s).
- Widget on `/events` (hidden in deep-link/not-found modes) and `/subscribe`.

### Welcome email

1. `POST /v1/emails` (`status: "transactional"`) creates a one-off email.
2. `POST /v1/subscribers/{id_or_email}/emails/{email_id}` sends it to the new
   subscriber only — avoids draft-preview headers and the per-draft
   recipient limit.

Step 2 is skipped if step 1 fails. Each call has an 8s timeout. Result pings
`SUBSCRIBE_HEALTHCHECK_URL` (or `/fail`, with the response body logged);
the visitor's response is unaffected. Template: `buildWelcomeHtml(auditions,
events, baseUrl)` — Upcoming Auditions and Upcoming Events sections, each
with an empty-state line.

### Daily digest — `send-digest.mts`

Runs `0 2 * * *` (02:00 UTC), set in the `schedule()` call.

1. Read `last-sent` from Blob store `audition-notifications` (missing →
   everything is new).
2. `classifyForDigest()` → new/updated auditions and events. **New**:
   `createdAt` > last-sent. **Updated**: `updatedAt` > last-sent and
   `createdAt` ≤ last-sent.
3. Nothing to send → stop (timestamp unchanged; healthcheck still pinged).
4. `EMAIL_DIGEST_DRY_RUN=true` → log only.
5. POST to Buttondown (`status: "about_to_send"`).
6. On success, write the new timestamp.
7. Ping `DIGEST_HEALTHCHECK_URL`.

**Why JSON timestamps, not file mtime**: git and Netlify deploys don't
preserve mtime. The editor sets `createdAt` on create and advances
`updatedAt` only when a record actually changed (dirty-check against a load
snapshot), so re-saving unchanged doesn't produce a spurious "Updated".

**Why Blob credentials are explicit**: Netlify doesn't inject a Blobs token
into scheduled functions, so `getStore()` needs `NETLIFY_SITE_ID` +
`NETLIFY_TOKEN`.

### Testing the digest

Requires `netlify login` and `netlify link`.

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

Healthcheck: 24h period, ~2h grace. It pings on every successful run, so a
missing ping always means a problem.

| Symptom                           | Likely cause                                |
| --------------------------------- | ------------------------------------------- |
| `MissingBlobsEnvironmentError`    | `NETLIFY_SITE_ID` / `NETLIFY_TOKEN` not set |
| `missing BUTTONDOWN_API_KEY`      | key not set or not yet deployed             |
| Buttondown 401                    | API key invalid/revoked                     |
| Buttondown 429                    | rate limited; retries next run              |
| No healthcheck ping on success    | `DIGEST_HEALTHCHECK_URL` not set            |
| Same records reappear next digest | Blob write failed after send — check logs   |

## 9. Validation scripts

`npm run check` (first step of `npm run build`) runs:

- `check-json.ts` — JSON syntax.
- `check-reference.ts` — the companies/organizers and venue lists (below).
- `check-shows.ts`, `check-activities.ts`, `check-services.ts` — the shared
  rules below plus structural checks. `check-activities.ts` also lists
  one-off session locations, so regulars can be added to the venue list.
- `check-markdown.ts` — `renderMd` regression cases.
- `vitest run` — unit tests in `tests/`. They run against fixture data in
  `tests/fixtures/`, never live `data/`, so an editor save can't break them.

After `astro build`, `npm run build` also runs `check-feeds.ts`. It parses
every generated `dist/**/*.ics` with `ical.js` and fails on:

- a parse error;
- a line over 75 octets, or a line ending that isn't CRLF;
- a missing required property;
- a duplicate UID within a feed;
- an event that ends before it starts.

This validates real data on every deploy, which the fixture-based tests
can't.

Errors fail the build; warnings print.

### Rule reference

**Shared rules** (`src/lib/data-rules.ts`), identical in editor and build.
_Error_: blocks Save / fails build. _Warning_: "Save anyway?" (changed
records only) / printed.

| Record   | Rule                                                                                                                                                                                                    | Level   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Run      | `show` non-blank                                                                                                                                                                                        | error   |
| Run      | `showAbv` non-blank, ≤ 20 chars (`SHOW_ABV_MAX`)                                                                                                                                                        | error   |
| Run      | `venue` non-blank and a listed venue code                                                                                                                                                               | error   |
| Both     | organizers listed exist (not sentinels), no repeats; `other` records name ≥ 1, main `filedUnderOther`; own-file records don't repeat their company; auditions/events name at most one, only under Other | error   |
| Run      | each performance: real `YYYY-MM-DD` within file year ± 1; `time` `HH:MM` 00:00–23:59                                                                                                                    | error   |
| Run      | earliest performance in the file's year                                                                                                                                                                 | error   |
| Run      | `price`, `infoUrl`, `description` non-blank; a tickets link (run or performance)                                                                                                                        | warning |
| Run      | at least one performance                                                                                                                                                                                | warning |
| Activity | `title` non-blank                                                                                                                                                                                       | error   |
| Activity | at least one date, unless audition + `virtualSubmission` or event + `datesByRequest`                                                                                                                    | error   |
| Activity | each date row: `date` as above; `startTime` valid; `endTime` valid if present                                                                                                                           | error   |
| Activity | each date row's `venue`, if set, is a listed venue code                                                                                                                                                 | error   |
| Activity | earliest date in the file's year                                                                                                                                                                        | error   |
| Audition | `rehearsalStart` / `openingDate` real `YYYY-MM-DD` if present                                                                                                                                           | error   |
| Audition | `productionId`, if set, is an existing run id                                                                                                                                                           | error   |
| Audition | has a `productionId` (a season-wide audition may not)                                                                                                                                                   | warning |
| Event    | one of `contact.email`, `contact.phone`, `noticeUrl`, `registerUrl`, or a named organizer's `website`                                                                                                   | error   |
| Listing  | `name` non-blank                                                                                                                                                                                        | error   |
| Listing  | at least one category                                                                                                                                                                                   | error   |
| Listing  | `contact.tel` or `contact.email`                                                                                                                                                                        | error   |

- The editor drops blank activity date rows (no date, no start time) before
  checking, matching what it saves.
- **Historic runs** (last performance before today, via `todayIso()`, local
  time) skip warnings — in `runIssues()` and `check-shows.ts`'s ordering
  warning. Errors still apply. A run with no performances isn't historic.

**Structural checks** (scripts only; editors guarantee these by
construction):

- `check-reference.ts` — venue codes unique, names present; company ids
  kebab-case and unique; `admin` first, `other` last; `abvName` present (≤ 12
  warning); `primaryVenue` a listed code; sentinels aren't majors, Other or
  on `/companies`; `filedUnderOther` organizers have no data files or
  editors and aren't majors; `majorCode` a unique power of two; majors have
  a `majorCode` and hex `colour`; only majors have a `colour`.
- `check-shows.ts` — field types; `company` is a known id and matches the
  file's; `organizers` an array of strings; genres valid, ≤ 2
  (`MAX_GENRES`, after legacy coercion); `perfType` valid; run ids unique
  across files; performance `id` is `perf-<timestamp>` and unique across
  files; `updatedAt` ISO 8601 if present. Warns on out-of-order performances (not for historic runs).
- `check-activities.ts` — field types; `id` format; session `id` is
  `session-<timestamp>` and unique across files; a session has a `venue` or
  a one-off `location`, not both; `type` valid; genres, role `type`/`gender`
  valid; booleans; ISO 8601 timestamps; no audition-only fields on events or
  vice versa; no leftover `organizerName` / `organizerUrl`.
- `check-services.ts` — field types; `id` format and uniqueness; every
  category is a known subcategory id; `active` boolean; ISO 8601 timestamps;
  no `_`-prefixed fields.

## 10. Local development

- `npm run dev` = `netlify dev` (localhost:8888): Astro plus real functions,
  so `/admin` works fully offline.
- `npx astro dev` gives a lighter server without functions — the editor
  can't load or save there.
- Under `netlify dev`, `data.mjs` / `upload-image.mjs` use local-filesystem
  mode ([§4](#4-data-flow)).
- `astro.config.mjs` has one Vite plugin: redirect `/admin` → `/admin/`.
  Without it the dev server serves `index.html` at `/admin`, breaking the
  SPA's relative `import './api.js'`. (Production's pretty-URL redirect
  already does this.)
- To test the real deployed path (Identity login, commits, rebuild), push a
  branch and use its branch-deploy URL.

## 11. Environment variables

Set in Netlify → Site configuration → Environment variables.

| Variable                    | Req. | Used by                            | Purpose                                                |
| --------------------------- | ---- | ---------------------------------- | ------------------------------------------------------ |
| `GITHUB_TOKEN`              | yes  | `data.mjs`, `upload-image.mjs`     | fine-grained PAT, Contents read/write                  |
| `GITHUB_OWNER`              | yes  | same                               | repo owner                                             |
| `GITHUB_REPO`               | yes  | same                               | repo name                                              |
| `GITHUB_BRANCH`             | no   | same                               | commit branch (default `main`)                         |
| `BUTTONDOWN_API_KEY`        | yes  | `subscribe.mts`, `send-digest.mts` | Buttondown API key                                     |
| `NETLIFY_SITE_ID`           | yes  | `send-digest.mts`                  | Blobs access (not injected for scheduled functions)    |
| `NETLIFY_TOKEN`             | yes  | `send-digest.mts`                  | Blobs access                                           |
| `EMAIL_DIGEST_DRY_RUN`      | no   | `send-digest.mts`                  | `true` → log only; don't send or advance timestamp     |
| `DIGEST_HEALTHCHECK_URL`    | no   | `send-digest.mts`                  | pinged on every successful run                         |
| `SUBSCRIBE_HEALTHCHECK_URL` | no   | `subscribe.mts`                    | welcome email: base URL on success, `/fail` on failure |

## 12. Build, deploy & branch workflow

- **Build**: Netlify runs `npm run build` (`npm run check` + `astro build` +
  `check-feeds.ts`) on every push to `main`. `netlify.toml` also sets `included_files` (§4)
  and headers.
- **Branches**: fixes and small enhancements branch from and merge to
  `main`; major features from and to `dev`. No PRs; never commit directly to
  `main` or `dev`; confirm the branch before committing.
- **Live edits land on `main`** — `data.mjs` commits straight to
  production.
- **`npm run sync`** (`sync-branches.sh`): fast-forward local `main` and
  `dev` to origin, merge `main` into `dev`, push. Run at the start of a
  feature branch.
- **`npm run release`** (`release.sh`): sync, merge `dev` → `main`, push
  (deploys), back-merge into `dev`. Lists the commits and prompts first
  (`-- -y` skips the prompt).
- **Data-file conflicts** between `main` and `dev` (separate `/admin` edits)
  surface as merge conflicts. Keep the side with the newer `updatedAt`, or
  merge both by hand if both are real edits.

## 13. Design notes

### Colour system

All CSS custom properties are in `:root` of `src/components/calendar.astro`;
matching JS maps follow the `PERFORMANCES` constant in its `<script>`. No
separate token file.

**Base tokens**: `--bg` `#f7f4ef` (page), `--surface` `#ffffff`
(cards/panels), `--ink` `#1a1612` (header, primary text), `--ink-muted`
`#6b6259` (secondary text), `--border` `#e0d9d0`.

**Company colours**, three tiers (each falls back to neutral grey for
unmapped companies):

| Tier   | Variables | S / L             | Function         | Used for                                                                                      |
| ------ | --------- | ----------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| Fill   | `--col-*` | ~35–40% / ~82–83% | `companyColor()` | year-view day cells; week-view bars (softened with `filter: saturate(0.78) brightness(1.02)`) |
| Dot    | `--dot-*` | ~30–35% / ~56–62% | `dotColor()`     | hover-panel dots, legend squares                                                              |
| Accent | `--acc-*` | ~55–65% / ~42–48% | `accentColor()`  | show-chip stripe, show-card company badge                                                     |

Named sets: SCS 7° (rose), MCT 116° (green), Renegade 188° (teal), AT 225°
(blue) — SCS and AT near-complementary for small-size contrast.
`--col-multi` / `--dot-multi` mark multi-company days.

**Adding a company colour**:

1. Add `--col-*`, `--dot-*`, `--acc-*` to `:root`.
2. Add entries to `COMPANY_COLORS`, `COMPANY_DOTS`, `COMPANY_ACCS` (keyed by
   the company string in the data), a `LEGEND_ENTRIES` item, and the full
   name in `COMPANY_NAMES`.
3. Use an unused hue — ~60° (amber), ~270° (purple), ~305° (orchid) are
   free.

### Home page spacing — `src/pages/index.astro`

Spare vertical space on desktop/tablet splits **3:2:1** across three flex
spacers: above the hero, hero-to-cards (16px floor), and below the cards.
Set by the `flex` values on `.page-content::before`, `.hero-cards-gap`, and
`.page-content::after`. Below 600px they collapse to zero and fixed padding
takes over.
