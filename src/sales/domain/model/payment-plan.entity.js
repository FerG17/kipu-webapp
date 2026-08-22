/**
 * One installment actually paid against a PaymentPlan — the audit trail
 * behind paidInstallments (X4 A5). A reversed payment stays in this list
 * (isReversed true) rather than disappearing, so the mistake and its
 * correction both stay visible.
 *
 * @typedef {Object} InstallmentPayment
 * @property {number}      id
 * @property {number}      amount           - Always Sale.TotalAmount / totalInstallments, computed server-side.
 * @property {string}      paidAt           - ISO 8601 timestamp.
 * @property {number}      paidByUserId
 * @property {boolean}     isReversed
 * @property {string|null} reversedAt       - ISO 8601 timestamp, or null.
 * @property {number|null} reversedByUserId
 */

/**
 * PaymentPlan entity within the Sales & POS Management bounded context.
 * Tracks how many installments a credit sale is split into and how many
 * have been paid — attached to an already-existing Sale sold on credit
 * (Sale.Status === CREDIT) via its own command, entirely separate from how
 * the sale itself was created or totaled (see the backend's
 * PaymentPlanCommandService).
 *
 * Business rules:
 * - totalInstallments is fixed at creation; there is no endpoint to change it.
 * - paidInstallments only ever increases via registerPayment, or decreases
 *   by exactly one via revertLastPayment (X4 A5) — never edited directly.
 * - isFullyPaid is server-computed (paidInstallments === totalInstallments).
 *
 * @class PaymentPlan
 */
export class PaymentPlan {
    /**
     * @param {Object}                 params
     * @param {number|null}            [params.id=null]
     * @param {number|null}            [params.saleId=null]
     * @param {number|null}            [params.businessId=null]
     * @param {number}                 [params.totalInstallments=1]
     * @param {number}                 [params.paidInstallments=0]
     * @param {boolean}                [params.isFullyPaid=false]
     * @param {boolean}                [params.isCancelled=false] - Set when the sale this plan belongs to was cancelled.
     * @param {InstallmentPayment[]}   [params.payments=[]]
     */
    constructor({
                    id                = null,
                    saleId            = null,
                    businessId        = null,
                    totalInstallments = 1,
                    paidInstallments  = 0,
                    isFullyPaid       = false,
                    isCancelled       = false,
                    payments          = []
                }) {
        this.id                = id;
        this.saleId            = saleId;
        this.businessId        = businessId;
        this.totalInstallments = totalInstallments;
        this.paidInstallments  = paidInstallments;
        this.isFullyPaid       = isFullyPaid;
        this.isCancelled       = isCancelled;
        this.payments          = payments;
    }

    /**
     * The most recent unreversed payment — what a revert would undo — or
     * null if there's nothing left to revert.
     * @returns {InstallmentPayment|null}
     */
    get lastReversiblePayment() {
        const reversible = this.payments.filter(payment => !payment.isReversed);
        if (reversible.length === 0) return null;
        return reversible.reduce((latest, payment) =>
            new Date(payment.paidAt) > new Date(latest.paidAt) ? payment : latest
        );
    }

    /**
     * Number of installments still unpaid.
     * @returns {number}
     */
    get remainingInstallments() {
        return this.totalInstallments - this.paidInstallments;
    }
}
