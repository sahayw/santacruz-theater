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
- **Editor** (`/admin`): one tile per dataset — Calendar, Activities,
  Companies, Services. Saving publishes; the change is live within a few
  minutes.
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
- **Filters**: company, genre, time of day. A footer legend maps colors to
  companies.

### Editors

A **run** is one production:

| Field                        | Notes                                                      |
| ---------------------------- | ---------------------------------------------------------- |
| Title, abbreviation          | Required. Abbreviation (≤ 20 chars) labels chips.          |
| Venue                        | Required. Suggests from the venue list; free text allowed. |
| Genre                        | Up to two.                                                 |
| Price, info URL, description | Recommended. Description is [rich text](#rich-text).       |
| Discounts, tickets URL       | Defaults for every performance.                            |

Each run has an ordered list of **performances**: date, time, optional type
(Preview / Opening / Closing / Talk-back), and optional per-performance
discounts or ticket link that override the run's defaults.

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

| Card     | Collapsed                                                      | Expanded adds                                                   |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Audition | title, genre, company, opening date, roles summary, date range | every session, locations, what to prepare, roles table, contact |
| Event    | title, blurb, company, date range (or "On request")            | sessions, description, cost, register link, contact             |

- A location shared by every session is shown once.
- **Status pills**: "Virtual", "Closed", "Past".
- **Filters**: company, genre (auditions only), and All Upcoming (default) /
  Upcoming Auditions / Upcoming Events / All.
- **Deep link**: `?id=` shows one record, expanded, alone — used for sharing
  and in email digests.

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

- Title (required).
- **Dates table**: date, start time, optional end time, location
  name/address, session notes. A new row copies the previous row's time and
  location.
- Contact: name, email, phone.
- For records under "Other" (no listed company): organizer name and URL.
- Header buttons: Preview / Restore / Delete, plus **Close** / **Reopen**.

**Audition only**

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

**Admins** edit the companies file by hand (not through a form):

- Name, abbreviation, primary venue, website.
- Logo, stored locally (light logos get a dark card).
- **Access grants**: each company lists editor emails and the datasets each
  may edit.
- Two special entries, not shown publicly: **admin** (emails with full
  access) and **other** (runs and activities for unlisted companies; admins
  only).

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

Typed dates become `YYYY-MM-DD` when you leave the field. Numbers are read
Year-Month-Day; a 2-digit year gets `20` prepended. Month names assume the
current year.

| You type                                     | Becomes      |
| -------------------------------------------- | ------------ |
| `26/1/2`, `2026/1/2`, `26.01.02`, `2026-1-2` | `2026-01-02` |
| `Oct 30`, `Oct. 30`, `Friday, Oct. 30`       | `2026-10-30` |
| `Sat. Nov 7`                                 | `2026-11-07` |
| `Oct 30 2026`                                | `2026-10-30` |

The Calendar paste parser accepts the same month-name formats.

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

| Record            | Required                                                                                                                                                                         | Recommended                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Calendar run      | title; abbreviation (≤ 20 chars); venue; valid date and time on every performance                                                                                                | price; info URL; description; at least one performance (otherwise it never appears) |
| Audition or event | title; at least one date with a valid date and start time (except virtual auditions and "Dates by request" events); valid end time, rehearsal-start and opening dates if entered | —                                                                                   |
| Event (also)      | one of: contact email, contact phone, info link, registration link, organizer URL                                                                                                | —                                                                                   |
| Service listing   | name; at least one category; phone or email                                                                                                                                      | —                                                                                   |

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
  minutes. The Google Calendar mirrors
  ([`google-calendar-sync.md`](google-calendar-sync.md)) update once a day.
- **Access**: per email, per dataset, set in the companies file
  ([§4](#4-companies)). Companies and Services are admin-only.
- **Accounts**: Netlify Identity, by invitation, to an email listed in that
  file.
