/**
 * Reusable endpoint client providing standard CRUD operations over a resource collection.
 * Each bounded-context API class composes one or more BaseEndpoint instances,
 * one per resource path.
 *
 * @class BaseEndpoint
 */
export class BaseEndpoint {
    /**
     * @param {import('./base-api.js').BaseApi} baseApi - Configured API client owner.
     * @param {string} endpointPath - Relative resource path (e.g. '/products').
     */
    constructor(baseApi, endpointPath) {
        this.http = baseApi.http;
        this.endpointPath = endpointPath;
    }

    /**
     * Fetches all resources from the endpoint.
     * @returns {Promise<import('axios').AxiosResponse>} HTTP response with the resource collection.
     */
    getAll() {
        return this.http.get(this.endpointPath);
    }

    /**
     * Fetches a single resource by its identifier.
     * @param {string|number} id - Resource identifier.
     * @returns {Promise<import('axios').AxiosResponse>} HTTP response with the resource.
     */
    getById(id) {
        return this.http.get(`${this.endpointPath}/${id}`);
    }

    /**
     * Fetches resources filtered by a single query parameter.
     * Useful for filtering by foreign key (e.g. businessId, supplierId).
     * @param {string} paramName - Query parameter name.
     * @param {string|number} paramValue - Query parameter value.
     * @returns {Promise<import('axios').AxiosResponse>} HTTP response with the filtered collection.
     */
    getAllByParam(paramName, paramValue) {
        return this.http.get(`${this.endpointPath}?${paramName}=${paramValue}`);
    }

    /**
     * Fetches a page of a collection endpoint (X4 S3: every collection GET
     * is now paginated server-side, capped at 200 rows per request). Pass
     * any combination of `page`, `pageSize`, and the endpoint's own filters
     * as a single params object. The response body is a paginated envelope:
     * { items, page, pageSize, totalCount, totalPages }.
     * @param {Object} [params] - Query parameters, e.g. { pageSize: 200, category }.
     * @returns {Promise<import('axios').AxiosResponse>} HTTP response with the paginated envelope.
     */
    getPage(params = {}) {
        return this.http.get(this.endpointPath, { params });
    }

    /**
     * Fetches a sub-path of this endpoint (e.g. '/filtered') with query
     * parameters — for a GET action that isn't page/id-based.
     * @param {string} subPath - Appended directly to endpointPath, e.g. '/filtered'.
     * @param {Object} [params] - Query parameters.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getWithParams(subPath, params = {}) {
        return this.http.get(`${this.endpointPath}${subPath}`, { params });
    }

    /**
     * Creates a new resource.
     * @param {Object} resource - Resource payload to persist.
     * @returns {Promise<import('axios').AxiosResponse>} HTTP response with the created resource.
     */
    create(resource) {
        return this.http.post(this.endpointPath, resource);
    }

    /**
     * Updates an existing resource by its identifier.
     * @param {string|number} id - Resource identifier.
     * @param {Object} resource - Updated resource payload.
     * @returns {Promise<import('axios').AxiosResponse>} HTTP response with the updated resource.
     */
    update(id, resource) {
        return this.http.patch(`${this.endpointPath}/${id}`, resource);
    }

    /**
     * Deletes a resource by its identifier.
     * @param {string|number} id - Resource identifier.
     * @returns {Promise<import('axios').AxiosResponse>} HTTP response for the delete operation.
     */
    delete(id) {
        return this.http.delete(`${this.endpointPath}/${id}`);
    }
}
