import { SupplierPaymentPlan } from '../domain/model/supplier-payment-plan.entity.js';

/**
 * Maps raw API resources into SupplierPaymentPlan domain entities and vice-versa.
 * Mirrors Sales' PaymentPlanAssembler (X6 #7) for the Suppliers side (X6 #12).
 *
 * @class SupplierPaymentPlanAssembler
 */
export class SupplierPaymentPlanAssembler {
    /**
     * @param {Object} resource - Raw SupplierPaymentPlanResource from the API.
     * @returns {SupplierPaymentPlan}
     */
    static toEntityFromResource(resource) {
        return new SupplierPaymentPlan({ ...resource });
    }

    /**
     * @param {import('axios').AxiosResponse<Array<Object>>} response
     * @returns {SupplierPaymentPlan[]}
     */
    static toEntitiesFromResponse(response) {
        const resources = Array.isArray(response.data) ? response.data : [];
        return resources.map(resource => this.toEntityFromResource(resource));
    }

    /**
     * Builds the exact payload the real backend accepts for creation
     * (`CreateSupplierPaymentPlanResource`: PurchaseOrderId, Schedule[]).
     * @param {Object}                                          params
     * @param {number|string}                                   params.purchaseOrderId
     * @param {Array<{dueDate: string, amount: number|string}>} params.schedule
     * @returns {Object}
     */
    static toResourceFromEntity({ purchaseOrderId, schedule }) {
        return {
            purchaseOrderId: parseInt(purchaseOrderId),
            schedule:        schedule.map(line => ({ dueDate: line.dueDate, amount: parseFloat(line.amount) }))
        };
    }

    /**
     * Builds the payload for PATCH /supplier-payment-plans/{id}/installments/{installmentId}
     * (`UpdateSupplierPaymentInstallmentResource`: DueDate, Amount).
     * @param {{dueDate: string, amount: number|string}} line
     * @returns {Object}
     */
    static toUpdateInstallmentResource({ dueDate, amount }) {
        return { dueDate, amount: parseFloat(amount) };
    }
}
