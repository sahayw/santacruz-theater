# Santa Cruz Theater — Claude Notes

## Project overview

Astro 6 static site covering Santa Cruz County theater — performances calendar, company directory, audition and event listings, and a services directory. Deployed to Netlify. TypeScript strict mode. No UI framework.

The site is a hub (`/`) linking to four sections: **Calendar** (`/calendar`), **Companies** (`/companies`), **Events** (`/events`), and **Services** (`/services`), plus an **About** page (`/about`) with a contact form. All content is maintained through a data editor at `/admin`; saving there publishes directly (commit → Netlify rebuild).

## Documentation map

| Doc                                                            | What it's for                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` (this file)                                        | Agent orientation: where things are, conventions, gotchas                                                                                                                                                                                            |
| [`docs/feature-guide.md`](docs/feature-guide.md)               | **Canonical description of what the system does** — every public-facing and editorial capability, written for anyone (not just editors) who wants the full picture without exploring the site. Read this to understand a feature before changing it. |
| [`docs/implementation.md`](docs/implementation.md)             | **Canonical technical reference** — data schemas, data flow, the `/admin` SPA, shared modules, functions, email, env vars, build/deploy. Read this before touching code.                                                                             |
| [`docs/ics-spec.md`](docs/ics-spec.md)                         | Calendar feeds design record — why feeds are static, subscribe-vs-single-event rules, occurrence ids, history window. Read before changing feed content or the Add to my calendar dialog. Both specs describe the current design; build and release history is in a History section at the end.                                                           |
| [`docs/notifications-spec.md`](docs/notifications-spec.md)     | Email updates, organizers & calendar redesign design record — two email lists, majors vs Other, organizers and venues as references, change detection, `/subscribe`, `/productions`, year/month/week views. Read before working on any of these. |
| `README.md`                                                    | GitHub-facing intro + quick start; points here for depth                                                                                                                                                                                             |

**When you change a feature or its data shape, update `docs/implementation.md` (schema/mechanics) and `docs/feature-guide.md` (user-visible behavior) in the same change — don't let them drift from the code or each other.**

## Key commands

| Command           | Action                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run dev`     | `netlify dev` at localhost:8888 — the whole system: public pages, functions, and the `/admin` editor         |
| `npm run check`   | Validate all data JSON (syntax + show, activity, service schemas), then run the vitest unit tests            |
| `npm run build`   | `npm run check`, Astro build to `dist/`, then validate the generated `.ics` feeds — Netlify's build command   |
| `npm run sync`    | Pull live `/admin` data edits into local `main` + `dev`. Run at the start of a feature branch.               |
| `npm run release` | Sync, then promote `dev` → `main` (deploy) and back-merge. Prompts, listing the commits it will ship.        |

There is no bare `astro dev` / `astro preview` script — `npm run dev` (netlify dev) covers both. Use `npx astro dev` directly if you ever want the lighter server without functions (the `/admin` editor won't load data there).

## Folder conventions

- `src/components/` — `calendar.astro` (calendar UI), `SiteNav.astro` (shared nav; `subscribe` prop adds Subscribe for updates), `PageBar.astro` (the `/productions` bar), `AddToCalendar.astro` (calendar-feed dialog), `SubscribeShell.astro` / `SubscribeChoices.astro` (the `/subscribe` pages)
- `src/pages/` — file-based routes: `index`, `calendar`, `companies`, `events`, `productions` (production pages — not in the nav), `subscribe` + `subscribe/manage` (email lists and a subscriber's choices), `services`, `about`, `admin/*.js.ts` (serve the shared `src/lib` modules as browser ES modules), `[...feed].ics.ts` (all calendar feeds, built statically), `missing-details.json.ts` (gaps list for the external alerting agent)
- `src/lib/` — `data.ts` (build-time data loading), `audition-format.ts` (shared formatting), `data-rules.ts` (shared validation rules and missing-details gaps), `organizers.ts` / `venues.ts` (who organizes a record; venue codes → places), `occurrence-ids.ts` (stable `perf-`/`session-` ids), `calendar-model.ts` / `ics.ts` (calendar feeds), `browser-module.ts` (serves a `src/lib` module to `/admin`), `email-lists.ts` / `notice-rules.ts` (email lists; digest change detection — §8) — see `docs/implementation.md` §6
- `src/types.ts` — shared data types
- `data/` — canonical data files; schemas in `docs/implementation.md` §3
- `public/admin/` — the editor SPA
- `public/images/companies/`, `public/images/services/` — locally stored images
- `scripts/` — `check-*.ts` (`npm run check`; `check-feeds.ts` runs after the build), `sync-branches.sh` / `release.sh` (`npm run sync` / `release`), `migrate-occurrence-ids.ts` / `migrate-organizers-venues.ts` / `migrate-subscribers.ts` (one-off, `npx tsx`)
- `tests/` — vitest unit tests (run by `npm run check`); fixture data in `tests/fixtures/`, never live `data/`
- `docs/` — `feature-guide.md`, `implementation.md`, `ics-spec.md` (calendar feeds design record), `notifications-spec.md` (email updates, organizers & calendar redesign design record)
- `netlify/functions/` — serverless functions; full list and purpose in `docs/implementation.md` §7. **New functions use the Netlify Functions v2 interface** (`export default async (req: Request) => ...` + `export const config`) rather than the legacy `export const handler = schedule(...)` style — the existing legacy function `data.mjs` isn't being migrated proactively. The nightly digest is a scheduled trigger (`send-digest.mts`) plus a background function (`send-digest-background.mts`) — see `docs/implementation.md` §8.

## Cross-cutting rules — easy to miss, don't skip

- **The "upcoming" rule for activities**: `closed` is never upcoming; virtual auditions without dates and events with `datesByRequest` and no dates stay upcoming; otherwise the latest date must be today or later (today is always the Santa Cruz date — `todayIso()`). It is implemented in the `/events` client filter, `isUpcomingActivity()` in `src/lib/data-rules.ts` (emails and digest change detection), and the editor Preview. Keep all three in sync — see `docs/implementation.md` §6.
- **Every performance and session has a permanent id** (`perf-…` / `session-…`, `src/lib/occurrence-ids.ts`) — it's the calendar-feed UID, so it must never change when a date or time is edited and is never derived from date, time, or array position. The editors assign it (and backfill on load, before snapshots, so `updatedAt` isn't bumped); `check-shows.ts` / `check-activities.ts` fail the build without it. Any new code path that creates performances or sessions must assign one.
- **Activity cards have four rendering paths**: the public Astro template, the deep-link view (inherits automatically), the editor's `buildPreviewHtml()`, and `activityCard()` in `email-template.mts`. A card-display change needs all four checked.
- **Rich-text fields share one Markdown renderer**: `src/lib/audition-format.ts`'s `renderMd()` escapes HTML and formats bold, italic, HTTP(S) links, and unordered lists. Activity, calendar, and service public views and editor previews must use it. Their textareas share the toolbar/shortcut logic in `public/admin/markdown-editor.js`; don't add local Markdown renderers. Its plain-text sibling `mdToPlain()` (calendar feed descriptions) handles the same syntax — change both together.
- **A record's organizer is never its `company` field** — `company` is the data file (`"other"` is the catch-all bucket, never an organizer). Show or match organizers via `recordOrganizerIds()` in `src/lib/organizers.ts` (public cards carry them as `data-organizers`, which `?company=` matches). Venues are codes resolved with `runPlace()` / `sessionPlace()` in `src/lib/venues.ts`. The companies/organizers and venue lists are hand-edited only. See `docs/notifications-spec.md`.
- **Validation rules live only in `src/lib/data-rules.ts`**, used by both the editors (on Save) and `scripts/check-*.ts` (at build) so they can't disagree. Never add a required-field or date rule directly to an editor or check script.
- **Data schema changes** need updating `docs/implementation.md` §3, the relevant `check-*.ts` validator, and usually `docs/feature-guide.md`.
- **`data.mjs` / `upload-image.mjs` have two modes** (GitHub API in prod, local filesystem under `netlify dev`) — see `docs/implementation.md` §4/§10 before changing either.

## Git workflow

- Bug fixes / small enhancements: branch from `main`, merge back to `main` when verified.
- Major features: branch from `dev`, merge back to `dev`.
- No PRs — merge directly; confirm the current branch with `git branch` before committing.
- Never commit directly to `main` or `dev`.
- Netlify deploys from `main` — only merge to `main` when verified.
- **Live editor writes land on `main`**. Run `npm run sync` at the start of a feature branch to pull those into `main` + `dev` locally.
- **`npm run release`** syncs, then promotes `dev` → `main` and back-merges. Prompts before pushing.
