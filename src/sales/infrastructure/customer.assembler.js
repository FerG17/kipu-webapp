import { Customer } from '../domain/model/customer.entity.js';

/**
 * Maps raw API resources into Customer domain entities.
 *
 * @class CustomerAssembler
 */
export class CustomerAssembler {
    /**
     * Converts a single raw resource object into a Customer entity.
     *
     * @param {Object} resource - Raw customer resource from the API.
     * @returns {Customer} Hydrated Customer entity.
     */
    static toEntityFromResource(resource) {
        return new Customer({ ...resource });
    }

    /**
     * Converts an Axios response containing an array of customer resources
     * into Customer entities.
     *
     * @param {import('axios').AxiosResponse<Array<Object>|Object>} response - HTTP response.
     * @returns {Customer[]} Array of Customer entities; empty array on error.
     */
    static toEntitiesFromResponse(response) {
        if (response.status !== 200) {
            console.error(`CustomerAssembler error — status: ${response.status}, message: ${response.statusText}`);
            return [];
        }
        const resources = response.data instanceof Array ? response.data : (response.data.items ?? response.data['customers']);
        return resources.map(resource => this.toEntityFromResource(resource));
    }

    /**
     * Builds the exact payload the real backend accepts for create/update
     * (`CreateCustomerResource`/`UpdateCustomerResource`: FullName,
     * DocumentNumber, PhoneNumber, Email — nothing else). id/businessId
     * come from the JWT and the URL, not the body.
     * @param {Customer} customer
     * @returns {Object}
     */
    static toResourceFromEntity(customer) {
        return {
            fullName:       customer.fullName,
            documentNumber: customer.documentNumber,
            phoneNumber:    customer.phoneNumber,
            email:          customer.email
        };
    }
}