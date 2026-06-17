# Santa Cruz Theater — Claude Notes

## Project overview

Astro 6 static site covering Santa Cruz County theater — performances calendar, company directory, audition listings, and a planned services section. Deployed to Netlify. TypeScript strict mode. No UI framework.

The site is structured as a hub (`/`) linking to four sections: **Calendar** (`/calendar`), **Companies** (`/companies`), **Auditions** (`/auditions`), and **Services** (`/services` — stub). A fixed top nav (`SiteNav.astro`) is shared across all inner pages. An **About** page (`/about`) is linked from the home page footer and contains a Netlify contact form.

## Key commands

| Command                   | Action                                      |
| ------------------------- | ------------------------------------------- |
| `npm run dev`             | Dev server at localhost:4321                |
| `npm run build`           | Build to `dist/`                            |
| `npm run preview`         | Preview production build locally            |
| `npm run check-shows`     | Validate show JSON files against schema     |
| `npm run check-auditions` | Validate audition JSON files against schema |

## Documentation files

`CLAUDE.md` (this file) — Claude-specific notes: schemas, editor behaviour, data flow detail.  
`README.md` — developer-facing overview (used on GitHub): site sections, calendar UI, editor walkthrough, build/deploy. **When updating either doc, check the other for consistency.**

## Folder conventions

- `src/components/` — reusable Astro components
  - `calendar.astro` — calendar interface
  - `SiteNav.astro` — shared site navigation
- `src/layouts/` — page layout wrappers
- `src/pages/` — file-based routes
  - `index.astro` — home page
  - `calendar.astro` — calendar route
  - `companies.astro` — company directory
  - `about.astro` — about and contact page
  - `auditions.astro` — auditions route
  - `subscribe.astro` — email subscription page at `/subscribe`
  - `services.astro` — stub
  - `admin/audition-format.js.ts` — Astro endpoint; strips TypeScript from the shared module and serves it as a browser ES module at `/admin/audition-format.js`
- `src/styles/` — global CSS
- `src/lib/` — shared TypeScript modules
  - `data.ts` — build-time data loading
  - `audition-format.ts` — pure formatting functions shared by Astro, Netlify functions, and browser (single source of truth)
- `src/types.ts` — shared data types
- `data/` — canonical data files
  - `sc-theater-companies.json` — company directory data, hand-editable
  - `sc-theater-venues.json` — shared venue list
  - `shows/<year>/<company-id>-<year>.json` — show data files
  - `auditions/<year>/<company-id>-auditions-<year>.json` — audition data files
- `public/admin/` — editor SPA at `/admin`
- `public/images/companies/` — company logos downloaded locally; paths stored in `sc-theater-companies.json`
- `scripts/` — utility scripts (run with `tsx`)
  - `check-shows.ts` — show data validation
  - `check-auditions.ts` — audition data validation
- `docs/` — design documentation (e.g. `color-system.md`, `description-feature.md`)
- `netlify/functions/` — serverless functions
  - `data.mjs` — data read/write endpoint
  - `fetch-page.mjs` — page-fetch proxy
  - `subscribe.mts` — Buttondown subscription handler (POST), sends a welcome email on new subscriptions
  - `send-audition-digest.mts` — scheduled daily digest (02:00 UTC); reads auditions from local data files, sends via Buttondown broadcast API, stores last-sent timestamp in Netlify Blob Storage
  - `lib/email-template.mts` — inline-styled email HTML templates for the digest and welcome email
  - `lib/auditions-data.mts` — shared local audition data loading (fs-based, not GitHub API) for the digest and welcome email

## Editor authentication & data flow

The `/admin` SPA is structured as a hub with separate editor modules:

- `public/admin/index.html` — login overlay, hub (dataset tiles), routing
- `public/admin/api.js` — shared `apiFetch` / `apiPut` / `resolveUserAccess` / `buildCompanyOptions`
- `public/admin/calendar.js` — calendar editor ES module (`mount` / `unmount`)
- `public/admin/auditions.js` — auditions editor ES module (`mount` / `unmount`)

On production, `/admin` shows a full-screen login overlay first. After **Netlify Identity** login, the user's email is looked up in `sc-theater-companies.json` via `resolveUserAccess()`. The hub then renders one tile per dataset the user may edit. Selecting a tile mounts the corresponding editor module.

The Identity widget is initialised with `APIUrl: 'https://santacruz.theater/.netlify/identity'` to pin it to the production endpoint regardless of which Netlify URL the page is served from (prevents 400 errors on preview deploys).

The Identity widget issues a JWT; the editor sends it as `Authorization: Bearer <token>` on every PUT request. Netlify populates `context.clientContext.user` automatically — no manual JWT validation needed in `data.mjs`.

In local dev (`localhost`) authentication is skipped entirely; the hub starts with full admin access and all dataset tiles visible.

The home page (`src/pages/index.astro`) loads the Identity widget so invite and password-reset flows that arrive as `#invite_token` / `#recovery_token` URL fragments can be processed correctly on the personal Netlify plan (which does not support custom email templates).

### Date and time input — normalization and validation

Both the calendar and auditions editors normalize and validate date/time fields on cell change:

**Date normalization (cell inputs — auditions editor)** — `normalizeDate()` in `auditions.js` accepts the following formats and normalizes to `YYYY-MM-DD` on change:

| Entered           | Stored as    |
| ----------------- | ------------ |
| `26/1/2`          | `2026-01-02` |
| `2026/1/2`        | `2026-01-02` |
| `26.01.02`        | `2026-01-02` |
| `2026-1-2`        | `2026-01-02` |
| `Oct 30`          | `2026-10-30` |
| `Oct. 30`         | `2026-10-30` |
| `Friday, Oct. 30` | `2026-10-30` |
| `Sat. Nov 7`      | `2026-11-07` |
| `Oct 30 2026`     | `2026-10-30` |

Numeric format is assumed `Y-M-D`; 2-digit years are prefixed with `20`. Named-month formats accept full month names, 3-letter abbreviations, and optional trailing periods. Leading day-of-week tokens (e.g. `Friday,`, `Sat.`) are stripped silently. When no year is present, `currentYear` (the loaded file's year) is used.

**Date normalization (Paste Dates panel — calendar editor)** — `parseDate()` in `calendar.js` handles the same named-month formats above in the paste textarea, including optional day-of-week prefixes and abbreviated months with periods. Year defaults to `currentYear` when absent. The Pattern panel uses native `<input type="date">` pickers and requires no parsing.

**Time normalization** — `normalizeTime()` (shared logic in both editors) accepts 12-hour and 24-hour inputs:

| Entered    | Stored as | Notes                                 |
| ---------- | --------- | ------------------------------------- |
| `7pm`      | `19:00`   | whole-hour 12-hour with suffix        |
| `7.30`     | `19:30`   | dot separator, no suffix → assumes PM |
| `2.00`     | `14:00`   | hours 1–11 without suffix assumed PM  |
| `10am`     | `10:00`   | explicit AM suffix                    |
| `10:30 AM` | `10:30`   | AM with colon separator               |
| `12pm`     | `12:00`   | noon                                  |
| `12am`     | `00:00`   | midnight                              |
| `12.00`    | `12:00`   | no suffix, 12 stays as noon           |
| `19:30`    | `19:30`   | 24-hour unchanged                     |
| `21.30`    | `21:30`   | 24-hour with dot separator            |

Rules: hours 1–11 with no AM/PM suffix are assumed PM (+12). Hour 12 with no suffix stays as `12:00` (noon). Hours 13–23 are taken as-is. Explicit `am`/`pm` suffix (case-insensitive, with or without space) overrides the default. Minutes are optional when using the AM/PM suffix (`7pm` → `19:00`). Separator can be `.` or `:`.

**Validation** — after normalization, invalid entries (bad format, impossible calendar date, hour > 23, minute > 59) are highlighted with a red cell border. Dates outside `currentYear ± 1` are also flagged red. The auditions editor additionally shows a text error box beneath the dates table describing each invalid date and listing accepted formats. Empty required fields are not highlighted during editing but are caught at save time. Clicking **Save** runs a full scan and shows a specific error list if anything is invalid; this includes a check that the first audition date (auditions) or earliest performance date (calendar) falls in `currentYear` — if not, the error message names the correct year file to use instead. The calendar editor checks every performance row; the auditions editor additionally rejects records with no audition date rows.

## Calendar — Shows

### Data schema (`data/shows/<year>/<company-id>-<year>.json`)

One file per company per year. Top-level shape:

```json
{ "company": "SCS", "year": 2026, "runs": [ <Run>, ... ] }
```

#### `Run`

| Field          | Type            | Notes                                                                                                                                             |
| -------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | `string`        | `"run-<timestamp>"` — stable, editor-assigned                                                                                                     |
| `company`      | `string`        | Company `abvName` from `sc-theater-companies.json`                                                                                                |
| `showAbv`      | `string`        | Short label shown in calendar chips                                                                                                               |
| `show`         | `string`        | Full production title                                                                                                                             |
| `description`  | `string?`       | Optional narrative paragraph; supports `**bold**` and `*italic*`                                                                                  |
| `genre`        | `Genre[]`       | Up to 2 values from `Drama \| Musical \| Comedy \| Other`; empty array when unset. Legacy string values are coerced to single-item array on read. |
| `venue`        | `string`        | Venue name from `sc-theater-venues.json`, or free text                                                                                            |
| `price`        | `string`        | Display string, e.g. `"$72-$92"`                                                                                                                  |
| `discounts`    | `string`        | Default discount text for all performances                                                                                                        |
| `infoUrl`      | `string`        | Show info page                                                                                                                                    |
| `ticketsUrl`   | `string`        | Default ticket link                                                                                                                               |
| `performances` | `Performance[]` | Ordered list of date/time slots                                                                                                                   |

#### `Performance`

| Field        | Type       | Notes                                              |
| ------------ | ---------- | -------------------------------------------------- |
| `date`       | `string`   | `YYYY-MM-DD`                                       |
| `time`       | `string`   | `HH:MM` 24-hour                                    |
| `perfType`   | `PerfType` | `"" \| Preview \| Opening \| Closing \| Talk-back` |
| `discounts`  | `string`   | Non-empty overrides `Run.discounts`                |
| `ticketsUrl` | `string`   | Non-empty overrides `Run.ticketsUrl`               |

#### `PerformanceEvent` (flattened, from `getPerformances()`)

Run metadata merged with each `Performance`. `discounts` and `ticketsUrl` are already resolved (performance value wins when non-empty). Sorted by date, then time.

#### `Venue`

The canonical venue list lives in `data/sc-theater-venues.json`. Each entry has `code`, `name`, `address`, and `website`. The calendar and auditions editors both use this file to drive venue autocomplete. `Run.venue` stores the venue **name** from this list, or `"Other"` for unlisted venues.

### Calendar editor (`calendar.js`)

The editor opens with a context-aware prompt:

- **Admin users** — toolbar shows a company selector (populated from `sc-theater-companies.json` via `buildCompanyOptions()`); main panel prompts "Select company / year".
- **Non-admin users** — toolbar shows a year selector for their company; main panel prompts "Select a year". If only one year of data exists for their company, the file is loaded automatically (no selection required).

The **+ New** button in the runs sidebar is hidden until a company file is loaded. The sidebar column stays blank until data is loaded.

The runs sidebar is user-resizable via a drag handle (default 160 px, range 130–400 px).

The **Venue** field is a text input with autocomplete driven by `sc-theater-venues.json` — the same dropdown pattern as the auditions location field. Selecting a venue stores its full name (e.g. `"The Grove"`). Files that previously stored a venue code are translated to the name on load for backward compatibility.

Import and Export buttons have been removed from the toolbar UI; the underlying functions (`importJSON`, `handleImport`, `openExport`, `closeExport`, `downloadJSON`) are retained in the module for future reinstatement if desired.

Date and time fields use the shared normalization and validation described under [Date and time input](#date-and-time-input--normalization-and-validation).

## Auditions

### Data schema (`data/auditions/<year>/<company-id>-auditions-<year>.json`)

One file per company per year. Top-level shape:

```json
{ "company": "MCT", "year": 2026, "auditions": [ <Audition>, ... ] }
```

#### `Audition`

| Field               | Type               | Notes                                                                                                                                             |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | `string`           | `"audition-<timestamp>"` — stable, editor-assigned                                                                                                |
| `production`        | `string`           | Full production title                                                                                                                             |
| `genre`             | `Genre[]`          | Up to 2 values from `Drama \| Musical \| Comedy \| Other`; empty array when unset. Legacy string values are coerced to single-item array on read. |
| `productionId`      | `string?`          | Soft ref to a `Run` id in shows data (not exposed in editor UI)                                                                                   |
| `auditionDates`     | `AuditionDate[]`   | Ordered list of audition sessions; each carries its own location                                                                                  |
| `rolesAvailable`    | `AuditionRole[]`   | Roles being cast                                                                                                                                  |
| `prep`              | `AuditionPrep?`    | `{ acting?, singing?, dance?, bring? }`                                                                                                           |
| `rehearsalStart`    | `string?`          | `YYYY-MM-DD`                                                                                                                                      |
| `openingDate`       | `string?`          | `YYYY-MM-DD`                                                                                                                                      |
| `contact`           | `AuditionContact?` | `{ name?, email?, phone? }`                                                                                                                       |
| `auditionNoticeUrl` | `string?`          | Link to full audition notice                                                                                                                      |
| `productionUrl`     | `string?`          | Link to production page                                                                                                                           |
| `notes`             | `string?`          | Full-width notes shown at bottom of expanded card                                                                                                 |
| `createdAt`         | `string`           | ISO 8601 timestamp                                                                                                                                |
| `updatedAt`         | `string`           | ISO 8601 timestamp                                                                                                                                |

#### `AuditionDate`

| Field       | Type                | Notes                                                                                |
| ----------- | ------------------- | ------------------------------------------------------------------------------------ |
| `date`      | `string`            | `YYYY-MM-DD`                                                                         |
| `startTime` | `string`            | `HH:MM` 24-hour                                                                      |
| `endTime`   | `string`            | `HH:MM` 24-hour                                                                      |
| `notes`     | `string?`           | e.g. `"First come, first served"`                                                    |
| `location`  | `AuditionLocation?` | `{ name, address? }` — per date, since different sessions may be in different venues |

#### `AuditionRole`

| Field         | Type               | Notes                                          |
| ------------- | ------------------ | ---------------------------------------------- |
| `role`        | `string`           | Character name                                 |
| `type`        | `AuditionRoleType` | `lead \| supporting \| ensemble`               |
| `gender`      | `AuditionGender`   | `female \| male \| any`                        |
| `ageRange`    | `string?`          | e.g. `"30s"`, `"20s–40s"`, `"18+"`, `"Any"`    |
| `voicePart`   | `string?`          | e.g. `"Soprano"`, `"Baritone"` — musicals only |
| `description` | `string?`          | Optional casting note                          |

#### Data access

`getAuditions()` in `src/lib/data.ts` compiles all `data/auditions/**/*.json` files via `import.meta.glob` and returns a flat `AuditionEvent[]` (audition + `company` + `year`), sorted by earliest `auditionDate.date` ascending.

The `/auditions` page is "upcoming" by default — an audition is upcoming when its latest `auditionDate.date` is ≥ today's date. Past/all filtering is handled client-side.

Past audition cards show a small "Past" pill in the collapsed header (right side, above the date range), applied client-side via a `.past` CSS class.

#### Deep-linking

A `?id=<timestamp>` URL parameter targets a specific audition record (the `audition-` prefix is stripped from the id for brevity; the page re-adds it when looking up the card). When a valid id is provided the page switches to single-card mode: the filter bar and subtitle are hidden, the page title changes to "Audition" at a reduced size, all other cards are hidden, and the target card is shown expanded. If the id is not recognised the list and filter bar are hidden and an error message is shown. URL format: `https://santacruz.theater/auditions?id=1735000000002`.

### Auditions editor (`auditions.js`)

Follows the same mount/unmount pattern as `calendar.js`. The company selector is populated from every company except the admin sentinel entry in `sc-theater-companies.json` via the shared `buildCompanyOptions()` function in `api.js`, with `Other` listed last. If the selected company has no existing file, one is created automatically for the current year. If existing files are all for the current year or earlier and the current year is present, it is auto-loaded without requiring a year selection.

The **+ New** button in the auditions sidebar is hidden until a company file is loaded. The sidebar column stays blank until data is loaded.

The form is split into a fixed header (production title, company badge, delete button) and a fixed fields row (company, genre, rehearsal start, opening date, production title, URLs), followed by a scrollable body containing: Audition Dates → Roles Available → Prepare/Contact → Notes.

- **Audition dates table** — inline-editable rows for date, start/end time, location name, address, and session notes. Date and time fields use the shared normalization and validation described under [Date and time input](#date-and-time-input--normalization-and-validation); start time and end time are both required.
- **Roles table** — inline-editable; Voice Part column is shown only when Musical is one of the selected genres.
- **Musical-only fields** — Singing and Dance prep rows, and the Voice Part column in the roles table, are shown only when Musical is one of the selected genres.
- **Roles Available section** — suppressed entirely (header and table) when no roles are defined, both in the editor and on the public `/auditions` page.

#### Save and dirty-check

The Save button and status bar ("unsaved changes" / "saved") are driven by `computeIsDirty()`, which compares the current state of every audition in the loaded file against a snapshot taken on load (and refreshed after each successful save). The comparison uses `JSON.stringify` on the cleaned record (empty date rows filtered, `updatedAt` excluded). If all records match their snapshots and no records have been added or deleted, the file is considered clean — so opening a record and saving without making any changes does not advance `updatedAt` or show unsaved-changes state.

`updatedAt` is only advanced at save time, and only for records whose content has actually changed since the last save.

#### Restore button

A **Restore** button appears in the record header (to the left of Delete) when the active record has unsaved changes — i.e. its current state differs from its snapshot. Clicking Restore re-applies the snapshot, discarding in-editor changes. The button is hidden for newly created records (which have no snapshot) and whenever the record matches its snapshot.

#### Card preview

The **Preview** button (toolbar) renders a modal (`#audPreviewBody`) showing what the collapsed audition card will look like on the public `/auditions` page. The preview HTML is built in `openPreview()` (`auditions.js`~line 1529) and must be kept in sync with the collapsed `<button class="aud-summary">` markup in `src/pages/auditions.astro`. Specifically, the `.pv-meta-row` line in the preview mirrors the `.aud-meta-row` div on the public page — any field added to one must be added to the other.

### Email notifications

Subscribers receive a daily digest when new or updated auditions have been posted since the last digest, plus a one-off welcome email on subscribing. Delivered via **Buttondown** (handles subscriber management, unsubscribe compliance, and delivery; subscribers are added with `type: "regular"` — no double opt-in).

#### Local audition data access

`netlify/functions/lib/auditions-data.mts` — reads `data/auditions/**/*.json` and `data/sc-theater-companies.json` directly via Node `fs` from the function bundle, rather than the GitHub Contents API. These files are shipped with the function bundle via `[functions].included_files` in `netlify.toml`, so this is current as of the last deploy with no network round-trips at request time. Exports `loadAllAuditions()`, `isUpcoming()`, `getUpcomingAuditions()`, and `classifyForDigest(auditions, lastSent)`. Shared by `send-audition-digest.mts` and `subscribe.mts` — this is the single source of truth for reading audition data in serverless functions; do not duplicate it or reintroduce GitHub API calls for this purpose.

#### Subscription

`netlify/functions/subscribe.mts` — POST handler. Accepts `{ email }`, calls `POST https://api.buttondown.email/v1/subscribers`, and returns a user-facing message for each outcome (201 new, 409/422 already subscribed, 400/5xx errors). The submit button is disabled while the request is in flight. On 201, triggers the welcome email (below) before returning the success response.

The subscribe widget appears on `/auditions` (below the header, above the filter bar; hidden in deep-link and not-found modes) and on the standalone `/subscribe` page.

#### Welcome email

On a successful new subscription, `subscribe.mts` sends a one-off welcome email containing all current upcoming auditions (via `getUpcomingAuditions(loadAllAuditions())` and `buildWelcomeHtml`), using Buttondown's create-draft → send-draft → delete-draft flow (`POST /v1/emails`, `POST /v1/emails/{id}/send-draft` with `recipients: [email]`, `DELETE /v1/emails/{id}`). The draft is created first; if that fails, send/delete are skipped. Once a draft id exists, send-draft and delete run inside a `try/finally` so the delete is always attempted even if send-draft fails, preventing orphaned drafts. Failures at any step are logged and ping `SUBSCRIBE_HEALTHCHECK_URL` (if set) but never change the user-facing response — the subscription itself already succeeded. If there are no upcoming auditions, the email shows a single fallback line instead of an empty list.

#### Scheduled digest

`netlify/functions/send-audition-digest.mts` — runs at `0 2 * * *` (02:00 UTC, configured in `netlify.toml`). Steps:

1. Read `last-sent` ISO timestamp from Netlify Blob Storage (store: `audition-notifications`, key: `last-sent`; missing key → treats all records as new).
2. Load all audition files via `loadAllAuditions()` and classify with `classifyForDigest()`: **new** if `createdAt` > last-sent; **updated** if `updatedAt` > last-sent and `createdAt` ≤ last-sent.
3. If nothing to send, exit without touching the timestamp (still pings `DIGEST_HEALTHCHECK_URL` if set).
4. `DRY_RUN=true` env var — logs what would be sent without calling Buttondown or updating the timestamp.
5. POST digest HTML to `https://api.buttondown.email/v1/emails` with `status: "about_to_send"`.
6. Write the new `last-sent` timestamp to Blob Storage only on success.
7. Ping `DIGEST_HEALTHCHECK_URL` (if set).

#### Email template

`netlify/functions/lib/email-template.mts` — exports `buildDigestHtml(newAuditions, updatedAuditions, baseUrl)` and `buildWelcomeHtml(auditions, baseUrl)`. Inline styles only (email client compatibility). The digest has two sections, **New Auditions** and **Updated Auditions** (Updated section omitted when empty); the welcome email is a single flat list (or a fallback line when empty), with no new/updated split. Each entry shows production title, company, up to 3 audition date rows (with overflow count), and a deep-link to the record on the public site.

#### Shared formatting module

`src/lib/audition-format.ts` — pure functions with no Astro or DOM dependencies. Exported: `fmt12`, `fmtTimeRange`, `fmtFullDate`, `fmtShortDate`, `fmtAudDateRange`, `rolesSum`, `rolesSummaryEmail`. Used by:

- `src/pages/auditions.astro` (imported directly at build time)
- `netlify/functions/send-audition-digest.mts` (resolved via esbuild bundling)
- `public/admin/auditions.js` (imports from `/admin/audition-format.js` at runtime)

The browser module at `/admin/audition-format.js` is generated by `src/pages/admin/audition-format.js.ts` using Vite `?raw` + two regexes to strip TypeScript syntax. Do not create a separate hand-maintained file at `public/admin/audition-format.js`.

## Companies

### Data schema (`data/sc-theater-companies.json`)

Hand-editable. The `/companies` page reads this at build time and filters out `adminOnly` entries. Logos are stored locally in `public/images/companies/` — download from the company's site and add the local path here rather than linking externally.

#### `CompaniesFile` (top-level shape)

```json
{ "companies": [ <CompanyEntry>, ... ] }
```

#### `CompanyEntry`

| Field          | Type                  | Notes                                                                                                                                                                                         |
| -------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | `string`              | Kebab-case slug, e.g. `"scs"`                                                                                                                                                                 |
| `abvName`      | `string`              | Short display label used in selectors and sidebar chips; `id` is used for data linkage                                                                                                        |
| `name`         | `string`              | Full company name                                                                                                                                                                             |
| `primaryVenue` | `string?`             | Main performing venue (display string)                                                                                                                                                        |
| `venueCode`    | `string?`             | Venue code from the [venue list](#venue-list) in Calendar — Shows, or a custom string for new venues                                                                                          |
| `website`      | `string?`             | Company website URL                                                                                                                                                                           |
| `logo`         | `string?`             | Local path, e.g. `"/images/companies/scs-logo.png"`                                                                                                                                           |
| `logoDark`     | `boolean?`            | `true` when the logo is white/light and needs a dark card background                                                                                                                          |
| `editors`      | `{email,datasets}[]?` | Array of editor objects. Each grants the named email access to the listed datasets, e.g. `[{"email":"x@y.com","datasets":["calendar"]}]`. Admin entry uses this to identify site-wide admins. |
| `adminOnly`    | `boolean?`            | `true` for the admin sentinel entry — excluded from public companies page                                                                                                                     |

The first entry (`id: "admin"`, `adminOnly: true`) is a sentinel used by the editor to grant site-wide access; it is never rendered on the public `/companies` page. The entry for 'Other Companies' (`id: "other"`, `adminOnly: true`) is used to manage file of runs for companies that are not explicitly named in the system. These runs are editable by admin user only and there is no corresponding entry on the Companies page.

**Entry ordering** — the order of entries in this file determines the display order in company filter dropdowns (no sort is applied in code); keep these in the desired display order with `admin` first and `other` last. Editor selectors (`buildCompanyOptions` in `api.js`) sort independently by `abvName` with `other` last, so JSON order does not affect them.

## Required Netlify environment variables

| Variable             | Purpose                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN`       | Fine-grained PAT with Contents read/write — used by `data.mjs` for admin writes                                                                  |
| `GITHUB_OWNER`       | GitHub repository owner — used by `data.mjs`                                                                                                     |
| `GITHUB_REPO`        | GitHub repository name — used by `data.mjs`                                                                                                      |
| `GITHUB_BRANCH`      | Branch to commit to (default: `main`) — used by `data.mjs`                                                                                       |
| `BUTTONDOWN_API_KEY` | Buttondown API key — used by `subscribe.mts` and `send-audition-digest.mts`                                                                      |
| `NETLIFY_SITE_ID`    | Site ID — must be set manually; scheduled functions do not receive it automatically                                                              |
| `NETLIFY_TOKEN`      | Netlify personal access token — required by `send-audition-digest.mts` for Blob Storage access (scheduled functions don't get an injected token) |
| `DRY_RUN`            | Optional. Set to `true` to run the digest function without sending email or updating the timestamp                                               |
| `DIGEST_HEALTHCHECK_URL`   | Optional. Pinged by `send-audition-digest.mts` on completion (success, failure, or nothing-to-send), for external monitoring                |
| `SUBSCRIBE_HEALTHCHECK_URL` | Optional. Pinged by `subscribe.mts` if the welcome email fails to send                                                                      |

## Git workflow

- For bug fixes and small enhancements: branch from `main`, merge back into `main` when verified
- For major features: branch from `dev`, merge back into `dev`
- No PRs — merge directly; always confirm the current branch with `git branch` before committing
- Never commit directly to `main` or `dev`
- Netlify deploys from `main` — only merge to `main` when the fix is verified
