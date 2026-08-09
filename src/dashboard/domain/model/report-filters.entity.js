/**
 * ReportFilters value object within the Dashboard & Analytics bounded context.
 * Encapsulates the filter criteria used when generating a business report.
 *
 * Business rules:
 * - startDate must be a valid ISO 8601 date string (YYYY-MM-DD).
 * - endDate must be a valid ISO 8601 date string and must not precede startDate.
 * - category is an optional free-text filter; empty string means "all categories".
 *
 * @class ReportFilters
 */
export class ReportFilters {
    /**
     * @param {Object} params - Filter attributes.
     * @param {string} [params.startDate=''] - Inclusive start date in ISO 8601 format (YYYY-MM-DD).
     * @param {string} [params.endDate='']   - Inclusive end date in ISO 8601 format (YYYY-MM-DD).
     * @param {string} [params.category='']  - Optional product category filter; empty means all.
     */
    constructor({ startDate = '', endDate = '', category = '' }) {
        this.startDate = startDate;
        this.endDate   = endDate;
        this.category  = category;
    }

    /**
     * Validates that both dates are present and that startDate does not come after endDate.
     *
     * @returns {boolean} True when the date range is valid, false otherwise.
     */
    isDateRangeValid() {
        if (!this.startDate || !this.endDate) return false;
        return new Date(this.startDate) <= new Date(this.endDate);
    }
}