# Email Updates, Organizers & Calendar Redesign — Spec

Status: **agreed 2026-10-15, not yet built.** Work happens on the
`email-updates` branch (from `dev`). This is the design record. Once each stage
ships, `implementation.md` and `feature-guide.md` describe how the system
works. Clickable mockups of the agreed UI:
<https://claude.ai/artifact/RZBHrgQFbHg8ehSkXVjuyH>. They are a guide, not
pixel-exact. They predate the `/runs` → `/productions` rename.

## Goal

Let visitors get email about new **performances** as well as auditions and
events. Choosing which companies to hear about should be optional but offered.
Doing this exposed related problems, which are fixed here too:

- "Other" was used both as a record's company name and as a catch-all group.
- The calendar's colour coding didn't work: in 2026, 96 of 166 performance
  days were a single "multi-company" taupe.
- Venues and locations are free text, so the same place is spelled several
  ways. That would make "venue changed" notifications unreliable.

Because this is a major revision, it also lays groundwork for planned work
(company pages, an alerting agent) so the data model doesn't need reworking
later.

## Decisions

| Decision         | Choice                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Email lists      | Two: **Performance updates** and **Audition & event notices**. Events are for theater practitioners, so they belong with auditions.    |
| Company choice   | Performance updates only. The four **majors** can be unticked; everyone else is always included. Auditions & events: no choice.        |
| Change detection | Same for both lists: compare significant fields with a snapshot of what was last emailed. Not `createdAt` / `updatedAt`.               |
| Preferences      | Stored in Buttondown: a tag per list, plus the subscriber's **excluded** majors. No accounts.                                          |
| Subscribe UI     | One page, `/subscribe`. No dialog. Reached from a nav link on the list pages.                                                          |
| Organizers       | Every production and activity names one or more real organizers. "Other" is only a group name, never a record's name.                  |
| Venues           | Productions refer to a listed venue. Audition and event sessions refer to a listed venue or give a one-off location.                   |
| Reference lists  | Organizers and venues are added by hand edit only (`sc-theater-companies.json`, `sc-theater-venues.json`). Editors can't create them.  |
| Data files       | Stay one per company per year. `other-<year>.json` files stay as an internal bucket for organizers without their own files.            |
| Calendar feeds   | Performances: the same four-major checkboxes, served as 16 pre-built static feeds. Old per-company feeds dropped (no subscribers yet). |
| Calendar colour  | Colour identifies only the four majors (plus grey for everyone else).                                                                  |
| `/runs` page     | Renamed `/productions` (page and feeds). No redirects: the old address had no real use.                                                |

## Organizers

The companies file becomes the single list of organizers. Each entry keeps its
current fields and gains:

| Field             | Type       | Notes                                                                                  |
| ----------------- | ---------- | -------------------------------------------------------------------------------------- |
| `major`           | `boolean?` | Offered as a checkbox in subscriptions; has its own calendar colour.                   |
| `majorCode`       | `number?`  | Majors only: 1, 2, 4, 8… Permanent. Used to number the filtered feeds (see Addresses). |
| `colour`          | `string?`  | Majors only. Moves the hard-coded colours out of `calendar.astro`.                     |
| `onCompaniesPage` | `boolean?` | Replaces "show everything not `adminOnly`" on `/companies`. Set by hand.               |

- `abvName` is the **short label** (about 12 characters or fewer). It is shown
  in calendar entries ("7:30pm · Much Ado · SCS"), the desktop year-view hover
  list, the `/companies` logo placeholder, and the editor.
- **Records name their organizers** in an `organizers: string[]` field, main
  organizer first:
  - In a company's own file, the file's company is the main organizer and
    `organizers` is optional, listing co-producers only.
  - In an `other` file, `organizers` is required. On activities it replaces
    the free-text `organizerName` / `organizerUrl`.
- **Co-productions** count for every organizer on them:
  - Emails and filtered feeds include them if any organizer is included.
  - In the year view, each major involved gets its square.
  - Month and week entries use the main organizer's colour edge and show both
    labels ("SCS / AT").
  - `?company=` matches any organizer.
- **Validation** in `src/lib/data-rules.ts` (editor and `check-*.ts`): every
  organizer named exists in the list; `other` records name at least one; a
  company's own records don't repeat their own company.
- **One shared helper** resolves a record's organizer ids, display names and
  short labels, main organizer first. The calendar, `/productions`, `/events`,
  feeds and emails all use it. Grouping (major vs Other) is derived from the
  organizer, never stored on records.
- **Organizer ids are permanent.** Moving an organizer from the `other` file
  to its own files (as with Good Egg) keeps its id. Links and saved
  subscription choices depend on it.
- **Editor**: a picker of existing organizers for `other` records, and an
  optional co-producer picker on all records. New organizers are added by hand
  edit only.
- **Planned, not in this work**: a company card on `/companies` that lists
  that company's upcoming productions on the site. The infrastructure here
  supports it: `/productions?company=<organizer id>` works for any organizer.
  How the card offers "website" vs "productions here" is still open.

**Majors** (2026): SCS (`majorCode` 1), AT (2), MCT (4), Renegade (8). Together
they produced 24 of 2026's 38 productions. All eleven current companies stay on
`/companies`.

**Organizers to add**, neither major nor on `/companies`:

| id               | Name                                | Short label  | Website                                 | Records                                        |
| ---------------- | ----------------------------------- | ------------ | --------------------------------------- | ---------------------------------------------- |
| `sh-theatrical`  | SH Theatrical                       | SH Theatre   | none                                    | R&G; Gross Indecency (production and audition) |
| `shadow-city`    | Shadow City                         | Shadow City  | none                                    | The Whole Monkey Show                          |
| `cabrillo-ta`    | Cabrillo College Theater Arts       | Cabrillo TA  | https://www.cabrillo.edu/vapa/#events   | Machinal (production and audition)             |
| `cabrillo-pac`   | Cabrillo Performing Arts Collective | Cabrillo PAC | https://www.instagram.com/cabrillopac/  | The 39 Steps, Abridged                         |
| `midsummer`      | Midsummer Ensemble                  | Midsummer    | https://www.midsummerensemble.com/      | Dracula                                        |
| `ucsc-barnstorm` | UCSC Barnstorm                      | Barnstorm    | https://play.ucsc.edu/news-events/      | The Flick                                      |
| `ucsc-ta`        | UCSC Theater Arts                   | UCSC         | https://play.ucsc.edu/news-events/      | UCSC New Play Festival                         |
| `dor-atkinson`   | Dor Atkinson                        | Dor Atkinson | https://dorcosbyatkinson.wordpress.com/ | Audition Clinic                                |

## Venues

The venue list (`sc-theater-venues.json`: `code`, `name`, `address`,
`website`) becomes the single source for venues, hand-edited like organizers.

- **Productions** refer to a venue by `code`. It must be listed.
- **Audition and event sessions** refer to a listed venue by `code`, or give a
  one-off location (name and address) for ad-hoc places such as a church hall.
  `npm run check` flags one-offs, so regulars can be added to the list.
- **Optional `room`** on productions and sessions ("Mainstage", "Studio B"),
  so one building stays one venue.
- **Change detection** compares venue codes (or the one-off text), so
  spelling fixes in the venue list never send email.
- **Migration** maps today's text onto listed venues. Known variants include
  "Crocker Mainstage, Cabrillo College" → Cabrillo Crocker Theater, and
  "Renegade" as a location name. Production venues not yet listed (SV High
  School, the two UCSC theaters, Cabrillo Black Box Theater) are added to the
  list. She Kills Monsters' venue "Other" becomes London Nelson Community
  Center.

## Productions and activities created early

Productions are often known before their details are. Creating the record
when a production is first known is encouraged. It also lets activities link
to it and lets missing details be chased.

- **A production may have no dates yet.** It stays off the public pages and
  feeds until it has performances. Notifications count it as new only when it
  has upcoming performances, so creating it early never sends email.
- **`Activity.productionId` is validated**: it must name an existing
  production, in any year. The audition editor offers a picker of the
  organizer's productions, including ones without dates.
- **Missing details are machine-readable.** The rules for what a record lacks
  (dates, tickets link, price, info link, venue) live in one shared module,
  as the editor warnings do now. The build writes a list of each record's id
  and its missing fields. An external alerting agent (prototyped separately,
  not part of this design) reads it, for example to chase when tickets go on
  sale.
- **Any agent that writes data** goes through the same save path as editors,
  so change tracking and notifications behave the same.

## Addresses

No public address has subscribers or emails pointing at it yet, so this is the
last free chance to set them. Once published, they don't change.

**Pages**

| Address                                                         | What it is                                         |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `/`, `/calendar`, `/companies`, `/services`, `/about`, `/admin` | Unchanged                                          |
| `/events`, `/events?id=<id>`                                    | Auditions and events; one record                   |
| `/events?company=<organizer id>`                                | One organizer's auditions and events (new)         |
| `/productions`, `/productions?id=<id>`                          | Productions; one production (was `/runs`)          |
| `/productions?company=<organizer id>`                           | One organizer's productions (new)                  |
| `/subscribe`, `?list=performances` or `?list=auditions-events`  | Sign up, a list pre-ticked (new)                   |
| `/subscribe/manage`                                             | Lost link: enter your email to be sent one (new)   |
| `/subscribe/manage?s=<subscriber id>`                           | Change your choices; the link in every email (new) |

**Calendar feeds**

| Address                                                                | What it is                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| `/productions.ics`                                                     | All performances (was `/runs.ics`)               |
| `/productions/selection/<n>.ics`                                       | Performances without some majors: 15 files (new) |
| `/activities.ics`, `/auditions.ics`                                    | Auditions and events (unchanged)                 |
| `/performances/<id>.ics`, `/sessions/<id>.ics`, `/activities/<id>.ics` | Single-item downloads (unchanged)                |

- `/runs/company/<id>.ics` is removed.
- **Feed numbers** are opaque: `<n>` is the sum of the `majorCode`s left out,
  so leaving out AT and MCT is `/productions/selection/6.ics`. A future fifth
  major gets 16, so existing numbers keep their meaning. Every number ever
  published keeps being built.
- Internal names (`data/shows/`, `getShows()`, `check-shows.ts`, the `Run`
  type) are not renamed.

## Change detection

Each digest keeps a snapshot, in Netlify Blobs, of the significant fields of
every record it has notified about. Each nightly run:

- **New**: not in the snapshot and currently listable. For a production that
  means it has upcoming performances; for an activity, that it is upcoming
  and not closed. This also handles productions created before their dates
  are known, and productions entered after they've finished.
- **Changed**: a significant field differs. The email says what changed.
- Everything else is ignored, so typo fixes never send email.

| Triggers an email                                                                 | Productions | Auditions & events |
| --------------------------------------------------------------------------------- | ----------- | ------------------ |
| New                                                                               | ✓           | ✓                  |
| Dates added, removed or moved                                                     | ✓           | ✓                  |
| Venue / location changed (by code)                                                | ✓           | ✓                  |
| Tickets link appears (production or any upcoming performance) — "Tickets on sale" | ✓           |                    |
| Registration link appears — "Registration open"                                   |             | ✓                  |
| Reopened after being closed                                                       |             | ✓                  |

**Ignored**: price, description, title, discounts, genre, info link, one
tickets link replacing another, notes, contact, prep.

The rules live in one module, `src/lib/notice-rules.ts`, with unit tests.
Snapshots are seeded at go-live so the first digest doesn't announce
everything. Release just after the 02:00 UTC run.

## Sending

- **Lists are defined in one place**: each list's tag, label and change rules.
  A future third list is configuration, not a rework.
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

- **Performance cards** follow `/productions`: title and genre, then
  organizer · venue · price, date range, the first few performances, and "All
  dates →". "2 dates added" lists only the new dates.
- **Sections**: New, then Updates. Labels say what changed. "Tickets on sale"
  and "Registration open" get a solid button.
- **Footer**: names the list and any excluded companies. It has **Change your
  choices** (to `/subscribe/manage?s=<subscriber id>`) and **Unsubscribe from
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
  `/calendar`, `/events` and `/productions`. It pre-ticks the list that suits
  the page and gives a back link. It's hidden on `/subscribe`. The hub's
  "Subscribe →" link on the Events card goes.
- **Managing**:
  - `/subscribe/manage?s=<Buttondown subscriber id>` opens the subscriber's
    current choices. That id is the same bearer token as Buttondown's own
    unsubscribe link.
  - A new `preferences` function (Functions v2) reads and writes them.
- **Unticking both lists** and saving asks "Nothing selected — do you want to
  unsubscribe?"
- **Lost link** (`/subscribe/manage` without `?s=`): the visitor enters their
  email and we send a link. The reply never says whether the address is
  subscribed.
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

## `/events` and `/productions`

- Both get a dark bar like the calendar's: Filters on the left, title in the
  middle, Add to my calendar on the right. The `/events` subscribe banner goes.
- Filters:
  - `/events`: Upcoming/All and Auditions/Events.
  - `/productions`: Upcoming/All, and Company (the four majors plus Other).
- Every card names its organizers.
- Cards carry their organizer ids (`data-organizers`), not the data file's
  company (today every catch-all production is tagged `"other"`).
- `?company=<organizer id>` filters to any one organizer, including ones not
  in the dropdown. The dropdown (four majors plus Other) is just the visible
  control.

## Stages

Each stage is built on `email-updates` and tested before the next. UI is
tested locally (`npm run dev`). The prototype runs on Netlify's `dev` deploy,
with `EMAIL_DIGEST_DRY_RUN=true`.

| Stage | Work                                                                                                                                                                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Reference data: organizer fields and entries, `organizers` on records, venue codes and one-off locations, validation rules (organizers, venues, `productionId`), shared organizer and venue helpers, editor pickers, missing-details list, migration script, organizer names shown where "Other" or a blank shows today. |
| 2     | Calendar: year-view squares, month view and phone week view, entry format, descriptions in the performance card, major colours from data, the 16 numbered feeds and the checkbox dialog, `/runs` → `/productions` (page and feeds).                                                                                      |
| 3     | Notifications: list definitions, `notice-rules.ts`, snapshots, the two digests, individual sends, `/subscribe` and `/subscribe/manage`, the `preferences` function, emails and welcome email, subscriber migration.                                                                                                      |
| 4     | Nav link, `/events` and `/productions` bars, `data-organizers` and `?company=`, hub link removal.                                                                                                                                                                                                                        |

**Releasing the migration**: as in `ics-spec.md`, live editor saves land on
`main`. So the data migration is regenerated at release time rather than
merged as committed: `npm run sync`, merge, take `main`'s `data/`, run the
migration script, then `npm run check`, then commit.

Every stage updates `implementation.md` and `feature-guide.md` for what it
ships. This includes the stale "Companies" tile in `feature-guide.md` §1:
there's no Companies editor.

## Housekeeping

- `data/sc-youth-theater.json` was unused and has been removed (`d860374`).
  Youth theater may return as its own design project.

## Out of scope

- **Server-side edit permissions**: `data.mjs` checks only that the user is
  signed in, not per-company access. Fix separately.
- **"n more productions from companies you left out"** line in emails:
  dropped.
- **The alerting agent itself**: only the missing-details list it reads is in
  scope.
