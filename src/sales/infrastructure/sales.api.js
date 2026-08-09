import { BaseApi }      from '../../shared/infrastructure/base-api.js';
import { BaseEndpoint } from '../../shared/infrastructure/base-endpoint.js';

const salesEndpointPath       = import.meta.env.VITE_SALES_ENDPOINT_PATH;
const saleDetailsEndpointPath = import.meta.env.VITE_SALE_DETAILS_ENDPOINT_PATH;
const customersEndpointPath   = import.meta.env.VITE_CUSTOMERS_ENDPOINT_PATH;

/**
 * Infrastructure gateway for the Sales & POS Management bounded-context endpoints.
 *
 * Responsibilities:
 * - Wraps all HTTP calls for Sales, SaleDetails, and Customers.
 * - Delegates CRUD to BaseEndpoint instances; one per resource path.
 * - Cancellation is performed via a PATCH/PUT (status update) because
 *   the mock API does not support a dedicated /cancel endpoint.
 *
 * @class SalesApi
 * @extends BaseApi
 */
export class SalesApi extends BaseApi {
    /** @type {BaseEndpoint} @private */
    #salesEndpoint;

    /** @type {BaseEndpoint} @private */
    #saleDetailsEndpoint;

    /** @type {BaseEndpoint} @private */
    #customersEndpoint;

    /**
     * Creates endpoint clients for sales, sale details, and customers.
     */
    constructor() {
        super();
        this.#salesEndpoint       = new BaseEndpoint(this, salesEndpointPath);
        this.#saleDetailsEndpoint = new BaseEndpoint(this, saleDetailsEndpointPath);
        this.#customersEndpoint   = new BaseEndpoint(this, customersEndpointPath);
    }

    // ─── Sales ────────────────────────────────────────────────────────────────

    /**
     * Fetches all sales for a given business.
     * @param {number|string} businessId - Business identifier.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getSales(businessId) {
        return this.#salesEndpoint.getAllByParam('businessId', businessId);
    }

    /**
     * Fetches a single sale by its identifier.
     * @param {number|string} id - Sale identifier.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getSaleById(id) {
        return this.#salesEndpoint.getById(id);
    }

    /**
     * Creates a sale atomically with all of its lines embedded.
     * The backend validates stock, decrements it, and persists the sale
     * already PAID in one request (CreateSaleCommand) — there is no
     * standalone endpoint to persist a line item separately.
     * @param {Object} resource - { customerId, paymentMethod, currency, description, lines }.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    createSale(resource) {
        return this.#salesEndpoint.create(resource);
    }

    /**
     * Updates an existing sale's status (e.g., PAID → CANCELLED).
     * @param {number|string} id - Sale identifier.
     * @param {Object} resource - Updated sale resource payload.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    updateSale(id, resource) {
        return this.#salesEndpoint.update(id, resource);
    }

    // ─── Sale Details ─────────────────────────────────────────────────────────

    /**
     * Fetches the lines of a sale. Read-only: a sale's lines are always
     * created atomically with the sale itself (see createSale) — the
     * backend has no endpoint to create or delete a line independently.
     * @param {number|string} saleId - Sale identifier.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getSaleDetailsBySale(saleId) {
        return this.#saleDetailsEndpoint.getAllByParam('saleId', saleId);
    }

    // ─── Customers ────────────────────────────────────────────────────────────

    /**
     * Fetches all customers for a given business.
     * @param {number|string} businessId - Business identifier.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getCustomers(businessId) {
        return this.#customersEndpoint.getAllByParam('businessId', businessId);
    }

    /**
     * Fetches a single customer by its identifier.
     * @param {number|string} id - Customer identifier.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getCustomerById(id) {
        return this.#customersEndpoint.getById(id);
    }

    /**
     * Creates a new customer resource.
     * @param {Object} resource - Customer resource payload.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    createCustomer(resource) {
        return this.#customersEndpoint.create(resource);
    }

    /**
     * Updates an existing customer resource by its identifier.
     * @param {number|string} id - Customer identifier.
     * @param {Object} resource - Updated customer resource payload.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    updateCustomer(id, resource) {
        return this.#customersEndpoint.update(id, resource);
    }

    /**
     * Deletes a customer resource by its identifier.
     * Business rule: the store must verify no OPEN sales reference this customer before calling.
     * @param {number|string} id - Customer identifier.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    deleteCustomer(id) {
        return this.#customersEndpoint.delete(id);
    }
}