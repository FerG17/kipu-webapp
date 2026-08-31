import { PaymentPlan } from '../domain/model/payment-plan.entity.js';

/**
 * Maps raw API resources into PaymentPlan domain entities and vice-versa.
 *
 * @class PaymentPlanAssembler
 */
export class PaymentPlanAssembler {
    /**
     * @param {Object} resource - Raw PaymentPlanResource from the API.
     * @returns {PaymentPlan}
     */
    static toEntityFromResource(resource) {
        return new PaymentPlan({ ...resource });
    }

    /**
     * @param {import('axios').AxiosResponse<Array<Object>>} response
     * @returns {PaymentPlan[]}
     */
    static toEntitiesFromResponse(response) {
        const resources = Array.isArray(response.data) ? response.data : [];
        return resources.map(resource => this.toEntityFromResource(resource));
    }

    /**
     * Builds the exact payload the real backend accepts for creation
     * (`CreatePaymentPlanResource`: SaleId, Schedule[] — X6 #7 replaced the
     * old bare TotalInstallments with a real cuota-by-cuota calendar).
     * @param {Object}                                          params
     * @param {number|string}                                   params.saleId
     * @param {Array<{dueDate: string, amount: number|string}>} params.schedule
     * @returns {Object}
     */
    static toResourceFromEntity({ saleId, schedule }) {
        return {
            saleId:   parseInt(saleId),
            schedule: schedule.map(line => ({ dueDate: line.dueDate, amount: parseFloat(line.amount) }))
        };
    }

    /**
     * Builds the payload for PATCH /payment-plans/{id}/installments/{installmentId}
     * (`UpdatePaymentInstallmentResource`: DueDate, Amount).
     * @param {{dueDate: string, amount: number|string}} line
     * @returns {Object}
     */
    static toUpdateInstallmentResource({ dueDate, amount }) {
        return { dueDate, amount: parseFloat(amount) };
    }
}
