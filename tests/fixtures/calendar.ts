// Fixture records for the calendar model / ICS tests — fixed sample data, never live data/.
import type { CalendarContext, CompanyActivity } from '../../src/lib/calendar-model.ts'
import type { Run } from '../../src/types.ts'

export const ctx: CalendarContext = {
  companies: [
    { id: 'tst', abvName: 'TST', name: 'Test Theatre', primaryVenue: 'TH' },
    { id: 'oth', abvName: 'OTH', name: 'Other Players' },
    { id: 'other', abvName: 'Other', name: 'Other Companies' }
  ],
  venues: [
    { code: 'TH', name: 'Test Hall', address: '1 Main St, Santa Cruz, CA 95060' },
    { code: 'BB', name: 'Black Box' }
  ]
}

export function run(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1700000000000',
    company: 'tst',
    showAbv: 'Much Ado',
    show: 'Much Ado About Nothing',
    description: '**Shakespeare** in the *park*.\n- Bring a blanket',
    genre: ['Comedy'],
    venue: 'TH',
    price: '$20',
    discounts: 'Students $10',
    infoUrl: 'https://example.com/info',
    ticketsUrl: 'https://example.com/tickets',
    performances: [
      {
        id: 'perf-1700000000001',
        date: '2026-10-30',
        time: '19:30',
        perfType: 'Opening',
        discounts: '',
        ticketsUrl: ''
      },
      {
        id: 'perf-1700000000002',
        date: '2026-11-01',
        time: '14:00',
        perfType: '',
        discounts: 'Pay what you can',
        ticketsUrl: 'https://example.com/matinee'
      }
    ],
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...overrides
  }
}

export function activity(overrides: Partial<CompanyActivity> = {}): CompanyActivity {
  return {
    id: 'activity-1700000000100',
    company: 'tst',
    type: 'audition',
    title: 'Hamlet Auditions',
    genre: ['Drama'],
    rolesAvailable: [
      { role: 'Hamlet', type: 'lead', gender: 'any' },
      { role: 'Ophelia', type: 'lead', gender: 'female' },
      { role: 'Court', type: 'ensemble', gender: 'any' }
    ],
    dates: [
      {
        id: 'session-1700000000101',
        date: '2026-11-05',
        startTime: '18:00',
        endTime: '21:00',
        notes: 'Prepare a **monologue**'
      },
      { id: 'session-1700000000102', date: '2026-11-06', startTime: '18:00' }
    ],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-15T08:30:00.000Z',
    ...overrides
  }
}
