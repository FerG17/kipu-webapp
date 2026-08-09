/**
 * SaleDetail entity within the Sales & POS Management bounded context.
 * Represents a single line item inside a Sale.
 *
 * Business rules:
 * - quantity must be a positive integer greater than zero.
 * - unitPrice must be a number greater than zero.
 * - discount is expressed as a decimal fraction (0.10 = 10%), matching
 *   PurchaseOrderDetail.discount so both modules share one discount format.
 * - lineTotal = quantity × unitPrice × (1 − discount).
 *
 * @class SaleDetail
 */
export class SaleDetail {
    /**
     * @param {Object}      params
     * @param {number|null} [params.id=null]        - Detail identifier (null before persisting).
     * @param {number|null} [params.saleId=null]    - Foreign key of the parent Sale.
     * @param {number|null} [params.productId=null] - Foreign key of the sold Product.
     * @param {number}      [params.quantity=1]     - Number of units sold.
     * @param {number}      [params.unitPrice=0]    - Price per unit at the moment of sale.
     * @param {number}      [params.discount=0]     - Decimal fraction (0–1).
     */
    constructor({
                    id        = null,
                    saleId    = null,
                    productId = null,
                    quantity  = 1,
                    unitPrice = 0,
                    discount  = 0
                }) {
        this.id        = id;
        this.saleId    = saleId;
        this.productId = productId;
        this.quantity  = quantity;
        this.unitPrice = unitPrice;
        this.discount  = discount;
    }

    /**
     * Calculates the total monetary value of this line item after applying the discount.
     *
     * Formula: quantity × unitPrice × (1 - discount)
     *
     * @returns {number} The line-item total rounded to two decimal places.
     */
    get lineTotal() {
        const grossAmount = this.quantity * this.unitPrice;
        const discountAmount = grossAmount * this.discount;
        return Math.round((grossAmount - discountAmount) * 100) / 100;
    }
}