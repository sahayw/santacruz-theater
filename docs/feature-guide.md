# Feature Guide

What the site does, for visitors and for editors. For how it's built, see
[`implementation.md`](implementation.md).

## Contents

**What visitors see**

1. [Overview](#1-overview)
2. [Productions](#2-productions)
3. [Auditions & events](#3-auditions--events)
4. [Companies & services](#4-companies--services)
5. [About & contact](#5-about--contact)
6. [Calendar feeds](#6-calendar-feeds)
7. [Email updates](#7-email-updates)

**How editors work**

8. [Editor basics](#8-editor-basics)
9. [Editing conventions](#9-editing-conventions)
10. [Calendar editor](#10-calendar-editor)
11. [Activities editor](#11-activities-editor)

---

## 1. Overview

- **Public site**: a hub (`/`) linking to **Calendar**, **Companies**, **Events**, **Services** and **About**, with a shared top nav. Calendar, Events and Productions pages add **Subscribe for updates** ([§7](#7-email-updates)).
- **Calendar feeds**: subscribe to all performances (optionally without some majors) or to all auditions and events, in any calendar app; or add one performance or session as a one-off ([§6](#6-calendar-feeds)).
- **Editor** (`/admin`): one tile per dataset (Calendar, Activities, Services). Saving publishes within a few minutes. Companies and venues are hand-edited ([§4](#4-companies--services)).
- **Organizers**: every production, audition and event names who puts it on. Smaller organizers are filed under "Other" but appear by their own names.
- **Access**: Netlify Identity; editors see only the datasets they're granted (usually their company's). Admins edit everything ([§8](#8-editor-basics)).
- **Consistency**: a field uses the same wording, pips and colours in every view. Views with room link to the record, the single source for everything else.

---

## 2. Productions

### How a production is displayed

One content model for eight views (the record and editor Preview share a column). A change to what a production shows is a change to this table and to every view in it.

| Field            | Grid, year hover | Calendar card                                         | Record / Preview                                          | Email: new          | Email: update       | Welcome row | Feed event                          |
| ---------------- | ---------------- | ----------------------------------------------------- | --------------------------------------------------------- | ------------------- | ------------------- | ----------- | ----------------------------------- |
| Title            | short            | full                                                  | full                                                      | full                | full                | full        | short; full title opens description |
| Organizer        | short label      | full                                                  | full                                                      | full                | full                | full        | full                                |
| Genre pip        | –                | –                                                     | ✓                                                         | ✓                   | ✓                   | ✓           | –                                   |
| Venue (and room) | hover only       | ✓                                                     | ✓                                                         | ✓                   | ✓                   | ✓           | ✓ (location)                        |
| Price            | –                | ✓                                                     | ✓                                                         | ✓                   | ✓                   | –           | ✓                                   |
| Dates            | that one         | date and time in the card's heading                   | range, count, every performance                           | range, count        | range, count        | range       | that one                            |
| Description      | –                | ✓                                                     | ✓                                                         | ✓, capped           | –                   | –           | ✓                                   |
| Discounts        | –                | ✓                                                     | production's, and per row                                 | –                   | –                   | –           | ✓                                   |
| Performance type | –                | pip                                                   | pip on each row                                           | –                   | –                   | –           | text line                           |
| Change pip       | –                | –                                                     | –                                                         | –                   | ✓                   | –           | –                                   |
| Links            | –                | More info, Get tickets, All dates, Add to my calendar | More info, Get tickets, row Tickets, Add to my calendar\* | Details & tickets → | Details & tickets → | The title   | Details & tickets →                 |

\* Preview shows everything in the data but no **Add to my calendar**.

**Pips**

| Pip              | Where                                            | Style                                                                                                               |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Genre            | Every view with a full title; one per genre      | Coloured pill, one shared definition                                                                                |
| Performance type | Individual performances only, never a production | Uppercase pill: Preview, Opening, Closing, Talk-back                                                                |
| Past             | Record list only                                 | Grey pill                                                                                                           |
| Change           | Update emails only                               | Blue: "2 dates added / cancelled", "Dates changed", "Venue changed"; amber: "Tickets now on sale"; red: "Cancelled" |

**Notes**

- Times read "7pm" / "7:30pm" in every view.
- A new-production email's description is cut at about 600 characters, at a sentence or line break, with a link to the rest. Update emails omit it.
- Emails list no performances and have no ticket or info buttons.

### Calendar — `/calendar`

- **Year view** (default): every month at a glance. Each performance day
  shows one small coloured square per **major** company performing (SCS,
  AT, MCT, Renegade — always in that order), then a grey square if any other
  company or organizer is. On a computer, hovering a day lists its
  performances. Clicking or tapping a day opens the drill-down at that day.
  On a phone the year view opens scrolled to the current month. ‹ › step a
  year; on a tablet, so does swiping left or right.
- **Drill-down** — **Month view** on wider screens, **Week view** on phones
  (one week at a time; the switch follows the screen width):
  - Each day lists its performances as "time · show · organizer", with the
    main organizer's colour on the left edge (grey for everyone but the
    majors). Days from the neighbouring months fill out the month grid; their day-number strips are tinted.
  - ‹ › step a month (or a week) — on a touch screen, so does swiping left
    or right; **← Year** goes back.
  - Clicking a performance opens its card ([fields](#how-a-production-is-displayed)),
    headed by its date and time; day numbers aren't clickable. The card slides
    up; × , tapping outside, or dragging down closes it.
- No filters: the calendar always shows everything. A footer legend maps
  colours to the majors, plus grey for Other.
- **Add to my calendar** (top bar, every view): subscribe, with a checkbox
  per major (all ticked). Everyone else is always included.

### Productions — `/productions`

Every production with its full schedule ([fields](#how-a-production-is-displayed)).

- Upcoming only by default; **Show past productions** adds the rest (`?show=all`), **Hide past productions** undoes it.
- `?company=<organizer id>`: one organizer's productions (`other` = everyone but the four majors). A co-production shows under each organizer. `/companies` cards link here.
- With one organizer selected, the intro shows its logo (or name), linked to the company's website. If nothing is listed, a box says "No upcoming productions" (with **Show past productions**) or "No productions recorded".
- `?id=`: one production, expanded, alone.
- Not in the nav. Reached from `/companies`, a card's **All dates** link, subscribed-calendar events, and Performance updates emails.

---

## 3. Auditions & events

### How an audition or event is displayed

One content model for six views (the expanded card, deep link and editor Preview share a column). One shared renderer produces the card body for `/events` and the Preview.

| Field                         | Collapsed card         | Expanded card / deep link / Preview                                              | Email (new and update)                    | Welcome row | Feed session                        |
| ----------------------------- | ---------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- | ----------- | ----------------------------------- |
| Type pip (Audition/Event)     | ✓                      | ✓                                                                                | ✓                                         | ✓           | "Audition:" / "Event:" in the title |
| Virtual pip                   | ✓                      | ✓                                                                                | ✓                                         | ✓           | –                                   |
| Closed, Past pips             | ✓                      | ✓                                                                                | – (never listed)                          | –           | –                                   |
| Genre pip (auditions)         | ✓                      | ✓                                                                                | ✓                                         | ✓           | –                                   |
| Title, organizer              | ✓                      | ✓                                                                                | ✓                                         | ✓           | ✓                                   |
| Dates                         | range, or "On request" | every session                                                                    | range, up to 3 session rows, "+ N more"   | range       | that session                        |
| Blurb (events)                | ✓                      | –                                                                                | ✓                                         | –           | –                                   |
| Opening date (auditions)      | ✓                      | ✓                                                                                | ✓                                         | –           | –                                   |
| Description (events)          | –                      | ✓, no heading                                                                    | –                                         | –           | ✓                                   |
| Roles                         | summary                | table: Role, Type, Age (and Voice); descriptions full-width rows under each role | –                                         | –           | ✓                                   |
| Prepare, Notes, Cost          | –                      | ✓                                                                                | –                                         | –           | ✓                                   |
| Locations, Organizer, Contact | –                      | ✓                                                                                | –                                         | –           | location                            |
| Register link                 | –                      | ✓                                                                                | – (see Links)                             | –           | ✓                                   |
| Change pip                    | –                      | –                                                                                | update emails only                        | –           | –                                   |
| Links                         | –                      | all; each date's Add to my calendar\*; Download all dates\*                      | one: Details → / Details & registration → | The title   | Details (& registration) →          |

\* Public cards only; the Preview shows everything in the data but no calendar links.

**Pips**

| Pip          | Where                                  | Style                                                                                                               |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Type         | Every view                             | Audition / Event                                                                                                    |
| Virtual      | Virtual-submission auditions           | Pill                                                                                                                |
| Closed, Past | Public cards and Preview; never emails | Grey pills                                                                                                          |
| Genre        | Auditions                              | The same coloured pills as productions                                                                              |
| Change       | Update emails only                     | Blue for "2 sessions added / cancelled / updated" and locations; amber for "Registration open"; red for "Cancelled" |

- No email carries a Register button. "Registration open" is a change pip, and the single link goes to the record.
- Closed records appear in no email. Reopening one announces it as a change, since it is open again by then.
- Virtual-submission wording is the same in every view that shows it.

### Events — `/events`

A filterable list of collapsed cards; click to expand ([fields](#how-an-audition-or-event-is-displayed)).

- A location shared by every session is shown once.
- **Filters** (row under the heading, with the count and **Add to my calendar**): All Upcoming (default) / Upcoming Auditions / Upcoming Events / All; and Company (every organizer with a listing). "Upcoming" is defined in [§7](#what-counts-as-upcoming).
- `?company=<organizer id>` filters by organizer; the Company filter updates the address so it can be shared.
- `?id=` shows one record, expanded, alone (sharing, digests, subscribed calendars).
- **Add to my calendar**: the filter row's button subscribes to everything or auditions only; each upcoming date has its own link; two or more dates add **Download all dates** ([§6](#6-calendar-feeds)).
- **Closing** keeps a record on file but removes it from the upcoming list — the way to retire anything with no end date. **Reopen** reverses it.

---

## 4. Companies & services

### Companies — `/companies`

A card grid of county companies with logos. A card opens that company's productions (`/productions?company=<id>`); none shows "No productions recorded."

**Admins** edit the companies file by hand (no form). Each organizer entry has:

| Item              | Notes                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Name, label       | Short label ≤ 12 characters, shown in calendar entries; primary venue; website.                                   |
| Logo              | Stored locally. Light logos get a dark card; a logo with its own background fills the card.                       |
| Access grants     | Editor emails and the datasets each may edit.                                                                     |
| Major             | SCS, AT, MCT, Renegade: a calendar colour; subscribers can untick them. Others always included.                   |
| `/companies`      | Whether shown: set case by case.                                                                                  |
| Filed under Other | An organizer without its own data files. Add an entry marked this way and editors see it in their Organizer list. |

Two entries are never shown publicly: **admin** (full-access emails) and **other** (data files for organizers filed under Other; admins only).

The **venue list** is hand-edited too (name, address, website). Sessions at unlisted places are allowed; the build lists them so regulars can be added.

`/missing-details.json` (built with the site) lists upcoming productions and open auditions/events lacking dates, tickets link, price, info link, description, location or start time; an external agent chases them.

### Services — `/services`

Production resources (photographers, rentals, spaces, crew, coaching) by category.

- Default view is a category grid. Clicking a category or subcategory
  filters the list; a two-level checkbox control widens or narrows it.
- Cards show name, category tags, optional photo, and contact; expanding
  adds the description and an optional "More info" link.
- `?id=` opens one listing.

**Admins** (this dataset is admin-only):

- **Listing**: name, one or more subcategories, phone or email (all
  required); photo, website, [rich-text](#rich-text) description, contact
  name and address (optional).
- **Active / inactive**: inactive listings are hidden, not deleted.
- **Categories** live in a hand-edited file. A subcategory's pill text can
  differ from its label ("Headshot Photography" vs "Headshots"). Changing pill
  text is safe; renaming or removing a subcategory **breaks the build** until
  every listing using it is reassigned.

---

## 5. About & contact

`/about` describes the site and has a contact form. Submissions email the
site owner; the visitor sees a confirmation. Nothing to edit.

---

## 6. Calendar feeds

- **Whole calendars** are subscriptions only (**Subscribe to this calendar**): Apple Calendar / Outlook (`webcal:` link), Google Calendar, or Copy link. Changes arrive when the app next refreshes (Google: up to a day).
- **Single items** are one-off copies that don't follow later edits. The dialog shows name, date, time and place, then offers an `.ics` download (Apple / Outlook) or a prefilled Google page.
- Subscriptions cover the last 12 months onward. Closed activities are left out.

| What                                                       | Offered as                       | Where                                                    |
| ---------------------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| All performances ("Santa Cruz Theater — All Performances") | Subscription                     | `/calendar` (top bar, any view)                          |
| Performances without some majors                           | Subscription                     | the same, majors unticked                                |
| All auditions & events                                     | Subscription                     | `/events` filter row                                     |
| Auditions only                                             | Subscription                     | `/events` filter row, Include picker                     |
| One performance                                            | One-off event                    | performance card; each upcoming row on `/productions`    |
| One audition or event session                              | One-off event                    | each upcoming date row of an open activity on `/events`  |
| All of an activity's dates                                 | One-off download (Apple/Outlook) | **Download all dates**, on open activities with 2+ dates |

**Download all dates** saves every date in one file. Google can't add several events from a link; Google users import it under Settings → Import & export.

---

## 7. Email updates

Two lists; visitors pick either or both on `/subscribe`:

- **Performance updates**: new productions, added or cancelled dates, venue changes, tickets on sale. **Select companies** lists SCS, AT, MCT and Renegade; untick any. Every other organizer is always included, and a co-production is included if any organizer is.
  - Company ticks follow Performance updates: ticking it ticks all four (unless saved choices say otherwise); unticking it clears them but remembers the choice.
  - Ticking a company also ticks Performance updates (alone, if no choice was made).
- **Audition & event notices**: new auditions and events, added, cancelled, or modified sessions, location changes, registration opening, reopened notices. All companies.

`/subscribe` is reached from **Subscribe for updates** in the nav on `/calendar`, `/events` and `/productions`, pre-ticking the list that suits the page, with a link back.

| Email          | When                         | Content                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome        | Immediately                  | What's coming up for each list chosen                                                                                                                                                                                                                                                                                                                                                                       |
| Nightly digest | One per list, only with news | **New**: records just become upcoming (a production saved before its dates is announced when dates are added). **Updates**: labelled changes, e.g. "2 dates added", "Tickets now on sale", "Venue changed", "Registration open". Cards are described in [How a production is displayed](#how-a-production-is-displayed) and [How an audition or event is displayed](#how-an-audition-or-event-is-displayed) |

- A production or activity with all remaining dates removed, or deleted with **Notify cancellation** (see [Removing dates and records](#removing-dates-and-records)), is **Cancelled**: a card with the pip and title only, and no link. It is announced as new again if dates are added back. Closing an audition sends nothing. Description, price, contact and wording edits never send email. A performance that has happened just drops off.
- **Production dates**: the email shows the first-to-last range and the performance count. Time changes and dates moved within the range are never announced; a date moved so the range changes sends "Dates changed". Added dates send "N dates added"; cancelled dates send "N dates cancelled".
- **Audition and event sessions**: any date or time change sends "N sessions updated". The card lists the affected sessions under **Added**, **Cancelled** (struck through) and **Updated**.
- **Delete without notification** never sends email.
- Every email ends with **Change your choices** and **Unsubscribe from everything**.

### What counts as upcoming

An activity is listed in emails, and on `/events` by default, only while it is upcoming:

| Record                                    | Upcoming?                  |
| ----------------------------------------- | -------------------------- |
| Closed                                    | Never                      |
| Virtual-submission audition with no dates | Always (until closed)      |
| "Dates by request" event with no dates    | Always (until closed)      |
| Anything else                             | Until its last date passes |

### Changing choices

- **Change your choices** opens `/subscribe/manage` with the subscriber's lists and companies. Unticking both lists and saving asks whether to unsubscribe; an unsubscribed visitor can tick a list to return.
- Without the link, `/subscribe/manage` asks for the address and emails a fresh link (as does subscribing an address already on file). It never says whether an address is subscribed.

Nothing for editors to configure.

---

## 8. Editor basics

- **Publishing**: every Save in `/admin` rebuilds the site; live in a few minutes. That includes the calendar feeds. Subscribers see the change when their calendar app next refreshes, which can take up to a day for Google.
- **Access**: per email, per dataset, set in the companies file ([§4](#4-companies--services)). Companies and Services are admin-only.
- **Accounts**: Netlify Identity, by invitation, to an email listed in that file.
- Admins pick a company first; company editors go straight to a year (skipped if there's only one).

### Preview, Restore, Save

- **Preview**: the record as the public site shows it, without publishing. It shows everything in the data but no **Add to my calendar**.
- **Restore**: only with unsaved changes; reverts to the last save.
- **Save**: publishes the whole file (every record for that company and year).
- **Delete**: once confirmed, removes the record immediately (no Save step). A show an audition links to can't be deleted until that's changed. Deleting a saved record that still has upcoming dates asks whether to notify subscribers ([Removing dates and records](#removing-dates-and-records)).
- Leaving with unsaved changes asks first.
- **Editor updated while open**: a red bar asks you to reload, and Save is refused until you do (unsaved changes in that tab are lost).
- **A save that would break the site is refused**, with reasons; other editors' saves still publish.
- A new record left empty is discarded; Save does nothing when nothing is entered.

### Removing dates and records

Only saved, upcoming rows and records are asked about; new rows, unsaved rows
and past dates delete without asking.

- **Row (×)** — **Notify cancellation**, **Delete without notification** or
  **Keep**. Notify: the next digest says "N dates cancelled" ("Cancelled" if none
  are left). Delete without notification: no email. The choice is stored with the
  record until the date passes; **Restore** undoes the row and the choice.
- **Delete run / Delete (activity)** — the same three choices. Notify sends a
  "Cancelled" card with no link; Delete without notification sends nothing.

---

## 9. Editing conventions

These apply in every editor.

### Dates

Every date field is a date picker: pick from the calendar, or type the
month, day and year into it. Copy and paste also work on a focused date
field: copying gives `YYYY-MM-DD`, and pasting accepts `2026-10-30`,
`10/30/2026` or `Oct 30, 2026` (unrecognized text is ignored). Cmd/Ctrl+Z
undoes the field's last change. In Safari, clicking anywhere on a date field
opens the picker (Esc closes it); in Chrome and Brave, use the calendar icon.

The Calendar editor's paste parser reads dates written out as text. Month
names assume the current year:

| You paste                              | Becomes      |
| -------------------------------------- | ------------ |
| `Oct 30`, `Oct. 30`, `Friday, Oct. 30` | `2026-10-30` |
| `Sat. Nov 7`                           | `2026-11-07` |
| `Oct 30 2026`                          | `2026-10-30` |

### Times

`.` or `:` both work as separators.

| You type         | Becomes          | Rule                     |
| ---------------- | ---------------- | ------------------------ |
| `7pm`, `10am`    | `19:00`, `10:00` | explicit suffix          |
| `12pm`, `12am`   | `12:00`, `00:00` | noon, midnight           |
| `2.00`, `7.30`   | `14:00`, `19:30` | no suffix, 1–11 → **PM** |
| `12.00`          | `12:00`          | no suffix, 12 → noon     |
| `19:30`, `21.30` | `19:30`, `21:30` | 24-hour passes through   |

### Rich text

Descriptions and notes support **bold**, _italic_, links, and bulleted
lists, via toolbar buttons or Ctrl/Cmd+B / Ctrl/Cmd+I.

### What's required

- **Required** — Save is blocked until fixed.
- **Recommended** — Save asks "Save anyway?" (only for records you changed,
  and never for a run whose last performance has passed).

| Record            | Required                                                                                                                                                                                                                                                                             | Recommended                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Calendar run      | title; abbreviation (≤ 20 chars); a venue from the list; an organizer if filed under Other; valid date and time on every performance                                                                                                                                                 | price; info URL; tickets link; description; at least one performance (otherwise it never appears) |
| Audition or event | title; an organizer if filed under Other; at least one date with a valid date (a start time is optional but warned about; except virtual auditions and "Dates by request" events); valid end time, rehearsal-start and opening dates if entered; a production that exists, if picked | —                                                                                                 |
| Event (also)      | one of: contact email, contact phone, info link, registration link, a named organizer's website                                                                                                                                                                                      | —                                                                                                 |
| Service listing   | name; at least one category; phone or email                                                                                                                                                                                                                                          | —                                                                                                 |

Completely blank date rows are ignored.

**Same-day check**: Save also asks "Save anyway?" when a run or activity you
changed has more than one performance or session on a day (e.g. "2
performances on 2027-02-07 (14:00, 19:00)"). The prompt lists these under their
own heading, "Check multiple performances on same day:" ("sessions" for
activities), apart from "Missing details:". It catches a Pattern or Paste that
landed on a day already scheduled. Matinee and evening pairs are normal,
so you confirm rather than fix. It isn't checked for finished records.

### Errors

- Impossible dates and out-of-range times turn red immediately, as do dates
  more than a year from the file's year.
- **Save** checks everything and lists every problem — including a first
  date in the wrong year, naming the file it belongs in.
- The site build runs the same checks: anything the editor saves will build.

---

## 10. Calendar editor

A **run** is one production:

| Field                        | Notes                                                                       |
| ---------------------------- | --------------------------------------------------------------------------- |
| Title, abbreviation          | Required. Abbreviation (≤ 20 chars) is the show's name in calendar entries. |
| Venue                        | Required. Pick from the venue list (type to search).                        |
| Location                     | Optional space within the venue, e.g. "Second Stage".                       |
| Organizer / Co-producers     | See below.                                                                  |
| Genre                        | Up to two.                                                                  |
| Price, info URL, description | Recommended. Description is [rich text](#rich-text).                        |
| Discounts, tickets URL       | Defaults for every performance.                                             |

- **Organizers**: a run in a company's file is that company's (the Shows list omits the name, except under Other). Add **co-producers** if others share it. A run under **Other** must pick an **Organizer**. Editors can't create organizers; ask an admin.
- **Performances**: an ordered list of date, time, optional type (Preview / Opening / Closing / Talk-back), and optional discounts or tickets link overriding the run's.
- **No dates yet**: saves with a warning; stays off the calendar, shown red in the Shows list, so an audition can link to it early.
- **Moving a performance** (editing date or time) moves it in subscribers' calendars; each performance has a hidden permanent id.
- **Shortcuts**: pattern generator (date range + weekdays + time → slots); paste parser (`Friday, June 5 at 7:30pm` → rows; unreadable lines are listed).

---

## 11. Activities editor

A new record is an **Audition** or an **Event** (fixed once created).

**Both types**

- **Title** (required; for an audition, its **Production**).
- **Dates table**: date, start time, end time, venue, address, location, session notes.
  - No start time: saving warns, it's listed in missing details, and feeds show an all-day entry. End time needs a start time.
  - A listed venue's name (or suggestion) links the session and supplies its address. **Other venue…** or any other name is a one-off you type.
  - A new row copies the previous row's time, venue and location.
- **Contact**: name, email, phone.
- **Organizer** (records under **Other** only): picked from the list; replaces the company on the card and digest, with its website spelled out in the expanded card. No co-producers.
- **Header buttons**: Preview, Restore, Delete, **Close** / **Reopen**.

**Audition only**

- **Production**: picked from the company's (or organizer's) runs, by short title. It gives the audition the production's title and follows renames, genre, opening (the performance marked Opening, else the first) and info link.
  - Not on file: **Add production…** opens the Calendar editor with a new show; after saving you return to the audition, now linked, with everything entered. Unsaved changes to _other_ activities would be lost (you're asked first).
  - Covering several shows: **Several productions…** and its own title; saving warns "not linked to a production" and allows it.
- Not linked: genre (up to two), opening date and production-info URL are entered here. Always: rehearsal start, notice URL.
- **Roles table**: name, type, gender, age range, casting note, voice part (Musical only). Hidden publicly if empty.
- **Prepare**: acting and what to bring (one line per item); singing and dance (Musical only).
- **Notes**: [rich text](#rich-text).
- **Virtual submission**: no date needed; an optional deadline row.

**Event only**

- Blurb (one line, collapsed card) and description ([rich text](#rich-text), expanded card).
- Cost; registration link.
- **Dates by request**: no dates; shows "On request".
- At least one contact route: email, phone or a link.
