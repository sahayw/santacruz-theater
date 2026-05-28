# Santa Cruz Theater

A resource for theater-goers and theater companies in Santa Cruz County — built as an Astro 6 static site, deployed to Netlify.

Four sections, accessible from a persistent top nav and a hub landing page:

1. **Calendar** — performances calendar ✓
2. **Companies** — theater company directory with logos ✓
3. **Auditions** — upcoming audition listings _(planned)_
4. **Services** — crew, props, and production resources _(planned)_

An **About** page is linked from the home page footer and includes a community contact form.

A companion **data editor** at `/admin` manages all show and performance data without requiring a build or deploy. Currently supports a single year (2026).

---

## About page and contact form

`/about` explains the site's purpose and invites feedback via a contact form. The form uses **Netlify Forms** — no serverless function needed. Submissions appear in the Netlify dashboard under **Forms**, and email notifications are configured there (Site settings → Forms → Notifications). The notification address is set entirely in the Netlify UI, not in code.

On successful submission the form is replaced by a confirmation message; after 5 seconds the user is returned to the home page.

---

## Companies directory

The `/companies` page displays a card grid of Santa Cruz County theater companies. Each card shows the company logo; hovering (on pointer devices) reveals the company name, venue, and a link. Tapping on mobile goes directly to the company website.

Company data lives in `data/sc-theater-companies.json`. Logos are downloaded locally to `public/images/companies/` so the site has no runtime dependency on external image hosts. Companies whose logos are white-on-transparent use a dark card background (`"logoDark": true`). Adding a new company requires only a new entry in the JSON file — no code changes.

---

## Calendar views

### Annual view (default)

A full-year grid of months, each showing mini day cells. Days with performances are coloured by company; days with multiple companies use a warm grey. Hovering a day opens a small panel listing every performance on that date with company, time, and show title. Clicking drills down into the weekly view for that date's week.

### Weekly drill-down

A scrollable grid of week columns. Each week has:

- **Shows column** — one chip per production running that week, with a coloured accent bar stripe and the show abbreviation. Hovering a chip (or tapping on mobile) opens a floating description panel when a description is set for that run.
- **Day columns (Mon–Sun)** — coloured performance bars stacked within each day; clicking a bar opens the show card

Filters at the top of the page narrow by **company**, **genre**, and **time of day** (matinee / evening). The header back-arrow returns to the annual view.

### Show card (bottom sheet)

Tapping a performance bar slides up a card with the full production title, company badge, venue, date and time, price, available discounts, and links to the info page and ticket purchase. The ticket button is hidden if no URL is set.

### Footer legend

A persistent footer identifies each company by a coloured square and full name. A "Multiple companies" entry is shown when the annual view is in scope. Legend dots use the muted accent colour tier so they read clearly at small sizes without dominating the layout.

---

## Data model

All show data lives in `data/sc-theater-runs.json`, which the editor writes via its Export button. The structure is two-tier:

- **Run** — one production: company, full title, short abbreviation, optional description paragraph, genre, venue, price, discount text, info URL, ticket URL, and an ordered list of performances
- **Performance** — one date/time slot: date (`YYYY-MM-DD`), time (`HH:MM` 24 h), optional performance type (Preview / Opening / Closing / Talk-back), and optional per-slot overrides for discounts and ticket URL

`src/lib/data.ts` flattens runs into a sorted `PerformanceEvent[]` at build time, resolving per-slot overrides. The calendar component receives this flat array as a prop.

### Companies

Calendar colour identities for companies that appear in `sc-theater-runs.json`:

| Key        | Full name                   | Color identity |
| ---------- | --------------------------- | -------------- |
| `SCS`      | Santa Cruz Shakespeare      | Rose           |
| `AT`       | Actors' Theatre             | Blue           |
| `MCT`      | Mountain Community Theater  | Green          |
| `Renegade` | Renegade Theater            | Teal           |
| `Cabrillo` | Cabrillo Stage              | None (grey)    |
| `Other`    | not individually identified | None (grey)    |

Full company profiles (name, venue, website, logo) are in `data/sc-theater-companies.json` and include additional companies not yet in the calendar (All About Theatre, The Landing).

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

Lists all production runs. Click a run to open it in the editor panel; click **+ New** to create one. Each run has fields for company, full title, short abbreviation, genre, venue, price, default discounts, info URL, and default ticket URL, plus an optional **Description** field. The description textarea provides **B** and **I** buttons which wrap the current selection in `**bold**` or `*italic*` markers, and a ↕ toggle expands the textarea for longer entries.

### Performances table

Below each run's metadata is an inline table of date/time slots. Each row is editable in place (date, time, performance type, per-slot discounts, per-slot ticket URL). Rows can be added individually or deleted with the × button.

### Pattern generator

A quick-fill tool for recurring schedules. Set a date range, choose days of the week (e.g. Fri/Sat/Sun), set a time, and click **Generate** — it adds the matching slots to the table in one step.

### Paste parser

Accepts free-form date text pasted from a website or email (e.g. `Friday, June 5 at 7:30pm`) and parses it into table rows. Lines that cannot be interpreted are listed separately so nothing is silently dropped.

### Import / Export

- **Export JSON** — serialises all runs to the canonical `sc-theater-runs.json` format and offers a download. Paste the file into `data/` and rebuild to publish.
- **Import JSON** — loads a previously exported two-tier `{ "runs": [...] }` file back into the editor. Runs with matching IDs are updated in place; new IDs are appended. Useful for continuing work across sessions or merging edits from another machine.

---

## Colour system

Companies are coloured at three saturation tiers: muted fills for area backgrounds, muted dot accents for small legend pips, and vivid accents for chip bar stripes and show-card badges. Cabrillo and ABT have no colour identity and fall through to grey at all tiers.

See [`docs/color-system.md`](docs/color-system.md) for the full variable reference, hex values, and instructions for adding a new company colour.

---

## Project structure

```
src/
  components/
    calendar.astro            # entire calendar UI — CSS, HTML, and JS in one file
    SiteNav.astro             # fixed top nav bar shared across all inner pages
  lib/data.ts                 # getShows() / getPerformances() — sole data access layer for runs
  pages/
    index.astro               # hub landing page; footer links to /about
    calendar.astro            # wraps calendar component under the site nav
    companies.astro           # company directory, reads sc-theater-companies.json at build time
    about.astro               # about page with community text and Netlify contact form
    auditions.astro           # stub
    services.astro            # stub
  types.ts                    # shared TypeScript interfaces
data/
  sc-theater-runs.json        # canonical run/performance data; written by the editor's Export button
  sc-theater-companies.json   # company directory; hand-editable
public/
  admin/index.html            # data editor SPA
  images/companies/           # locally stored company logos
netlify/
  functions/fetch-page.mjs    # server-side proxy, not currently used (CORS bypass)
scripts/
  check-data.ts               # dry-run: prints show count and date range (tsx)
docs/
  color-system.md             # colour variable reference
  description-feature.md      # show description field — editor UI, panel behaviour, fetch proxy
```

---

## Getting started

```sh
nvm use          # Node 20 (.nvmrc)
npm install
npm run dev      # http://localhost:4321
```

| Command                       | Action                                                                    |
| ----------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`                 | Dev server at localhost:4321                                              |
| `npm run build`               | Production build to `dist/`                                               |
| `npm run preview`             | Preview the production build locally                                      |
| `npm run check-data`          | Dry-run: prints show count and date range                                 |
| `npm run check-data-contract` | Validates the canonical two-tier JSON file and the display data transform |

## Build & deploy

```sh
npm run build    # outputs to dist/
npm run preview  # verify locally before pushing
```

Netlify CI watches `main` and deploys on every push, using the config in `netlify.toml`. The calendar itself is fully static. The `netlify/functions/fetch-page.mjs` serverless function is deployed alongside it and is only called from the `/admin` editor UI. Not currently in use.
