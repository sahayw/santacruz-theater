# Home page spacing reference

All spacing properties in `src/pages/index.astro`.

## How vertical space is distributed (desktop and tablet)

Spare vertical space (viewport height minus content) is split between three flex spacers in a **3:2:1 ratio**:

| Spacer | Element | Flex weight | Share of spare space |
|---|---|---|---|
| Top (above hero text) | `.page-content::before` | 3 | ~50% |
| Middle (hero text to cards) | `.hero-cards-gap` div | 2 | ~33% |
| Bottom (below cards) | `.page-content::after` | 1 | ~17% |

The middle spacer has `min-height: 16px` so it never collapses entirely on short viewports.

To adjust the ratio, change the `flex` values on `.page-content::before` (line 224), `.hero-cards-gap` (line 228), and `.page-content::after` (line 225).

## Desktop (>860px)

| What | Property | Line |
|---|---|---|
| Page edge padding (top/bottom) | `padding: 20px 32px` on `.page-content` | 211 |
| Gap between the 3 cards | `gap: 32px` on `.cards-grid` | 272 |
| Outer edge inset of cards grid | `padding: 0 8px 8px` on `.cards-grid` | 274 |

## Tablet (≤860px)

| What | Property | Line |
|---|---|---|
| Page edge padding | `padding: 16px 24px` on `.page-content` | 441 |

## Phone / single-column (≤600px)

The proportional flex spacers are collapsed to zero on phone. Spacing reverts to fixed values.

| What | Property | Line |
|---|---|---|
| Page edge padding | `padding: 16px 16px 20px` on `.page-content` | 448 |
| Gap between hero text and Calendar card | `min-height: 32px` on `.hero-cards-gap` | 460 |
| Gap between cards | `gap: 20px` on `.cards-grid` | 469 |

## Inside cards (all breakpoints)

| What | Property | Line |
|---|---|---|
| Icon top padding | `padding: 16px 20px 0` on `.card-icon` | 313 |
| Title padding | `padding: 8px 20px 0` on `.card-title` | 326 |
| Description padding | `padding: 6px 20px 0` on `.card-desc` | 344 |
| CTA bottom padding | `padding: 12px 20px 16px` on `.card-cta` | 355 |
