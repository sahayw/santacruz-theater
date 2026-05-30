# Santa Cruz Theater — Claude Notes

## Project overview

Astro 6 static site covering Santa Cruz County theater — performances calendar, company directory, and (planned) auditions and services listings. Deployed to Netlify. TypeScript strict mode. No UI framework.

The site is structured as a hub (`/`) linking to four sections: **Calendar** (`/calendar`), **Companies** (`/companies`), **Auditions** (`/auditions` — stub), and **Services** (`/services` — stub). A fixed top nav (`SiteNav.astro`) is shared across all inner pages. An **About** page (`/about`) is linked from the home page footer and contains a Netlify contact form.

## Key commands

| Command              | Action                                    |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Dev server at localhost:4321              |
| `npm run build`      | Build to `dist/`                          |
| `npm run preview`    | Preview production build locally          |
| `npm run check-data` | Dry-run: prints show count and date range |

## Folder conventions

- `src/components/` — reusable Astro components
  - `calendar.astro` — entire calendar UI
  - `SiteNav.astro` — fixed top nav bar, shared across all inner pages
- `src/layouts/` — page layout wrappers
- `src/pages/` — file-based routes
  - `index.astro` — hub landing page; footer links to `/about`
  - `calendar.astro` — wraps `calendar.astro` component under the site nav
  - `companies.astro` — company directory, reads from `data/companies/sc-theater-companies.json`
  - `about.astro` — about page with community text and Netlify contact form
  - `auditions.astro` — stub
  - `services.astro` — stub
- `src/styles/` — global CSS
- `src/lib/data.ts` — `getShows()` / `getPerformances()` — the only data access layer for runs; compiles from all `data/shows/**/*.json` via `import.meta.glob`
- `src/types.ts` — all shared TypeScript interfaces
- `data/` — canonical data files
  - `shows/<year>/<company-id>-<year>.json` — per-company per-year show files; use the `/admin` editor to manage runs
  - `companies/sc-theater-companies.json` — company directory data, hand-editable
- `public/admin/` — editor SPA at `/admin` (static HTML, no build step)
- `public/images/companies/` — company logos downloaded locally; paths stored in `sc-theater-companies.json`
- `scripts/` — one-off Node scripts (run with `tsx`)
  - `split-runs.ts` — migration script that split the old single `sc-theater-runs.json` into the per-company per-year structure
- `docs/` — design documentation (e.g. `color-system.md`, `description-feature.md`)
- `netlify/functions/` — serverless functions
  - `data.mjs` — GET/PUT show files via GitHub API; PUT requires a valid Netlify Identity JWT; commits trigger a Netlify rebuild
  - `fetch-page.mjs` — server-side HTML proxy for the editor's description-fetch feature

## Data schema

### Shows (`data/shows/<year>/<company-id>-<year>.json`)

One file per company per year. Managed by the `/admin` editor. Do not hand-edit individual runs; use the editor instead.

### `ShowsFile` (top-level shape)

```json
{ "company": "SCS", "year": 2026, "runs": [ <Run>, ... ] }
```

### `Run`

| Field          | Type            | Notes                                                            |
| -------------- | --------------- | ---------------------------------------------------------------- |
| `id`           | `string`        | `"run-<timestamp>"` — stable, editor-assigned                    |
| `company`      | `Company`       | `SCS \| AT \| MCT \| Renegade \| Cabrillo \| Other \| ""`        |
| `showAbv`      | `string`        | Short label shown in calendar chips                              |
| `show`         | `string`        | Full production title                                            |
| `description`  | `string?`       | Optional narrative paragraph; supports `**bold**` and `*italic*` |
| `genre`        | `Genre`         | `Drama \| Musical \| Comedy \| Other \| ""`                      |
| `venue`        | `Venue`         | `G \| VMB \| PH \| AT \| CCT \| Other \| ""`                     |
| `price`        | `string`        | Display string, e.g. `"$72-$92"`                                 |
| `discounts`    | `string`        | Default discount text for all performances                       |
| `infoUrl`      | `string`        | Show info page                                                   |
| `ticketsUrl`   | `string`        | Default ticket link                                              |
| `performances` | `Performance[]` | Ordered list of date/time slots                                  |

### `Performance`

| Field        | Type       | Notes                                              |
| ------------ | ---------- | -------------------------------------------------- |
| `date`       | `string`   | `YYYY-MM-DD`                                       |
| `time`       | `string`   | `HH:MM` 24-hour                                    |
| `perfType`   | `PerfType` | `"" \| Preview \| Opening \| Closing \| Talk-back` |
| `discounts`  | `string`   | Non-empty overrides `Run.discounts`                |
| `ticketsUrl` | `string`   | Non-empty overrides `Run.ticketsUrl`               |

### `PerformanceEvent` (flattened, from `getPerformances()`)

Run metadata merged with each `Performance`. `discounts` and `ticketsUrl` are
already resolved (performance value wins when non-empty). Sorted by date, then time.

## Venue codes

| Code  | Venue                      |
| ----- | -------------------------- |
| `G`   | The Grove (SCS)            |
| `VMB` | Veterans Memorial Building |
| `PH`  | Park Hall (MCT)            |
| `AT`  | Actors' Theatre            |
| `CCT` | Cabrillo Crocker Theater   |

### Companies (`data/companies/sc-theater-companies.json`)

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
| `venueCode`    | `string?`             | Venue code from the table above, or a custom string for new venues                                                                                                                            |
| `website`      | `string?`             | Company website URL                                                                                                                                                                           |
| `logo`         | `string?`             | Local path, e.g. `"/images/companies/scs-logo.png"`                                                                                                                                           |
| `logoDark`     | `boolean?`            | `true` when the logo is white/light and needs a dark card background                                                                                                                          |
| `editors`      | `{email,datasets}[]?` | Array of editor objects. Each grants the named email access to the listed datasets, e.g. `[{"email":"x@y.com","datasets":["calendar"]}]`. Admin entry uses this to identify site-wide admins. |
| `adminOnly`    | `boolean?`            | `true` for the admin sentinel entry — excluded from public companies page                                                                                                                     |

The first entry (`id: "admin"`, `adminOnly: true`) is a sentinel used by the editor to grant site-wide access; it is never rendered on the public `/companies` page. The entry for 'Other Companies' (`id: "other"`, `adminOnly: true`) is used to manage file of runs for companies that are not explicitly named in the system. These runs are editable by admin user only and there is no corresponding entry on the Companies page.

## Editor authentication & data flow

The `/admin` SPA is structured as a hub with separate editor modules:

- `public/admin/index.html` — login overlay, hub (dataset tiles), routing
- `public/admin/api.js` — shared `apiFetch` / `apiPut` / `resolveUserAccess`
- `public/admin/calendar.js` — calendar editor ES module (`mount` / `unmount`)
- `public/admin/auditions.js` — auditions editor stub ES module

On production, `/admin` shows a full-screen login overlay first. After **Netlify Identity** login, the user's email is looked up in `sc-theater-companies.json` via `resolveUserAccess()`. The hub then renders one tile per dataset the user may edit. Selecting a tile mounts the corresponding editor module.

The Identity widget is initialised with `APIUrl: 'https://santacruz.theater/.netlify/identity'` to pin it to the production endpoint regardless of which Netlify URL the page is served from (prevents 400 errors on preview deploys).

The Identity widget issues a JWT; the editor sends it as `Authorization: Bearer <token>` on every PUT request. Netlify populates `context.clientContext.user` automatically — no manual JWT validation needed in `data.mjs`.

In local dev (`localhost`) authentication is skipped entirely; the hub starts with full admin access and all dataset tiles visible.

The home page (`src/pages/index.astro`) loads the Identity widget and handles `#invite_token` / `#recovery_token` URL fragments so invite and password-reset emails work correctly on the personal Netlify plan (which does not support custom email templates).

### Calendar editor (`calendar.js`)

The editor opens with a context-aware prompt:

- **Admin users** — toolbar shows a company selector; main panel prompts "Select company / year".
- **Non-admin users** — toolbar shows a year selector for their company; main panel prompts "Select a year". If only one year of data exists for their company, the file is loaded automatically (no selection required).

The runs sidebar is user-resizable via a drag handle (default 160 px, range 130–400 px).

Import and Export buttons have been removed from the toolbar UI; the underlying functions (`importJSON`, `handleImport`, `openExport`, `closeExport`, `downloadJSON`) are retained in the module for future reinstatement if desired.

## Required Netlify environment variables

| Variable        | Purpose                                   |
| --------------- | ----------------------------------------- |
| `GITHUB_TOKEN`  | Fine-grained PAT with Contents read/write |
| `GITHUB_OWNER`  | GitHub repository owner                   |
| `GITHUB_REPO`   | GitHub repository name                    |
| `GITHUB_BRANCH` | Branch to commit to (default: `main`)     |
