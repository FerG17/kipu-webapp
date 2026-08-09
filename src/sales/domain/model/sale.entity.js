/**
 * Enumeration of the supported sale lifecycle statuses
 * within the Sales & POS Management bounded context.
 *
 * Business rules:
 * - OPEN:      Sale is being built; items can be added or removed; no payment yet.
 * - PAID:      Payment has been registered and confirmed; sale is immutable.
 * - CANCELLED: Sale was voided before or after payment; no stock change is reverted here
 *              (handled by the store layer).
 *
 * @enum {string}
 */
export const SaleStatus = Object.freeze({
    OPEN:      'OPEN',
    PAID:      'PAID',
    CANCELLED: 'CANCELLED'
});

/**
 * Enumeration of the accepted payment methods
 * within the Sales & POS Management bounded context.
 *
 * Business rules:
 * - A sale can only be marked PAID when a valid PaymentMethod is selected.
 * - CASH:  Physical currency; change must be calculated by the presenter.
 * - CARD:  Credit or debit card terminal.
 * - YAPE:  QR-based mobile wallet (Banco de Crédito del Perú).
 * - PLIN:  QR-based mobile wallet (BBVA / Scotiabank / Interbank).
 *
 * @enum {string}
 */
export const PaymentMethod = Object.freeze({
    CASH: 'CASH',
    CARD: 'CARD',
    YAPE: 'YAPE',
    PLIN: 'PLIN'
});

import { SaleDetail }  from './sale-detail.entity.js';

/**
 * Sale entity within the Sales & POS Management bounded context.
 * Represents a complete sales transaction at the point of sale.
 *
 * Business rules:
 * - A new Sale always starts with status OPEN.
 * - A Sale can only transition to PAID when at least one SaleDetail exists
 *   and a valid PaymentMethod is provided (enforced by the store).
 * - A Sale can only be cancelled when its current status is OPEN or PAID
 *   (enforced by the store).
 * - totalAmount is derived from the sum of all SaleDetail lineTotals (see computed getter).
 * - IGV (Peruvian value-added tax) is 18% of the subtotal (totalAmount).
 * - grandTotal = totalAmount + igvAmount.
 *
 * @class Sale
 */
export class Sale {
    /**
     * @param {Object}         params
     * @param {number|null}    [params.id=null]            - Sale identifier (null before persisting).
     * @param {number|null}    [params.businessId=null]    - Foreign key of the owning Business.
     * @param {number|null}    [params.customerId=null]    - Foreign key of the Customer (optional).
     * @param {string}         [params.status=SaleStatus.OPEN] - Lifecycle status of the sale.
     * @param {number}         [params.totalAmount=0]      - Persisted subtotal amount (sum of line totals).
     * @param {string|null}    [params.paymentMethod=null] - Payment method used when status is PAID.
     * @param {string}         [params.date='']            - ISO 8601 timestamp of the sale.
     * @param {string}         [params.description='']     - Optional free-text note.
     * @param {string}         [params.currency='PEN']     - ISO 4217 currency code; defaults to PEN.
     * @param {SaleDetail[]}   [params.details=[]]         - Line items belonging to this sale.
     */
    constructor({
                    id            = null,
                    businessId    = null,
                    customerId    = null,
                    status        = SaleStatus.OPEN,
                    totalAmount   = 0,
                    paymentMethod = null,
                    date          = '',
                    description   = '',
                    currency      = 'PEN',
                    details       = []
                }) {
        this.id            = id;
        this.businessId    = businessId;
        this.customerId    = customerId;
        this.status        = status;
        this.totalAmount   = totalAmount;
        this.paymentMethod = paymentMethod;
        this.date          = date;
        this.description   = description;
        this.currency      = currency;
        this.details       = details.map(detail =>
            detail instanceof SaleDetail ? detail : new SaleDetail(detail)
        );
    }

    /**
     * Returns true when the sale is in the OPEN state and can still be edited.
     * @returns {boolean}
     */
    get isOpen() {
        return this.status === SaleStatus.OPEN;
    }

    /**
     * Returns true when the sale has been successfully paid.
     * @returns {boolean}
     */
    get isPaid() {
        return this.status === SaleStatus.PAID;
    }

    /**
     * Returns true when the sale has been cancelled.
     * @returns {boolean}
     */
    get isCancelled() {
        return this.status === SaleStatus.CANCELLED;
    }

    /**
     * Calculates the subtotal by summing the lineTotal of every SaleDetail.
     * This is the pre-tax amount.
     *
     * @returns {number} Subtotal rounded to two decimal places.
     */
    get subtotal() {
        const sum = this.details.reduce((accumulator, detail) => accumulator + detail.lineTotal, 0);
        return Math.round(sum * 100) / 100;
    }

    /**
     * Calculates the IGV (Impuesto General a las Ventas) tax amount.
     * IGV rate in Peru is 18% of the subtotal.
     *
     * @returns {number} IGV amount rounded to two decimal places.
     */
    get igvAmount() {
        return Math.round(this.subtotal * 0.18 * 100) / 100;
    }

    /**
     * Calculates the grand total including IGV.
     *
     * Formula: subtotal + igvAmount = subtotal × 1.18
     *
     * @returns {number} Grand total rounded to two decimal places.
     */
    get grandTotal() {
        return Math.round((this.subtotal + this.igvAmount) * 100) / 100;
    }
}