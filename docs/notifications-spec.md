# Email Updates, Organizers & Calendar Redesign — Spec

Status: **agreed 2026-10-15, not yet built.** Work happens on the
`email-updates` branch (from `dev`). This is the design record. Once each stage
ships, `implementation.md` and `feature-guide.md` describe how the system
works. Clickable mockups of the agreed UI:
<https://claude.ai/artifact/RZBHrgQFbHg8ehSkXVjuyH>. They are a guide, not
pixel-exact.

## Goal

Let visitors get email about new **performances** as well as auditions and
events. Choosing which companies to hear about should be optional but offered.
Doing this exposed two related problems, which are fixed here too:

- "Other" was used both as a record's company name and as a catch-all group.
- The calendar's colour coding didn't work: in 2026, 96 of 166 performance
  days were a single "multi-company" taupe.

## Decisions

| Decision          | Choice                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Email lists       | Two: **Performance updates** and **Audition & event notices**. Events are for theater practitioners, so they belong with auditions.    |
| Company choice    | Performance updates only. The four **majors** can be unticked; everyone else is always included. Auditions & events: no choice.        |
| Change detection  | Same for both lists: compare significant fields with a snapshot of what was last emailed. Not `createdAt` / `updatedAt`.               |
| Preferences       | Stored in Buttondown: a tag per list, plus the subscriber's **excluded** majors. No accounts.                                          |
| Subscribe UI      | One page, `/subscribe`. No dialog. Reached from a nav link on the list pages.                                                          |
| Organizers        | Every production and activity names a real organizer. "Other" is only a group name, never a record's name.                             |
| Adding organizers | Hand edit of `data/sc-theater-companies.json` only. Editors can't create organizers.                                                   |
| Data files        | Stay one per company per year. `other-<year>.json` files stay as an internal bucket for non-major, unlisted organizers.                |
| Calendar feeds    | Performances: the same four-major checkboxes, served as 16 pre-built static feeds. Old per-company feeds dropped (no subscribers yet). |
| Calendar colour   | Colour identifies only the four majors (plus grey for everyone else).                                                                  |

## Organizers

The companies file becomes the single list of organizers. Each entry keeps its
current fields and gains:

| Field             | Type       | Notes                                                                    |
| ----------------- | ---------- | ------------------------------------------------------------------------ |
| `major`           | `boolean?` | Offered as a checkbox in subscriptions; has its own calendar colour.     |
| `colour`          | `string?`  | Majors only. Moves the hard-coded colours out of `calendar.astro`.       |
| `onCompaniesPage` | `boolean?` | Replaces "show everything not `adminOnly`" on `/companies`. Set by hand. |

- `abvName` is the **short label** (about 12 characters or fewer). It is shown
  in calendar entries ("7:30pm · Much Ado · SCS"), the desktop year-view hover
  list, the `/companies` logo placeholder, and the editor.
- Records in `other-<year>` files carry `organizer: "<id>"`. On activities
  this replaces the free-text `organizerName` / `organizerUrl`.
- Validation in `src/lib/data-rules.ts` (editor and `check-*.ts`): every record
  in an `other` file names an organizer that exists in the list. Records in a
  company's own file must not set one.
- One shared helper resolves a record's **organizer id**, display name and
  short label. The id is the file's company id for a company's own records,
  or the `organizer` field for `other` records. The calendar, `/runs`,
  `/events`, feeds and emails all use it. Grouping (major vs Other) is
  derived from the organizer, never stored on records.
- **Organizer ids are permanent.** Moving an organizer from the `other` file
  to its own files (as with Good Egg) keeps its id. Links and saved
  subscription choices depend on it.
- **Planned, not in this work**: a company card on `/companies` that lists
  that company's upcoming productions on the site. The infrastructure here
  supports it: `/runs?company=<organizer id>` works for any organizer (see
  [`/events` and `/runs`](#events-and-runs)). How the card offers "website"
  vs "productions here" is still open.
- The editor offers a picker of existing organizers for `other` records. New
  organizers are added by hand edit only.

**Majors** (2026): SCS, AT, MCT, Renegade. Together they produced 24 of 2026's
38 productions. All eleven current companies stay on `/companies`.

**Organizers to add**, neither major nor on `/companies`:

| id (proposed)    | Name                                | Short label  | Website                                 | Records                                        |
| ---------------- | ----------------------------------- | ------------ | --------------------------------------- | ---------------------------------------------- |
| `sh-theatrical`  | SH Theatrical                       | SH Theatre   | none                                    | R&G; Gross Indecency (production and audition) |
| `shadow-city`    | Shadow City                         | Shadow City  | none                                    | The Whole Monkey Show                          |
| `cabrillo-ta`    | Cabrillo College Theater Arts       | Cabrillo TA  | https://www.cabrillo.edu/vapa/#events   | Machinal (production and audition)             |
| `cabrillo-pac`   | Cabrillo Performing Arts Collective | Cabrillo PAC | https://www.instagram.com/cabrillopac/  | The 39 Steps, Abridged                         |
| `midsummer`      | Midsummer Ensemble                  | Midsummer    | https://www.midsummerensemble.com/      | Dracula                                        |
| `ucsc-barnstorm` | UCSC Barnstorm                      | Barnstorm    | https://play.ucsc.edu/news-events/      | The Flick                                      |
| `ucsc-ta`        | UCSC Theater Arts                   | UCSC         | https://play.ucsc.edu/news-events/      | UCSC New Play Festival                         |
| `dor-atkinson`   | Dor Atkinson                        | Dor Atkinson | https://dorcosbyatkinson.wordpress.com/ | Audition Clinic                                |

The migration also strips "(Midsummer Ensemble)" from the Dracula title. "(Christopher Michael
Palermo)" in The Whole Monkey Show's title stays: it names the writer or
performer, like "(Albee)" elsewhere.

## Change detection

Each digest keeps a snapshot, in Netlify Blobs, of the significant fields of
every record it has notified about. Each nightly run:

- **New**: not in the snapshot and currently listable. For a production that
  means it has upcoming performances; for an activity, that it is upcoming
  and not closed. This also handles productions saved before their dates are
  entered, and productions entered after they've finished.
- **Changed**: a significant field differs. The email says what changed.
- Everything else is ignored, so typo fixes never send email.

| Triggers an email                                                                 | Productions | Auditions & events |
| --------------------------------------------------------------------------------- | ----------- | ------------------ |
| New                                                                               | ✓           | ✓                  |
| Dates added, removed or moved                                                     | ✓           | ✓                  |
| Venue / location changed                                                          | ✓           | ✓                  |
| Tickets link appears (production or any upcoming performance) — "Tickets on sale" | ✓           |                    |
| Registration link appears — "Registration open"                                   |             | ✓                  |
| Reopened after being closed                                                       |             | ✓                  |

**Ignored**: price, description, title, discounts, genre, info link, one
tickets link replacing another, notes, contact, prep.

The rules live in one module, `src/lib/notice-rules.ts`, with unit tests.
Snapshots are seeded at go-live so the first digest doesn't announce
everything. Release just after the 02:00 UTC run.

## Sending

- **Audition & event notices**: one Buttondown broadcast to the
  `auditions-events` tag.
- **Performance updates**:
  - One broadcast to subscribers who excluded nothing.
  - Each subscriber with exclusions gets an individual email holding only
    their content, or no email if nothing is left. Identical content shares
    one created email. The individual sends run in a background function,
    because scheduled functions are limited to 30 seconds.
  - A per-run record of who has been sent to makes a retry skip them.
  - Buttondown's API rate limit is to be checked during the build.
- Scale: low hundreds of subscribers, under 1,000. The Buttondown archive
  doesn't matter.
- Existing subscribers are tagged `auditions-events` once, so they keep what
  they get today.

## Emails

- **Performance cards** follow `/runs`: title and genre, then company · venue ·
  price, date range, the first few performances, and "All dates →". "2 dates
  added" lists only the new dates.
- **Sections**: New, then Updates. Labels say what changed. "Tickets on sale"
  and "Registration open" get a solid button.
- **Footer**: names the list and any excluded companies. It has **Change your
  choices** (to `/subscribe?s=<subscriber id>`) and **Unsubscribe from
  everything** (Buttondown's link, which covers both lists).
- **Welcome email**: one email, with a section for each list chosen.
  Productions appear as a compact list.

## Subscribe and manage

- **`/subscribe`** shows the two lists, either or both.
  - Under Performance updates: **Select companies**, the four majors, all
    ticked. People untick what they don't want. "Productions by all other
    companies and organizers are always included."
  - Unticking all four is allowed.
  - Changing a company tick also ticks Performance updates.
- **The nav link** "Subscribe for updates" sits beside the site name, only on
  `/calendar`, `/events` and `/runs`. It pre-ticks the list that suits the
  page (`?list=performances` or `?list=auditions-events`) and gives a back
  link. It's hidden on `/subscribe`. The hub's "Subscribe →" link on the
  Events card goes.
- **Managing**:
  - `/subscribe?s=<Buttondown subscriber id>` opens the subscriber's current
    choices. That id is the same bearer token as Buttondown's own unsubscribe
    link.
  - A new `preferences` function (Functions v2) reads and writes them.
- **Unticking both lists** and saving asks "Nothing selected — do you want to
  unsubscribe?"
- **Lost link**: the visitor enters their email and we send a link. The reply
  never says whether the address is subscribed.
- **Subscribing an address that's already subscribed** emails it a manage
  link instead of an error.

## Calendar

Terminology: the **year view** and the **month view** (larger screens) or
**week view** (phones). There's no Filters button in either view.

- **Year view**:
  - Day cells show one square per major performing, always in the same order
    (SCS, AT, MCT, Renegade), then one grey square if anyone else is.
  - On phones it opens scrolled to the current month.
  - Desktop keeps the hover list.
  - One tap or click opens the drill-down at that day.
- **Drill-down**:
  - Larger screens get a month grid. Days from the previous and next months
    are filled in, and ‹ › steps a month.
  - Phones get one week at a time, with ‹ › stepping a week.
  - There's no shows column. Entries read "time · show · organizer", with a
    coloured left edge for majors and grey for everyone else.
  - Show descriptions move into the performance card.
- **Add to my calendar**: the same four checkboxes as `/subscribe`. The
  audition feeds are unchanged.

## `/events` and `/runs`

- Both get a dark bar like the calendar's: Filters on the left, title in the
  middle, Add to my calendar on the right. The `/events` subscribe banner goes.
- Filters:
  - `/events`: Upcoming/All and Auditions/Events.
  - `/runs`: Upcoming/All, and Company (the four majors plus Other).
- Every card names its organizer.
- Cards carry the organizer id (`data-organizer`), not the data file's
  company (today every catch-all production is tagged `"other"`).
- `/runs?company=<organizer id>` filters to any one organizer, including ones
  not in the dropdown. The dropdown (four majors plus Other) is just the
  visible control. `/events` accepts the same parameter.

## Stages

Each stage is built on `email-updates` and tested before the next. UI is
tested locally (`npm run dev`). The prototype runs on Netlify's `dev` deploy,
with `EMAIL_DIGEST_DRY_RUN=true`.

| Stage | Work                                                                                                                                                                                                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Organizer list: new fields, new entries, `organizer` on `other` records, validation rule, shared organizer helper (id, name, label), editor picker, migration script, organizer names shown where "Other" or a blank shows today, `data-organizer` on `/runs` and `/events` cards. |
| 2     | Calendar: year-view squares, month view and phone week view, entry format, descriptions in the performance card, major colours from data, the 16 static feeds and the checkbox dialog.                                                                                             |
| 3     | Notifications: `notice-rules.ts`, snapshots, the two digests, individual sends, `/subscribe` and the `preferences` function, emails and welcome email, subscriber migration.                                                                                                       |
| 4     | Nav link, `/events` and `/runs` bars (including `?company=<organizer id>`), hub link removal.                                                                                                                                                                                      |

**Releasing the migration**: as in `ics-spec.md`, live editor saves land on
`main`. So the data migration is regenerated at release time rather than
merged as committed: `npm run sync`, merge, take `main`'s `data/`, run the
migration script, then `npm run check`, then commit.

Every stage updates `implementation.md` and `feature-guide.md` for what it
ships. This includes the stale "Companies" tile in `feature-guide.md` §1:
there's no Companies editor.

## Out of scope

- **Server-side edit permissions**: `data.mjs` checks only that the user is
  signed in, not per-company access. Fix separately.
- **"n more productions from companies you left out"** line in emails:
  dropped.
