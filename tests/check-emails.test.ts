import { describe, expect, it } from 'vitest'
import { emailProblems } from '../scripts/check-emails.ts'

const wrap = (body: string) => `<div style="max-width:580px">${body}</div>`

describe('emailProblems', () => {
  it('accepts a clean email', () => {
    expect(
      emailProblems(wrap('<a href="https://santacruz.theater/x?a=1&amp;b=2">Go</a> <b>Hi</b>'))
    ).toEqual([])
    expect(emailProblems(wrap('<a href="{{ unsubscribe_url }}">Out</a>'))).toEqual([])
  })

  it('flags leftover values, style blocks, bad links and unknown tokens', () => {
    expect(emailProblems(wrap('<b>Opens undefined</b>'))).toContain('shows "undefined"')
    expect(emailProblems(wrap('<style>a{}</style>'))).toContain('uses <style> or <script>')
    expect(emailProblems(wrap('<a href="/relative">x</a>'))).toContain(
      'has a link that isn\u2019t absolute: "/relative"'.replace('\u2019', "'")
    )
    expect(emailProblems(wrap('{{ other }}'))).toContain('has an unknown token {{ other }}')
  })

  it('flags unbalanced tags, a missing width cap and a size Gmail would clip', () => {
    expect(emailProblems(wrap('<table><tr><td>x</td></table>'))).toContain('has 1 <tr> but 0 </tr>')
    expect(emailProblems('<div>x</div>')).toContain('is not capped at 580px')
    expect(emailProblems(wrap('x'.repeat(101 * 1024))).join()).toMatch(/Gmail clips/)
  })
})
