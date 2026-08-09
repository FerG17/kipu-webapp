import { BaseApi }      from '../../shared/infrastructure/base-api.js';
import { BaseEndpoint } from '../../shared/infrastructure/base-endpoint.js';

const salesEndpointPath     = import.meta.env.VITE_SALES_ENDPOINT_PATH;
const saleDetailsEndpointPath = import.meta.env.VITE_SALE_DETAILS_ENDPOINT_PATH;

/**
 * Infrastructure gateway for the Dashboard & Analytics bounded-context endpoints.
 * Reads sales to populate the weekly-revenue chart.
 *
 * @class DashboardApi
 * @extends BaseApi
 */
export class DashboardApi extends BaseApi {
    /** @type {BaseEndpoint} @private */
    #salesEndpoint;
    /** @type {BaseEndpoint} @private */
    #saleDetailsEndpoint;

    constructor() {
        super();
        this.#salesEndpoint      = new BaseEndpoint(this, salesEndpointPath);
        this.#saleDetailsEndpoint = new BaseEndpoint(this, saleDetailsEndpointPath);
    }

    /**
     * Fetches all sales for a given business.
     * @param {number|string} businessId
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getSales(businessId) {
        return this.#salesEndpoint.getAllByParam('businessId', businessId);
    }

    /**
     * Fetches the sale detail lines belonging to a single sale.
     * Used to compute revenue per weekday, scoped one sale at a time so no
     * other business's sale-line data is ever requested.
     * @param {number|string} saleId
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getSaleDetailsBySale(saleId) {
        return this.#saleDetailsEndpoint.getAllByParam('saleId', saleId);
    }
}
