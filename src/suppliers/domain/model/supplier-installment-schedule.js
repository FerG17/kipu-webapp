/**
 * Splits a total into `count` installment amounts that sum back to it
 * exactly — mirrors the backend's own rounding rule (round to the cent,
 * remainder folded into the last installment) so a client-built schedule
 * never gets rejected by SupplierInstallmentAmountMismatch just from float
 * drift. Duplicated from Sales' installment-schedule.js rather than
 * imported — Suppliers and Sales are separate bounded contexts and don't
 * share domain modules across that boundary.
 * @param {number} total
 * @param {number} count
 * @returns {number[]}
 */
export function splitIntoInstallments(total, count) {
    const base = Math.round((total / count) * 100) / 100;
    const last = Math.round((total - base * (count - 1)) * 100) / 100;
    return Array.from({ length: count }, (_, index) => index === count - 1 ? last : base);
}

/**
 * Adds `days` to a 'yyyy-MM-dd' calendar date, treating it as a plain date
 * with no timezone — not an instant. Uses UTC-based arithmetic purely as a
 * neutral epoch for the day-count math (see todayLocalDateString's own
 * comment on why mixing local/UTC date handling causes off-by-one-day bugs);
 * the input and output are both timezone-less calendar dates throughout.
 * @param {string} dateString - 'yyyy-MM-dd'.
 * @param {number} days
 * @returns {string} 'yyyy-MM-dd'.
 */
export function addDaysToDateString(dateString, days) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

/**
 * Builds a default cuota-by-cuota schedule for the editable second screen
 * (X6 #12, decision 12.3): amounts are proportionally suggested (see
 * splitIntoInstallments) AND dates are auto-suggested — unlike Sales' #7,
 * where dates start blank. Cuotas are spaced 30 days apart, starting 30
 * days after `startDate` (the order's expected delivery date): both the
 * amounts and the dates remain fully editable afterward.
 * @param {number} total
 * @param {number} count
 * @param {string} startDate - 'yyyy-MM-dd', typically the order's expectedDate.
 * @returns {Array<{dueDate: string, amount: number}>}
 */
export function buildDefaultSupplierSchedule(total, count, startDate) {
    return splitIntoInstallments(total, count).map((amount, index) => ({
        dueDate: addDaysToDateString(startDate, 30 * (index + 1)),
        amount
    }));
}

/**
 * Whether a schedule is ready to submit: every row has a date, and the
 * amounts add up exactly (to the cent) to the total — the backend enforces
 * this with no margin (SupplierInstallmentAmountMismatch), so the UI must too.
 * @param {Array<{dueDate: string, amount: number|string}>} schedule
 * @param {number} total
 * @returns {boolean}
 */
export function isSupplierScheduleValid(schedule, total) {
    if (schedule.length === 0) return false;
    if (schedule.some(line => !line.dueDate || !(parseFloat(line.amount) > 0))) return false;
    const sum = schedule.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0);
    return Math.round(sum * 100) === Math.round(total * 100);
}
