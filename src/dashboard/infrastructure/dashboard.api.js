import { BaseApi } from '../../shared/infrastructure/base-api.js';

const dashboardEndpointPath = import.meta.env.VITE_DASHBOARD_ENDPOINT_PATH ?? '/dashboard';
const reportsEndpointPath   = import.meta.env.VITE_REPORTS_ENDPOINT_PATH ?? '/reports';

/**
 * Infrastructure gateway for the Dashboard & Analytics bounded-context
 * endpoints — live KPIs/charts (DashboardController) and the persisted
 * report history (ReportsController). Both are Admin-only server-side.
 *
 * @class DashboardApi
 * @extends BaseApi
 */
export class DashboardApi extends BaseApi {
    /**
     * The 6 live business KPIs.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getKpis() {
        return this.http.get(`${dashboardEndpointPath}/kpis`);
    }

    /**
     * Daily sales totals. Defaults to the last 7 days server-side when both
     * dates are omitted.
     * @param {string} [dateFrom] - 'yyyy-mm-dd'.
     * @param {string} [dateTo]   - 'yyyy-mm-dd'.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getSalesByDay(dateFrom, dateTo) {
        const params = new URLSearchParams();
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo)   params.set('dateTo', dateTo);
        const query = params.toString();
        return this.http.get(`${dashboardEndpointPath}/sales-by-day${query ? `?${query}` : ''}`);
    }

    /**
     * Top products ranked by real current stock.
     * @param {number} count
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getTopStockProducts(count) {
        return this.http.get(`${dashboardEndpointPath}/top-stock-products?count=${count}`);
    }

    /**
     * Fetches the current business's generated-report history.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getReports() {
        return this.http.get(reportsEndpointPath);
    }

    /**
     * Generates a report — its metadata is persisted server-side; the
     * figures themselves are only computed when it's exported.
     * @param {Object} resource - { type, dateFrom?, dateTo?, productId?, supplierId? }
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    generateReport(resource) {
        return this.http.post(reportsEndpointPath, resource);
    }

    /**
     * Downloads a report as CSV, re-running its live query server-side.
     * `responseType: 'blob'` is required so Axios hands back the raw file
     * instead of trying to parse it as JSON.
     * @param {number|string} id
     * @returns {Promise<import('axios').AxiosResponse<Blob>>}
     */
    exportReportCsv(id) {
        return this.http.get(`${reportsEndpointPath}/${id}/export`, { responseType: 'blob' });
    }

    /**
     * Downloads a report as PDF — only STOCK_MOVEMENTS reports support this
     * server-side (400 for any other type).
     * @param {number|string} id
     * @returns {Promise<import('axios').AxiosResponse<Blob>>}
     */
    exportReportPdf(id) {
        return this.http.get(`${reportsEndpointPath}/${id}/export/pdf`, { responseType: 'blob' });
    }
}
