import { BaseApi }      from '../../shared/infrastructure/base-api.js';
import { BaseEndpoint } from '../../shared/infrastructure/base-endpoint.js';

const productsEndpointPath       = import.meta.env.VITE_PRODUCTS_ENDPOINT_PATH;
const inventoriesEndpointPath    = import.meta.env.VITE_INVENTORIES_ENDPOINT_PATH;
const batchesEndpointPath        = import.meta.env.VITE_BATCHES_ENDPOINT_PATH;
const warehousesEndpointPath     = import.meta.env.VITE_WAREHOUSES_ENDPOINT_PATH;
const suppliersEndpointPath      = import.meta.env.VITE_SUPPLIERS_ENDPOINT_PATH;
const stockMovementsEndpointPath = import.meta.env.VITE_STOCK_MOVEMENTS_ENDPOINT_PATH;

/**
 * Infrastructure gateway for the Product & Inventory Management bounded-context endpoints.
 *
 * @class ProductApi
 * @extends BaseApi
 */
export class ProductApi extends BaseApi {
    /** @type {BaseEndpoint} @private */
    #productsEndpoint;
    /** @type {BaseEndpoint} @private */
    #inventoriesEndpoint;
    /** @type {BaseEndpoint} @private */
    #batchesEndpoint;
    /** @type {BaseEndpoint} @private */
    #warehousesEndpoint;
    /** @type {BaseEndpoint} @private */
    #suppliersEndpoint;
    /** @type {BaseEndpoint} @private */
    #stockMovementsEndpoint;

    constructor() {
        super();
        this.#productsEndpoint       = new BaseEndpoint(this, productsEndpointPath);
        this.#inventoriesEndpoint    = new BaseEndpoint(this, inventoriesEndpointPath);
        this.#batchesEndpoint        = new BaseEndpoint(this, batchesEndpointPath);
        this.#warehousesEndpoint     = new BaseEndpoint(this, warehousesEndpointPath);
        this.#suppliersEndpoint      = new BaseEndpoint(this, suppliersEndpointPath);
        this.#stockMovementsEndpoint = new BaseEndpoint(this, stockMovementsEndpointPath);
    }

    /**
     * Fetches all products for the authenticated business. Scoped server-side
     * by the JWT — ProductsController.GetProducts has no businessId query
     * parameter at all (a stray `?businessId=` used to be sent here and was
     * simply ignored by ASP.NET's model binding).
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getProducts() {
        return this.#productsEndpoint.getAll();
    }

    /**
     * Fetches a single product by its identifier.
     * @param {number|string} id
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getProductById(id) {
        return this.#productsEndpoint.getById(id);
    }

    /**
     * Creates a new product resource.
     * @param {Object} resource
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    createProduct(resource) {
        return this.#productsEndpoint.create(resource);
    }

    /**
     * Updates an existing product resource.
     * @param {number|string} id
     * @param {Object} resource
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    updateProduct(id, resource) {
        return this.#productsEndpoint.update(id, resource);
    }

    /**
     * Deletes a product by its identifier.
     * Business rule: the store must verify no stock exists before calling this.
     * @param {number|string} id
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    deleteProduct(id) {
        return this.#productsEndpoint.delete(id);
    }

    /**
     * Fetches every product for the business, active and inactive alike —
     * GetProducts only returns active ones by default. Used to build the
     * "reactivate a deactivated product" screen.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getAllProductsIncludingInactive() {
        return this.#productsEndpoint.getAllByParam('includeInactive', true);
    }

    /**
     * Reactivates a previously deactivated product (undoes DeleteProduct's
     * soft delete).
     * @param {number|string} id
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    activateProduct(id) {
        return this.http.post(`${productsEndpointPath}/${id}/activate`);
    }

    /**
     * Fetches all inventory records for the authenticated business. Scoped
     * server-side by the JWT — InventoriesController only ever reads
     * `?productId=`, never a businessId query parameter.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getInventory() {
        return this.#inventoriesEndpoint.getAll();
    }

    /**
     * Fetches inventory records for a specific product.
     * @param {number|string} productId
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getInventoryByProduct(productId) {
        return this.#inventoriesEndpoint.getAllByParam('productId', productId);
    }

    /**
     * Updates a product's minimum stock threshold via the backend's
     * dedicated command endpoint (PATCH /inventories/{productId}/minimum-stock).
     * There is no generic PATCH /inventories/{id} on the real backend.
     * @param {number|string} productId
     * @param {Object} resource
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    updateMinimumStock(productId, resource) {
        return this.http.patch(`${inventoriesEndpointPath}/${productId}/minimum-stock`, resource);
    }

    /**
     * Registers a stock intake for a product via the dedicated backend
     * command endpoint — sums into the existing InventoryItem (per
     * product+warehouse) or creates one, and records the StockMovement,
     * all server-side and atomically. Replaces the old client-orchestrated
     * "GET, then PUT-or-POST, then separately log a movement" sequence the
     * mock API required.
     * @param {number|string} productId
     * @param {Object} resource
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    registerStockIntake(productId, resource) {
        return this.http.post(`${productsEndpointPath}/${productId}/stock-intake`, resource);
    }

    /**
     * Fetches all batches for a specific product.
     * Batches are used to derive INTAKE stock movements client-side.
     * @param {number|string} productId
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getBatchesByProduct(productId) {
        return this.#batchesEndpoint.getAllByParam('productId', productId);
    }

    /**
     * Creates a new batch resource for a product.
     * @param {Object} resource
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    createBatch(resource) {
        return this.#batchesEndpoint.create(resource);
    }

    /**
     * Discards a batch whose goods left the shelf (thrown out, returned) —
     * this is what stops an expired batch from alerting forever.
     * @param {number|string} batchId
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    discardBatch(batchId) {
        return this.http.post(`${batchesEndpointPath}/${batchId}/discard`);
    }

    /**
     * Fetches all batches across every product.
     * Batch resources carry no businessId of their own, so scoping to the
     * authenticated business is done client-side by matching productId
     * against the already-loaded, business-scoped products list.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getAllBatches() {
        return this.#batchesEndpoint.getAll();
    }

    /**
     * Fetches all warehouses for the authenticated business. Scoped
     * server-side by the JWT — WarehousesController has no query parameters
     * at all.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getWarehouses() {
        return this.#warehousesEndpoint.getAll();
    }

    /**
     * Creates a new warehouse for a business.
     * @param {Object} resource
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    createWarehouse(resource) {
        return this.#warehousesEndpoint.create(resource);
    }

    /**
     * Fetches all suppliers for the authenticated business.
     * Used to populate the supplier dropdown in the stock intake form.
     * Scoped server-side by the JWT.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getSuppliers() {
        return this.#suppliersEndpoint.getAll();
    }

    /**
     * Fetches all stock movement records for the authenticated business.
     * Scoped server-side by the JWT — StockMovementsController has no query
     * parameters at all.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getStockMovements() {
        return this.#stockMovementsEndpoint.getAll();
    }
}