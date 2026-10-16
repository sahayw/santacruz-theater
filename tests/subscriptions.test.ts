// Subscriber choices ↔ Buttondown tags and metadata — fixture companies only.
import { describe, expect, it } from 'vitest'
import { tagsFor, listsFromTags, SELECTED_TAG } from '../src/lib/email-lists.ts'
import { excludedOf } from '../netlify/functions/lib/digest.mts'
import {
  choicesOf,
  readChoices,
  subscriberFields
} from '../netlify/functions/lib/subscriptions.mts'
import { includesProduction } from '../netlify/functions/lib/shows-data.mts'
import { isSubscriberId } from '../netlify/functions/lib/buttondown.mts'
import { ctx } from './fixtures/calendar.ts'

const { companies } = ctx // majors: tst, oth

describe('email lists', () => {
  it('tags a subscriber with exclusions as selected', () => {
    expect(tagsFor(['performances'], [])).toEqual(['performances'])
    expect(tagsFor(['performances', 'auditions-events'], ['tst'])).toEqual([
      'performances',
      'auditions-events',
      SELECTED_TAG
    ])
    expect(tagsFor(['auditions-events'], ['tst'])).toEqual(['auditions-events'])
    expect(listsFromTags(['vip', 'auditions-events', SELECTED_TAG])).toEqual(['auditions-events'])
  })
})

describe('choices', () => {
  it('keeps only known lists and majors, and drops exclusions without Performance updates', () => {
    expect(
      readChoices({ lists: ['performances', 'spam'], excluded: ['oth', 'fight', 'x'] }, companies)
    ).toEqual({
      lists: ['performances'],
      excluded: ['oth']
    })
    expect(readChoices({ lists: ['auditions-events'], excluded: ['oth'] }, companies)).toEqual({
      lists: ['auditions-events'],
      excluded: []
    })
  })

  it('writes tags and metadata, keeping ones it does not manage', () => {
    const fields = subscriberFields(
      { lists: ['performances'], excluded: ['tst'] },
      { tags: ['vip', 'auditions-events'], metadata: { source: 'fair' } }
    )
    expect(fields).toEqual({
      tags: ['vip', 'performances', SELECTED_TAG],
      metadata: { source: 'fair', excluded_majors: 'tst' }
    })
  })

  it('reads choices back, and none once unsubscribed', () => {
    const s = {
      id: 'x',
      email_address: 'a@b.co',
      type: 'regular',
      tags: ['performances', SELECTED_TAG],
      metadata: { excluded_majors: 'oth,tst,gone' }
    }
    expect(choicesOf(s, companies)).toEqual({ lists: ['performances'], excluded: ['oth', 'tst'] })
    expect(excludedOf({ metadata: { excluded_majors: ['tst'] } }, companies)).toEqual(['tst'])
    expect(choicesOf({ ...s, type: 'unsubscribed' }, companies)).toEqual({
      lists: [],
      excluded: []
    })
  })

  it('keeps a co-production when any organizer is still wanted', () => {
    expect(includesProduction({ organizerIds: ['tst', 'oth'] }, ['tst'])).toBe(true)
    expect(includesProduction({ organizerIds: ['tst'] }, ['tst'])).toBe(false)
    expect(includesProduction({ organizerIds: ['fight'] }, ['tst', 'oth'])).toBe(true)
  })
})

describe('subscriber ids', () => {
  it('accepts both Buttondown id formats and nothing else', () => {
    expect(isSubscriberId('2c4bc54b-35d8-5bd0-8e2c-07d30dc75ce2')).toBe(true)
    expect(isSubscriberId('sub_74qn4db4mz94eshy2pvx3k8f0a')).toBe(true)
    expect(isSubscriberId('sub_tag_74qn4db4mz94eshy2pvx3k')).toBe(false)
    expect(isSubscriberId('sub_../emails')).toBe(false)
    expect(isSubscriberId('someone@example.com')).toBe(false)
    expect(isSubscriberId(undefined)).toBe(false)
  })
})
