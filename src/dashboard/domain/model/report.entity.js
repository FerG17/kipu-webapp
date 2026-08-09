import { ReportFilters } from './report-filters.entity.js';

/**
 * Enumeration of the supported report types within the Dashboard & Analytics context.
 * Each type corresponds to a different data dimension of the business.
 *
 * @enum {string}
 */
export const ReportType = Object.freeze({
    INVENTORY:     'INVENTORY',
    SALES:         'SALES',
    LOW_STOCK:     'LOW_STOCK',
    REPLENISHMENT: 'REPLENISHMENT'
});

/**
 * Report entity within the Dashboard & Analytics bounded context.
 * Represents a generated business report with its type, filters, and metadata.
 *
 * Business rules:
 * - type must be one of the values defined in ReportType.
 * - filters must be a valid ReportFilters instance with a valid date range.
 * - generatedAt is set server-side; the client treats it as read-only after creation.
 *
 * @class Report
 */
export class Report {
    /**
     * @param {Object} params - Entity attributes.
     * @param {number|null}    [params.id=null]           - Report identifier.
     * @param {number|null}    [params.businessId=null]    - Foreign key of the associated business.
     * @param {string}         [params.type=ReportType.SALES] - Report type; must match a ReportType value.
     * @param {ReportFilters}  [params.filters=null]       - Filter criteria applied when generating the report.
     * @param {string}         [params.generatedAt='']     - ISO 8601 timestamp when the report was generated.
     */
    constructor({
                    id          = null,
                    businessId  = null,
                    type        = ReportType.SALES,
                    filters     = null,
                    generatedAt = ''
                }) {
        this.id          = id;
        this.businessId  = businessId;
        this.type        = type;
        this.filters     = filters instanceof ReportFilters ? filters : new ReportFilters(filters ?? {});
        this.generatedAt = generatedAt;
    }
}