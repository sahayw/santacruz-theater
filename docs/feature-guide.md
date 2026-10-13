# Feature Guide

The site supports two types of users: visitors who can look up information, and editors who create or update listings.
For implementation details see
[`implementation.md`](implementation.md).

---

## 1. Overview

The site is a hub (`/`) linking to four public sections — **Calendar**,
**Companies**, **Events** (auditions and other events), and **Services** — plus
an **About** page with a contact form. A persistent top nav is shared across
every inner page.

All content is maintained through a data editor at `/admin`, organized as a
hub of tiles — one per dataset (Calendar, Activities, Companies, Services).
Saving a change in the editor publishes it directly: the site rebuilds
automatically and the update is live within a few minutes, with no separate
publish step. Editors sign in with a Netlify Identity account; each account
is scoped to specific datasets — most editors manage only their own
company's calendar and/or activities, while a small number of site admins
can edit anything, including the company directory and services (see
[§9 Publishing & access](#9-publishing--access)).

---

## 2. Calendar — Shows

**What visitors see** (`/calendar`): a full-year grid by default — every
month, with day cells colored by which company is performing that day (a
neutral color when more than one company shares a day). Hovering (or
tapping, on touch) a day shows every performance on that date with company,
time, and title; clicking drills into a week-by-week view for that week.

The weekly view lists one chip per running production, with hover/tap
revealing a description panel when the run has one, next to day-by-day
columns of performance time bars. Clicking a bar opens a card with the full
title, company, venue, date/time, price, discounts, and ticket/info links —
the ticket link is simply absent if none is set. Filters at the top narrow
by company, genre, and time of day. A footer legend identifies every company
by color.

**What an editor controls**: a "run" is one production — title, abbreviated
label for calendar chips, up to two genres, venue, price, a default discount
line, an optional narrative description (supports bold, italic, hyperlinks,
and bulleted lists), and links to the info page and default ticket purchase
page. The description editor provides formatting controls and Ctrl/Cmd+B/I
shortcuts.

Each run has an ordered list of performances — date, time, an optional type
tag (Preview / Opening / Closing / Talk-back), and per-performance overrides
for discounts or the ticket link when a specific performance differs from
the run's default (a preview night at a different price, say).

The venue field suggests entries from a shared venue list, but custom venue
names are allowed and displayed as entered. Two tools speed up entering a run's
performance schedule: a **pattern generator** that fills in a recurring
weekly pattern (choose a date range, days of the week, a time, and it adds
every matching slot at once), and a **paste parser** that turns loosely
formatted text copied from a poster or email (`Friday, June 5 at 7:30pm`)
into rows — anything it can't interpret is listed separately rather than
silently dropped.

An admin sees a company selector before choosing what to edit; a
company-scoped editor goes straight to a year selector for their own
company (and skips even that if there's only one year of data).

---

## 3. Auditions & Events

**What visitors see** (`/events`): a filterable list of audition calls and
other events, collapsed to a one-line summary by default. **Audition
cards** show the production title, genre, company, opening date, a roles
summary, and the audition date range; expanding shows every session's date
and time, locations, what to prepare (acting, singing, dance, what to
bring), the full roles table, and contact info. **Event cards** show the
event title, a short blurb if set, company, and date range (or "On request"
when dates are by request); expanding shows full session details or "On
request", a longer description, cost, a register link if set, and contact
info. When every session for a record shares one location, that location is
shown once rather than repeated per row.

A record can be a **virtual submission** — an audition with no in-person
session, evaluated from submitted material. These show a "Virtual" badge and
"Virtual submission" in place of a date range, and — unlike everything
else — stay in the upcoming list indefinitely, since there's no date for
them to age past. Any record, audition or event, can also be **closed**:
it's kept on file but drops out of the upcoming list (shown with a "Closed"
pill) without being deleted, which is how a virtual submission — or
anything else with no natural end date — gets retired.
Events with **Dates by request** also stay upcoming until closed.

Past records show a "Past" pill. A filter bar narrows by company, genre
(auditions only), and a show setting (All Upcoming / Upcoming Auditions /
Upcoming Events / All), defaulting to All Upcoming. A `?id=` link opens one
record directly, expanded, with everything else hidden — used for sharing a
specific listing and for links in emailed digests.

**What an editor controls**: creating a new record locks in whether it's an
**Audition** or an **Event** — that choice can't change later, since the two
types show different fields.

For an audition: genre (up to two), rehearsal start and opening dates, a
notice URL and a separate production-info URL, a roles table (role name,
type, gender, age range, an optional voice part shown only when Musical is
one of the genres, and an optional casting note — the whole roles section is
skipped on the public page if left empty), a "prepare" section (what to
bring for acting, and — Musical only — singing and dance; the Acting and
Bring fields are multi-line, so each line you enter shows as its own line on
the public card), and a full-width notes field supporting bold, italic,
hyperlinks, and bulleted lists. The notes editor provides formatting controls
and Ctrl/Cmd+B/I shortcuts. Checking **Virtual submission** in the dates
section lifts the requirement for a scheduled date entirely (an application deadline can still
be entered as an optional date row) and dims the table to show it's
optional.

For an event: a brief one-line description for the collapsed card, a longer
description for the expanded view (supporting bold, italic, hyperlinks, and
bulleted lists), a cost line, and an optional registration link. The long
description editor provides the same formatting controls and shortcuts. In
the dates section, **Dates by request** allows the event to have no scheduled
date rows and displays "On request" publicly.

Both types share: a dates table (date, start time, optional end time,
location name/address, session notes — adding a row copies the time and
location from the previous one, since sessions of the same activity are
often at the same place), a contact block (name/email/phone), and — when the
record belongs to "Other" rather than a named company — an organizer name
and URL.

A record's header has **Close** (or **Reopen**, once closed) alongside
Preview / Restore / Delete — see the virtual-submission/closed description
above for what it does.

---

## 4. Companies

**What visitors see** (`/companies`): a card grid of Santa Cruz County
theater companies with logo and a link to their website.

**What an editor controls**: the company roster is maintained by hand
(admin only, not through a form) — name, abbreviated name, primary venue,
website, and a locally-stored logo (downloaded once so the site has no
runtime dependency on outside image hosts; a logo that's white or light
gets a dark card background). This same file is also where **access is
granted** — each entry can list one or more editor email addresses and which
datasets each may edit (for example, one person editing only that company's
calendar, another editing both calendar and activities). A special entry
grants full site-wide admin access to a set of emails; another holds runs
for companies not individually listed on the Companies page, editable by
admins only.

---

## 5. Services

**What visitors see** (`/services`): production resources — photographers,
equipment rental, rehearsal and performance spaces, technical crew,
coaching — organized into categories and subcategories. The default view is
a category grid; clicking a category (or a narrower subcategory) filters to
matching listings, with a two-level checkbox control to broaden or narrow
further without returning to the grid. A `?id=` link opens one listing
directly. Listing cards show name, category tags, optional photo, and
contact info collapsed; expanding adds the full description (supporting
bold, italic, hyperlinks, and bulleted lists) and an optional "More info"
link.

**What an editor controls**: this dataset is admin-only. Categories and
subcategories are their own hand-edited file (a category's display pill
text can differ from its label — "Headshot Photography" rather than
"Headshots", say). A listing picks one or more subcategories through the
same two-level control used on the public filter, uploads an optional
photo, and can be toggled active/inactive — inactive listings are hidden
from the public site without being deleted, the same "keep the record,
just stop showing it" pattern as a closed audition or event.
Descriptions support bold, italic, hyperlinks, and bulleted lists through
the shared formatting controls and Ctrl/Cmd+B/I shortcuts.

---

## 6. About & contact

`/about` explains the site and includes a contact form; a submission
notifies the site owner by email and the visitor sees an on-page
confirmation. There's nothing here for a dataset editor to maintain — the
page and form are static.

---

## 7. Shared editing conventions

These apply across every editor and are described once here rather than
repeated per section.

### Entering dates

Typed dates are normalized to `YYYY-MM-DD` as soon as you move to the next
field. Accepted input includes:

| You type                 | Becomes                                   |
| ------------------------ | ----------------------------------------- |
| `26/1/2` or `2026/1/2`   | `2026-01-02`                              |
| `26.01.02` or `2026-1-2` | `2026-01-02`                              |
| `Oct 30` / `Oct. 30`     | `2026-10-30` (current year assumed)       |
| `Friday, Oct. 30`        | `2026-10-30` (day-of-week prefix dropped) |
| `Sat. Nov 7`             | `2026-11-07`                              |
| `Oct 30 2026`            | `2026-10-30`                              |

Numeric input is always read as Year-Month-Day; a 2-digit year is prefixed
with `20`. The Calendar editor's date-paste panel (see
[§2](#2-calendar--shows)) accepts the same named-month formats.

### Entering times

| You type          | Becomes           | Why                                       |
| ----------------- | ----------------- | ----------------------------------------- |
| `7pm`             | `19:00`           | explicit suffix                           |
| `10am`            | `10:00`           | explicit suffix                           |
| `12pm`            | `12:00`           | noon                                      |
| `12am`            | `00:00`           | midnight                                  |
| `2.00` or `7.30`  | `14:00` / `19:30` | no suffix on hours 1–11 is assumed **PM** |
| `12.00`           | `12:00`           | no suffix, 12 stays noon                  |
| `19:30` / `21.30` | `19:30` / `21:30` | 24-hour input passes through unchanged    |

Either `.` or `:` works as the separator, and minutes are optional with an
am/pm suffix (`7pm` is enough).

### What gets flagged

An impossible date, an hour over 23, or a minute over 59 is outlined in red
as soon as you enter it. A date more than one year from the file you're
editing (e.g. a 2028 date in a 2026 file) is flagged too. Empty required
fields aren't marked while you're still working, but **Save** always runs a
full check first and lists every problem — including, if the first
performance or activity date doesn't belong in the year of file you have
open, which year's file you should be using instead.

### Preview, Restore, and Save

Every record editor has a **Preview** button that shows exactly what the
record will look like on the public site — collapsed and expanded — without
publishing anything. A **Restore** button appears next to it only once you've
made an unsaved change, and reverts the record to how it was last saved;
it disappears again once there's nothing to revert. **Save** publishes the
whole file (all records for that company/year) — the button and the on-page
status line reflect whether there's anything unsaved.

---

## 8. Email updates

Visitors can subscribe to email updates from `/events` or the standalone
`/subscribe` page. Subscribing immediately sends a welcome email listing
everything currently upcoming (auditions and events, each in their own
section — or a line saying there's nothing posted right now, if the list is
empty). After that, subscribers get **one digest email per day** covering
anything newly posted or meaningfully updated since the previous digest —
new and updated auditions and events each in their own section — and
nothing at all on a day with no changes. Every email includes an
unsubscribe link. There's no editor-facing configuration for this — it
follows automatically from activity records being created or edited.

---

## 9. Publishing & access

Saving a change anywhere in `/admin` publishes it: the site rebuilds and the
change is live within a few minutes, the same lag as any other update.
Google Calendar mirrors of the performance and activity schedules (still
under development — see [`google-calendar-sync.md`](google-calendar-sync.md))
update on their own daily schedule rather than immediately.

Editing access is per-email, per-dataset, set in the Companies file (see
[§4](#4-companies)): most people can edit only their own company's Calendar
and/or Activities data; Companies and Services are admin-only. Signing in
uses Netlify Identity — an account is created by invitation, matched to an
email address listed in that file.
