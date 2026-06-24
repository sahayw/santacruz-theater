# SC Theater - Services

## Overview

The Services section connects Santa Cruz County theater companies and individuals with production resources: photographers, equipment rental, spaces, technical crew, and coaches.

The `/services` page has three modes:

- **Index mode** (no params) — shows a category grid; clicking a category navigates to filtered mode
- **Filtered mode** (`?category=<id>`) — category grid disappears entirely; listing cards filtered by the selected category id are shown; a two-level category selector (same hierarchy as the index grid) allows switching to another category or subcategory without returning to the index; no explicit back link is needed — the SiteNav "Services" link returns to index mode
- **Deep-link mode** (`?id=<listing-id>`) — shows a single listing card expanded (all others hidden); filter bar and category grid hidden; page title changes to the listing name

---

## Category index

Stored in `data/sc-theater-service-categories.json` — hand-editable, drives both the index grid and the filter dropdown. Each category has an `id` (kebab-case slug used in the URL), a `label`, and an array of `subcategories` (each with its own `id` and `label`).

```
Photography / Videography          id: photography
  Headshots                          id: headshots
  Shows                              id: shows
Equipment Rental                   id: equipment-rental
  Lighting                           id: lighting
  Sound                              id: sound
  Staging                            id: staging
Space Rental                       id: space-rental
  Rehearsal                          id: rehearsal
  Performance                        id: performance
Technical Skills                   id: technical-skills
  Lighting Design                    id: lighting-design
  Sound Design                       id: sound-design
  Board Ops                          id: board-ops
  Stage Management                   id: stage-management
  Stage Hand                         id: stage-hand
  Production Management              id: production-management
  Set Design                         id: set-design
Coaching                           id: coaching
  Acting                             id: acting
  Voice                              id: voice
  Movement                           id: movement
```

Clicking a top-level category navigates to `/services?category=<id>` and shows all listings that include any subcategory under that parent. Clicking a subcategory navigates to `/services?category=<subcategory-id>` and filters to exact subcategory matches.

The two-level hierarchy is surfaced in both the category index grid and the filtered-mode category selector. Selecting a top-level category matches all listings tagged with any of its subcategories. Listings store only subcategory ids (leaf-level values) — never a top-level category id directly.

---

## Data storage

Single file: `data/sc-theater-services.json`

Top-level shape:

```json
{ "listings": [ <ServiceListing>, ... ] }
```

### `ServiceListing`

| Field         | Type             | Required | Notes                                                                                                         |
| ------------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `id`          | `string`         | yes      | `"service-<timestamp>"` — stable, admin-assigned                                                              |
| `name`        | `string`         | yes \*   | Company or individual name                                                                                    |
| `categories`  | `string[]`       | yes \*   | One or more subcategory ids from `sc-theater-service-categories.json`; a listing may span multiple categories |
| `contact`     | `ServiceContact` | yes      | At least `tel` or `email` required                                                                            |
| `photo`       | `string?`        | no       | Local path, e.g. `"/images/services/jane-smith.jpg"` — stored in `public/images/services/`                    |
| `url`         | `string?`        | no       | URL for further info                                                                                          |
| `description` | `string?`        | no       | Full description; supports `**bold**` and `*italic*`; shown in expanded card                                  |
| `active`      | `boolean`        | yes      | `false` hides the listing from public pages without deleting it                                               |
| `createdAt`   | `string`         | yes      | ISO 8601 timestamp — not displayed, kept for audit                                                            |
| `updatedAt`   | `string`         | yes      | ISO 8601 timestamp — not displayed, kept for audit                                                            |

### `ServiceContact`

| Field     | Type      | Required | Notes                                                     |
| --------- | --------- | -------- | --------------------------------------------------------- |
| `name`    | `string?` | no       | Contact person name                                       |
| `tel`     | `string?` | no\*     | At least `tel` or `email` required                        |
| `email`   | `string?` | no\*     | At least `tel` or `email` required                        |
| `address` | `string?` | no       | Physical address; most relevant for Space Rental listings |

---

## Service card display

Cards are collapsed by default; clicking expands to show the description. Consistent with the Activities card pattern.

**Collapsed card** shows:

- Name (heading)
- Category pills (one per subcategory)
- Contact info block with photo to its left (photo is optional; ~80×80 px square, rounded corners)

**Expanded card** additionally shows, below the collapsed content (contact block stays in place):

- Description (supports `**bold**` / `*italic*` inline formatting, same renderer as Activities)
- URL as a labelled link ("More info")

### Photo form factor

Small optional image displayed to the left of the contact info block within the collapsed card — approximately 80×80 px, displayed as a rounded square. Images stored in `public/images/services/`. No minimum dimension enforced; admin should crop/resize before upload. Filename convention: `<kebab-name>.<ext>`.

---

## URL patterns

| URL                              | Behaviour                                              |
| -------------------------------- | ------------------------------------------------------ |
| `/services`                      | Category index grid                                    |
| `/services?category=photography` | All listings with a subcategory under Photography      |
| `/services?category=headshots`   | Listings tagged specifically with Headshots            |
| `/services?id=1735000000001`     | Single-listing deep-link (expanded, all others hidden) |

The `id` in the deep-link URL is the numeric timestamp portion of the listing id (the `service-` prefix is stripped, matching the `/events?id=` pattern).

---

## Admin editor (`services.js`)

- Mount/unmount module pattern, same as `calendar.js` and `activities.js`
- Admin-only dataset: not tied to a company; only users with site-wide admin access can edit
- Sidebar: listing names; **+ New** button creates a new record
- Form fields follow the `ServiceListing` schema above
- `categories` field: multi-select using the two-level hierarchy; selecting a top-level category in the UI selects/deselects all its subcategories; the stored value always contains only subcategory ids (leaf-level)
- `active` toggle: shown in the record header alongside Restore / Delete
- Photo: text input for the local path (admin uploads the file manually to `public/images/services/` and enters the path)
- `description` field: plain textarea; same `**bold**` / `*italic*` rendering as Activities notes
- Save, dirty-check, and restore behaviour: same pattern as Activities editor

---

## Implementation plan

### Phase 1 — Data layer

- Create `data/sc-theater-service-categories.json`
- Create `data/sc-theater-services.json` (empty listings array)
- Add `ServiceCategory`, `ServiceContact`, `ServiceListing` types to `src/types.ts`
- Add `getServices()` to `src/lib/data.ts`

### Phase 2 — Public page

- Replace stub in `src/pages/services.astro` with category index and listing cards
- Client-side `?category=` filter
- `?id=` deep-link single-card mode
- Collapsed/expanded card toggle

### Phase 3 — Admin editor

- `public/admin/services.js` (mount/unmount)
- Services tile in `public/admin/index.html`
- Extend `netlify/functions/data.mjs` for services read/write
