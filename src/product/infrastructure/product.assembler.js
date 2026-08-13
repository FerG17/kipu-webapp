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

    /**
     * Builds the exact payload the real backend accepts for create/update
     * (`CreateProductResource`/`UpdateProductResource`: Name, Description,
     * Category, BasePrice — nothing else). The Product entity legitimately
     * carries id/businessId/status too, but those come from the JWT or the
     * URL, not the body; sending them used to just be silently ignored by
     * the backend's model binding, not a functional bug, but it contradicted
     * the project's own documented rule that BusinessId never goes in a body.
     * @param {import('../domain/model/product.entity.js').Product} product
     * @returns {Object}
     */
    static toResourceFromEntity(product) {
        return {
            name:        product.name,
            description: product.description,
            category:    product.category,
            basePrice:   product.basePrice,
            barcode:     product.barcode || null
        };
    }
}