import { BaseApi }      from '../../shared/infrastructure/base-api.js';
import { BaseEndpoint } from '../../shared/infrastructure/base-endpoint.js';

const categoriesEndpointPath = import.meta.env.VITE_CATEGORIES_ENDPOINT_PATH;

/**
 * Infrastructure gateway for the product category catalog (X6 #5) — a
 * per-business list of category names, fed to the product form's dropdown
 * instead of a hardcoded/free-text list.
 * @class CategoryApi
 * @extends BaseApi
 */
export class CategoryApi extends BaseApi {
    /** @type {BaseEndpoint} @private */
    #categoriesEndpoint;

    constructor() {
        super();
        this.#categoriesEndpoint = new BaseEndpoint(this, categoriesEndpointPath);
    }

    /**
     * Fetches every category in the authenticated business's catalog.
     * Unpaged — a business realistically has a handful of these, not
     * hundreds, so there's no paginated counterpart on the backend.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getCategories() {
        return this.#categoriesEndpoint.getAll();
    }

    /**
     * Quick-creates a category from just a name.
     * @param {{name: string}} resource
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    createCategory(resource) {
        return this.#categoriesEndpoint.create(resource);
    }
}
