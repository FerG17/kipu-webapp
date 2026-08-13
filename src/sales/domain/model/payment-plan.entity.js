/**
 * PaymentPlan entity within the Sales & POS Management bounded context.
 * Tracks how many installments a credit sale is split into and how many
 * have been paid — attached to an already-existing, already-PAID Sale via
 * its own command, entirely separate from how the sale itself was created
 * or totaled (see the backend's PaymentPlanCommandService).
 *
 * Business rules:
 * - totalInstallments is fixed at creation; there is no endpoint to change it.
 * - paidInstallments only ever increases, one at a time, via registerPayment.
 * - isFullyPaid is server-computed (paidInstallments === totalInstallments).
 *
 * @class PaymentPlan
 */
export class PaymentPlan {
    /**
     * @param {Object}      params
     * @param {number|null} [params.id=null]
     * @param {number|null} [params.saleId=null]
     * @param {number|null} [params.businessId=null]
     * @param {number}      [params.totalInstallments=1]
     * @param {number}      [params.paidInstallments=0]
     * @param {boolean}     [params.isFullyPaid=false]
     * @param {boolean}     [params.isCancelled=false] - Set when the sale this plan belongs to was cancelled.
     */
    constructor({
                    id                = null,
                    saleId            = null,
                    businessId        = null,
                    totalInstallments = 1,
                    paidInstallments  = 0,
                    isFullyPaid       = false,
                    isCancelled       = false
                }) {
        this.id                = id;
        this.saleId            = saleId;
        this.businessId        = businessId;
        this.totalInstallments = totalInstallments;
        this.paidInstallments  = paidInstallments;
        this.isFullyPaid       = isFullyPaid;
        this.isCancelled       = isCancelled;
    }

    /**
     * Number of installments still unpaid.
     * @returns {number}
     */
    get remainingInstallments() {
        return this.totalInstallments - this.paidInstallments;
    }
}
