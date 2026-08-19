/**
 * Today's date as 'yyyy-mm-dd' in the browser's local timezone.
 *
 * `new Date().toISOString().slice(0, 10)` is UTC-based — in a timezone
 * behind UTC (e.g. Peru, UTC-5) it reads as tomorrow's date for the last
 * several hours of every local day, which shows up as "today" filters
 * missing recent sales, date pickers rejecting today's own date as a
 * minimum, and documents stamped a day ahead of when they were made.
 *
 * @returns {string} 'yyyy-mm-dd' in local time.
 */
export function todayLocalDateString() {
    return new Date().toLocaleDateString('en-CA');
}
