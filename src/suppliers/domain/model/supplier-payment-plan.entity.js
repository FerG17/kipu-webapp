/**
 * One installment actually paid against a SupplierPaymentPlan — the audit
 * trail behind paidInstallments, mirroring Sales' InstallmentPayment (X6 #7).
 * A reversed payment stays in this list (isReversed true) rather than
 * disappearing, so the mistake and its correction both stay visible.
 *
 * @typedef {Object} SupplierInstallmentPayment
 * @property {number}      id
 * @property {number}      amount
 * @property {string}      paidAt           - ISO 8601 timestamp.
 * @property {number}      paidByUserId
 * @property {boolean}     isReversed
 * @property {string|null} reversedAt       - ISO 8601 timestamp, or null.
 * @property {number|null} reversedByUserId
 */

/**
 * One scheduled cuota of a SupplierPaymentPlan — date + amount, mirroring
 * Sales' PaymentInstallment (X6 #7). Unlike Sales, the dates start
 * auto-suggested rather than blank (X6 #12, decision 12.3) — both remain
 * editable either way.
 *
 * @typedef {Object} SupplierPaymentInstallment
 * @property {number}  id
 * @property {number}  number   - 1-based order within the plan.
 * @property {string}  dueDate  - 'yyyy-MM-dd'.
 * @property {number}  amount
 * @property {boolean} isPaid
 */

/**
 * SupplierPaymentPlan entity within the Supplier & Replenishment Management
 * bounded context. Mirrors Sales' PaymentPlan (X6 #7) applied to a purchase
 * order bought "a crédito" (X6 #12) instead of a credit sale — attached to
 * an already-existing PurchaseOrder via its own command, entirely separate
 * from how the order itself was created or totaled (see the backend's
 * SupplierPaymentPlanCommandService).
 *
 * Business rules:
 * - totalInstallments is fixed at creation; there is no endpoint to change it.
 * - paidInstallments only ever increases via registerPayment, or decreases
 *   by exactly one via revertLastPayment — never edited directly.
 * - isFullyPaid is server-computed (paidInstallments === totalInstallments).
 * - Unlike Sales' #7 (which requires Sale.Status === CREDIT), a plan can
 *   attach to a PENDING, DELAYED, or RECEIVED purchase order — only a
 *   CANCELLED order rejects it (X6 #12, decision 12.5).
 *
 * @class SupplierPaymentPlan
 */
export class SupplierPaymentPlan {
    /**
     * @param {Object}                         params
     * @param {number|null}                    [params.id=null]
     * @param {number|null}                    [params.purchaseOrderId=null]
     * @param {number|null}                    [params.businessId=null]
     * @param {number}                         [params.totalInstallments=1]
     * @param {number}                         [params.paidInstallments=0]
     * @param {boolean}                        [params.isFullyPaid=false]
     * @param {boolean}                        [params.isCancelled=false] - Set when the purchase order this plan belongs to was cancelled.
     * @param {SupplierInstallmentPayment[]}   [params.payments=[]]
     * @param {SupplierPaymentInstallment[]}   [params.installments=[]]
     */
    constructor({
                    id                = null,
                    purchaseOrderId   = null,
                    businessId        = null,
                    totalInstallments = 1,
                    paidInstallments  = 0,
                    isFullyPaid       = false,
                    isCancelled       = false,
                    payments          = [],
                    installments      = []
                }) {
        this.id                = id;
        this.purchaseOrderId   = purchaseOrderId;
        this.businessId        = businessId;
        this.totalInstallments = totalInstallments;
        this.paidInstallments  = paidInstallments;
        this.isFullyPaid       = isFullyPaid;
        this.isCancelled       = isCancelled;
        this.payments          = payments;
        this.installments      = installments;
    }

    /**
     * The cuota RegisterPayment would pay next — the earliest unpaid one by
     * DueDate — or null once fully paid.
     * @returns {SupplierPaymentInstallment|null}
     */
    get nextUnpaidInstallment() {
        const unpaid = this.installments.filter(installment => !installment.isPaid);
        if (unpaid.length === 0) return null;
        return unpaid.reduce((earliest, installment) =>
            installment.dueDate < earliest.dueDate ? installment : earliest
        );
    }

    /**
     * The most recent unreversed payment — what a revert would undo — or
     * null if there's nothing left to revert.
     * @returns {SupplierInstallmentPayment|null}
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
