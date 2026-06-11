# Audition digest function — maintenance reference

Source: `netlify/functions/send-audition-digest.mts`

## Overview

Scheduled Netlify function that runs at **02:00 UTC daily** (`0 2 * * *`). To change the schedule, update the cron expression in the `schedule()` call at the top of `send-audition-digest.mts` and redeploy.

The function reads all audition files from GitHub, compares `createdAt`/`updatedAt` timestamps against the last time a digest was sent, and emails subscribers a digest of anything new or updated. The last-sent timestamp is persisted in Netlify Blob Storage so each run only covers changes since the previous send.

## Execution flow

1. Read `last-sent` ISO timestamp from Blob Storage (store `audition-notifications`, key `last-sent`). Missing key → treats all records as new (falls back to epoch).
2. Fetch `data/sc-theater-companies.json` from GitHub to build a company name map for display.
3. Walk `data/auditions/**/*.json` on GitHub (all year subdirectories, all matching files).
4. Classify records:
   - **New** — `createdAt > lastSent`
   - **Updated** — `updatedAt > lastSent` AND `createdAt ≤ lastSent`
5. If nothing qualifies → log `nothing to send`, ping Healthchecks.io, exit.
6. If `DRY_RUN=true` → log what would be sent, exit without sending, updating timestamp, or pinging.
7. POST digest HTML to Buttondown (`status: "about_to_send"` sends immediately).
8. On Buttondown success → write new `last-sent` timestamp to Blob Storage.
9. Ping Healthchecks.io.

The healthcheck ping fires on every successful execution (both "nothing to send" and "sent" paths). It does **not** fire on `DRY_RUN` or any error exit — so a missing ping always means something went wrong.

## Environment variables

| Variable             | Required | Notes                                                                |
| -------------------- | -------- | -------------------------------------------------------------------- |
| `GITHUB_TOKEN`       | Yes      | Fine-grained PAT with Contents read access on the repo               |
| `GITHUB_OWNER`       | Yes      | GitHub repository owner                                              |
| `GITHUB_REPO`        | Yes      | GitHub repository name                                               |
| `GITHUB_BRANCH`      | No       | Branch to read from; defaults to `main`                              |
| `BUTTONDOWN_API_KEY` | Yes      | Buttondown API key                                                   |
| `HEALTHCHECK_URL`    | No       | Healthchecks.io ping URL; omitting disables monitoring silently      |
| `DRY_RUN`            | No       | Set to `true` to log without sending, updating timestamp, or pinging |

## Blob storage

- **Store name:** `audition-notifications`
- **Key:** `last-sent`
- **Value:** ISO 8601 timestamp string, e.g. `2026-06-11T02:01:05.000Z`

The timestamp is only written after Buttondown confirms a successful send. If the Buttondown call fails, the timestamp is left unchanged so the same records will be retried next run.

### Why the function uses `schedule()` from `@netlify/functions`

Netlify only injects the Blobs context environment variable (`NETLIFY_BLOBS_CONTEXT`) into on-demand (HTTP-triggered) functions, not scheduled ones. Wrapping the handler with the `schedule()` helper from `@netlify/functions` ensures the context is injected correctly. Without it, `getStore()` throws `MissingBlobsEnvironmentError` at runtime.

## Monitoring (Healthchecks.io)

The function pings the `HEALTHCHECK_URL` at the end of every successful run. Configure the check in Healthchecks.io with:

- **Period:** 24 hours
- **Grace:** 2 hours (allows for Netlify scheduling jitter)

An alert email is sent if no ping arrives within the grace window, covering both runtime errors and cases where the function simply fails to start.

## Testing

Prerequisites: Netlify CLI installed, authenticated (`netlify login`), and linked to the site (`netlify link` in the project root).

### Negative test — nothing to send

After a recent successful run the stored timestamp will be current, so re-invoking immediately should find nothing:

```bash
netlify functions:invoke send-audition-digest --live
```

Expected log: `nothing to send`. Confirm a ping arrived in the Healthchecks.io dashboard.

### Positive test — dry run first

Preview what would be sent without emailing subscribers or advancing the timestamp:

```bash
netlify env:set DRY_RUN true
netlify deploy --trigger          # redeploy to pick up env change
netlify functions:invoke send-audition-digest --live
```

Expected log: lists `NEW` and/or `UPDATED` records, then `DRY_RUN — skipping send`. No ping fires.

### Positive test — real send

Once the dry run looks correct, reset the timestamp to the epoch and do a live run:

```bash
netlify env:unset DRY_RUN
netlify blobs:set audition-notifications last-sent "1970-01-01T00:00:00.000Z"
netlify deploy --trigger
netlify functions:invoke send-audition-digest --live
```

Expected: digest email arrives in subscriber inboxes, Healthchecks.io receives a ping, Blob Storage timestamp is updated to approximately now. Re-invoking immediately afterward gives the negative test.

### Inspecting blob storage

```bash
# Read current timestamp
netlify blobs:get audition-notifications last-sent

# Manually set timestamp (e.g. to replay a specific window)
netlify blobs:set audition-notifications last-sent "2026-06-01T00:00:00.000Z"

# Delete key entirely (next run treats all records as new)
netlify blobs:delete audition-notifications last-sent
```

## Viewing logs

Function logs are available in the Netlify dashboard under **Functions → send-audition-digest → Logs**, or via:

```bash
netlify functions:log send-audition-digest --live
```

All log lines are prefixed `send-audition-digest:` for easy filtering.

## Troubleshooting

| Symptom                                         | Likely cause                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `MissingBlobsEnvironmentError`                  | Function not using `schedule()` wrapper — see note above                          |
| `missing GitHub env vars`                       | `GITHUB_TOKEN`, `GITHUB_OWNER`, or `GITHUB_REPO` not set in Netlify               |
| `missing BUTTONDOWN_API_KEY`                    | Key not set or not deployed yet                                                   |
| `Buttondown error 401`                          | API key invalid or revoked                                                        |
| `Buttondown error 429`                          | Rate limited; will retry next scheduled run                                       |
| No ping on success                              | `HEALTHCHECK_URL` env var not set                                                 |
| Healthchecks.io alerts daily with nothing wrong | Ping not firing on "nothing to send" path — check function version                |
| Digest sent but same records appear next day    | Blob Storage write failed after send; check logs for `failed to update timestamp` |
