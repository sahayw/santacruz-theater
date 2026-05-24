# Color System

All CSS custom properties are defined in the `:root` block of
`src/components/calendar.astro`. JavaScript colour maps are defined
immediately after the `PERFORMANCES` constant in the same file's `<script>`
block. There is no separate design-token file.

---

## 1. Base tokens

Foundation palette used across every surface. Not company-specific.

| CSS variable    | Value     | Usage                                                      |
| --------------- | --------- | ---------------------------------------------------------- |
| `--bg`          | `#f7f4ef` | Page background; shows column; day-number row; month label |
| `--surface`     | `#ffffff` | Month blocks; week grid; filter bar; footer; bottom sheet  |
| `--ink`         | `#1a1612` | App header bar (fill); primary text; today badge fill      |
| `--ink-muted`   | `#6b6259` | Secondary text; filter labels; legend title; date numbers  |
| `--border`      | `#e0d9d0` | All dividing lines (cells, cards, headers, footer)         |

---

## 2. Company colour system

Companies are coloured at three levels of saturation depending on context.
Only SCS, AT, MCT, and Renegade have named colour sets.
**Cabrillo and ABT are treated as "other"** and fall through to the grey fallback
at every level — they have display names but no distinct colour identity.

### 2a. Fill colors — `--col-*`

Muted tints (S ≈ 35–40%, L ≈ 80–82%). Used as area fills where colour covers
a block of pixels: annual-view mini-day cell backgrounds and drill-down
performance-bar backgrounds (further softened by `filter: saturate(0.6)` on
`.perf-bar`).

SCS and AT are near-complementary on the colour wheel (rose 7° vs blue 225°)
to maximise contrast at the smallest display sizes.

| CSS variable      | Value     | Hue  | Company      | Name        |
| ----------------- | --------- | ---- | ------------ | ----------- |
| `--col-scs`       | `#E9C1BE` |   7° | SCS          | Carnation   |
| `--col-at`        | `#AFBFEE` | 225° | AT           | Dusk        |
| `--col-mct`       | `#C1E1C6` | 130° | MCT          | Willow      |
| `--col-renegade`  | `#AFE9E7` | 178° | Renegade     | Verdigris   |
| `--col-other`     | `#E0DCD6` |  —   | Cabrillo / ABT / unknown | Warm grey |
| `--col-multi`     | `#E0DCD6` |  —   | Multi-company (annual only) | Warm grey |

**Where used:**
- `companyColor(company)` JS function returns these variables.
  Fallback for unmapped companies: `var(--col-other)`.
- **Annual view** — mini-day cell background (`el.style.background`) when a
  single company has performances on that date (JS, line ≈ 1112).
- **Annual view** — multi-company dates use `var(--col-multi)` via the
  `.mini-day.has-perf.multi` CSS rule.
- **Drill-down view** — performance-bar background (`bar.style.background`,
  line ≈ 1260). The `.perf-bar` CSS rule applies `filter: saturate(0.6)` on
  top, softening these fills in the drill-down context only.

### 2b. Dot colors — `--dot-*`

Muted accents (S ≈ 30–35%, L ≈ 56–62%). Used for small identification dots
where colour must read clearly at 8–11 px without dominating the surrounding
content.

| CSS variable      | Value     | Company  | Name        |
| ----------------- | --------- | -------- | ----------- |
| `--dot-scs`       | `#BA8A88` | SCS      | Dusty rose  |
| `--dot-at`        | `#7080B8` | AT       | Soft indigo |
| `--dot-mct`       | `#5CAA72` | MCT      | Sage green  |
| `--dot-renegade`  | `#40A0AA` | Renegade | Muted teal  |

**Where used:**
- `dotColor(company)` JS function returns these variables.
  Fallback for unmapped companies: `var(--ink-muted)` (`#6b6259`).
- **Annual view hover panel** — the 8×8 px company dot beside each
  performance row (`hover-panel-dot`, line ≈ 974).
- **Footer legend** — the 11×11 px coloured square beside each company name
  (built dynamically in `buildFixedFooter()`).

### 2c. Accent colors — `--acc-*`

Fully saturated (S ≈ 55–65%, L ≈ 42–48%). Used where colour acts as a clear,
vivid identity signal on a neutral background rather than as an area fill.

| CSS variable      | Value     | Company  | Name            |
| ----------------- | --------- | -------- | --------------- |
| `--acc-scs`       | `#D03C3C` | SCS      | Vivid red-rose  |
| `--acc-at`        | `#4064C8` | AT       | Vivid blue      |
| `--acc-mct`       | `#28A050` | MCT      | Vivid green     |
| `--acc-renegade`  | `#1898A8` | Renegade | Vivid teal      |

**Where used:**
- `accentColor(company)` JS function returns these variables.
  Fallback for unmapped companies: `var(--ink-muted)` (`#6b6259`).
- **Drill-down shows column** — the 4×16 px vertical bar stripe inside each
  show chip (`.show-chip-bar`, line ≈ 1210).
- **Show card (bottom sheet)** — the 8×8 px circular badge beside the company
  name (`.company-badge`, line ≈ 1338).

---

## 3. UI element summary

| UI element                                  | Colour source          | Variable / function  |
| ------------------------------------------- | ---------------------- | -------------------- |
| Page / column background                    | Base token             | `--bg`               |
| Card / sheet / filter bar background        | Base token             | `--surface`          |
| App header bar                              | Base token             | `--ink`              |
| All dividing lines                          | Base token             | `--border`           |
| Primary text                                | Base token             | `--ink`              |
| Secondary / muted text                      | Base token             | `--ink-muted`        |
| Annual mini-day cell (single company)       | Fill · `companyColor()`| `--col-*`            |
| Annual mini-day cell (multiple companies)   | Fill token             | `--col-multi`        |
| Drill-down perf bar background              | Fill · `companyColor()`| `--col-*` + `saturate(0.6)` filter |
| Drill-down shows column chip bar stripe     | Accent · `accentColor()`| `--acc-*`           |
| Annual hover panel company dot              | Dot · `dotColor()`     | `--dot-*`            |
| Footer legend colour square                 | Dot · `dotColor()`     | `--dot-*`            |
| Show card (bottom sheet) company badge      | Accent · `accentColor()`| `--acc-*`           |

---

## 4. Colour fallback chain

When a company has no entry in a given map (Cabrillo, ABT, Other, or any
future unregistered company):

| Context                  | Fallback value       | Appearance         |
| ------------------------ | -------------------- | ------------------ |
| `companyColor()` fill    | `var(--col-other)`   | `#E0DCD6` warm grey |
| `dotColor()` dot         | `var(--ink-muted)`   | `#6b6259` warm grey |
| `accentColor()` accent   | `var(--ink-muted)`   | `#6b6259` warm grey |

---

## 5. Adding a new company colour

1. Add three CSS custom properties to the `:root` block in
   `src/components/calendar.astro`:
   ```css
   --col-newco:  #…;   /* muted fill    S≈38% L≈82% */
   --dot-newco:  #…;   /* muted dot     S≈32% L≈58% */
   --acc-newco:  #…;   /* vivid accent  S≈60% L≈45% */
   ```
2. Add an entry to each of the three JS maps (`COMPANY_COLORS`,
   `COMPANY_DOTS`, `COMPANY_ACCS`) using the company's key string as it
   appears in `data/sc-theater-runs.json`.
3. Add a `LEGEND_ENTRIES` item (dot + display name) in the same script block.
4. Add the full display name to `COMPANY_NAMES` if not already present.

Choose a hue not already in use. Current hue assignments:
7° (SCS) · 130° (MCT) · 178° (Renegade) · 225° (AT).
Good candidates for new companies: ~60° (amber), ~270° (purple), ~305° (orchid).
