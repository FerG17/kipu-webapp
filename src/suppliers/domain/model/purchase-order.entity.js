/**
 * Enumeration of the supported purchase order lifecycle statuses
 * within the Supplier & Replenishment Management bounded context.
 *
 * Business rules:
 * - PENDING:   Order has been created and sent to the supplier; awaiting delivery.
 * - RECEIVED:  All items have been delivered and inventory has been updated.
 * - DELAYED:   Supplier confirmed the delivery will arrive after the expected date.
 * - CANCELLED: Order was voided before delivery; no inventory update is performed.
 *
 * @enum {string}
 */
export const PurchaseOrderStatus = Object.freeze({
    PENDING:   'PENDING',
    RECEIVED:  'RECEIVED',
    DELAYED:   'DELAYED',
    CANCELLED: 'CANCELLED'
});

/**
 * PurchaseOrderDetail entity representing a single line item in a purchase order.
 * Encapsulates the product, quantity, and unit price for one order line.
 *
 * Business rules:
 * - quantity must be a positive integer greater than zero.
 * - unitPrice must be a positive number greater than zero.
 * - lineTotal = quantity × unitPrice × (1 − discount).
 * - discount is expressed as a decimal fraction (0.10 = 10%).
 *
 * @class PurchaseOrderDetail
 */
export class PurchaseOrderDetail {
    /**
     * @param {Object}      params
     * @param {number|null} [params.id=null]
     * @param {number|null} [params.purchaseId=null]
     * @param {number|null} [params.productId=null]
     * @param {string}      [params.productName='']     - Denormalized name for display purposes.
     * @param {number}      [params.quantity=1]
     * @param {number}      [params.unitPrice=0]
     * @param {number}      [params.discount=0]         - Decimal fraction (0–1).
     * @param {string}      [params.deliveryStatus='']
     * @param {string}      [params.deliveryTrackingNum='']
     */
    constructor({
                    id                  = null,
                    purchaseId          = null,
                    productId           = null,
                    productName         = '',
                    quantity            = 1,
                    unitPrice           = 0,
                    discount            = 0,
                    deliveryStatus      = '',
                    deliveryTrackingNum = ''
                }) {
        this.id                  = id;
        this.purchaseId          = purchaseId;
        this.productId           = productId;
        this.productName         = productName;
        this.quantity            = quantity;
        this.unitPrice           = unitPrice;
        this.discount            = discount;
        this.deliveryStatus      = deliveryStatus;
        this.deliveryTrackingNum = deliveryTrackingNum;
    }

    /**
     * Calculates the line total applying the discount.
     * Formula: quantity × unitPrice × (1 - discount)
     *
     * @returns {number} Line total rounded to two decimal places.
     */
    get lineTotal() {
        const grossAmount = this.quantity * this.unitPrice;
        const discountAmount = grossAmount * this.discount;
        return Math.round((grossAmount - discountAmount) * 100) / 100;
    }
}

/**
 * PurchaseOrder (Orden de Reposición) entity within the Supplier & Replenishment
 * Management bounded context.
 * Represents a complete replenishment order sent to a supplier.
 *
 * Business rules:
 * - A new PurchaseOrder always starts with status PENDING.
 * - A PurchaseOrder requires at least one PurchaseOrderDetail line.
 * - A PurchaseOrder can only transition to RECEIVED or CANCELLED when its
 *   current status is PENDING or DELAYED.
 * - A RECEIVED or CANCELLED order is immutable.
 * - totalAmount is the sum of all detail lineTotals.
 * - expectedDate must be on or after the creation date.
 * - currency defaults to PEN (Peruvian Sol).
 *
 * @class PurchaseOrder
 */
export class PurchaseOrder {
    /**
     * @param {Object}               params
     * @param {number|null}          [params.id=null]
     * @param {number|null}          [params.businessId=null]
     * @param {number|null}          [params.supplierId=null]
     * @param {string}               [params.supplierName='']   - Denormalized for display.
     * @param {string}               [params.date='']           - ISO 8601 creation timestamp.
     * @param {string}               [params.expectedDate='']   - ISO date of expected delivery.
     * @param {string}               [params.receivedDate='']   - ISO date when actually received.
     * @param {string}               [params.status=PurchaseOrderStatus.PENDING]
     * @param {string}               [params.currency='PEN']
     * @param {string}               [params.description='']    - Optional free-text notes.
     * @param {PurchaseOrderDetail[]} [params.details=[]]
     */
    constructor({
                    id           = null,
                    businessId   = null,
                    supplierId   = null,
                    supplierName = '',
                    date         = '',
                    expectedDate = '',
                    receivedDate = '',
                    status       = PurchaseOrderStatus.PENDING,
                    currency     = 'PEN',
                    description  = '',
                    details      = []
                }) {
        this.id           = id;
        this.businessId   = businessId;
        this.supplierId   = supplierId;
        this.supplierName = supplierName;
        this.date         = date;
        this.expectedDate = expectedDate;
        this.receivedDate = receivedDate;
        this.status       = status;
        this.currency     = currency;
        this.description  = description;
        this.details      = details.map(detail =>
            detail instanceof PurchaseOrderDetail ? detail : new PurchaseOrderDetail(detail)
        );
    }

    /**
     * Returns true when the order can still be updated (received, delayed or cancelled).
     * @returns {boolean}
     */
    get isActionable() {
        return (
            this.status === PurchaseOrderStatus.PENDING ||
            this.status === PurchaseOrderStatus.DELAYED
        );
    }

    /**
     * Returns true when the order has been fully received.
     * @returns {boolean}
     */
    get isReceived() {
        return this.status === PurchaseOrderStatus.RECEIVED;
    }

    /**
     * Returns true when the order has been cancelled.
     * @returns {boolean}
     */
    get isCancelled() {
        return this.status === PurchaseOrderStatus.CANCELLED;
    }

    /**
     * Returns true when the order is delayed.
     * @returns {boolean}
     */
    get isDelayed() {
        return this.status === PurchaseOrderStatus.DELAYED;
    }

    /**
     * Calculates the total amount of the order by summing all detail lineTotals.
     * @returns {number} Total amount rounded to two decimal places.
     */
    get totalAmount() {
        const sum = this.details.reduce((accumulator, detail) => accumulator + detail.lineTotal, 0);
        return Math.round(sum * 100) / 100;
    }

    /**
     * Returns the number of line items in the order.
     * @returns {number}
     */
    get itemCount() {
        return this.details.length;
    }
}
