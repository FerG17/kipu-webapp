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
     * (`CreatePaymentPlanResource`: SaleId, TotalInstallments — nothing else).
     * @param {Object}        params
     * @param {number|string} params.saleId
     * @param {number}        params.totalInstallments
     * @returns {Object}
     */
    static toResourceFromEntity({ saleId, totalInstallments }) {
        return {
            saleId:            parseInt(saleId),
            totalInstallments: parseInt(totalInstallments)
        };
    }
}
