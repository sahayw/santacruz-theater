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
- `netlify/functions/` — serverless functions (currently: `fetch-page.mjs`)

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
| `company`      | `Company`       | `SCS \| AT \| MCT \| Renegade \| Cabrillo \| ABT \| Other \| ""` |
| `showAbv`      | `string`        | Short label shown in calendar chips                              |
| `show`         | `string`        | Full production title                                            |
| `description`  | `string?`       | Optional narrative paragraph; supports `**bold**` and `*italic*` |
| `genre`        | `Genre`         | `Drama \| Musical \| Comedy \| Tragedy \| Other \| ""`           |
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

| Field          | Type       | Notes                                                                     |
| -------------- | ---------- | ------------------------------------------------------------------------- |
| `id`           | `string`   | Kebab-case slug, e.g. `"scs"`                                             |
| `abvName`      | `string`   | Short key; matches `Run.company` for calendar-linked companies             |
| `name`         | `string`   | Full company name                                                         |
| `primaryVenue` | `string?`  | Main performing venue (display string)                                    |
| `venueCode`    | `string?`  | Venue code from the table above, or a custom string for new venues        |
| `website`      | `string?`  | Company website URL                                                       |
| `logo`         | `string?`  | Local path, e.g. `"/images/companies/scs-logo.png"`                       |
| `logoDark`     | `boolean?` | `true` when the logo is white/light and needs a dark card background      |
| `editorEmail`  | `string?`  | Email matched against Netlify Identity login to scope editor access       |
| `adminOnly`    | `boolean?` | `true` for the admin sentinel entry — excluded from public companies page |

The first entry (`id: "admin"`, `adminOnly: true`) is a sentinel used by the editor to grant site-wide access; it is never rendered on the public `/companies` page.
