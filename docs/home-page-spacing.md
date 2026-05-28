# Home page spacing reference

All spacing properties in `src/pages/index.astro`.

## How vertical space is distributed (desktop and tablet)

Spare vertical space (viewport height minus content) is split between three flex spacers in a **3:2:1 ratio**:

| Spacer                              | Element                 | Flex weight | Share of spare space |
| ----------------------------------- | ----------------------- | ----------- | -------------------- |
| Top (above hero text)               | `.page-content::before` | 3           | ~50%                 |
| Middle (hero text to cards)         | `.hero-cards-gap` div   | 2           | ~33%                 |
| Bottom (below cards and footer row) | `.page-content::after`  | 1           | ~17%                 |

The middle spacer has `min-height: 16px` so it never collapses entirely on short viewports.

To adjust the ratio, change the `flex` values on `.page-content::before` (line 223), `.hero-cards-gap` (line 230), and `.page-content::after` (line 226).

## Desktop (>860px)

| What                           | Property                                  | Line |
| ------------------------------ | ----------------------------------------- | ---- |
| Page edge padding (top/bottom) | `padding: 20px 32px` on `.page-content`   | 209  |
| Gap between the 3 cards        | `gap: 32px` on `.cards-grid`              | 274  |
| Outer edge inset of cards grid | `padding: 0 8px 8px` on `.cards-grid`     | 276  |
| Footer row padding             | `padding: 10px 8px 4px` on `.page-footer` | 430  |

## Tablet (≤860px)

| What              | Property                                | Line |
| ----------------- | --------------------------------------- | ---- |
| Page edge padding | `padding: 16px 24px` on `.page-content` | 461  |

## Phone / single-column (≤600px)

The proportional flex spacers are collapsed to zero on phone. Spacing reverts to fixed values.

| What                                    | Property                                     | Line |
| --------------------------------------- | -------------------------------------------- | ---- |
| Page edge padding                       | `padding: 16px 16px 20px` on `.page-content` | 468  |
| Gap between hero text and Calendar card | `min-height: 32px` on `.hero-cards-gap`      | 480  |
| Gap between cards                       | `gap: 20px` on `.cards-grid`                 | 489  |

## Page footer row

The "About this site" link and photo credit sit in `.page-footer` — a flex row at the bottom of `.page-content`, naturally aligned to the cards' left and right edges.

## Inside cards (all breakpoints)

| What                | Property                                 | Line |
| ------------------- | ---------------------------------------- | ---- |
| Icon top padding    | `padding: 16px 20px 0` on `.card-icon`   | 315  |
| Title padding       | `padding: 8px 20px 0` on `.card-title`   | 328  |
| Description padding | `padding: 6px 20px 0` on `.card-desc`    | 346  |
| CTA bottom padding  | `padding: 12px 20px 16px` on `.card-cta` | 357  |
