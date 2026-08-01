# Plan: One-way sync of shows & activities to Google Calendar

## TL;DR

Add a new Netlify scheduled function that mirrors upcoming performances and activity
sessions into two public Google Calendars (Shows; Auditions & Events), using a
service account that has been granted "Make changes to events" access to calendars
created and owned by a real Google account. Each run does a full, idempotent
reconciliation (insert/update/delete) against a 30-day-past..future window, keyed by
deterministic event IDs and a stored content hash — no cross-invocation state needed.

## Decisions (from discussion)

- Scope: both shows (performances) and activities (auditions/events).
- Two separate calendars, both public/shareable (embedding on the site deferred).
- Window: upcoming + 30-day trailing grace period; older items pruned automatically.
- Default performance duration (no end time in data): 2 hours.
- Default activity-session duration (no endTime): 2 hours.
- "Other Companies" (`company: "other"`) records are included (they're public on /calendar and /events).
- Sync cadence: once daily, offset from the existing 02:00 UTC digest cron (e.g. 04:15 UTC).
- One event per performance / per ActivityDate row (not one event per run/activity, not RRULE recurrence) — irregular real-world schedules don't fit recurrence cleanly.
- No bi-directional sync; Google Calendar is a pure read-only mirror for its viewers.
- Calendar creation itself is a manual one-time step (a real Google account should own the calendars, not the service account — see Google's own guidance against service-account-owned calendars).

## Architecture reference (existing patterns to reuse)

- `netlify/functions/send-digest.mts` — template for scheduled function structure: `schedule('0 2 * * *', handler)`, env var validation, DRY_RUN support, healthcheck ping pattern. Note: this new function does NOT need Netlify Blob Storage state (unlike send-digest) because full reconciliation each run makes Google Calendar itself the source of "last sync" truth.
- `netlify/functions/lib/activities-data.mts` — fs-based loader pattern (reads `data/activities/**/*.json` via `fs`, not `import.meta.glob`) to mirror for shows.
- `src/lib/data.ts` `getPerformances()` (L24-45) — flattening logic (Run + Performance → PerformanceEvent) to replicate in a fs-based loader.
- `src/lib/audition-format.ts` — pure, DOM/Astro-free formatting functions (`fmt12`, `fmtTimeRange`, `fmtFullDate`, `rolesSummaryEmail`) already reused by `send-digest.mts` via esbuild bundling; reuse directly in the new function for activity descriptions.
- `src/types.ts` — `Run`, `Performance`, `PerformanceEvent`, `Activity`, `ActivityDate`, `ActivityEvent` types.
- Deep-link URL format for activities: `https://santacruz.theater/events?id=<numeric id, "activity-" prefix stripped>` (documented in CLAUDE.md). No equivalent deep-link exists for individual performances/runs on `/calendar` — link to `infoUrl`/`ticketsUrl`/generic `/calendar` instead.

## Google Calendar API technical notes (verified against current docs)

- **Auth**: use a service account (Calendar API enabled in a GCP project). Do NOT use domain-wide delegation (not needed — no Workspace domain). Instead: create each calendar under a normal Google account, then share it with the service account email with "Make changes to events" role. Use `google-auth-library`'s `JWT` client (lightweight; avoids pulling in the full `googleapis` package) with scope `https://www.googleapis.com/auth/calendar`.
- **Event IDs**: Calendar lets you set your own `id` on insert — must be lowercase base32hex charset (`0-9a-v`), length 5–1024, unique per calendar. A lowercase hex SHA-1/SHA-256 digest is a valid subset (hex chars 0-9a-f ⊂ 0-9a-v), so deterministic IDs can be derived by hashing a stable source key (e.g. `perf|{runId}|{date}|{time}` or `activity|{activity.id}|{dateIndex}`).
- **Extended properties**: `extendedProperties.private` holds hidden key/value metadata (max 44-char keys, 1024-char values, 300 props/32kB total per event) — used to tag our managed events (`sctheaterManaged=true`, `sctheaterType`, `sctheaterSourceId`, `sctheaterContentHash`) and to query them back via `events.list?privateExtendedProperty=sctheaterManaged%3Dtrue`.
- **Diffing without stored state**: list managed events for the target calendar/window via the extended-property filter, build a map by id, and compare against the freshly computed desired set (also keyed by id) — insert missing, patch changed (compare stored `sctheaterContentHash` vs freshly computed hash), delete extras. This makes each run stateless/idempotent.
- **Quotas**: 10,000 req/min per project, 600 req/min per user (service account = one "user" here) — far more than our small dataset needs; no batching required (Calendar API's global batch endpoint is being phased out anyway). Use simple sequential/modestly-parallel requests with basic retry/backoff on 403/429.
- **Description field** accepts basic HTML — convert existing `**bold**`/`*italic*` markdown to `<b>`/`<i>` for event descriptions.

## Steps

### Phase 1 — Google Cloud & Calendar setup (manual, outside repo)

1. Create/select a GCP project; enable the Google Calendar API.
2. Create a service account; generate a JSON key. Note `client_email` and `private_key`.
3. In Google Calendar, using a real Google account (the intended data owner), create two new calendars: "Santa Cruz Theater — Shows" and "Santa Cruz Theater — Auditions & Events".
4. For each calendar: Settings → "Share with specific people" → add the service account email with **"Make changes to events"**. Also enable public access ("Make available to public" / "See all event details") per the visibility decision, and note the public/embed URL for future use.
5. Note each calendar's Calendar ID (Settings → "Integrate calendar").
6. Add Netlify env vars (Production, and any preview contexts that should also sync): `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (store with literal `\n`; code unescapes), `GOOGLE_SHOWS_CALENDAR_ID`, `GOOGLE_ACTIVITIES_CALENDAR_ID`, optional `CALENDAR_SYNC_DRY_RUN`, optional `CALENDAR_SYNC_HEALTHCHECK_URL`.

### Phase 2 — Data loaders (fs-based, function-safe) — _can run parallel with Phase 3_

2. Create `netlify/functions/lib/shows-data.mts` mirroring `activities-data.mts`: reads `data/shows/**/*.json` via `fs`, flattens `Run.performances` into `PerformanceEvent`-shaped records (replicating `getPerformances()` logic from [src/lib/data.ts](../src/lib/data.ts)), attaching resolved company display name. Export `loadAllPerformances()`.
3. Create `netlify/functions/lib/venues-data.mts`: reads `data/sc-theater-venues.json` via `fs`; export `resolveVenueLocation(venueNameOrCode)` returning an address string when matched, else the raw venue text passed in.
4. Refactor: extract the company-name-lookup helper currently inside `activities-data.mts` into a shared `netlify/functions/lib/company-data.mts` (`loadCompanyNames()`), imported by both `activities-data.mts` and the new `shows-data.mts`, to avoid duplication.
5. Update [netlify.toml](../netlify.toml) `[functions].included_files` to add `data/shows/**/*.json` and `data/sc-theater-venues.json` (activities + companies are already included).

### Phase 3 — Google Calendar client helper — _depends on Phase 1 env vars, can be coded in parallel with Phase 2_

6. Add `google-auth-library` to [package.json](../package.json) dependencies.
7. Create `netlify/functions/lib/google-calendar.mts`:
   - `getAuthorizedClient()` — builds a `JWT` client from env vars, scope `https://www.googleapis.com/auth/calendar`.
   - `listManagedEvents(calendarId, timeMin, timeMax)` — paginated `events.list` filtered by `privateExtendedProperty=sctheaterManaged=true`, `singleEvents=true`, `showDeleted=false`; returns array keyed by id with their stored `sctheaterContentHash`.
   - `upsertEvent(calendarId, id, eventBody)` — `events.insert` with explicit `id`; on 409 (already exists) falls back to `events.update`.
   - `deleteEvent(calendarId, id)` — `events.delete`; tolerate 404/410 as already-gone.
   - `computeContentHash(fields)` — stable SHA-1 hex over the fields the sync controls (summary/description/location/start/end).

### Phase 4 — Sync orchestration — _depends on Phases 2 & 3_

8. Create `netlify/functions/sync-calendar.mts`, scheduled via `schedule('15 4 * * *', handler)`:
   - Validate required env vars (fail fast, log and return if missing — same pattern as `send-digest.mts`).
   - Compute window: `windowStart = today - 30 days`, `windowEnd` = a generous forward bound (e.g. now + 18 months) to satisfy the Calendar API's list bounds.
   - **Shows reconciliation**: `loadAllPerformances()` → filter by `date >= windowStart` → map each to `{ id: hash('perf|'+runId+'|'+date+'|'+time), summary, description (with resolved venue, price, discounts, ticketsUrl/infoUrl links, perfType annotation), location: resolveVenueLocation(venue), start/end (date+time, +2h default, timeZone America/Los_Angeles) }` → diff against `listManagedEvents(GOOGLE_SHOWS_CALENDAR_ID, windowStart, windowEnd)` → insert/update/delete via the Phase 3 helper.
   - **Activities reconciliation**: `loadAllActivities()` → expand into one record per `ActivityDate` (carrying its own index) → filter by that date's `date >= windowStart` → map each to `{ id: hash('activity|'+activity.id+'|'+dateIndex), summary ("Audition: "|"Event: " + title + " — " + companyOrOrganizerName), description (type-conditional: roles/prep/notes for auditions; briefDescription/cost/registerUrl/contact for events; always include the `/events?id=` deep link), location (date's location.name/address, else company primaryVenue), start/end (date+startTime, endTime or +2h default) }` → diff against `listManagedEvents(GOOGLE_ACTIVITIES_CALENDAR_ID, ...)` → insert/update/delete.
   - Respect `CALENDAR_SYNC_DRY_RUN` (log planned inserts/updates/deletes without calling the API).
   - Log summary counts; ping `CALENDAR_SYNC_HEALTHCHECK_URL` if set (success or failure), matching `send-digest.mts` conventions.

### Phase 5 — Verification

9. Local dry run via Netlify CLI (`netlify functions:invoke sync-calendar`) with `CALENDAR_SYNC_DRY_RUN=true` pointed at a scratch/test calendar ID before wiring the real public calendars.
10. First real run: manually confirm event counts in both Google Calendars roughly match current upcoming counts on `/calendar` and `/events`.
11. Edit a performance time or activity session via `/admin`; confirm the next run updates the existing Calendar event in place (no duplicate).
12. Remove/cancel a performance or activity date in the data; confirm the corresponding Calendar event is deleted on the next run.
13. Confirm items older than the 30-day grace window are pruned (verifiable via a dry run log listing deletions).
14. `npm run check-shows` / `npm run check-activities` unaffected; run `get_errors` against new `.mts` files for type issues.

## Relevant files

- `netlify/functions/sync-calendar.mts` — new, orchestration (Phase 4)
- `netlify/functions/lib/google-calendar.mts` — new, Calendar API client (Phase 3)
- `netlify/functions/lib/shows-data.mts` — new, fs-based shows loader (Phase 2)
- `netlify/functions/lib/venues-data.mts` — new, fs-based venue lookup (Phase 2)
- `netlify/functions/lib/company-data.mts` — new, extracted from `activities-data.mts` (Phase 2)
- `netlify/functions/lib/activities-data.mts` — modify to import shared company-name helper instead of its own
- `netlify.toml` — add `data/shows/**/*.json` and `data/sc-theater-venues.json` to `included_files`
- `package.json` — add `google-auth-library` dependency
- `src/lib/audition-format.ts` — reused as-is for activity description formatting

## Scope boundaries (explicit exclusions)

- No sync direction from Google Calendar back to santacruz.theater.
- No automated calendar _creation_ via API — calendars are created manually by a real Google account (per Google's own guidance against service-account-owned calendars).
- No public embedding of the calendars on the site in this pass (deferred; public/shareable access is enabled now so it can be added later).
- No RRULE/recurring-event modeling — every performance/session is a discrete event.
- No Google push notifications/webhooks — daily polling reconciliation is sufficient at this data volume/change frequency.
- No attendee invitations, Meet links, or custom reminders.

## Further considerations

1. Description formatting — plan converts `**bold**`/`*italic*` to `<b>`/`<i>` for Calendar's HTML-capable description field; confirm this is sufficient (no need to reuse the fuller `renderDesc()` link-rendering logic from `services.astro`, though it could be extended similarly for `[text](url)` links if wanted).
2. Two calendars means two separate service-account shares and two Calendar IDs to configure — confirm the Google account used to create/own them (e.g. an existing site admin's account, or a new dedicated one) before Phase 1.
