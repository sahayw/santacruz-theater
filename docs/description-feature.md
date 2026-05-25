# Show Description Feature

## Overview

Each run can carry an optional narrative description paragraph displayed as a
hover/tap panel on the calendar drill-down view. Descriptions are authored in
the Data Editor at `/admin` and stored in `data/sc-theater-runs.json`.

---

## 1. Data schema

`description` is an optional string field on the `Run` type (`src/types.ts`).
It supports a minimal Markdown-like syntax:

| Syntax          | Renders as    |
| --------------- | ------------- |
| `**bold text**` | **bold text** |
| `*italic text*` | _italic text_ |

`PerformanceEvent` always has `description: string` (defaults to `''` when the
run has none). The field is populated in `src/lib/data.ts` via
`run.description || ''` in `getPerformances()`.

---

## 2. Data Editor UI (`public/admin/index.html`)

The description section sits between the run-level fields and the performances
table. It is built into the existing run editor form.

### Controls

| Element              | ID / class       | Behaviour                                                                                                  |
| -------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Description textarea | `#f-description` | Auto-saves via `runFieldChanged()` on every keystroke; starts single-line, expands to 5 rows when expanded |
| **B** button         | `.desc-fmt-btn`  | Wraps the current text selection in `**…**`; places cursor after closing markers if nothing selected       |
| _I_ button           | `.desc-fmt-btn`  | Same, but wraps in `*…*`                                                                                   |
| ↕ / ↑ toggle         | `#descExpandBtn` | Toggles `.expanded` on the textarea (`rows="5"`)                                                           |

### Dormant fetch capability

A `fetchDescription()` function is implemented but its trigger button is
commented out in the HTML. If re-enabled, clicking **↓ Fetch** would:

1. Call `/.netlify/functions/fetch-page?url=<infoUrl>` to retrieve the show's
   info page server-side (bypassing CORS).
2. Extract a description using a three-stage heuristic:
   - **Heading-guided** — find the first `<h2>`/`<h3>` containing "Synopsis",
     "Story", "About", "Description", or "Overview", then collect the
     paragraphs immediately following it.
   - **Paragraph fallback** — scan `main`, `article`, and common content-area
     selectors for the first two substantial paragraphs (> 60 chars), skipping
     any that look like rehearsal schedules (≥ 2 time patterns or day names).
   - **Meta fallback** — use `og:description` / `meta[name="description"]`.
3. Prefer body-extracted text when it is > 1.3× longer than the meta
   (indicates the meta is site-wide boilerplate rather than show-specific).

The button is useful for SCS show pages (which have rich `og:description`
tags) and for Renegade show pages (which have show descriptions under a
"Story" or "Synopsis" heading). It is not reliable for other Companies
because they do not provide consistent individual show pages. This feature is cuurent suppressed.

To re-enable: uncomment the button in the `.desc-toolbar` section of
`public/admin/index.html`.

---

## 3. Server-side fetch proxy

### Netlify Function — `netlify/functions/fetch-page.mjs`

Accepts `GET /.netlify/functions/fetch-page?url=<encoded-url>` and returns the
raw HTML of the target page. Exists to bypass browser CORS restrictions when
fetching external show pages from the admin editor.

Security constraints:

- Only `http:` and `https:` protocols are accepted (prevents SSRF against
  internal resources).
- 8-second timeout, `redirect: 'follow'`.

### Dev-mode Vite proxy — `astro.config.mjs`

A `fetch-page-dev-proxy` Vite plugin intercepts `/.netlify/functions/fetch-page`
requests during `npm run dev` and performs the same fetch server-side, so the
admin editor works without needing `netlify dev` running alongside.

---

## 4. Calendar drill-down panel (`src/components/calendar.astro`)

Shows with a non-empty description get a `.has-desc` class on their show chip
in the sticky left column.

### Trigger behaviour

| Input                 | Action                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| Mouse hover (desktop) | Panel appears; dismisses on mouse leave                                     |
| Touch tap (mobile)    | Panel toggles on first tap; dismisses on second tap or by tapping elsewhere |
| Scroll                | Panel is dismissed                                                          |
| Click outside         | Panel is dismissed                                                          |

### Panel content

The panel is a `position: fixed` overlay (`#showDescPanel`, z-index 300)
positioned to the right of the chip. It contains:

- Company label and full show title (header)
- Description text rendered through `renderMd()` — converts `**bold**` →
  `<strong>` and `*italic*` → `<em>`
- Footer with performance type label if set (e.g. "Talk-back")

### `renderMd(text)`

Minimal renderer for the `**bold**` / `*italic*` syntax used in description
fields. Does not support any other Markdown constructs.
