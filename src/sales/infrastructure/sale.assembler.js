import { Sale } from '../domain/model/sale.entity.js';

/**
 * Maps raw API resources into Sale domain entities.
 *
 * @class SaleAssembler
 */
export class SaleAssembler {
    /**
     * Converts a single raw resource object into a Sale entity.
     *
     * @param {Object} resource - Raw sale resource from the API.
     * @returns {Sale} Hydrated Sale entity.
     */
    static toEntityFromResource(resource) {
        return new Sale({ ...resource });
    }

    /**
     * Converts an Axios response containing an array of sale resources into Sale entities.
     *
     * @param {import('axios').AxiosResponse<Array<Object>|Object>} response - HTTP response.
     * @returns {Sale[]} Array of Sale entities; empty array on error.
     */
    static toEntitiesFromResponse(response) {
        if (response.status !== 200) {
            console.error(`SaleAssembler error — status: ${response.status}, message: ${response.statusText}`);
            return [];
        }
        const resources = response.data instanceof Array ? response.data : response.data['sales'];
        return resources.map(resource => this.toEntityFromResource(resource));
    }
}