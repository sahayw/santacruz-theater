// The email lists, defined once: the subscribe/manage pages, the subscribe and preferences
// functions, the digests and the subscriber migration all read this. A list is a
// Buttondown tag. Adding a list is a new entry here plus its digest content.
// See docs/notifications-spec.md.

export interface EmailList {
  id: 'performances' | 'auditions-events'
  tag: string // Buttondown tag name
  label: string
  description: string
}

export const EMAIL_LISTS: EmailList[] = [
  {
    id: 'performances',
    tag: 'performances',
    label: 'Performance updates',
    description: 'New productions, added dates, and when tickets go on sale.'
  },
  {
    id: 'auditions-events',
    tag: 'auditions-events',
    label: 'Audition & event notices',
    description: 'Auditions, workshops and classes for theater makers. All companies.'
  }
]

export type ListId = EmailList['id']

/**
 * Extra tag on Performance updates subscribers who left out some majors. They get an
 * individual email; everyone else on the list gets the one broadcast.
 */
export const SELECTED_TAG = 'performances-selected'

/** Subscriber metadata key holding the majors (company ids) a subscriber left out. */
export const EXCLUDED_KEY = 'excluded_majors'

export function isListId(id: unknown): id is ListId {
  return EMAIL_LISTS.some((l) => l.id === id)
}

/** Tags for a subscriber on `lists`, leaving out `excluded` majors. */
export function tagsFor(lists: ListId[], excluded: string[]) {
  const tags = EMAIL_LISTS.filter((l) => lists.includes(l.id)).map((l) => l.tag)
  if (lists.includes('performances') && excluded.length) tags.push(SELECTED_TAG)
  return tags
}

/** The lists a subscriber's tags put them on. */
export function listsFromTags(tags: string[]): ListId[] {
  return EMAIL_LISTS.filter((l) => tags.includes(l.tag)).map((l) => l.id)
}

/** Tags this system manages; any others on a subscriber are left alone. */
export const MANAGED_TAGS = [...EMAIL_LISTS.map((l) => l.tag), SELECTED_TAG]
