/**
 * Enumeration of the supported alert types
 * within the Alerts & Operational Monitoring bounded context.
 *
 * Business rules:
 * - LOW_STOCK:    Stock is below the configured minimum threshold.
 * - OUT_OF_STOCK: Stock has reached zero — critical priority.
 * - EXPIRATION:   A product batch is approaching its expiry date.
 * - EXPIRED:      A product batch has already passed its expiry date — critical priority.
 *
 * @enum {string}
 */
export const AlertType = Object.freeze({
    LOW_STOCK:    'LOW_STOCK',
    OUT_OF_STOCK: 'OUT_OF_STOCK',
    EXPIRATION:   'EXPIRATION',
    EXPIRED:      'EXPIRED'
});

/**
 * Enumeration of the supported alert statuses.
 *
 * Business rules:
 * - ACTIVE:       Alert has been generated and requires attention.
 * - ACKNOWLEDGED: Alert has been seen and recognized by the user; still unresolved.
 * - SENT:         Alert has been dispatched via a notification channel.
 * - RESOLVED:     The underlying issue has been addressed by the user.
 *
 * @enum {string}
 */
export const AlertStatus = Object.freeze({
    ACTIVE:       'ACTIVE',
    ACKNOWLEDGED: 'ACKNOWLEDGED',
    SENT:         'SENT',
    RESOLVED:     'RESOLVED'
});

/**
 * Enumeration of alert severity levels.
 *
 * Business rules:
 * - HIGH:   Requires immediate action (OUT_OF_STOCK or EXPIRED, or expiring in ≤ 3 days).
 * - MEDIUM: Requires attention soon (stock ≤ 50% of minimum or expiring in ≤ 14 days).
 * - LOW:    Informational warning (stock below minimum but above 50% or expiring in ≤ 30 days).
 *
 * @enum {string}
 */
export const AlertSeverity = Object.freeze({
    HIGH:   'HIGH',
    MEDIUM: 'MEDIUM',
    LOW:    'LOW'
});

/**
 * Alert entity within the Alerts & Operational Monitoring bounded context.
 *
 * @class Alert
 */
export class Alert {
    /**
     * @param {Object}      params
     * @param {number|null} [params.id=null]
     * @param {number|null} [params.businessId=null]
     * @param {number|null} [params.productId=null]
     * @param {number|null} [params.batchId=null]
     * @param {number|null} [params.warehouseId=null] - Which warehouse this LOW_STOCK/
     *   OUT_OF_STOCK alert is about (null for EXPIRATION/EXPIRED, scoped by batchId instead).
     * @param {string}      [params.productName='']
     * @param {string}      [params.type=AlertType.LOW_STOCK]
     * @param {string}      [params.severity=AlertSeverity.LOW]
     * @param {string}      [params.message='']
     * @param {string}      [params.status=AlertStatus.ACTIVE]
     * @param {string}      [params.date='']
     * @param {number|null} [params.currentStock=null]
     * @param {number|null} [params.minStock=null]
     * @param {number|null} [params.daysToExpiry=null]
     * @param {boolean}     [params.notified=false]
     * @param {string}      [params.notifiedAt='']
     * @param {string}      [params.resolvedAt='']
     */
    constructor({
                    id           = null,
                    businessId   = null,
                    productId    = null,
                    batchId      = null,
                    warehouseId  = null,
                    productName  = '',
                    type         = AlertType.LOW_STOCK,
                    severity     = AlertSeverity.LOW,
                    message      = '',
                    status       = AlertStatus.ACTIVE,
                    date         = '',
                    currentStock = null,
                    minStock     = null,
                    daysToExpiry = null,
                    notified     = false,
                    notifiedAt   = '',
                    resolvedAt   = ''
                }) {
        this.id           = id;
        this.businessId   = businessId;
        this.productId    = productId;
        this.batchId      = batchId;
        this.warehouseId  = warehouseId;
        this.productName  = productName;
        this.type         = type;
        this.severity     = severity;
        this.message      = message;
        this.status       = status;
        this.date         = date;
        this.currentStock = currentStock;
        this.minStock     = minStock;
        this.daysToExpiry = daysToExpiry;
        this.notified     = notified;
        this.notifiedAt   = notifiedAt;
        this.resolvedAt   = resolvedAt;
    }

    /** @returns {boolean} */
    get isActive() {
        return this.status === AlertStatus.ACTIVE;
    }

    /** @returns {boolean} */
    get isAcknowledged() {
        return this.status === AlertStatus.ACKNOWLEDGED;
    }

    /** @returns {boolean} */
    get isResolved() {
        return this.status === AlertStatus.RESOLVED;
    }

    /**
     * Returns true when the alert is critical — OUT_OF_STOCK or EXPIRED types,
     * or any alert with HIGH severity.
     * @returns {boolean}
     */
    get isCritical() {
        return (
            this.severity === AlertSeverity.HIGH ||
            this.type === AlertType.OUT_OF_STOCK ||
            this.type === AlertType.EXPIRED
        );
    }

    /**
     * Returns true when the alert is still actionable (not yet resolved).
     * @returns {boolean}
     */
    get isActionable() {
        return this.status !== AlertStatus.RESOLVED;
    }

    /** @returns {Date} */
    get createdAtDate() {
        return new Date(this.date);
    }
}