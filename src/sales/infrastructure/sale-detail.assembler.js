import { SaleDetail } from '../domain/model/sale-detail.entity.js';

/**
 * Maps raw API resources into SaleDetail domain entities.
 *
 * @class SaleDetailAssembler
 */
export class SaleDetailAssembler {
    /**
     * Converts a single raw resource object into a SaleDetail entity.
     *
     * @param {Object} resource - Raw sale detail resource from the API.
     * @returns {SaleDetail} Hydrated SaleDetail entity.
     */
    static toEntityFromResource(resource) {
        return new SaleDetail({ ...resource });
    }

    /**
     * Converts an Axios response containing an array of sale detail resources
     * into SaleDetail entities.
     *
     * @param {import('axios').AxiosResponse<Array<Object>|Object>} response - HTTP response.
     * @returns {SaleDetail[]} Array of SaleDetail entities; empty array on error.
     */
    static toEntitiesFromResponse(response) {
        if (response.status !== 200) {
            console.error(`SaleDetailAssembler error — status: ${response.status}, message: ${response.statusText}`);
            return [];
        }
        const resources = response.data instanceof Array ? response.data : response.data['saleDetails'];
        return resources.map(resource => this.toEntityFromResource(resource));
    }
}