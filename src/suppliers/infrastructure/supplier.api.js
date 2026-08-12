import { BaseApi }      from '../../shared/infrastructure/base-api.js';
import { BaseEndpoint } from '../../shared/infrastructure/base-endpoint.js';

const suppliersEndpointPath      = import.meta.env.VITE_SUPPLIERS_ENDPOINT_PATH;
const purchasesEndpointPath      = import.meta.env.VITE_PURCHASES_ENDPOINT_PATH;
const purchaseDetailsEndpointPath = import.meta.env.VITE_PURCHASE_DETAILS_ENDPOINT_PATH;

/**
 * Infrastructure gateway for the Supplier & Replenishment Management bounded-context endpoints.
 *
 * Exposes CRUD operations for:
 *  - Suppliers      → /suppliers
 *  - Purchases      → /purchases  (purchase orders)
 *  - PurchaseDetails → /purchaseDetails (order line items)
 *
 * @class SupplierApi
 * @extends BaseApi
 */
export class SupplierApi extends BaseApi {
    /** @type {BaseEndpoint} @private */
    #suppliersEndpoint;
    /** @type {BaseEndpoint} @private */
    #purchasesEndpoint;
    /** @type {BaseEndpoint} @private */
    #purchaseDetailsEndpoint;

    constructor() {
        super();
        this.#suppliersEndpoint       = new BaseEndpoint(this, suppliersEndpointPath);
        this.#purchasesEndpoint        = new BaseEndpoint(this, purchasesEndpointPath);
        this.#purchaseDetailsEndpoint  = new BaseEndpoint(this, purchaseDetailsEndpointPath);
    }

    // ─── Supplier operations ──────────────────────────────────────────────────

    /**
     * Fetches all suppliers for the authenticated business. Scoped
     * server-side by the JWT — SuppliersController.GetSuppliers has no
     * query parameters at all.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getSuppliers() {
        return this.#suppliersEndpoint.getAll();
    }

    /**
     * Fetches a single supplier by its identifier.
     * @param {number|string} id
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getSupplierById(id) {
        return this.#suppliersEndpoint.getById(id);
    }

    /**
     * Creates a new supplier resource.
     * @param {Object} resource
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    createSupplier(resource) {
        return this.#suppliersEndpoint.create(resource);
    }

    /**
     * Updates an existing supplier resource.
     * @param {number|string} id
     * @param {Object} resource
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    updateSupplier(id, resource) {
        return this.#suppliersEndpoint.update(id, resource);
    }

    /**
     * Deactivates (soft-deletes) a supplier via the dedicated DELETE endpoint,
     * which flips its Status to INACTIVE server-side. Business rule: suppliers
     * with active pending orders cannot be deactivated; the store layer must
     * verify this before calling this method. Note this is NOT a PATCH — the
     * edit endpoint's UpdateSupplierResource has no Status field at all, so a
     * PATCH with status: 'INACTIVE' would return 200 while silently leaving
     * the supplier active.
     * @param {number|string} id
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    deactivateSupplier(id) {
        return this.#suppliersEndpoint.delete(id);
    }

    // ─── Purchase order operations ────────────────────────────────────────────

    /**
     * Fetches all purchase orders for the authenticated business. Scoped
     * server-side by the JWT — PurchasesController.GetPurchaseOrders only
     * ever reads an optional `?supplierId=`, never a businessId parameter.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getPurchaseOrders() {
        return this.#purchasesEndpoint.getAll();
    }

    /**
     * Fetches all purchase orders for a specific supplier.
     * @param {number|string} supplierId
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getPurchaseOrdersBySupplier(supplierId) {
        return this.#purchasesEndpoint.getAllByParam('supplierId', supplierId);
    }

    /**
     * Fetches a single purchase order by its identifier.
     * @param {number|string} id
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getPurchaseOrderById(id) {
        return this.#purchasesEndpoint.getById(id);
    }

    /**
     * Creates a purchase order atomically with all of its lines embedded.
     * There is no standalone endpoint to persist a line item separately —
     * a purchase order's lines are always created together with the order
     * itself (CreatePurchaseOrderCommand).
     * @param {Object} resource - { supplierId, date, expectedDate, currency, description, lines }.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    createPurchaseOrder(resource) {
        return this.#purchasesEndpoint.create(resource);
    }

    /**
     * Updates an existing purchase order (e.g. changing its status).
     * @param {number|string} id
     * @param {Object} resource
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    updatePurchaseOrder(id, resource) {
        return this.#purchasesEndpoint.update(id, resource);
    }

    // ─── Purchase detail operations ───────────────────────────────────────────

    /**
     * Fetches the lines of a purchase order. Read-only: a purchase order's
     * lines are always created atomically with the order itself (see
     * createPurchaseOrder) — the backend has no endpoint to create or delete
     * a line independently.
     * @param {number|string} purchaseId
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getPurchaseDetailsByOrder(purchaseId) {
        return this.#purchaseDetailsEndpoint.getAllByParam('purchaseId', purchaseId);
    }
}
