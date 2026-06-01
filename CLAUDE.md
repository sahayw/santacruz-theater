# Santa Cruz Theater — Claude Notes

## Project overview

Astro 6 static site covering Santa Cruz County theater — performances calendar, company directory, and (planned) auditions and services listings. Deployed to Netlify. TypeScript strict mode. No UI framework.

The site is structured as a hub (`/`) linking to four sections: **Calendar** (`/calendar`), **Companies** (`/companies`), **Auditions** (`/auditions`), and **Services** (`/services` — stub). A fixed top nav (`SiteNav.astro`) is shared across all inner pages. An **About** page (`/about`) is linked from the home page footer and contains a Netlify contact form.

## Key commands

| Command                       | Action                             |
| ----------------------------- | ---------------------------------- |
| `npm run dev`                 | Dev server at localhost:4321       |
| `npm run build`               | Build to `dist/`                   |
| `npm run preview`             | Preview production build locally   |
| `npm run check-shows`         | Validate show JSON files against schema |
| `npm run check-auditions`     | Validate audition JSON files against schema |

## Documentation files

`CLAUDE.md` (this file) — Claude-specific notes: schemas, editor behaviour, data flow detail.  
`README.md` — developer-facing overview (used on GitHub): site sections, calendar UI, editor walkthrough, build/deploy. **When updating either doc, check the other for consistency.**

## Folder conventions

- `src/components/` — reusable Astro components
  - `calendar.astro` — entire calendar UI
  - `SiteNav.astro` — fixed top nav bar, shared across all inner pages
- `src/layouts/` — page layout wrappers
- `src/pages/` — file-based routes
  - `index.astro` — hub landing page; footer links to `/about`
  - `calendar.astro` — wraps `calendar.astro` component under the site nav
  - `companies.astro` — company directory, reads from `data/sc-theater-companies.json`
  - `about.astro` — about page with community text and Netlify contact form
  - `auditions.astro` — audition listings with filter bar and collapsible detail cards
  - `services.astro` — stub
- `src/styles/` — global CSS
- `src/lib/data.ts` — `getShows()` / `getPerformances()` / `getAuditions()` — sole data access layer; compiles from all `data/shows/**/*.json` and `data/auditions/**/*.json` via `import.meta.glob`
- `src/types.ts` — all shared TypeScript interfaces
- `data/` — canonical data files
  - `sc-theater-companies.json` — company directory data, hand-editable
  - `sc-theater-venues.json` — curated venue list used by both calendar and auditions editors for venue autocomplete
  - `shows/<year>/<company-id>-<year>.json` — per-company per-year show files; use the `/admin` editor to manage runs
  - `auditions/<year>/<company-id>-auditions-<year>.json` — per-company per-year audition files; use the `/admin` editor to manage
- `public/admin/` — editor SPA at `/admin` (static HTML, no build step)
- `public/images/companies/` — company logos downloaded locally; paths stored in `sc-theater-companies.json`
- `scripts/` — utility scripts (run with `tsx`)
  - `check-shows.ts` — validates all show JSON files against schema; also runs as part of `npm run build`
  - `check-auditions.ts` — validates all audition JSON files against schema; also runs as part of `npm run build`
- `docs/` — design documentation (e.g. `color-system.md`, `description-feature.md`)
- `netlify/functions/` — serverless functions
  - `data.mjs` — GET/PUT show files via GitHub API; PUT requires a valid Netlify Identity JWT; commits trigger a Netlify rebuild
  - `fetch-page.mjs` — server-side HTML proxy for the editor's description-fetch feature

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

The home page (`src/pages/index.astro`) loads the Identity widget and handles `#invite_token` / `#recovery_token` URL fragments so invite and password-reset emails work correctly on the personal Netlify plan (which does not support custom email templates).

### Date and time input — normalization and validation

Both the calendar and auditions editors normalize and validate date/time fields on cell change:

**Date normalization** — the editor accepts several entry formats and normalizes to `YYYY-MM-DD` on blur, updating the cell in place:

| Entered    | Stored as    |
| ---------- | ------------ |
| `26/1/2`   | `2026-01-02` |
| `2026/1/2` | `2026-01-02` |
| `26.01.02` | `2026-01-02` |
| `2026-1-2` | `2026-01-02` |

Format assumed to be `Y-M-D` (or `YY-M-D`). 2-digit years are prefixed with `20`.

**Time normalization** — dot separator is accepted and converted to colon (e.g. `21.30` → `21:30`).

**Validation** — after normalization, invalid entries (bad format, impossible calendar date, hour > 23, minute > 59) are highlighted with a red cell border. Empty required fields are not highlighted during editing but are caught at save time. Clicking **Save** runs a full scan across all records in the file and shows a specific error list if anything is invalid. The calendar editor checks every performance row; the auditions editor additionally rejects records with no audition date rows.

## Calendar — Shows

### Data schema (`data/shows/<year>/<company-id>-<year>.json`)

One file per company per year. Managed by the `/admin` editor. Do not hand-edit individual runs; use the editor instead.

#### `ShowsFile` (top-level shape)

```json
{ "company": "SCS", "year": 2026, "runs": [ <Run>, ... ] }
```

#### `Run`

| Field          | Type            | Notes                                                            |
| -------------- | --------------- | ---------------------------------------------------------------- |
| `id`           | `string`        | `"run-<timestamp>"` — stable, editor-assigned                    |
| `company`      | `string`        | Company `abvName` from `sc-theater-companies.json`               |
| `showAbv`      | `string`        | Short label shown in calendar chips                              |
| `show`         | `string`        | Full production title                                            |
| `description`  | `string?`       | Optional narrative paragraph; supports `**bold**` and `*italic*` |
| `genre`        | `Genre`         | `Drama \| Musical \| Comedy \| Other \| ""`                      |
| `venue`        | `string`        | Venue name from `sc-theater-venues.json`, or free text           |
| `price`        | `string`        | Display string, e.g. `"$72-$92"`                                 |
| `discounts`    | `string`        | Default discount text for all performances                       |
| `infoUrl`      | `string`        | Show info page                                                   |
| `ticketsUrl`   | `string`        | Default ticket link                                              |
| `performances` | `Performance[]` | Ordered list of date/time slots                                  |

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

#### Venue list

The canonical venue list lives in `data/sc-theater-venues.json`. Each entry has `code`, `name`, `address`, and `website`. The calendar and auditions editors both use this file to drive venue autocomplete. `Run.venue` stores the venue **name**; old files that stored a code are translated to the name on load. `check-data-contract.ts` accepts both codes and names.

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

| Field               | Type               | Notes                                                            |
| ------------------- | ------------------ | ---------------------------------------------------------------- |
| `id`                | `string`           | `"audition-<timestamp>"` — stable, editor-assigned               |
| `production`        | `string`           | Full production title                                            |
| `genre`             | `Genre`            | `Drama \| Musical \| Comedy \| Other \| ""`                      |
| `productionId`      | `string?`          | Soft ref to a `Run` id in shows data (not exposed in editor UI)  |
| `auditionDates`     | `AuditionDate[]`   | Ordered list of audition sessions; each carries its own location |
| `rolesAvailable`    | `AuditionRole[]`   | Roles being cast                                                 |
| `prep`              | `AuditionPrep?`    | `{ acting?, singing?, dance?, bring? }`                          |
| `rehearsalStart`    | `string?`          | `YYYY-MM-DD`                                                     |
| `openingDate`       | `string?`          | `YYYY-MM-DD`                                                     |
| `contact`           | `AuditionContact?` | `{ name?, email?, phone? }`                                      |
| `auditionNoticeUrl` | `string?`          | Link to full audition notice                                     |
| `productionUrl`     | `string?`          | Link to production page                                          |
| `notes`             | `string?`          | Full-width notes shown at bottom of expanded card                |
| `createdAt`         | `string`           | ISO 8601 timestamp                                               |
| `updatedAt`         | `string`           | ISO 8601 timestamp                                               |

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

### Auditions editor (`auditions.js`)

Follows the same mount/unmount pattern as `calendar.js`. The company selector is populated from all non-admin entries in `sc-theater-companies.json` via the shared `buildCompanyOptions()` function in `api.js`. If the selected company has no existing file, one is created automatically for the current year. If existing files are all for the current year or earlier and the current year is present, it is auto-loaded without requiring a year selection.

The **+ New** button in the auditions sidebar is hidden until a company file is loaded. The sidebar column stays blank until data is loaded.

The form is split into a fixed header (production title, company badge, delete button) and a fixed fields row (company, genre, rehearsal start, opening date, production title, URLs), followed by a scrollable body containing: Audition Dates → Roles Available → Prepare/Contact → Notes.

- **Audition dates table** — inline-editable rows for date, start/end time, location name, address, and session notes. Date and time fields use the shared normalization and validation described under [Date and time input](#date-and-time-input--normalization-and-validation); start time and end time are both required.
- **Roles table** — inline-editable; Voice Part column is shown only for Musical genre. Role count is hidden in the sidebar when no roles are defined.
- **Musical-only fields** — Singing and Dance prep rows, and the Voice Part column in the roles table, are shown only when genre is Musical.
- **Roles Available section** — suppressed entirely (header and table) when no roles are defined, both in the editor and on the public `/auditions` page.

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
| `abvName`      | `string`              | Short key; matches `Run.company` for calendar-linked companies                                                                                                                                |
| `name`         | `string`              | Full company name                                                                                                                                                                             |
| `primaryVenue` | `string?`             | Main performing venue (display string)                                                                                                                                                        |
| `venueCode`    | `string?`             | Venue code from the [venue list](#venue-list) in Calendar — Shows, or a custom string for new venues                                                                                          |
| `website`      | `string?`             | Company website URL                                                                                                                                                                           |
| `logo`         | `string?`             | Local path, e.g. `"/images/companies/scs-logo.png"`                                                                                                                                           |
| `logoDark`     | `boolean?`            | `true` when the logo is white/light and needs a dark card background                                                                                                                          |
| `editors`      | `{email,datasets}[]?` | Array of editor objects. Each grants the named email access to the listed datasets, e.g. `[{"email":"x@y.com","datasets":["calendar"]}]`. Admin entry uses this to identify site-wide admins. |
| `adminOnly`    | `boolean?`            | `true` for the admin sentinel entry — excluded from public companies page                                                                                                                     |

The first entry (`id: "admin"`, `adminOnly: true`) is a sentinel used by the editor to grant site-wide access; it is never rendered on the public `/companies` page. The entry for 'Other Companies' (`id: "other"`, `adminOnly: true`) is used to manage file of runs for companies that are not explicitly named in the system. These runs are editable by admin user only and there is no corresponding entry on the Companies page.

## Required Netlify environment variables

| Variable        | Purpose                                   |
| --------------- | ----------------------------------------- |
| `GITHUB_TOKEN`  | Fine-grained PAT with Contents read/write |
| `GITHUB_OWNER`  | GitHub repository owner                   |
| `GITHUB_REPO`   | GitHub repository name                    |
| `GITHUB_BRANCH` | Branch to commit to (default: `main`)     |
