import { describe, expect, it } from 'vitest'
import { fmtTimeRange } from '../src/lib/audition-format.ts'

describe('fmtTimeRange', () => {
  it('shows a lone time with its am/pm', () => {
    expect(fmtTimeRange('19:00', '')).toBe('7 pm')
    expect(fmtTimeRange('10:30', '')).toBe('10:30 am')
    expect(fmtTimeRange('', '21:00')).toBe('9 pm')
  })

  it('shares the suffix when both ends are on the same side of noon', () => {
    expect(fmtTimeRange('19:00', '21:30')).toBe('7–9:30 pm')
    expect(fmtTimeRange('11:00', '13:00')).toBe('11 am–1 pm')
  })

  it('is empty with no times', () => {
    expect(fmtTimeRange('', '')).toBe('')
  })
})
