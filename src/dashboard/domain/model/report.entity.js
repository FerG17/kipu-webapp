/**
 * Enumeration of the report types the real backend actually supports
 * (ReportsController/Report.Type). "Low stock" and "replenishment" were
 * frontend-only inventions with no server-side persistence or export —
 * that data is already covered live by Inventario/Alertas, so they were
 * dropped rather than adding backend scope for them.
 *
 * @enum {string}
 */
export const ReportType = Object.freeze({
    SALES:           'SALES',
    INVENTORY:       'INVENTORY',
    STOCK_MOVEMENTS: 'STOCK_MOVEMENTS'
});

/**
 * Report entity within the Dashboard & Analytics bounded context — mirrors
 * ReportResource exactly (flat fields, no nested filters object): a
 * persisted report's metadata. Its actual figures are never snapshotted —
 * both generation and export re-run the same live query server-side.
 *
 * @class Report
 */
export class Report {
    /**
     * @param {Object}      params
     * @param {number|null} [params.id=null]
     * @param {number|null} [params.businessId=null]
     * @param {string}      [params.type=ReportType.SALES]
     * @param {string|null} [params.dateFrom=null]   - 'yyyy-mm-dd', only meaningful for SALES/STOCK_MOVEMENTS.
     * @param {string|null} [params.dateTo=null]     - 'yyyy-mm-dd'.
     * @param {number|null} [params.productId=null]  - Only meaningful for STOCK_MOVEMENTS.
     * @param {number|null} [params.supplierId=null] - Only meaningful for STOCK_MOVEMENTS.
     * @param {string}      [params.generatedAt='']  - ISO 8601 timestamp, set server-side.
     */
    constructor({
                    id          = null,
                    businessId  = null,
                    type        = ReportType.SALES,
                    dateFrom    = null,
                    dateTo      = null,
                    productId   = null,
                    supplierId  = null,
                    generatedAt = ''
                }) {
        this.id          = id;
        this.businessId  = businessId;
        this.type        = type;
        this.dateFrom    = dateFrom;
        this.dateTo      = dateTo;
        this.productId   = productId;
        this.supplierId  = supplierId;
        this.generatedAt = generatedAt;
    }
}
