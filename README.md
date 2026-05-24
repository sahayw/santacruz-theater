# Santa Cruz Theater

A performance calendar for Santa Cruz theater companies — built as an Astro 6 static site, deployed to Netlify.

The site displays the full 2026 season across six local companies in two complementary views: an **annual overview** that shows the whole year at a glance, and a **weekly drill-down** that reveals individual performance slots. A companion **data editor** at `/admin` manages all show and performance data without requiring a build or deploy.

---

## Calendar views

### Annual view (default)

A full-year grid of months, each showing mini day cells. Days with performances are coloured by company; days with multiple companies use a warm grey. Hovering a day opens a small panel listing every performance on that date with company, time, and show title. Clicking drills down into the weekly view for that date's week.

### Weekly drill-down

A scrollable grid of week columns. Each week has:

- **Shows column** — one chip per production running that week, with a coloured accent bar stripe and the show abbreviation
- **Day columns (Mon–Sun)** — coloured performance bars stacked within each day; clicking a bar opens the show card

Filters at the top of the page narrow by **company**, **genre**, and **time of day** (matinee / evening). The header back-arrow returns to the annual view.

### Show card (bottom sheet)

Tapping a performance bar slides up a card with the full production title, company badge, venue, date and time, price, available discounts, and links to the info page and ticket purchase. The ticket button is hidden if no URL is set.

### Footer legend

A persistent footer identifies each company by a coloured square and full name. A "Multiple companies" entry is shown when the annual view is in scope. Legend dots use the muted accent colour tier so they read clearly at small sizes without dominating the layout.

---

## Data model

All show data lives in `data/sc-theater-runs.json`, which the editor writes via its Export button. The structure is two-tier:

- **Run** — one production: company, full title, short abbreviation, genre, venue, price, discount text, info URL, ticket URL, and an ordered list of performances
- **Performance** — one date/time slot: date (`YYYY-MM-DD`), time (`HH:MM` 24 h), optional performance type (Preview / Opening / Closing / Talk-back), and optional per-slot overrides for discounts and ticket URL

`src/lib/data.ts` flattens runs into a sorted `PerformanceEvent[]` at build time, resolving per-slot overrides. The calendar component receives this flat array as a prop.

### Companies

| Key        | Full name                  | Color identity |
| ---------- | -------------------------- | -------------- |
| `SCS`      | Santa Cruz Shakespeare     | Rose           |
| `AT`       | Actors' Theatre            | Blue           |
| `MCT`      | Mountain Community Theater | Green          |
| `Renegade` | Renegade Theatre           | Teal           |
| `Cabrillo` | Cabrillo Stage             | None (grey)    |
| `ABT`      | Actors Beyond Theater      | None (grey)    |

### Venues

| Code  | Venue                      |
| ----- | -------------------------- |
| `G`   | The Grove (SCS)            |
| `VMB` | Veterans Memorial Building |
| `PH`  | Park Hall (MCT)            |
| `AT`  | Actors' Theatre            |
| `CCT` | Cabrillo Crocker Theater   |

---

## Data editor (`/admin`)

A self-contained single-page editor served statically from `public/admin/index.html` — no build step, no server dependency. It reads and writes to `localStorage` and exports to `data/sc-theater-runs.json`.

### Runs sidebar

Lists all production runs. Click a run to open it in the editor panel; click **+ New** to create one. Each run has fields for company, full title, short abbreviation, genre, venue, price, default discounts, info URL, and default ticket URL.

### Performances table

Below each run's metadata is an inline table of date/time slots. Each row is editable in place (date, time, performance type, per-slot discounts, per-slot ticket URL). Rows can be added individually or deleted with the × button.

### Pattern generator

A quick-fill tool for recurring schedules. Set a date range, choose days of the week (e.g. Fri/Sat/Sun), set a time, and click **Generate** — it adds the matching slots to the table in one step.

### Paste parser

Accepts free-form date text pasted from a website or email (e.g. `Friday, June 5 at 7:30pm`) and parses it into table rows. Lines that cannot be interpreted are listed separately so nothing is silently dropped.

### Import / Export

- **Export JSON** — serialises all runs to the canonical `sc-theater-runs.json` format and offers a download. Paste the file into `data/` and rebuild to publish.
- **Import JSON** — loads a previously exported file back into the editor. Runs with matching IDs are updated in place; new IDs are appended. Useful for continuing work across sessions or merging edits from another machine.

---

## Colour system

Companies are coloured at three saturation tiers: muted fills for area backgrounds, muted dot accents for small legend pips, and vivid accents for chip bar stripes and show-card badges. Cabrillo and ABT have no colour identity and fall through to grey at all tiers.

See [`docs/color-system.md`](docs/color-system.md) for the full variable reference, hex values, and instructions for adding a new company colour.

---

## Project structure

```
src/
  components/calendar.astro   # entire calendar UI — CSS, HTML, and JS in one file
  lib/data.ts                 # getShows() / getPerformances() — sole data access layer
  pages/index.astro           # root page; passes performances to the calendar component
  types.ts                    # shared TypeScript interfaces
data/
  sc-theater-runs.json        # canonical data; written by the editor's Export button
public/
  admin/index.html            # data editor SPA
scripts/
  check-data.ts               # dry-run: prints show count and date range (tsx)
docs/
  color-system.md             # colour variable reference
```

---

## Getting started

```sh
nvm use          # Node 20 (.nvmrc)
npm install
npm run dev      # http://localhost:4321
```

| Command              | Action                                    |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Dev server at localhost:4321              |
| `npm run build`      | Production build to `dist/`               |
| `npm run preview`    | Preview the production build locally      |
| `npm run check-data` | Dry-run: prints show count and date range |

## Build & deploy

```sh
npm run build    # outputs to dist/
npm run preview  # verify locally before pushing
```

Netlify CI watches `main` and deploys on every push, using the config in `netlify.toml`. The site is fully static — no server-side runtime required.
