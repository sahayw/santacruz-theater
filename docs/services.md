# SC Theater - Services

## Overview

The Services section connects Santa Cruz County theater companies and individuals with production resources: photographers, equipment rental, spaces, technical crew, and coaches.

The `/services` page has three modes:

- **Index mode** (no params) — shows a category grid; clicking a category navigates to filtered mode
- **Filtered mode** (`?category=<id>`) — category grid disappears entirely; listing cards filtered by the selected category id are shown; a two-level category selector (same hierarchy as the index grid) allows switching to another category or subcategory without returning to the index; when all subcategories are deselected the empty state shows a "Return to Services index" link; the SiteNav "Services" link also returns to index mode at any time
- **Deep-link mode** (`?id=<listing-id>`) — shows a single listing card expanded (all others hidden); filter bar and category grid hidden; page title changes to the listing name at a reduced size

---

## Category index

Stored in `data/sc-theater-service-categories.json` — hand-editable, drives both the index grid and the filter dropdown. Each category has an `id` (kebab-case slug used in the URL), a `label`, and an array of `subcategories`. Each subcategory has an `id`, a `label`, and an optional `description`.

### `ServiceSubcategory`

| Field         | Type      | Notes                                                                                 |
| ------------- | --------- | ------------------------------------------------------------------------------------- |
| `id`          | `string`  | Kebab-case slug; used as the `?category=` URL value and stored in `ServiceListing.categories` |
| `label`       | `string`  | Display name in the category index and filter dropdown                                |
| `description` | `string?` | Short phrase used as the category pill text on listing cards (e.g. "Headshot Photography"). Falls back to `label` when absent. |

Current categories and subcategories:

```
                                    id                      description (pill text)
Photography / Videography       photography
  Headshots                     headshots                   Headshot Photography
  Shows                         shows                       Show Photography
Equipment Rental                equipment-rental
  Lighting                      lighting                    Lighting Rental
  Sound                         sound                       Sound Rental
  Staging                       staging                     Staging Rental
Space Rental                    space-rental
  Rehearsal                     rehearsal                   Rehearsal Space
  Performance                   performance                 Performance Space
Technical Skills                technical-skills
  Lighting Design               lighting-design             (falls back to label)
  Sound Design                  sound-design                (falls back to label)
  Board Ops                     board-ops                   (falls back to label)
  Stage Management              stage-management            (falls back to label)
  Stage Hand                    stage-hand                  (falls back to label)
  Production Management         production-management       (falls back to label)
  Set Design                    set-design                  (falls back to label)
Coaching                        coaching
  Acting                        acting                      Acting Coach
  Voice                         voice                       Voice Coach
  Movement                      movement                    Movement Coach
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
| `description` | `string?`        | no       | Full description; supports `**bold**`, `*italic*`, and `[link text](https://url)`; shown in expanded card     |
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

Cards are collapsed by default; clicking expands to show the description. Consistent with the Activities card pattern — filter changes reset all open cards to closed.

**Collapsed card** shows:

- Name (heading) with category pills inline to its right (one pill per subcategory; pill text is the subcategory `description` if set, otherwise the subcategory `label`)
- Contact info block with photo to its left (photo is optional; ~80×80 px square, rounded corners)

**Expanded card** additionally shows:

- Description (supports `**bold**`, `*italic*`, and `[link text](url)` inline formatting)
- URL as a labelled link ("More info →")

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
- Sidebar: listing names with active/inactive status; **+ New** button creates a new record; sidebar width is adjustable via a drag handle
- Form fields follow the `ServiceListing` schema above
- `categories` field: multi-select using the two-level hierarchy; selecting a top-level category in the UI selects/deselects all its subcategories; the stored value always contains only subcategory ids (leaf-level)
- `active` toggle: shown in the record header alongside Restore / Preview / Delete
- Photo: file picker uploads the image to `public/images/services/` on Save; the filename field is editable before saving; the stored `photo` path is set automatically from the uploaded filename
- `description` field: plain textarea; supports `**bold**`, `*italic*`, and `[link text](https://url)` rendering on the public page
- **Preview** button: renders a modal showing what the collapsed and expanded card will look like on the public `/services` page — category pills use the same `description ?? label` pill text as the public page; photo preview uses the pending upload if one is staged
- Save, dirty-check, and restore behaviour: same pattern as Activities editor
