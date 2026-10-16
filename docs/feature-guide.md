# Feature Guide

What the site does, for visitors and for editors. For how it's built, see
[`implementation.md`](implementation.md).

## Contents

1. [Overview](#1-overview)
2. [Calendar](#2-calendar)
3. [Auditions & Events](#3-auditions--events)
4. [Companies](#4-companies)
5. [Services](#5-services)
6. [About & contact](#6-about--contact)
7. [Editing conventions](#7-editing-conventions)
8. [Email updates](#8-email-updates)
9. [Publishing & access](#9-publishing--access)

---

## 1. Overview

- **Public site**: a hub (`/`) linking to **Calendar**, **Companies**,
  **Events**, and **Services**, plus **About**. Every inner page shares a top
  nav.
- **Calendar feeds**: visitors can subscribe to all performances (or one
  company's), or to all auditions and events, in Apple Calendar, Google
  Calendar, Outlook or any other calendar app. A subscription stays up to
  date. They can also add a single performance or session as a one-off
  event. See [Add to my calendar](#add-to-my-calendar).
- **Editor** (`/admin`): one tile per dataset — Calendar, Activities,
  Services. Saving publishes; the change is live within a few minutes. The
  companies/organizers and venue lists are edited by hand
  ([§4](#4-companies)).
- **Organizers**: every production, audition and event names who puts it on.
  Smaller organizers are grouped as "Other" for data management, but their
  own names appear everywhere a company name would.
- **Access**: editors sign in with Netlify Identity and see only the datasets
  they're granted — usually their own company's calendar and/or activities.
  Admins can edit everything. See [§9](#9-publishing--access).

---

## 2. Calendar

### Visitors — `/calendar`

- **Year view** (default): every month, each day colored by the company
  performing (neutral when several share a day). Hover or tap a day to list
  its performances; click to open that week.
- **Week view**: one chip per running production (hover/tap shows its
  description), beside day columns of performance time bars. Clicking a bar
  opens a card: title, company, venue, date/time, price, discounts, and
  ticket/info links.
- **Filters** (left of the top bar): company, genre, time of day. They change
  what the page shows, not what **Add to my calendar** subscribes to. A
  footer legend maps colors to companies.
- **Add to my calendar** (top bar, week view only): subscribe to every
  performance, or to one company's. It isn't offered in the year view, which
  doesn't show what you'd be subscribing to. The bar's filters don't change
  what's in the feed.
- Each performance card links to **All dates**, the production's page, and
  to **Add to my calendar** for that one performance.

### Productions — `/runs`

Every production with its complete performance schedule. Each performance
shows its type, plus any discounts or ticket link that differ from the
production's. The page lists upcoming productions (or all), filterable by
company.

- Each upcoming performance has its own **Add to my calendar** link.
- `?id=` shows one production, expanded, on its own.
- It isn't in the nav. Visitors reach it from a performance card's **All
  dates** link, and from the link on every performance in a subscribed
  calendar.

### Add to my calendar

What the dialog offers depends on what's being added:

- **Whole calendars** are offered only as a **subscription**: **Apple
  Calendar / Outlook** (a `webcal:` link), **Google Calendar**, or **Copy
  link** for any other app. Edits, new dates and removals show up when the
  app next refreshes. Each app chooses how often to refresh; Google can take
  up to a day.
- **Single items** are added as a **one-off copy**, which won't change if the
  listing does. The dialog shows the event's name, date, time and place
  first, then offers:
  - **Apple Calendar / Outlook**: downloads an `.ics` file for that one
    event;
  - **Google Calendar**: opens Google's add-event page, already filled in.

| What                                                       | Offered as                       | Where                                                    |
| ---------------------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| All performances ("Santa Cruz Theater — All Performances") | Subscription                     | `/calendar` bar (week view)                              |
| One company's performances                                 | Subscription                     | `/calendar` bar, Company picker                          |
| All auditions & events                                     | Subscription                     | `/events` banner                                         |
| Auditions only                                             | Subscription                     | `/events` banner, Include picker                         |
| One performance                                            | One-off event                    | performance card; each upcoming row on `/runs`           |
| One audition or event session                              | One-off event                    | each upcoming date row of an open activity on `/events`  |
| All of an activity's dates                                 | One-off download (Apple/Outlook) | **Download all dates**, on open activities with 2+ dates |

**Download all dates** saves every date in one file. Google can't add
several events from a link, so Google users import that file under Settings
→ Import & export.

Each subscribe, add-event or download click is recorded in the site's
Plausible analytics as a custom event, with the calendar or event name and
the app chosen. This shows interest. It can't show how many people remain
subscribed, because Google and Outlook.com fetch each feed once for all
their users.

Subscriptions cover the last 12 months onward. Closed activities are left
out of everything.

### Editors

A **run** is one production:

| Field                        | Notes                                                 |
| ---------------------------- | ----------------------------------------------------- |
| Title, abbreviation          | Required. Abbreviation (≤ 20 chars) labels chips.     |
| Venue                        | Required. Pick from the venue list (type to search).  |
| Location                     | Optional space within the venue, e.g. "Second Stage". |
| Organizer / Co-producers     | See below.                                            |
| Genre                        | Up to two.                                            |
| Price, info URL, description | Recommended. Description is [rich text](#rich-text).  |
| Discounts, tickets URL       | Defaults for every performance.                       |

**Organizers**: a run in a company's file is that company's, so the list of
**Shows** doesn't repeat the company name (except under Other). Add
**co-producers** (last field; "None" by default) if others share the run. A
run filed under **Other** must pick its **Organizer** from the list (and may
add co-producers). Editors can't create organizers — ask an admin to add one
to the companies file.

A run can be saved before its dates are known (with a warning); it stays off
the calendar until it has performances, and its title shows in red in the
**Shows** list and the editor until then. That lets an audition link to it
early. The warnings also flag a missing tickets link.

Each run has an ordered list of **performances**: date, time, optional type
(Preview / Opening / Closing / Talk-back), and optional per-performance
discounts or ticket link that override the run's defaults.

Editing a performance's date or time **moves** it in subscribers' calendars
rather than adding a duplicate. Each performance (and each audition or event
session) has a hidden permanent id that the editor assigns automatically.

Two shortcuts fill in performances:

- **Pattern generator** — date range + weekdays + time → every matching slot.
- **Paste parser** — turns text like `Friday, June 5 at 7:30pm` into rows;
  lines it can't read are listed, not dropped.

Admins pick a company first; company editors go straight to a year (skipped
if there's only one).

---

## 3. Auditions & Events

### Visitors — `/events`

A filterable list of collapsed cards; click to expand.

| Card     | Collapsed                                                      | Expanded adds                                                              |
| -------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Audition | title, genre, company, opening date, roles summary, date range | every session, locations, what to prepare, roles table, organizer, contact |
| Event    | title, blurb, company, date range (or "On request")            | sessions, description, cost, register link, contact, organizer             |

- A location shared by every session is shown once.
- **Status pills**: "Virtual", "Closed", "Past".
- **Filters**: company, genre (auditions only), and All Upcoming (default) /
  Upcoming Auditions / Upcoming Events / All.
- **Deep link**: `?id=` shows one record, expanded, alone — used for sharing,
  in email digests, and from subscribed calendars.
- **Add to my calendar**: the banner subscribes to every audition and
  event, or to auditions only. Each upcoming date of an open activity has its
  own **Add to my calendar** link. An activity with two or more dates also
  has **Download all dates** ([details](#add-to-my-calendar)).

**What counts as upcoming**

| Record                                    | Upcoming?                  |
| ----------------------------------------- | -------------------------- |
| Closed                                    | Never                      |
| Virtual-submission audition with no dates | Always (until closed)      |
| "Dates by request" event with no dates    | Always (until closed)      |
| Anything else                             | Until its last date passes |

**Closing** keeps a record on file but removes it from the upcoming list —
the way to retire anything with no end date. **Reopen** reverses it.

### Editors

A new record is an **Audition** or an **Event**; this can't change later.

**Both types**

- Title (required). For an audition this is its **Production** — see below.
- **Dates table**: date, start time, optional end time, venue, address,
  location (a space within the venue), session notes. Typing a listed
  venue's name (or picking it from the suggestions) links the session to
  that venue, and its address comes from the venue list. Any other name is a
  one-off venue with its own address. A new row copies the previous row's
  time, venue and location.
- Contact: name, email, phone.
- **Organizer** (records filed under **Other** only): picked from the list;
  its name replaces the company on the card and in the email digest. An
  expanded card shows it under **Organizer**, with its website spelled out in
  full. Auditions and events have no co-producers.
- Header buttons: Preview / Restore / Delete, plus **Close** / **Reopen**.
- A new audition or event that you leave before entering anything is
  discarded, so it doesn't linger as "Untitled" (the same goes for a new
  show in the Calendar editor). Save does nothing when nothing has been
  entered.

**Audition only**

- **Production**: the run this audition casts, picked from the company's runs
  (or, under Other, the organizer's), listed by short title (full title on
  hover); the hint reads "Select". Picking one sets the title. If the
  production isn't on file yet, choose **Add production…**: it opens the
  Calendar editor with a new show. Save the show (dates can come later) and
  you're offered a way back to the audition, now linked to it, with everything
  you'd entered. Only unsaved changes to _other_ activities would be lost, and
  you're asked first.
- An audition is expected to be for one production. One covering several
  shows (e.g. a season audition) chooses **Several productions…** and gets
  its own title; saving then warns "not linked to a production", and you can
  save anyway.
- Genre (up to two); rehearsal-start and opening dates; notice URL;
  production-info URL.
- **Roles table**: name, type, gender, age range, casting note, and voice
  part (Musical only). Omitted from the public card if empty.
- **Prepare**: acting and what to bring (multi-line — each line displays
  separately); singing and dance (Musical only).
- **Notes**: [rich text](#rich-text).
- **Virtual submission**: no scheduled date needed. An optional deadline row
  can still be added.

**Event only**

- One-line blurb (collapsed card) and long description ([rich
  text](#rich-text), expanded card).
- Cost; registration link.
- **Dates by request**: no dates needed; shows "On request".
- Needs at least one contact route — email, phone, or a link.

---

## 4. Companies

**Visitors** — `/companies`: a card grid of county theater companies with
logos and website links.

**Admins** edit the companies file by hand (not through a form). It lists
every organizer — companies with their own data, and smaller organizers
whose records are filed under Other:

- Name, short label (≤ 12 characters; shown in calendar entries), primary
  venue, website.
- Logo, stored locally (light logos get a dark card).
- **Access grants**: each company lists editor emails and the datasets each
  may edit.
- **Majors** — the companies with the most productions (SCS, AT, MCT,
  Renegade) — each with a calendar colour. Subscribers will be able to
  untick majors; everyone else is always included.
- **On /companies**: set case by case.
- **Filed under Other**: an organizer without its own data files. To add a
  new small organizer, add an entry marked this way; editors then see it in
  their Organizer list.
- Two special entries, not shown publicly: **admin** (emails with full
  access) and **other** (the data files for organizers filed under Other;
  admins only).

The **venue list** is also hand-edited: name, address and website per venue.
Sessions at places not in the list are allowed; the build lists them so
regulars can be added.

A build also publishes `/missing-details.json`: every upcoming production or
open audition/event that lacks dates, a tickets link, a price, an info link,
a description or a location. An external alerting agent reads it to chase
the missing details.

---

## 5. Services

**Visitors** — `/services`: production resources (photographers, rentals,
spaces, crew, coaching) by category.

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

## 6. About & contact

`/about` describes the site and has a contact form. Submissions email the
site owner; the visitor sees a confirmation. Nothing to edit.

---

## 7. Editing conventions

These apply in every editor.

### Dates

Every date field is a date picker: pick from the calendar, or type the
month, day and year into it.

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

| Record            | Required                                                                                                                                                                                                                                                 | Recommended                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Calendar run      | title; abbreviation (≤ 20 chars); a venue from the list; an organizer if filed under Other; valid date and time on every performance                                                                                                                     | price; info URL; tickets link; description; at least one performance (otherwise it never appears) |
| Audition or event | title; an organizer if filed under Other; at least one date with a valid date and start time (except virtual auditions and "Dates by request" events); valid end time, rehearsal-start and opening dates if entered; a production that exists, if picked | —                                                                                                 |
| Event (also)      | one of: contact email, contact phone, info link, registration link, a named organizer's website                                                                                                                                                          | —                                                                                                 |
| Service listing   | name; at least one category; phone or email                                                                                                                                                                                                              | —                                                                                                 |

Completely blank date rows are ignored.

### Errors

- Impossible dates and out-of-range times turn red immediately, as do dates
  more than a year from the file's year.
- **Save** checks everything and lists every problem — including a first
  date in the wrong year, naming the file it belongs in.
- The site build runs the same checks: anything the editor saves will build.

### Preview, Restore, Save

- **Preview** — shows the record as the public site will (collapsed and
  expanded) without publishing.
- **Restore** — appears only with unsaved changes; reverts to the last save.
- **Save** — publishes the whole file (every record for that company and
  year).

---

## 8. Email updates

Visitors subscribe on `/events` or `/subscribe`.

- **Welcome email**, sent immediately: everything currently upcoming,
  auditions and events in separate sections.
- **Daily digest**: new and updated auditions and events since the last
  digest. No changes, no email.
- Every email has an unsubscribe link. Nothing to configure — it follows
  from edits to activity records.

---

## 9. Publishing & access

- **Publishing**: every Save in `/admin` rebuilds the site; live in a few
  minutes. That includes the calendar feeds. Subscribers see the change when
  their calendar app next refreshes, which can take up to a day for Google.
- **Access**: per email, per dataset, set in the companies file
  ([§4](#4-companies)). Companies and Services are admin-only.
- **Accounts**: Netlify Identity, by invitation, to an email listed in that
  file.
