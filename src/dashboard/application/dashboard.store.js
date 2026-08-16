/**
 * Application service store for the Dashboard & Analytics bounded context.
 * Every figure here — KPIs, the weekly chart, top-stock, report history and
 * exports — is fetched from the real backend (DashboardController /
 * ReportsController), which itself composes Product/Inventory/Sales live,
 * never from a snapshot. This store used to compute all of this client-side
 * from whatever Product/Sales data happened to already be loaded in the
 * browser, which both duplicated business logic that already exists
 * server-side and quietly broke for any role that couldn't read Sales.
 * Both controllers are Admin-only server-side (see dashboardForbidden below).
 *
 * @module useDashboardStore
 */
import { defineStore }  from 'pinia';
import { computed, ref } from 'vue';
import { DashboardApi }       from '../infrastructure/dashboard.api.js';
import { ReportAssembler }    from '../infrastructure/report.assembler.js';
import { Report }             from '../domain/model/report.entity.js';
import { parseLocalDate }     from '../../product/application/product.store.js';

const dashboardApi = new DashboardApi();

/** @param {*} error @returns {boolean} */
function isForbidden(error) {
    return error?.response?.status === 403;
}

/**
 * Triggers a browser download for a blob response — same
 * Blob/createObjectURL/`<a download>` mechanism this store already used for
 * the old client-generated CSV, just fed by a real server response now.
 * @param {Blob} blob
 * @param {string} filename
 */
function downloadBlob(blob, filename) {
    const downloadUrl = URL.createObjectURL(blob);
    const anchorElement = document.createElement('a');
    anchorElement.href = downloadUrl;
    anchorElement.download = filename;
    anchorElement.click();
    URL.revokeObjectURL(downloadUrl);
}

/**
 * Reactive store that exposes Dashboard & Analytics commands and queries.
 * @returns {Object} Store state and actions.
 */
const useDashboardStore = defineStore('dashboard', () => {

    /** @type {import('vue').Ref<Object|null>} */
    const kpis = ref(null);
    /** @type {import('vue').Ref<boolean>} */
    const kpisLoaded = ref(false);

    /**
     * True once any Dashboard/Reports request has come back 403 — both
     * controllers are Admin-only server-side, so this single flag covers
     * every fetch in this store (kpis, salesByDay, topStockProducts,
     * reports), not just one card the way the old sales-only banner did.
     * @type {import('vue').Ref<boolean>}
     */
    const dashboardForbidden = ref(false);

    /**
     * Aggregated sales per weekday for the requested range (defaults to the
     * last 7 days server-side). Each entry: { dayIndex, totalAmount,
     * barHeightPercent }. dayIndex is 0=Monday..6=Sunday; the presentation
     * layer translates it to a label via i18n so this stays locale-agnostic.
     * @type {import('vue').Ref<Array>}
     */
    const salesByDay = ref([]);

    /** @type {import('vue').Ref<Array>} */
    const topStockProducts = ref([]);
    /** @type {import('vue').Ref<boolean>} */
    const topStockLoaded = ref(false);

    /** @type {import('vue').Ref<Report[]>} */
    const reports = ref([]);

    /** @type {import('vue').Ref<boolean>} */
    const reportsLoaded = ref(false);

    /** @type {import('vue').Ref<Error[]>} */
    const errors = ref([]);

    /** @type {import('vue').ComputedRef<number>} */
    const reportsCount = computed(() => reports.value.length);

    // ─── Queries ──────────────────────────────────────────────────────────────

    /**
     * The 6 live business KPI cards.
     */
    function fetchKpis() {
        return dashboardApi.getKpis()
            .then(response => {
                kpis.value = response.data;
                kpisLoaded.value = true;
                dashboardForbidden.value = false;
            })
            .catch(error => {
                kpisLoaded.value = true;
                if (isForbidden(error)) { dashboardForbidden.value = true; return; }
                errors.value.push(error);
            });
    }

    /**
     * Fetches daily sales totals and computes salesByDay for the chart.
     *
     * Business rules:
     * - barHeightPercent is scaled so the day with maximum revenue = 100%.
     * - Days with zero sales render with totalAmount = 0 and barHeightPercent = 0.
     * @param {string} [dateFrom] - 'yyyy-mm-dd'; server defaults to 6 days back.
     * @param {string} [dateTo]   - 'yyyy-mm-dd'; server defaults to today.
     */
    function fetchSalesByDay(dateFrom, dateTo) {
        return dashboardApi.getSalesByDay(dateFrom, dateTo)
            .then(response => {
                const days = response.data instanceof Array ? response.data : [];

                const dayEntries = days.map(entry => {
                    // getDay() returns 0=Sunday...6=Saturday; remap to 0=Monday
                    const jsDay       = parseLocalDate(entry.date).getDay();
                    const mondayIndex = (jsDay + 6) % 7;
                    return { dayIndex: mondayIndex, totalAmount: entry.total };
                });

                const maxAmount = Math.max(0, ...dayEntries.map(entry => entry.totalAmount));
                salesByDay.value = dayEntries.map(entry => ({
                    ...entry,
                    barHeightPercent: maxAmount > 0 ? Math.round((entry.totalAmount / maxAmount) * 100) : 0
                }));
                dashboardForbidden.value = false;
            })
            .catch(error => {
                if (isForbidden(error)) { dashboardForbidden.value = true; return; }
                errors.value.push(error);
            });
    }

    /**
     * Top products ranked by real current stock.
     * @param {number} [count=5]
     */
    function fetchTopStockProducts(count = 5) {
        return dashboardApi.getTopStockProducts(count)
            .then(response => {
                topStockProducts.value = response.data instanceof Array ? response.data : [];
                topStockLoaded.value = true;
                dashboardForbidden.value = false;
            })
            .catch(error => {
                topStockLoaded.value = true;
                if (isForbidden(error)) { dashboardForbidden.value = true; return; }
                errors.value.push(error);
            });
    }

    /**
     * Fetches the current business's generated-report history.
     */
    function fetchReports() {
        return dashboardApi.getReports()
            .then(response => {
                reports.value = ReportAssembler.toEntitiesFromResponse(response);
                reportsLoaded.value = true;
                dashboardForbidden.value = false;
            })
            .catch(error => {
                reportsLoaded.value = true;
                if (isForbidden(error)) { dashboardForbidden.value = true; return; }
                errors.value.push(error);
            });
    }

    // ─── Commands ─────────────────────────────────────────────────────────────

    /**
     * Generates a report — persists its metadata server-side (its actual
     * figures are only computed when exported, never here). Appends the
     * real, server-assigned report to the history on success.
     * @param {Object} resource - { type, dateFrom?, dateTo?, productId?, supplierId? }
     * @returns {Promise<Report>}
     */
    function generateReport(resource) {
        return dashboardApi.generateReport(resource)
            .then(response => {
                const report = ReportAssembler.toEntityFromResource(response.data);
                reports.value.push(report);
                reportsLoaded.value = true;
                return report;
            });
    }

    /**
     * Downloads a report as a formatted .xlsx workbook, re-running its live
     * query server-side.
     * @param {number|string} reportId
     */
    function downloadReportExcel(reportId) {
        return dashboardApi.exportReportExcel(reportId)
            .then(response => downloadBlob(response.data, `report-${reportId}.xlsx`))
            .catch(error => { errors.value.push(error); throw error; });
    }

    /**
     * Downloads a report as PDF — only STOCK_MOVEMENTS reports support this
     * server-side (400 for any other type).
     * @param {number|string} reportId
     */
    function downloadReportPdf(reportId) {
        return dashboardApi.exportReportPdf(reportId)
            .then(response => downloadBlob(response.data, `report-${reportId}.pdf`))
            .catch(error => { errors.value.push(error); throw error; });
    }

    return {
        kpis,
        kpisLoaded,
        dashboardForbidden,
        salesByDay,
        topStockProducts,
        topStockLoaded,
        reports,
        reportsLoaded,
        reportsCount,
        errors,
        fetchKpis,
        fetchSalesByDay,
        fetchTopStockProducts,
        fetchReports,
        generateReport,
        downloadReportExcel,
        downloadReportPdf
    };
});

export default useDashboardStore;
