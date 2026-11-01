import { describe, expect, it } from 'vitest'
import { activityCard, buildWelcomeEmail } from '../netlify/functions/lib/email-template.mts'
import type { DigestActivity } from '../netlify/functions/lib/activities-data.mts'
import {
  VIRTUAL_NOTE,
  activityDetailHtml,
  activityPipsHtml,
  activityRangeText,
  type ViewActivity
} from '../src/lib/activity-view.ts'

const session = (n: number, place = 'Colligan Theater') => ({
  id: `session-${n}`,
  date: `2027-03-0${n}`,
  startTime: '19:00',
  endTime: '21:00',
  place: { name: place, address: '1 Main St' }
})

const audition: ViewActivity = {
  id: 'activity-1',
  type: 'audition',
  title: 'Rumors (Neil Simon)',
  genre: ['Comedy', 'Musical'],
  openingDate: '2027-05-01',
  rolesAvailable: [
    {
      role: 'Chris',
      type: 'lead',
      gender: 'female',
      ageRange: '40s',
      voicePart: 'Alto',
      description: 'A lawyer, hosting.'
    },
    { role: 'Ensemble', type: 'ensemble', gender: 'any' }
  ],
  dates: [session(1), session(2)]
}

const event: ViewActivity = {
  id: 'activity-2',
  type: 'event',
  title: 'Audition Clinic',
  genre: [],
  description: 'Bring **water**.',
  registerUrl: 'https://example.com/register',
  dates: [session(1)]
}

describe('activityDetailHtml', () => {
  it('puts a role description in a full-width row, whatever the columns', () => {
    const html = activityDetailHtml(audition)
    expect(html).toContain('<th>Voice</th>')
    expect(html).toMatch(/<td class="role-desc-cell" colspan="4">/)
    expect(html).not.toContain('<th>Description</th>')
  })

  it('has no About heading and shows an event description first', () => {
    const html = activityDetailHtml(event)
    expect(html).not.toContain('About')
    expect(html.indexOf('detail-description')).toBeLessThan(html.indexOf('detail-grid'))
    expect(html).toContain('<strong>water</strong>')
  })

  it('shows a shared location once', () => {
    const html = activityDetailHtml(audition)
    expect(html.match(/Colligan Theater/g)).toHaveLength(1)
  })

  it('offers calendar links only when asked, never on a closed record', () => {
    expect(activityDetailHtml(audition)).not.toContain('Add to my calendar')
    const open = activityDetailHtml(audition, { withAdd: true, eventId: (id) => `x/${id}` })
    expect(open).toContain('data-ics-event="sessions/x/session-1"')
    expect(open).toContain('Download all dates')
    expect(activityDetailHtml({ ...audition, closed: true }, { withAdd: true })).not.toContain(
      'Add to my calendar'
    )
  })

  it('uses one wording for a virtual submission', () => {
    const html = activityDetailHtml({ ...audition, virtualSubmission: true, dates: [] })
    expect(html).toContain(VIRTUAL_NOTE)
  })
})

describe('pips and range', () => {
  it('shows type, Virtual, then genre on an audition; type only on an event', () => {
    const pips = activityPipsHtml({ ...audition, virtualSubmission: true })
    expect(pips.indexOf('Audition')).toBeLessThan(pips.indexOf('Virtual'))
    expect(pips.indexOf('Virtual')).toBeLessThan(pips.indexOf('Comedy'))
    expect(activityPipsHtml(event)).toContain('type-event')
    expect(activityPipsHtml(event)).not.toContain('pv-genre')
  })

  it('says why there is no date range', () => {
    expect(activityRangeText({ ...event, dates: [], datesByRequest: true })).toBe('On request')
    expect(activityRangeText({ ...audition, dates: [], virtualSubmission: true })).toBe(
      'Virtual submission'
    )
  })
})

const digestOf = (v: ViewActivity): DigestActivity =>
  ({
    ...v,
    company: 'mct',
    companyName: 'MCT',
    year: 2027,
    createdAt: '',
    updatedAt: ''
  }) as unknown as DigestActivity

describe('emails', () => {
  it('has the pips, the session rows and one link, no Register button', () => {
    const html = activityCard(
      digestOf({ ...event, registerUrl: 'https://example.com/register' }),
      'https://x.test',
      [{ kind: 'registration' }]
    )
    expect(html).toContain('Event')
    expect(html).toContain('Colligan Theater')
    expect(html).not.toContain('>Register<')
    expect(html.match(/<a /g)).toHaveLength(1)
    expect(html).toContain('https://x.test/events?id=2')
    expect(html).toContain('Details &amp; registration')
  })

  it('colours a cancelled activity red and links to plain Details', () => {
    const html = activityCard(digestOf(audition), 'https://x.test', [
      { kind: 'sessions-removed', when: [], all: true } as never
    ])
    expect(html).toContain('#ffd4d4')
    expect(html).toContain('>Details &rarr;')
  })

  it('welcomes with one row each: pips, organizer, range, one link', () => {
    const { html } = buildWelcomeEmail(
      {
        productions: null,
        excludedNames: [],
        auditions: [digestOf(audition)],
        events: [digestOf(event)]
      },
      'https://x.test',
      { manageUrl: 'm', unsubscribeUrl: 'u' }
    )
    expect(html).toContain('Rumors (Neil Simon)')
    expect(html).not.toContain('2 more')
    expect(html.match(/events\?id=/g)).toHaveLength(2)
  })
})
