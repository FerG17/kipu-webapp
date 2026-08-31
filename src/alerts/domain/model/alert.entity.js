/**
 * Enumeration of the supported alert types
 * within the Alerts & Operational Monitoring bounded context.
 *
 * Business rules:
 * - LOW_STOCK:    Stock is below the configured minimum threshold.
 * - OUT_OF_STOCK: Stock has reached zero — critical priority.
 * - EXPIRATION:   A product batch is approaching its expiry date.
 * - EXPIRED:      A product batch has already passed its expiry date — critical priority.
 * - INSTALLMENT_DUE: A credit sale's next cuota is coming due (X6 #7) — no product involved.
 *
 * @enum {string}
 */
export const AlertType = Object.freeze({
    LOW_STOCK:       'LOW_STOCK',
    OUT_OF_STOCK:    'OUT_OF_STOCK',
    EXPIRATION:      'EXPIRATION',
    EXPIRED:         'EXPIRED',
    INSTALLMENT_DUE: 'INSTALLMENT_DUE'
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
     * @param {number|null} [params.saleId=null] - The credit sale an INSTALLMENT_DUE alert is about.
     * @param {number|null} [params.purchaseOrderId=null] - Reserved for X6 #12 (Bloque G2) — always null for now.
     * @param {string}      [params.customerOrSupplierName=''] - Who owes the cuota — null-safe fallback for an anonymous sale.
     * @param {number|null} [params.amount=null] - The due cuota's amount — only set for INSTALLMENT_DUE.
     * @param {number|null} [params.daysRemaining=null] - Days until (positive) or since (negative) the cuota's due date.
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
                    resolvedAt   = '',
                    saleId                 = null,
                    purchaseOrderId        = null,
                    customerOrSupplierName = '',
                    amount                 = null,
                    daysRemaining          = null
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
        this.saleId                 = saleId;
        this.purchaseOrderId        = purchaseOrderId;
        this.customerOrSupplierName = customerOrSupplierName;
        this.amount                 = amount;
        this.daysRemaining          = daysRemaining;
    }

    /** @returns {boolean} */
    get isInstallmentDue() {
        return this.type === AlertType.INSTALLMENT_DUE;
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