# Santa Cruz Theater

A resource for theater-goers and theater companies in Santa Cruz County — built as an Astro 6 static site, deployed to Netlify. Built with assistance from Claude Code (under very close supervision).

Four sections, accessible from a persistent top nav and a hub landing page:

1. **Calendar** — performances calendar ✓
2. **Companies** — theater company directory with logos ✓
3. **Auditions** — upcoming audition listings ✓
4. **Services** — crew, props, and production resources _(planned)_

An **About** page is linked from the home page footer and includes a contact form.

A companion **data editors** at `/admin` manage show and audition data without requiring a local build or deploy. Changes saved in the editor commit directly to GitHub, triggering a Netlify rebuild.

---

## Performances

### Annual view (default)

A full-year grid of months, each showing mini day cells. Days with performances are coloured by company, or a fallback color if there are performances by multiple companies on that day. Hovering a day shows a small panel listing every performance on that date with company, time, and show title. Clicking drills down into the weekly view for that date's week. On touch devices, tapping day gives the performances for that day, tapping that panel gives the weekly view.

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

## Companies directory

The `/companies` page displays a card grid of Santa Cruz County theater companies, showing the company logo. Links to URL specified in JSON data (should be the company website).

Company data lives in `data/sc-theater-companies.json`. Logos are downloaded locally to `public/images/companies/` so the site has no runtime dependency on external image hosts. Companies whose logos are white-on-transparent use a dark card background (`"logoDark": true`). Adding a new company requires only a new entry in the JSON file — no code changes.

---

## Auditions

The `/auditions` page lists upcoming open calls from Santa Cruz County theater companies. Cards are collapsed by default, showing the production title, genre badge, company colour dot, opening date, a roles summary, and the audition date range. Clicking a card expands a detail panel with full audition dates and times, locations, preparation requirements, contact info, and a roles table. Past audition cards show a small "Past" pill in the collapsed header. Cards for auditions updated since they were first posted show a blue "Updated" pill.

A filter bar with Company, Genre, and When controls (Upcoming / All dates / Past only) narrows the list client-side. Filter defaults to Upcoming.

A `?id=<timestamp>` URL parameter opens a single audition record directly (filter bar hidden, all other cards hidden, target card expanded). An unrecognised id shows an error message.

A subscribe widget is shown below the page header (hidden in deep-link and not-found modes). The standalone `/subscribe` page provides the same form with additional context. Both submit to `/.netlify/functions/subscribe`, which adds the address to the Buttondown subscriber list. Buttondown sends a double opt-in confirmation email automatically; unsubscribe links are included in every email.

### Auditions data

Data lives in `data/auditions/<year>/<company-id>-auditions-<year>.json` — one file per company per year. `getAuditions()` in `src/lib/data.ts` imports all files at build time and returns a flat, sorted `AuditionEvent[]`. The upcoming/past distinction is determined client-side from the user's current date.

Location is stored per `AuditionDate`, so different sessions of the same audition can be in different venues. Collapsed cards show only the date range; location appears in the expanded detail per date row. Voice Part is only shown for Musical genre auditions; Singing and Dance prep fields are similarly Musical-only.

### Email notifications

A daily digest email is sent to subscribers when new or updated auditions have been posted since the previous digest. Delivered via **Buttondown**.

**Subscribing** — an email form appears on `/auditions` (below the header) and on the standalone `/subscribe` page. Submissions go to `/.netlify/functions/subscribe`, which calls the Buttondown API. Buttondown sends a double opt-in confirmation; unsubscribe links are included in every outgoing email.

**Digest** — `netlify/functions/send-audition-digest.mts` runs at 02:00 UTC. It reads current audition data from the GitHub API, compares `createdAt`/`updatedAt` timestamps against a "last sent" value stored in Netlify Blob Storage, and sends a digest if anything is new or updated. New and updated auditions are presented in separate sections; each entry links directly to the audition record on the site. The last-sent timestamp is updated only after a successful send.

Setting `DRY_RUN=true` in Netlify environment variables causes the function to log what it would send without calling Buttondown.

---

## About page and contact form

`/about` explains the site's purpose and invites feedback via a contact form. The form uses **Netlify Forms** — no serverless function needed. Submissions appear in the Netlify dashboard under **Forms**, and email notifications are configured there (Site settings → Forms → Notifications). The notification address is set entirely in the Netlify UI, not in code.

On successful submission the form is replaced by a confirmation message; after 5 seconds the user is returned to the home page.

---

## Data model

### Companies

Full company profiles (name, primary venue, website, logo) are in `data/sc-theater-companies.json` (hand-editable).

#### Colour system

Companies have distinct colour identities in displays:

| Key        | Full name                   | Color identity |
| ---------- | --------------------------- | -------------- |
| `SCS`      | Santa Cruz Shakespeare      | Rose           |
| `AT`       | Actors' Theatre             | Blue           |
| `MCT`      | Mountain Community Theater  | Green          |
| `Renegade` | Renegade Theater            | Teal           |
| `Other`    | not individually identified | None (grey)    |

Colors are defined at three saturation tiers: muted fills for area backgrounds, muted dot accents for small legend pips, and vivid accents for chip bar stripes and show-card badges.

See [`docs/color-system.md`](docs/color-system.md) for the full variable reference, hex values, and instructions for adding a new company colour.

### Venues

Venue names and addresses are maintained in `data/sc-theater-venues.json` (hand-editable). Both editors use this file to drive venue autocomplete.

### Shows Files (top-level shape)

```json
{ "company": "SCS", "year": 2026, "runs": [ <Run>, ... ] }
```

### Auditions Files (top-level shape)

```json
{ "company": "MCT", "year": 2027, "auditions": [ <Audition>, ... ] }
```

### Genre

Hard coded: `Drama`, `Musical`, `Comedy`, `Other`.

---

## Data editors (`/admin`)

### Authentication

Visiting `/admin` shows a login overlay (production only; dev skips auth). Sign in with a Netlify Identity account whose email matches an entry in `sc-theater-companies.json`. After login the hub shows a tile for each dataset the user has access to (e.g. Calendar Editor, Auditions Editor).

The Identity widget is pinned to `https://santacruz.theater/.netlify/identity` so that sign-in works correctly on preview deploys as well as the main domain.

### Data access

Data in `data/shows/<year>/<company-id>-<year>.json`and `data/auditions/<year>/<company-id>-auditions-<year>.json` is read and written via the `/.netlify/functions/data` endpoint, which commits to GitHub and triggers a rebuild.

It is not recommended to edit these files by hand. The scripts `check-shows.ts` and `check-auditions.ts` can be used to check for consistency of data with code expectations. Files can be archived by moving to some alternate directory.

`src/lib/data.ts` imports all show and audition JSON at build time via `import.meta.glob`. `getPerformances()` flattens runs into a sorted `PerformanceEvent[]` with per-slot overrides resolved; `getAuditions()` flattens auditions into a sorted `AuditionEvent[]`.

### Selecting data to edit

After choosing an editor tile the editor opens with a context-aware prompt:

- **Admin users** — a company selector appears in the toolbar (populated from `sc-theater-companies.json`); the main panel shows "Select company / year". Once a company is chosen a year selector appears. When year is picked the file loads.
- **Non-admin users** — the company is pre-determined by their login; a year selector appears immediately.

The top bar subtitle updates to reflect the active editor ("Edit Performances" or "Edit Auditions"). Clicking **← Editors** returns to the hub and resets the title.

For Auditiions, if only one year of data exists for the company that file loads automatically with no selection required.

### Runs sidebar

Lists all production runs for the loaded file. The sidebar column stays blank until a company file is loaded. Click a run to open it. The sidebar width is adjustable. The Company field in each run is read-only (set from the loaded file) to prevent inconsistencies between JSON file names and data content.

### Performances table

Below each run's metadata is an inline table of date/time slots. Each row is editable in place (date, time, performance type, per-slot discounts, per-slot ticket URL). Rows can be added individually or deleted with the × button.

### Pattern generator

A quick-fill tool for recurring schedules. Set a date range, choose days of the week (e.g. Fri/Sat/Sun), set a time, and click **Generate** — it adds the matching slots to the table in one step.

### Paste parser

Accepts free-form date text pasted from a website or email (e.g. `Friday, June 5 at 7:30pm`) and parses it into table rows. Lines that cannot be interpreted are listed separately so nothing is silently dropped.

### Date and time entry

Both the calendar and auditions editors accept relaxed date and time formats and normalize them on blur:

- **Dates** — `YYYY-MM-DD` is canonical, but `/` and `.` separators and 2-digit years are accepted: `26/6/13`, `2026.6.13`, `26-6-13` all normalize to `2026-06-13`. Order is always Y-M-D.
- **Times** — dot separator accepted: `21.30` normalizes to `21:30`.

Invalid entries (impossible dates, out-of-range hours or minutes) are highlighted with a red cell border immediately. Clicking **Save** runs a full validation pass across all records in the file and shows a specific error list before aborting — empty required fields and audition records with no date rows are caught here.

### Saving

The **Save** button commits the current file to GitHub (`data/shows/<year>/<company>-<year>.json`). In production a valid Netlify Identity session is required. The commit message records the editor's email address. Netlify detects the push and triggers a rebuild automatically.

---

## Auditions editor

Choosing the **Auditions Editor** tile opens a similar editor for audition listings.

The company selector shows every company except the admin sentinel entry from `sc-theater-companies.json` (populated via the shared `buildCompanyOptions()` function), with `Other` listed last. Selecting a company with no existing file creates one automatically for the current year. If a company's files are all for the current year or earlier, the current year loads without requiring a selection.

The sidebar column stays blank until a company file is loaded.

### Audition dates

Each audition record has one or more date rows, each with a date, start/end time, optional location (name and address), and session notes. Date and time fields use the same normalization and validation as the calendar editor; start and end times are required. A record with no date rows cannot be saved.

### Roles table

Inline-editable table of roles being cast. Columns: Role, Type, Gender, Age Range, Description — plus Voice Part for Musical genre productions only. If no roles are specified the section is hidden on the public page and the role count is omitted from the editor sidebar.

### Musical-only fields

When Genre is set to Musical, Singing and Dance fields appear in the Prepare section and the Voice Part column appears in the roles table. Switching away from Musical hides these fields and clears them from the saved data.

### Restore

A **Restore** button appears in the record header when the active record has unsaved changes. It reverts the record to its last saved state. The button is hidden when the record is clean and not shown at all for newly created records.

---

## Project structure

```
src/
  components/
    calendar.astro            # calendar interface
    SiteNav.astro             # shared site navigation
  lib/data.ts                 # build-time data loading
  lib/
    data.ts                   # build-time data loading
    audition-format.ts        # shared audition formatting (Astro + Netlify functions + browser)
  pages/
    index.astro               # home page
    calendar.astro            # calendar route
    companies.astro           # company directory
    auditions.astro           # auditions route
    subscribe.astro           # email subscription page
    about.astro               # about and contact page
    services.astro            # stub
    admin/
      audition-format.js.ts   # Astro endpoint serving shared module as browser ES module
  types.ts                    # shared TypeScript interfaces
data/
  shows/<year>/               # one JSON file per company per year, e.g. scs-2026.json
  auditions/<year>/           # one JSON file per company per year, e.g. renegade-auditions-2026.json
  sc-theater-companies.json   # company directory; hand-editable
  sc-theater-venues.json      # shared venue list; hand-editable
public/
  admin/
    index.html                # shell for data editors
    calendar.js               # calendar editor
    auditions.js              # auditions editor
    api.js                    # shared editor API helpers
  images/companies/           # locally stored company logos
astro.config.mjs              # Astro config, including Vite dev proxy
netlify/
  functions/
    data.mjs                  # data read/write endpoint
    fetch-page.mjs            # page-fetch proxy
    subscribe.mjs             # Buttondown subscription handler
    send-audition-digest.mts  # scheduled daily digest (02:00 UTC)
    lib/
      email-template.mts      # email HTML template for digest
scripts/
  check-shows.ts              # show data validation
  check-auditions.ts          # audition data validation
docs/
  color-system.md             # color reference
  description-feature.md      # notes on show description extraction feature (not currently used)
  home-page-spacing.md        # homepage layout notes inc device type differences
```

---

## Getting started

```sh
nvm use          # Node 22 (.nvmrc)
npm install
npm run dev      # http://localhost:4321
```

| Command                   | Action                                           |
| ------------------------- | ------------------------------------------------ |
| `npm run dev`             | Dev server at localhost:4321                     |
| `npm run build`           | Production build to `dist/`                      |
| `npm run preview`         | Preview the production build locally             |
| `npm run check-shows`     | Validates all show JSON files against schema     |
| `npm run check-auditions` | Validates all audition JSON files against schema |

## Build & deploy

```sh
npm run build     # outputs to dist/
npm run preview   # verify locally before pushing
npm release       # git merge dev to main and sync back to dev, so commits remain consistent
```

Netlify CI watches `main` and deploys on every push, using the config in `netlify.toml`.

### Netlify environment variables

Required (set in Netlify → Site configuration → Environment variables):

| Variable             | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `GITHUB_TOKEN`       | Fine-grained PAT, Contents r/w (used by `data.mjs`)          |
| `GITHUB_OWNER`       | Repository owner (GitHub username)                            |
| `GITHUB_REPO`        | Repository name                                               |
| `GITHUB_BRANCH`      | Branch to commit to (default: `main`)                         |
| `BUTTONDOWN_API_KEY` | Buttondown API key (used by `subscribe.mjs` and digest)       |
| `DRY_RUN`            | Optional. `true` runs the digest without sending or recording |

### Netlify Identity

Enabled under Netlify → Identity. Registration is set to **invite only**. Each editor is invited by email; their address must match an entry in the `editors` array in `sc-theater-companies.json`. Each editor entry specifies which datasets that person can edit (e.g. `["calendar"]` or `["calendar", "auditions"]`). The Netlify Identity widget is loaded on the home page (`src/pages/index.astro`) so invite and password-reset flows that arrive as URL fragments can be processed by Netlify Identity.
