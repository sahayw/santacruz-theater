/** Site-wide constants for the email functions. */

export const SITE_URL = 'https://santacruz.theater'

/**
 * Today's date in Santa Cruz (YYYY-MM-DD). Functions run in UTC; the 02:00 UTC digest is
 * the previous evening locally, and "upcoming" means from today there.
 */
export function localToday(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}
