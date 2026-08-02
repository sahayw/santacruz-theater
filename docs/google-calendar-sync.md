# Google Calendar sync

One-way mirror of upcoming performances and activity sessions into two public Google
Calendars ("Santa Cruz Theater — Shows" and "Santa Cruz Theater — Auditions & Events"),
so people can subscribe to them directly. Fully implemented and live-tested; not yet
merged to `main`.

## Architecture

Two Netlify Functions (v2, `config` export):

```
sync-calendar-trigger.mts   (scheduled, 04:15 UTC)  --HTTP POST-->  sync-calendar-background.mts  (does the work)
```

**Why two functions, not one.** Netlify Scheduled Functions have a hard **30s**
execution limit; Background Functions get up to **15 minutes** but can't be triggered
by a cron schedule directly. Netlify doesn't support a single function being both at
once — [their own docs](https://docs.netlify.com/build/functions/scheduled-functions/)
say to use a scheduled function to trigger a background function. A full reconciliation
of the whole dataset (first-ever run, or any change to a field every event shares, e.g.
this doc's field-mapping revision) is a few hundred writes — comfortably over 30s, well
within 15 minutes.

- `sync-calendar-trigger.mts` — `config.schedule = '15 4 * * *'` (offset from the
  02:00 UTC digest cron). Fires one `fetch()` at the background function's own URL
  (`process.env.URL`, injected by Netlify) and returns — trivially within 30s.
- `sync-calendar-background.mts` — `config.background = true`. No auth check: it has
  no request-derived input (desired state is always recomputed from the local data
  files), so an unauthenticated early/extra trigger just converges the calendars
  sooner, not incorrectly. Does everything below.

Each run is a **full, idempotent reconciliation** (insert/update/delete) against a
30-day-past .. 18-month-future window, keyed by a deterministic event id and a stored
content hash. No cross-invocation state — Google Calendar itself is the source of
"what's already synced."

## Reconciliation algorithm

1. Load performances (`loadAllPerformances()`) and activity-dates (`loadAllActivities()`
   expanded per `ActivityDate`), filtered to `date >= today - 30 days`.
2. Compute each one's desired Calendar event body and a deterministic id:
   - Shows: `id = sha1('perf|' + runId + '|' + date + '|' + time)`
   - Activities: `id = sha1('activity|' + activity.id + '|' + dateIndex)` (`dateIndex`
     = position in the `dates[]` array — **not** date/time, so editing a session's
     time is a true in-place update, unlike shows where a date/time edit changes the
     id — see "Event identity" below).
3. `listManagedEvents(calendarId, timeMin, timeMax)` — paginated `events.list` filtered
   by `privateExtendedProperty=sctheaterManaged=true`, `singleEvents=true`,
   `showDeleted=false` — returns `Map<eventId, storedContentHash>`.
4. Diff: id missing from the list → insert. Id present but hash differs → update. Id
   present in the list but not in the desired set → delete (this is also how items
   aging out of the 30-day grace window get pruned — no separate code path).
5. Writes run through a concurrency-5 worker pool (`WRITE_CONCURRENCY` in
   `sync-calendar-background.mts`) — see "Concurrency and rate limits" below. A single
   item exhausting retries is logged and recorded as a failure, not thrown — the rest
   of the batch keeps going, and the idempotent design means it's just retried next run.

### Event identity

Google Calendar doesn't let two different logical "things" share an id across time —
so id derivation directly determines whether an edit shows as *update* or
*delete+insert*:

- **Shows**: id includes `date` + `time`. Editing a performance's date/time changes
  its id → the old id is deleted, a new one inserted. This is a deliberate tradeoff:
  the data model has no stable per-performance identifier (`Performance` has no `id`
  field, only an array position), and an index-based id would make removing a
  performance mid-list cascade-relabel every later performance in that run as a new
  delete+insert pair — worse than the current behavior for the more common edit
  (canceling one performance from a run). Either way the calendar ends up correct;
  only whether it's literally "the same Calendar event object" differs, which mostly
  matters if a viewer had personal reminders on that specific event — low risk for a
  public read-only mirror calendar.
- **Activities**: id is `activity.id` + array position, not date/time. Editing a
  session's date/time is a true in-place update.

## Field mapping

### Shows (`Run` + `Performance`)

| Calendar field | Built from | Notes |
|---|---|---|
| `summary` | `showAbv` (fallback `show`) + `companyName` | `"{title} — {company}"`. No `perfType` (Preview/Opening/etc) annotation. |
| `description` | `description` + a link | `description` (markdown → HTML) if present, blank line, "View on santacruz.theater" linking to `/calendar` (no per-performance deep-link page exists, so this points at the general calendar page). `price`, `discounts`, `ticketsUrl`, `infoUrl` are not included. |
| `location` | `venue` | `"{name} · {address}"` via `resolveVenue()` in `venues-data.mts`; falls back to just the raw text (no `·`) when unmatched against `sc-theater-venues.json`. |
| `start`/`end` | `date` + `time`, `timeZone: America/Los_Angeles` | No end-time field exists on `Performance`, so always `start + 2h` (`DEFAULT_DURATION_HOURS`). |

### Activities (`Activity` + `ActivityDate`)

| Calendar field | Built from | Notes |
|---|---|---|
| `summary` | `type`, `title`, `companyName`/`organizerName` | `"Audition: {title} — {company}"` / `"Event: {title} — {company}"`. `organizerName` used instead of `companyName` when `company === "other"` and it's set. |
| `description` (audition) | `rolesAvailable` + deep link | `"Roles: {summary}"` (via `rolesSum()`) if any roles are defined, then the `/events?id=` deep link. `prep`, `notes`, `contact` are not included — auditions have no `description`/`briefDescription` field in the schema, so roles are the closest equivalent to "what this record is about." |
| `description` (event) | `description` (fallback `briefDescription`) + deep link | `cost`, `registerUrl`, `contact` are not included. |
| `location` | `ActivityDate.location` (name/address), else company `primaryVenue` | `"{name} · {address}"`. If the date's own `location.address` is missing but `location.name` matches a canonical venue, the address is filled in from `sc-theater-venues.json`. Falls back to just the name when no address is available anywhere. |
| `start`/`end` | `date` + `startTime`; `endTime` if set, else `+2h` | Per-date `endTime` is respected when present. |

Both event types also carry `extendedProperties.private`: `sctheaterManaged: "true"`,
`sctheaterType` (`"show"` / `"audition"` / `"event"`), `sctheaterSourceId` (`runId`, or
`activity.id + "|" + dateIndex`), `sctheaterContentHash`. `status` is always forced to
`"confirmed"` on every write — see "Deleted events aren't really deleted" below.

**Calendar's `location` field is plain text** — it can't contain a real hyperlink (only
the HTML `description` field supports that). Google's own Calendar UI auto-detects a
recognizable address anywhere in `location` and shows a map icon/link for it
automatically, so `"Name · Address"` still gets that behavior with no markup needed.

## Google Calendar API notes

- **Auth**: service account JWT (`google-auth-library`'s `JWT` class — lighter than
  the full `googleapis` package), scope `https://www.googleapis.com/auth/calendar`.
  No domain-wide delegation (no Workspace domain on this account) — the calendars are
  owned by a real Google account and merely *shared* with the service account at
  "Make changes to events." `getAuthorizedClient()` in `google-calendar.mts` strips a
  wrapping pair of literal `"` characters from `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
  before unescaping `\n` — a real, encountered failure mode from pasting the
  `"private_key": "..."` field straight out of the downloaded JSON key file, including
  the JSON string's own quote delimiters (see "Bugs found in testing" below).
- **Event ids**: must be lowercase base32hex (`0-9a-v`), length 5–1024, unique per
  calendar. A lowercase hex SHA-1 digest is a valid subset (`0-9a-f` ⊂ `0-9a-v`).
- **`gaxios`**: imported via `google-auth-library`'s re-exported `gaxios` namespace
  (`import { JWT, gaxios } from 'google-auth-library'`), not the `gaxios` package
  directly — `gaxios` isn't a declared dependency of this project, only a transitive
  one of `google-auth-library`.
- **Retry/backoff**: `requestWithRetry()` retries on 429 always, and on 403 only when
  Google's error `reason` is `rateLimitExceeded` / `userRateLimitExceeded` /
  `quotaExceeded` — a 403 for insufficient permissions (calendar not actually shared
  with the service account) is not transient and should surface immediately, not after
  5 pointless retries. `MAX_RETRIES = 5`, exponential backoff from `BASE_DELAY_MS = 500`.

### Deleted events aren't really deleted

Google Calendar never truly deletes an event — `deleteEvent()` (a real API call) leaves
a `status: "cancelled"` tombstone at that id. `listManagedEvents()`'s
`showDeleted=false` filter correctly hides it from the diff, but the id is still
occupied. If the same id is ever desired again (e.g. a canceled performance gets
un-canceled, or any id reuse), inserting hits a 409 against the tombstone and falls
through to a PATCH — but a PATCH alone does **not** revive a cancelled event; Google
requires `status: "confirmed"` to be set explicitly. Without this, the id would show as
"insert" forever, on every future run, never actually becoming visible again. Fixed by
always setting `status: "confirmed"` on every write in `insertEvent()`/`updateEvent()`.

### Insert vs. update, and why they're different calls

`insertEvent()` (POST, falls back to PATCH on 409 — the tombstone-revival case above)
and `updateEvent()` (PATCH only) are separate functions, even though a naive "upsert"
POST-then-409-fallback would work for both. `reconcile()` already knows in advance
which items are new (`toInsert`) vs. already-existing-with-different-hash (`toUpdate`),
since that classification comes from diffing against `listManagedEvents()`. Routing
every update through the insert path would waste a *guaranteed-to-fail* POST before
falling back to the real PATCH on every single update — roughly doubling real request
volume for update-heavy runs, which is exactly what caused Bug 2 below.

### Concurrency and rate limits

`WRITE_CONCURRENCY = 5` in `sync-calendar-background.mts`. Concurrency 10 was tried
first and proved bursty enough to trip Google's short-term rate limiting even though
total volume is nowhere near the documented 600 req/min-per-user quota — Google's
limiter appears to care about instantaneous burst, not just the rolling average. At
concurrency 5, live testing with a forced full-dataset update (304 events at once —
deliberately far beyond any plausible real edit volume) saw a consistent **~2.6%
transient failure rate** (8/304, `quotaExceeded` errors), every time fully resolved by
simply re-running — the idempotent design makes this a non-issue rather than something
requiring special handling.

## Monitoring

`CALENDAR_SYNC_HEALTHCHECK_URL` (a healthchecks.io-style ping URL) is pinged on every
run — the base URL on a clean pass, `{url}/fail` when anything failed (a per-item write
failure, or a fatal error like missing env vars or an unhandled exception). The ping
body carries diagnostic text, e.g.:

```
shows: inserted 0, updated 4, deleted 0, unchanged 280, failed 0
activities: inserted 0, updated 0, deleted 0, unchanged 20, failed 1

FAILURES (1):
- 29edac2b...: Error: Quota exceeded for quota metric 'Queries' and limit...
```

(healthchecks.io renders a POST body as the "Last Ping" diagnostic text for that
check — confirmed working live.) Failure lines include the event id, its summary, and
the real error message, capped at 20 lines (`MAX_FAILURES_IN_MESSAGE`) with a
"+ N more" tail — enough to diagnose a real problem from the monitoring dashboard alone,
without needing live function logs (which is the point: this job is unattended, and
whether Background Function logs are easily accessible wasn't something worth
depending on either way).

## Manual setup (one-time, outside the repo)

1. GCP project with the Calendar API enabled.
2. A service account with a JSON key (`client_email`, `private_key`).
3. Using a **real Google account** (not the service account — Google's own guidance is
   against service-account-owned calendars), create two calendars: "Santa Cruz Theater
   — Shows" and "Santa Cruz Theater — Auditions & Events".
4. For each: Settings → "Share with specific people" → add the service account email
   with **"Make changes to events"**. Also enable public access ("Make available to
   public") and note the public/embed URL (embedding on the site is deferred, not yet
   built).
5. Note each calendar's Calendar ID (Settings → "Integrate calendar").
6. Set the Netlify env vars below. Store `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` with
   literal `\n` sequences (not real newlines) — the code unescapes them, and also
   tolerates (but doesn't require) a wrapping pair of `"` characters.

## Required Netlify environment variables

| Variable | Purpose |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Service account private key, literal `\n` |
| `GOOGLE_SHOWS_CALENDAR_ID` | Calendar ID for the Shows calendar |
| `GOOGLE_ACTIVITIES_CALENDAR_ID` | Calendar ID for the Auditions & Events calendar |
| `CALENDAR_SYNC_DRY_RUN` | Optional. `true` logs planned inserts/updates/deletes without calling the API |
| `CALENDAR_SYNC_HEALTHCHECK_URL` | Optional. Base URL pinged on success; `{url}/fail` on any failure |

## Bugs found in testing (all fixed)

Real, live-testing-only bugs — none caught by offline logic simulation, since all three
are properties of the real Google API, not the diff algorithm:

1. **Malformed private key** — `error:1E08010C:DECODER routines::unsupported` on every
   auth attempt. Root cause: a literal `"` wrapping the whole PEM string in the stored
   env var (confirmed via char codes, without ever printing the actual key). Fixed by
   stripping a wrapping quote pair in `getAuthorizedClient()`.
2. **Timeout on bulk writes** — the first real (non-dry-run) run 502'd partway through:
   sequential one-request-at-a-time writes for ~300 events exceeded a normal function's
   execution ceiling. No corruption (idempotent retry picked up where it left off), but
   a single daily run could never fully catch up this way. Fixed by (a) a concurrency-5
   worker pool, (b) the insert/update split above (roughly halves real request volume
   for update-heavy runs), and (c) moving the actual work into a Background Function
   (15 min ceiling instead of 30s) — see "Architecture."
3. **Deleted event ids don't silently come back** — see "Deleted events aren't really
   deleted" above.

## Live testing summary

Tested against the real production calendars via `netlify deploy` draft builds (no
`--prod`) plus temporary, never-committed diagnostic functions (deleted after each use)
— real credentials only exist in Netlify's deployed runtime, never locally, so this was
the only way to exercise real auth. Results:

- **Bulk backlog** (171 real writes, from an earlier interrupted run): 151/151 shows +
  19/20 activities succeeded, 1 transient failure — self-healed on immediate retry.
- **Minimal mixed case** (1 insert + 1 delete + 1 update, single pass, both calendars):
  all three types correctly isolated and counted, 0 failures.
- **Full-scale** (all 304 records forced to update at once, via a shared-template
  change — deliberately far beyond any realistic edit volume): 296/304 succeeded first
  pass, 8 transient `quotaExceeded` failures (~2.6%), fully diagnosed via the
  healthcheck message (exact id/summary/error), all resolved on retry. Completed in
  ~2–3 minutes, comfortably within the 15-minute Background Function budget. Repeated
  twice with the same ~2.6% pattern both times.
- Both calendars end every test cycle at a clean, stable, 0-failure steady state.

## Known limitation: "Created by" shows the service account (cosmetic)

Google Calendar's `creator` field is **read-only** — always set by Google to whichever
identity actually calls the API, with no request parameter to override it. Confirmed
via a live `events.get` on a real event: `creator.email` is the service account
address; `organizer` (which *is* controllable in principle, though not exercised here)
is already the calendar itself (`displayName: "Santa Cruz Theater — Shows"`), which is
the more prominent field in most Calendar UI layouts. The only way to make `creator`
show a human account would be domain-wide delegation impersonating a Workspace user, or
literal human OAuth instead of a service account — both are exactly the setup this
design deliberately avoided (no Workspace domain; unattended daily automation needs a
credential that doesn't need periodic re-consent). Not worth revisiting for a cosmetic
detail. One untested, cheap, reversible option: GCP service accounts have an editable
IAM display name separate from their fixed email — unconfirmed whether Calendar would
surface that as `creator.displayName` instead of the raw email.

## Scope boundaries (explicit exclusions)

- No sync direction from Google Calendar back to santacruz.theater.
- No automated calendar *creation* via API — calendars are created manually by a real
  Google account (per Google's own guidance against service-account-owned calendars).
- No public embedding of the calendars on the site yet (public/shareable access is
  enabled so it can be added later).
- No RRULE/recurring-event modeling — every performance/session is a discrete event.
- No Google push notifications/webhooks — daily polling reconciliation is sufficient
  at this data volume/change frequency.
- No attendee invitations, Meet links, or custom reminders.

## Relevant files

- `netlify/functions/sync-calendar-trigger.mts` — scheduled trigger
- `netlify/functions/sync-calendar-background.mts` — actual sync logic
- `netlify/functions/lib/google-calendar.mts` — Calendar API client (auth, list/insert/update/delete, content hash)
- `netlify/functions/lib/shows-data.mts` — fs-based shows loader, mirrors `getPerformances()` from `src/lib/data.ts`; also coerces legacy bare-string `genre` to `Genre[]` (31 of 34 show runs use the legacy format — not an edge case)
- `netlify/functions/lib/venues-data.mts` — fs-based venue lookup (`resolveVenue()`)
- `netlify/functions/lib/company-data.mts` — fs-based company name + primary-venue lookup; extracted from `activities-data.mts` to share with `shows-data.mts`
- `netlify/functions/lib/activities-data.mts` — modified to import the shared company-name helper instead of its own copy
- `netlify.toml` — `[functions].included_files` includes `data/shows/**/*.json` and `data/sc-theater-venues.json`
- `package.json` — `google-auth-library` dependency
- `src/lib/audition-format.ts` — `renderMd()`/`rolesSum()` reused as-is; `sync-calendar-background.mts` wraps `renderMd()` in a local `mdToHtml()` that also converts literal `\n` to `<br>`, since Calendar's HTML description otherwise collapses multi-line notes/descriptions into one run-on line
