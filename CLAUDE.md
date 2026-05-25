# Santa Cruz Theater — Claude Notes

## Project overview

Astro 6 static site listing Santa Cruz theater performances, deployed to Netlify.
TypeScript strict mode. No UI framework.

## Key commands

| Command              | Action                                    |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Dev server at localhost:4321              |
| `npm run build`      | Build to `dist/`                          |
| `npm run preview`    | Preview production build locally          |
| `npm run check-data` | Dry-run: prints show count and date range |

## Folder conventions

- `src/components/` — reusable Astro components
- `src/layouts/` — page layout wrappers
- `src/pages/` — file-based routes
- `src/styles/` — global CSS
- `src/lib/data.ts` — `getShows()` / `getPerformances()` — the only data access layer
- `src/types.ts` — all shared TypeScript interfaces
- `data/` — `sc-theater-runs.json` (canonical source, editor-managed)
- `public/admin/` — editor SPA at `/admin` (static HTML, no build step)
- `scripts/` — one-off Node scripts (run with `tsx`)
- `docs/` — design documentation (e.g. `color-system.md`, `description-feature.md`)
- `netlify/functions/` — serverless functions (currently: `fetch-page.mjs`)

## Data schema

`data/sc-theater-runs.json` is produced by the editor at `/admin` using its
**Export JSON** button. Do not hand-edit it; use the editor instead.

### `RunsFile` (top-level shape)

```json
{ "runs": [ <Run>, ... ] }
```

### `Run`

| Field          | Type            | Notes                                                            |
| -------------- | --------------- | ---------------------------------------------------------------- |
| `id`           | `string`        | `"run-<timestamp>"` — stable, editor-assigned                    |
| `company`      | `Company`       | `SCS \| AT \| MCT \| Renegade \| Other \| ""`                    |
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
