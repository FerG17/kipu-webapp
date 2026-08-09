import { Product } from '../domain/model/product.entity.js';

/**
 * Maps raw API resources into Product domain entities.
 * @class ProductAssembler
 */
export class ProductAssembler {
    /**
     * @param {Object} resource
     * @returns {Product}
     */
    static toEntityFromResource(resource) {
        return new Product({ ...resource });
    }

    /**
     * @param {import('axios').AxiosResponse} response
     * @returns {Product[]}
     */
    static toEntitiesFromResponse(response) {
        if (response.status !== 200) {
            console.error(`ProductAssembler error — status: ${response.status}, message: ${response.statusText}`);
            return [];
        }
        const resources = response.data instanceof Array ? response.data : response.data['products'];
        return resources.map(resource => this.toEntityFromResource(resource));
    }
}