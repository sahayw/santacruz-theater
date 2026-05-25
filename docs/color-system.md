# Color System

All CSS custom properties are defined in the `:root` block of
`src/components/calendar.astro`. JavaScript colour maps are defined
immediately after the `PERFORMANCES` constant in the same file's `<script>`
block. There is no separate design-token file.

Swatches below use inline HTML so they render in VS Code Markdown preview.

---

## 1. Base tokens

Foundation palette used across every surface. Not company-specific.

| CSS variable  | Value     | Swatch                                                                                                                                                   | Usage                                                      |
| ------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `--bg`        | `#f7f4ef` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#f7f4ef;vertical-align:middle;"></span> | Page background; shows column; day-number row; month label |
| `--surface`   | `#ffffff` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#ffffff;vertical-align:middle;"></span> | Month blocks; week grid; filter bar; footer; bottom sheet  |
| `--ink`       | `#1a1612` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#1a1612;vertical-align:middle;"></span> | App header bar (fill); primary text; today badge fill      |
| `--ink-muted` | `#6b6259` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#6b6259;vertical-align:middle;"></span> | Secondary text; filter labels; legend title; date numbers  |
| `--border`    | `#e0d9d0` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#e0d9d0;vertical-align:middle;"></span> | All dividing lines (cells, cards, headers, footer)         |

---

## 2. Company colour system

Companies are coloured at three levels of saturation depending on context.
Only SCS, AT, MCT, and Renegade have named colour sets.

### 2a. Fill colors — `--col-*`

Muted tints (S ≈ 35–40%, L ≈ 82–83%). Used as area fills where colour covers
a block of pixels: annual-view mini-day cell backgrounds and drill-down
performance-bar backgrounds (further softened by `filter: saturate(0.78) brightness(1.02)` on
`.perf-bar`).

SCS and AT are near-complementary on the colour wheel (rose 7° vs blue 225°)
to maximise contrast at the smallest display sizes.

| CSS variable     | Value     | Swatch                                                                                                                                                   | Hue  | Company                     | Name         |
| ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------- | ------------ |
| `--col-scs`      | `#E9C1BE` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#E9C1BE;vertical-align:middle;"></span> | 7°   | SCS                         | Carnation    |
| `--col-at`       | `#AFBFEE` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#AFBFEE;vertical-align:middle;"></span> | 225° | AT                          | Dusk         |
| `--col-mct`      | `#C9E6BF` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#C9E6BF;vertical-align:middle;"></span> | 116° | MCT                         | Willow       |
| `--col-renegade` | `#B7E8EC` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#B7E8EC;vertical-align:middle;"></span> | 188° | Renegade                    | Verdigris    |
| `--col-other`    | `#d6d6d6` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#d6d6d6;vertical-align:middle;"></span> | —    | Other                       | Neutral grey |
| `--col-multi`    | `#d4ccc2` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#d4ccc2;vertical-align:middle;"></span> | —    | Multi-company (annual only) | Warm taupe   |

**Where used:**

- `companyColor(company)` JS function returns these variables.
  Fallback for unmapped companies: `var(--col-other)`.
- **Annual view** — mini-day cell background (`el.style.background`) when a
  single company has performances on that date (JS, line ≈ 1112).
- **Annual view** — multi-company dates use `var(--col-multi)` via the
  `.mini-day.has-perf.multi` CSS rule, distinct from neutral-company fallback days.
- **Drill-down view** — performance-bar background (`bar.style.background`,
  line ≈ 1260). The `.perf-bar` CSS rule applies `filter: saturate(0.78) brightness(1.02)` on
  top, keeping the bars soft while preserving more company-to-company separation.

### 2b. Dot colors — `--dot-*`

Muted accents (S ≈ 30–35%, L ≈ 56–62%). Used for small identification dots
where colour must read clearly at 8–11 px without dominating the surrounding
content.

| CSS variable     | Value     | Swatch                                                                                                                                                   | Company                     | Name         |
| ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------ |
| `--dot-scs`      | `#ce8481` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#ce8481;vertical-align:middle;"></span> | SCS                         | Dusty rose   |
| `--dot-at`       | `#7b8bc4` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#7b8bc4;vertical-align:middle;"></span> | AT                          | Soft indigo  |
| `--dot-mct`      | `#71c75f` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#71c75f;vertical-align:middle;"></span> | MCT                         | Leaf green   |
| `--dot-renegade` | `#5dadbe` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#5dadbe;vertical-align:middle;"></span> | Renegade                    | Sea teal     |
| `--dot-other`    | `#cbcbcb` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#cbcbcb;vertical-align:middle;"></span> | Other                       | Neutral grey |
| `--dot-multi`    | `#ccc3b8` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#ccc3b8;vertical-align:middle;"></span> | Multi-company (annual only) | Warm taupe   |

**Where used:**

- `dotColor(company)` JS function returns these variables.
  Fallback for unmapped companies: `var(--dot-other)` (`#cbcbcb`).
- **Annual view hover panel** — the 8×8 px company dot beside each
  performance row (`hover-panel-dot`, line ≈ 974).
- **Footer legend** — the 11×11 px coloured square beside each company name
  (built dynamically in `buildFixedFooter()`). The "Multiple companies" legend
  entry uses `--dot-multi` (`#ccc3b8`) in annual view; the "Other" entry uses
  `--dot-other` (`#cbcbcb`) in drill-down view.

### 2c. Accent colors — `--acc-*`

Fully saturated (S ≈ 55–65%, L ≈ 42–48%). Used where colour acts as a clear,
vivid identity signal on a neutral background rather than as an area fill.

| CSS variable     | Value     | Swatch                                                                                                                                                   | Company  | Name                |
| ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------- |
| `--acc-scs`      | `#dc4343` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#dc4343;vertical-align:middle;"></span> | SCS      | Vivid red-rose      |
| `--acc-at`       | `#4f5ce0` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#4f5ce0;vertical-align:middle;"></span> | AT       | Vivid blue-violet   |
| `--acc-mct`      | `#48ae31` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#48ae31;vertical-align:middle;"></span> | MCT      | Vivid leaf green    |
| `--acc-renegade` | `#21a4c8` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#21a4c8;vertical-align:middle;"></span> | Renegade | Vivid sea teal      |
| `--acc-other`    | `#8f8a85` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#8f8a85;vertical-align:middle;"></span> | Other    | Neutral grey accent |

**Where used:**

- `accentColor(company)` JS function returns these variables.
  Fallback for unmapped companies: `var(--acc-other)` (`#8b8076`).
- **Drill-down shows column** — the 4×16 px vertical bar stripe inside each
  show chip (`.show-chip-bar`, line ≈ 1210).
- **Show card (bottom sheet)** — the 8×8 px circular badge beside the company
  name (`.company-badge`, line ≈ 1338).

---

## 3. UI element summary

| UI element                                | Colour source            | Variable / function                                  |
| ----------------------------------------- | ------------------------ | ---------------------------------------------------- |
| Page / column background                  | Base token               | `--bg`                                               |
| Card / sheet / filter bar background      | Base token               | `--surface`                                          |
| App header bar                            | Base token               | `--ink`                                              |
| All dividing lines                        | Base token               | `--border`                                           |
| Primary text                              | Base token               | `--ink`                                              |
| Secondary / muted text                    | Base token               | `--ink-muted`                                        |
| Annual mini-day cell (single company)     | Fill · `companyColor()`  | `--col-*`                                            |
| Annual mini-day cell (multiple companies) | Fill token               | `--col-multi`                                        |
| Drill-down perf bar background            | Fill · `companyColor()`  | `--col-*` + `saturate(0.78) brightness(1.02)` filter |
| Drill-down shows column chip bar stripe   | Accent · `accentColor()` | `--acc-*`                                            |
| Annual hover panel company dot            | Dot · `dotColor()`       | `--dot-*`                                            |
| Footer legend colour square               | Dot · `dotColor()`       | `--dot-*`                                            |
| Show card (bottom sheet) company badge    | Accent · `accentColor()` | `--acc-*`                                            |

---

## 4. Colour fallback chain

When a company has no entry in a given map:

| Context                | Fallback value     | Swatch                                                                                                                                                   | Appearance                    |
| ---------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `companyColor()` fill  | `var(--col-other)` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#d6d6d6;vertical-align:middle;"></span> | `#d6d6d6` neutral grey        |
| `dotColor()` dot       | `var(--dot-other)` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#cbcbcb;vertical-align:middle;"></span> | `#cbcbcb` neutral grey        |
| `accentColor()` accent | `var(--acc-other)` | <span style="display:inline-block;width:1.1em;height:1.1em;border:1px solid #b8b0a6;border-radius:2px;background:#8f8a85;vertical-align:middle;"></span> | `#8f8a85` neutral grey accent |

---

## 5. Adding a new company colour

1. Add three CSS custom properties to the `:root` block in
   `src/components/calendar.astro`:
   ```css
   --col-newco: #…; /* muted fill    S≈38% L≈82% */
   --dot-newco: #…; /* muted dot     S≈32% L≈58% */
   --acc-newco: #…; /* vivid accent  S≈60% L≈45% */
   ```
2. Add an entry to each of the three JS maps (`COMPANY_COLORS`,
   `COMPANY_DOTS`, `COMPANY_ACCS`) using the company's key string as it
   appears in `data/sc-theater-runs.json`.
3. Add a `LEGEND_ENTRIES` item (dot + display name) in the same script block.
4. Add the full display name to `COMPANY_NAMES` if not already present.

Choose a hue not already in use. Current hue assignments:
7° (SCS) · 116° (MCT) · 188° (Renegade) · 225° (AT).
Good candidates for new companies: ~60° (amber), ~270° (purple), ~305° (orchid).
