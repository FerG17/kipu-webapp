/**
 * Splits a total into `count` installment amounts that sum back to it
 * exactly — mirrors the backend's own rounding rule (round to the cent,
 * remainder folded into the last installment) so a client-built schedule
 * never gets rejected by InstallmentAmountMismatch just from float drift.
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
 * Builds a default cuota-by-cuota schedule for the editable second screen
 * (X6 #7): amounts are proportionally suggested (see splitIntoInstallments),
 * but dates start blank — the cashier enters each one by hand, there is no
 * predefined cadence the system suggests on its own (decision 1, confirmed).
 * @param {number} total
 * @param {number} count
 * @returns {Array<{dueDate: string, amount: number}>}
 */
export function buildDefaultSchedule(total, count) {
    return splitIntoInstallments(total, count).map(amount => ({ dueDate: '', amount }));
}

/**
 * Whether a schedule is ready to submit: every row has a date, and the
 * amounts add up exactly (to the cent) to the total — the backend enforces
 * this with no margin (InstallmentAmountMismatch), so the UI must too.
 * @param {Array<{dueDate: string, amount: number|string}>} schedule
 * @param {number} total
 * @returns {boolean}
 */
export function isScheduleValid(schedule, total) {
    if (schedule.length === 0) return false;
    if (schedule.some(line => !line.dueDate || !(parseFloat(line.amount) > 0))) return false;
    const sum = schedule.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0);
    return Math.round(sum * 100) === Math.round(total * 100);
}
