## Email Notification System

### Overview

A subscriber notification system will alert registered users when new auditions are posted
or existing auditions are updated. The system is built on top of the existing auditions data
workflow — notifications are triggered by new or updated audition data reaching the site,
not by a separate intake process.

Implementation begins after the Buttondown account is set up and the API key is available.

### Architecture Decisions

**Email provider: Buttondown**
Buttondown handles subscriber management, list storage, unsubscribe compliance, and
email delivery via API. It was chosen over Mailchimp (too heavyweight) and Resend
(requires building subscriber management from scratch). Free tier supports up to 100
subscribers, adequate for a local community list; the next paid tier is $9/month if the
list grows.

**Delivery pattern: Daily digest**
A Netlify scheduled function runs once per day at a fixed UTC time: 02:00 UTC. It
compares current audition data against a stored "last sent" timestamp, collects all
auditions with `createdAt` or `updatedAt` after that timestamp, formats them as a single
email, and sends to the Buttondown list. New and updated auditions are presented in
separate sections (see Email Content). If nothing is new or updated, no email is sent.

**State storage: Netlify Blob Storage**
The "last sent" timestamp is stored in Netlify Blob Storage under a fixed key
(e.g. `audition-notifications/last-sent`). This is the simplest persistent storage option
within the existing stack, requiring no additional database service.

**Subscription: Netlify Function**
A Netlify Function handles subscription form submissions, calling the Buttondown API
to add the subscriber (`type: "regular"` — no double opt-in). After a successful
subscription, the function sends a welcome email directly to the new subscriber via the
Buttondown draft API (see Welcome email below). Unsubscribe links in every email are
handled by Buttondown — no custom unsubscribe logic required.

The subscription widget appears on the `/auditions` page (below the header, above the
filter bar; hidden in deep-link and not-found modes) and on the standalone `/subscribe`
page.

### Key Principles

- **The site is the record of truth.** Emails are notifications only. If audition details
  are corrected after an email has gone out, the site reflects the correction; the
  correction will surface in the next digest as an "Updated" entry (see Email Content).
  Email copy should direct subscribers to the site for current information.

- **Quality responsibility lies with the posting company.** The site admin does not
  act as quality control on audition submissions. Companies are responsible for the
  accuracy of their own data.

- **"New" vs "Updated" is defined by record timestamps.** An audition is new if its
  `createdAt` is after the last-sent timestamp. It is updated if its `updatedAt` is after
  the last-sent timestamp but its `createdAt` is not (i.e. it was already notified in a
  prior digest). Records matching both conditions are treated as new.

### createdAt / updatedAt timestamps

These timestamps must remain in the audition JSON files. File-system modification times
are not a reliable alternative: git does not preserve `mtime` on checkout, and Netlify
resets filesystem timestamps at deploy time. The `createdAt` and `updatedAt` fields in
the JSON are the only reliable source of record-level change information — they are read
from the data files bundled with the function (see Data access below), not derived from
file timestamps.

The editor must continue to write `createdAt` on record creation and `updatedAt` on every
save. Manual edits to JSON files that bypass the editor will not advance `updatedAt`, and
those changes will not surface in the digest.

**Editor dirty-check requirement:** The editor must not advance `updatedAt` unconditionally
on save. Instead it should snapshot the record on load, compare the current state against
that snapshot before saving, and only write a new `updatedAt` if the data has actually
changed. This prevents a user opening a record, making no changes, and saving from
generating a spurious "Updated" notification. The snapshot should be refreshed after each
successful save.

### Subscription form error handling

The Netlify Function calling the Buttondown API should handle the following cases:

| Scenario                                  | Buttondown response | User-facing message                                                                       |
| ----------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| New subscriber                            | 201 Created         | "Thanks for subscribing! We've sent you a welcome email with current upcoming auditions." |
| Already subscribed (confirmed or pending) | 409 or 422          | "That address is already subscribed."                                                     |
| Invalid email format                      | 400                 | "Please enter a valid email address." (catch client-side first)                           |
| Buttondown API error (5xx)                | 5xx                 | "Something went wrong — please try again shortly."                                        |
| Function timeout / network error          | —                   | "Something went wrong — please try again shortly."                                        |

The submit button should be disabled while the request is in flight to prevent double
submission.

### Welcome email

When a new subscriber is successfully added (Buttondown returns 201), the subscribe
function sends a welcome email directly to that address containing all current upcoming
auditions. This gives immediate value and confirms the subscription without requiring
double opt-in.

**Buttondown draft flow (3 calls):**

1. `POST /v1/emails` — create a draft with the welcome HTML body and subject; capture the
   returned `id`
2. `POST /v1/emails/{id}/send-draft` with `recipients: [newEmail]` — sends to the new
   subscriber only, not the full list
3. `DELETE /v1/emails/{id}` — clean up the draft (drafts accumulate otherwise)

Step 1 is awaited first; if it fails, steps 2–3 are skipped (there is no draft to send or
delete). If step 1 succeeds, steps 2 and 3 run inside a `try/finally` — the delete in
step 3 is always attempted once a draft id exists, even if step 2 (send-draft) throws, so
drafts don't accumulate on partial failure. Each step's failure is logged independently.
None of this changes the user-facing response — the subscription itself already
succeeded by the time the welcome flow runs. An optional `SUBSCRIBE_HEALTHCHECK_URL` env
var, if set, is pinged on any failure in this flow, as an alert distinct from the
digest's own healthcheck (see Required Netlify environment variables).

**Template:** `buildWelcomeHtml(auditions, baseUrl)` in `email-template.mts` — a
welcome-specific export distinct from `buildDigestHtml`. Structure:

- Brief intro paragraph (e.g. "You're now subscribed to audition notices from Santa Cruz
  Theater. Here's what's coming up:")
- All upcoming auditions as a single flat list, ordered by earliest audition date
- No new/updated split — this is a snapshot, not a change notification
- Same inline-styled audition blocks as the digest
- Footer with unsubscribe note
- If `auditions` is empty (e.g. subscribing during an off-season with nothing currently
  posted), the flat list is replaced with a single line: "Currently there are no
  upcoming auditions — you will receive a notification when any new or updated
  auditions are posted."

An audition is "upcoming" if its latest `auditionDate.date` is ≥ today.

**Shared data module:** The audition-loading and new/updated/upcoming filtering logic is
extracted from `send-audition-digest.mts` into `netlify/functions/lib/auditions-data.mts`.
Both `send-audition-digest.mts` and `subscribe.mts` import from it — see Data access below
for how it reads audition data.

**`subscribe.mjs` → `subscribe.mts`:** The file must be converted from `.mjs` to `.mts`
to enable TypeScript imports from the shared lib modules.

### Data access: local files, not GitHub Contents API

The originally implemented `send-audition-digest.mts` read audition data via the GitHub
Contents API at runtime (one call to list `data/auditions`, one per year directory, one
per file, plus the companies file) — chosen for consistency with the existing `data.mjs`
admin-write pattern. In practice this is unnecessary network overhead for data that
already ships with every deploy, and it would add unwanted latency to the new welcome-email
path, which runs synchronously in the subscribe request rather than on a daily schedule.

**Revised approach:** both the digest and the welcome-email path read audition data
directly from the JSON files bundled with the function, via Node `fs`, instead of the
GitHub API. `import.meta.glob` (used by `src/lib/data.ts` for the Astro build) is a
Vite-only macro and does not work inside esbuild-bundled Netlify Functions, so the shared
module cannot import `data.ts` directly — it re-implements the same directory walk with
`fs.readdirSync` / `fs.readFileSync` over `data/auditions/**/*.json` and
`data/sc-theater-companies.json`.

For these files to be present at runtime, they must be explicitly shipped with the
function bundle via Netlify's `included_files` config in `netlify.toml`:

```toml
[functions]
  included_files = ["data/auditions/**/*.json", "data/sc-theater-companies.json"]
```

Freshness is bounded by deploy time, not request time: a same-day admin edit reaches both
the digest and the welcome email as soon as the resulting commit finishes deploying — the
same lag the site itself already has. This is judged acceptable for this data (audition
listings change at most daily, not data subscribers need to the second).

`auditions-data.mts` exports the directory-walk + parse logic once; `send-audition-digest.mts`
uses it for the new/updated split, `subscribe.mts` uses it (filtered to upcoming) for the
welcome email. No GitHub env vars (`GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`,
`GITHUB_BRANCH`) are required by either function after this change.

### Email template and shared data transformation

Astro components cannot be imported into Node serverless functions, so the site's audition
card rendering and the email template are separate presentation layers. However, the
data-transformation logic — extracting and formatting display fields from raw `AuditionEvent`
objects — can be shared.

**Proposed structure:**

- `src/lib/audition-format.ts` — a pure TypeScript module (no Astro imports, no DOM
  dependencies) exporting functions that accept an `AuditionEvent` and return plain-object
  display representations: formatted date/time ranges, resolved location strings, role
  summaries, prep notes, contact lines. This is the shared layer; both the Astro card
  component and the email template consume it.

- The existing Astro audition card component imports from this module for its data
  transformations (refactored in step 3b).

- `netlify/functions/lib/email-template.mts` — imports from `src/lib/audition-format.ts`
  and wraps the formatted output in email-optimised, inline-styled HTML.

**Netlify function bundling:** The scheduled function will be written as a `.mts` file,
using Netlify's built-in esbuild bundling to resolve the `src/lib/` import. The existing
plain `.mjs` functions are unaffected. This is the clean path; duplicating the formatting
logic to avoid the build change is not acceptable.

**Email layout:**

- Inline styles only — no external stylesheets, no class-based CSS (email client
  compatibility).
- No interactive elements: no JavaScript, no hover states, no expand/collapse.
- Each audition block shows: production title, company name, audition dates/times,
  location, a summary of roles (e.g. "6 roles available, including 2 leads"), and a
  direct link to the specific audition record on the site (see Deep-linking below). Prep
  notes and full role lists are not included — the email is a prompt to visit the site,
  not a replacement for it.
- Visual structure and information hierarchy should closely follow the site's audition
  cards, but pixel-level parity is not required and should not be pursued at the cost
  of email client compatibility.

**Digest sections:**

1. **New Auditions** — records where `createdAt` > last-sent timestamp, ordered by
   earliest audition date.
2. **Updated Auditions** — records where `updatedAt` > last-sent but `createdAt` ≤
   last-sent, ordered by earliest audition date. Each entry carries a brief "Updated"
   label so subscribers who received an earlier notice understand why it appears again.

### Deep-linking to audition records

The email links subscribers to a specific audition record on the site. The auditions page
does not currently support deep-linking — there are no URL parameters. This must be
implemented before the email system goes live.

**Proposed approach:** Add `?id=<audition-id>` parameter support to the `/auditions` page.
On page load, client-side JS checks for this parameter, finds the matching card and displays it. The email template constructs these URLs for each audition block (e.g.
`https://santacruz.theater/auditions?id=1234`). URL id uses just the timestamp number without "audition-" prefix. Error displayed if no matching audition id found.

### Implementation Sequence

0. ✅ Editor dirty-check: snapshot record on load, compare before save, advance `updatedAt`
   only if data has changed. Save button and status bar derived directly from
   `computeIsDirty()` so they always reflect actual state. Restore button appears in the
   record header when unsaved changes exist, replacing Delete while active. Editor preview
   modal (Preview button, left of Restore) renders the record as it appears on the public
   auditions page.
   ✅ Deep-linking to audition records (`?id=<timestamp>`, `audition-` prefix stripped from
   URL). Single-card display mode: filter bar hidden, only target card shown expanded,
   page title reduced. Unrecognised id shows `audition-xxxx not found`. Auditions nav
   link re-enabled in both modes so users can return to the full list.
   ✅ Past marker on audition cards: "Past" pill in the collapsed card header (right side,
   above date range), applied client-side.
1. ✅ Buttondown account setup; API key stored as Netlify environment variable
   (`BUTTONDOWN_API_KEY`).
   ✅ Subscription form component + Netlify Function (`netlify/functions/subscribe.mjs`) to
   add subscribers via Buttondown API, with error handling per the table above. Form
   placed on the auditions page between the header and filter bar. Hidden in deep-link
   and not-found modes.
   ✅ Scheduled function and email template:
   - **3a.** ✅ Scheduled function (`netlify/functions/send-audition-digest.mts`): reads
     audition data from GitHub API, reads/writes last-sent timestamp in Blob Storage.
     `DRY_RUN=true` logs which records would be included without sending. Schedule set to
     `0 2 * * *` (02:00 UTC) in `netlify.toml`. `@netlify/blobs` added to dependencies.
     (Superseded in step 2: the GitHub-fetch read path is replaced with local `fs` reads
     of bundled data — see Data access above.)
   - **3b.** ✅ Shared data-transformation module (`src/lib/audition-format.ts`) + email HTML
     template (`netlify/functions/lib/email-template.mts`). Astro audition card refactored
     to import `fmtShortDate`, `fmtAudDateRange`, `fmtFullDate`, `fmtTimeRange`, `rolesSum`
     from the shared module. Editor `pv*` functions removed; `auditions.js` imports the
     same functions from `/admin/audition-format.js` (Astro endpoint at
     `src/pages/admin/audition-format.js.ts` strips TypeScript from the source and serves
     it as a browser ES module).
   - **3c.** ✅ Wired: digest HTML formatted via `buildDigestHtml`, POSTed to Buttondown
     broadcast API (`status: "about_to_send"`), timestamp updated on success only.
     ✅ Subscription widget placed on the auditions page (below the page header, above the
     filter bar).
     ✅ "Updated" indicator on public audition cards — blue "Updated" pip in the collapsed
     card header, applied client-side when `updatedAt − createdAt > 1 minute`.
     ✅ Standalone `/subscribe` page at `src/pages/subscribe.astro`.
2. ✅ Welcome email on new subscription:
   - ✅ Converted `netlify/functions/subscribe.mjs` → `subscribe.mts`
   - ✅ `[functions] included_files` entry added to `netlify.toml` for
     `data/auditions/**/*.json` and `data/sc-theater-companies.json`
   - ✅ `netlify/functions/lib/auditions-data.mts` created: local `fs`-based audition
     loading (directory walk + parse + company-name lookup), with `isUpcoming`,
     `getUpcomingAuditions`, and `classifyForDigest` helpers. `send-audition-digest.mts`
     refactored to use it; GitHub API calls and `GITHUB_*` env var checks dropped from
     that function (still required by `data.mjs` for admin writes — left in the env var
     tables for that reason).
   - ✅ `buildWelcomeHtml(auditions, baseUrl)` added to `email-template.mts`, including
     the empty-state line for zero upcoming auditions.
   - ✅ 3-call Buttondown draft flow implemented in `subscribe.mts` (create, then
     send-draft/delete in `try/finally` so cleanup runs even if send-draft fails); errors
     logged per step; pings `SUBSCRIBE_HEALTHCHECK_URL` on any failure in this flow.
   - ✅ Success message fixed to: "Thanks for subscribing! We've sent you a welcome email
     with current upcoming auditions."
   - ✅ Digest function's healthcheck env var renamed `HEALTHCHECK_URL` →
     `DIGEST_HEALTHCHECK_URL`.
   - ✅ `DIGEST_HEALTHCHECK_URL` and `SUBSCRIBE_HEALTHCHECK_URL` added to the required env
     vars tables in `CLAUDE.md` and `README.md`.
