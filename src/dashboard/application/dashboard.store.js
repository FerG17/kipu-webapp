/**
 * Application service store for the Dashboard & Analytics bounded context.
 * Coordinates sales and report use cases. KPIs are computed live from the
 * Product and Sales bounded contexts' own stores (see liveMetrics below)
 * instead of a static pre-seeded snapshot — that snapshot never changed as
 * real products/inventory/sales did, so every KPI reading it (total
 * products, inventory value, total sales, stock health) was stale by
 * construction. Alerts are likewise sourced directly from the Alerts
 * bounded context's own store (see alerts.store.js's fetchAlerts), which the
 * real backend now persists and evaluates entirely server-side.
 *
 * @module useDashboardStore
 */
import { defineStore }  from 'pinia';
import { computed, ref } from 'vue';
import { DashboardApi }     from '../infrastructure/dashboard.api.js';
import { Report, ReportType } from '../domain/model/report.entity.js';
import { ReportFilters }      from '../domain/model/report-filters.entity.js';
import useProductStore, { parseLocalDate } from '../../product/application/product.store.js';
import useSalesStore          from '../../sales/application/sales.store.js';

const dashboardApi = new DashboardApi();

/**
 * Current-state product/inventory figures — never date-scoped, since this
 * mock has no historical inventory snapshots to report "as of" a past date;
 * these always reflect right-now, regardless of any report date range.
 * @returns {{totalProducts: number, lowStockProducts: number, inventoryValue: number, stockHealthPercentage: number}}
 */
function currentStockMetrics() {
    const productStore = useProductStore();

    const totalProducts    = productStore.products.length;
    const lowStockProducts = productStore.inventory.filter(item => item.isLowStock).length;
    const inventoryValue   = productStore.inventory.reduce((sum, item) => {
        const product = productStore.getProductById(item.productId);
        return sum + item.currentStock * (product?.basePrice ?? 0);
    }, 0);

    return {
        totalProducts,
        lowStockProducts,
        inventoryValue: Math.round(inventoryValue * 100) / 100,
        stockHealthPercentage: totalProducts === 0
            ? 100
            : Math.round(((totalProducts - lowStockProducts) / totalProducts) * 100)
    };
}

/**
 * Sales-derived figures for PAID sales whose date falls within
 * [startDate, endDate] (inclusive, local dates) — or all-time when either
 * bound is omitted, which is what the Panel's own KPI cards want.
 * @param {string} [startDate] - 'yyyy-mm-dd', inclusive.
 * @param {string} [endDate]   - 'yyyy-mm-dd', inclusive.
 * @returns {{totalSales: number, salesCount: number, averageSaleValue: number}}
 */
function salesMetricsInRange(startDate, endDate) {
    const salesStore = useSalesStore();

    const rangeStart = startDate ? parseLocalDate(startDate) : null;
    const rangeEnd   = endDate   ? parseLocalDate(endDate)   : null;
    if (rangeEnd) rangeEnd.setHours(23, 59, 59, 999); // inclusive through end of that day

    const scopedSales = salesStore.sales.filter(sale => {
        if (sale.status !== 'PAID') return false;
        const saleDate = new Date(sale.date);
        if (rangeStart && saleDate < rangeStart) return false;
        if (rangeEnd && saleDate > rangeEnd) return false;
        return true;
    });

    const totalSales = Math.round(scopedSales.reduce((sum, sale) => sum + sale.subtotal, 0) * 100) / 100;
    const salesCount = scopedSales.length;

    return {
        totalSales,
        salesCount,
        averageSaleValue: salesCount === 0 ? 0 : Math.round((totalSales / salesCount) * 100) / 100
    };
}

/** @param {number} value @returns {number} */
function round2(value) {
    return Math.round(value * 100) / 100;
}

/**
 * Column keys per report type, in display order — shared between
 * report-result.vue (maps each to a translated table header) and
 * exportReport (maps each to a plain-text CSV header via the same labels
 * the caller already supplies).
 * @type {Record<string, string[]>}
 */
const REPORT_TABLE_COLUMNS = {
    [ReportType.INVENTORY]:     ['category', 'productCount', 'totalValue'],
    [ReportType.SALES]:         ['paymentMethod', 'count', 'total'],
    [ReportType.LOW_STOCK]:     ['productName', 'warehouseId', 'currentStock', 'minimumStock', 'status'],
    [ReportType.REPLENISHMENT]: ['productName', 'warehouseId', 'currentStock', 'minimumStock', 'suggestedQuantity']
};

/**
 * Inventory report: overall stock summary plus a by-category value
 * breakdown (top 5 by inventory value) — reuses
 * productStore.getTotalInventoryForProduct so "low stock"/value here always
 * agrees with what Inventario itself shows (summed across every warehouse a
 * product is split into).
 * @param {import('../domain/model/report-filters.entity.js').ReportFilters} filters
 * @returns {{summary: Array, tableRows: Array, generatedAt: string}}
 */
function computeInventoryReport(filters) {
    const productStore = useProductStore();
    const categoryFilter = (filters?.category ?? '').trim();

    const relevantProducts = productStore.products.filter(product =>
        product.isActive && (!categoryFilter || product.category === categoryFilter)
    );

    const categoryTotals = new Map();
    let lowStockProducts = 0;
    let inventoryValue = 0;

    relevantProducts.forEach(product => {
        const totalItem    = productStore.getTotalInventoryForProduct(product.id);
        const currentStock = totalItem ? totalItem.currentStock : 0;
        const value         = currentStock * (product.basePrice ?? 0);
        inventoryValue += value;
        if (totalItem?.isLowStock) lowStockProducts += 1;

        const existing = categoryTotals.get(product.category) ?? { productCount: 0, totalValue: 0 };
        categoryTotals.set(product.category, {
            productCount: existing.productCount + 1,
            totalValue:   existing.totalValue + value
        });
    });

    const tableRows = Array.from(categoryTotals.entries())
        .map(([category, data]) => ({
            category,
            productCount: data.productCount,
            totalValue:   round2(data.totalValue)
        }))
        .sort((rowA, rowB) => rowB.totalValue - rowA.totalValue)
        .slice(0, 5);

    return {
        summary: [
            { key: 'totalProducts',    value: relevantProducts.length },
            { key: 'lowStockProducts', value: lowStockProducts },
            { key: 'inventoryValue',   value: round2(inventoryValue) },
            { key: 'stockHealth',      value: relevantProducts.length === 0
                ? 100
                : Math.round(((relevantProducts.length - lowStockProducts) / relevantProducts.length) * 100) }
        ],
        tableRows,
        generatedAt: new Date().toISOString()
    };
}

/**
 * Sales report: totals for PAID sales within the date range, plus a
 * breakdown by payment method. When a category filter is set, only sales
 * containing at least one line for a product of that category are counted
 * (their full subtotal, not prorated — this app doesn't split a sale by
 * category, only by whether it's relevant).
 * @param {import('../domain/model/report-filters.entity.js').ReportFilters} filters
 * @returns {{summary: Array, tableRows: Array, generatedAt: string}}
 */
function computeSalesReport(filters) {
    const salesStore   = useSalesStore();
    const productStore = useProductStore();
    const categoryFilter = (filters?.category ?? '').trim();

    const rangeStart = filters?.startDate ? parseLocalDate(filters.startDate) : null;
    const rangeEnd   = filters?.endDate   ? parseLocalDate(filters.endDate)   : null;
    if (rangeEnd) rangeEnd.setHours(23, 59, 59, 999);

    const scopedSales = salesStore.sales.filter(sale => {
        if (sale.status !== 'PAID') return false;
        const saleDate = new Date(sale.date);
        if (rangeStart && saleDate < rangeStart) return false;
        if (rangeEnd && saleDate > rangeEnd) return false;
        if (categoryFilter) {
            const hasCategoryLine = sale.details.some(detail => {
                const product = productStore.getProductById(detail.productId);
                return product?.category === categoryFilter;
            });
            if (!hasCategoryLine) return false;
        }
        return true;
    });

    const totalSales = round2(scopedSales.reduce((sum, sale) => sum + sale.subtotal, 0));
    const salesCount = scopedSales.length;

    const byMethod = new Map();
    scopedSales.forEach(sale => {
        const method   = sale.paymentMethod || 'UNKNOWN';
        const existing = byMethod.get(method) ?? { count: 0, total: 0 };
        byMethod.set(method, { count: existing.count + 1, total: existing.total + sale.subtotal });
    });

    const tableRows = Array.from(byMethod.entries())
        .map(([paymentMethod, data]) => ({ paymentMethod, count: data.count, total: round2(data.total) }))
        .sort((rowA, rowB) => rowB.total - rowA.total);

    return {
        summary: [
            { key: 'totalSales',       value: totalSales },
            { key: 'salesCount',       value: salesCount },
            { key: 'averageSaleValue', value: salesCount === 0 ? 0 : round2(totalSales / salesCount) }
        ],
        tableRows,
        generatedAt: new Date().toISOString()
    };
}

/**
 * Low-stock report: every real (product, warehouse) InventoryItem currently
 * at or below its minimum — including out-of-stock — listing which specific
 * warehouse each row is about (see the same per-warehouse reasoning as the
 * Alerts bounded context's WarehouseId fix).
 * @param {import('../domain/model/report-filters.entity.js').ReportFilters} filters
 * @returns {{summary: Array, tableRows: Array, generatedAt: string}}
 */
function computeLowStockReport(filters) {
    const productStore = useProductStore();
    const categoryFilter = (filters?.category ?? '').trim();

    const tableRows = [];
    productStore.inventory.forEach(item => {
        const product = productStore.getProductById(item.productId);
        if (!product || !product.isActive) return;
        if (categoryFilter && product.category !== categoryFilter) return;

        if (item.currentStock === 0) {
            tableRows.push({
                productName: product.name, warehouseId: item.warehouseId,
                currentStock: 0, minimumStock: item.minimumStock, status: 'OUT_OF_STOCK'
            });
        } else if (item.isLowStock) {
            tableRows.push({
                productName: product.name, warehouseId: item.warehouseId,
                currentStock: item.currentStock, minimumStock: item.minimumStock, status: 'LOW_STOCK'
            });
        }
    });
    tableRows.sort((rowA, rowB) => rowA.currentStock - rowB.currentStock);

    return {
        summary: [
            { key: 'outOfStockCount', value: tableRows.filter(row => row.status === 'OUT_OF_STOCK').length },
            { key: 'lowStockCount',   value: tableRows.filter(row => row.status === 'LOW_STOCK').length }
        ],
        tableRows,
        generatedAt: new Date().toISOString()
    };
}

/**
 * Replenishment report: suggests a reorder quantity per (product, warehouse)
 * that's currently low or out of stock — quantity needed to reach that
 * item's own configured minimum, or a small default (10) when out of stock
 * with no minimum configured at all (nothing to size the suggestion against).
 * @param {import('../domain/model/report-filters.entity.js').ReportFilters} filters
 * @returns {{summary: Array, tableRows: Array, generatedAt: string}}
 */
function computeReplenishmentReport(filters) {
    const productStore = useProductStore();
    const categoryFilter = (filters?.category ?? '').trim();

    const tableRows = [];
    productStore.inventory.forEach(item => {
        const product = productStore.getProductById(item.productId);
        if (!product || !product.isActive) return;
        if (categoryFilter && product.category !== categoryFilter) return;
        if (item.currentStock > 0 && !item.isLowStock) return;

        const suggestedQuantity = item.minimumStock > item.currentStock
            ? item.minimumStock - item.currentStock
            : (item.currentStock === 0 ? 10 : 0);
        if (suggestedQuantity <= 0) return;

        tableRows.push({
            productName: product.name, warehouseId: item.warehouseId,
            currentStock: item.currentStock, minimumStock: item.minimumStock, suggestedQuantity
        });
    });
    tableRows.sort((rowA, rowB) => rowB.suggestedQuantity - rowA.suggestedQuantity);

    return {
        summary: [
            { key: 'itemsToReplenish',   value: tableRows.length },
            { key: 'suggestedUnitsTotal', value: tableRows.reduce((sum, row) => sum + row.suggestedQuantity, 0) }
        ],
        tableRows,
        generatedAt: new Date().toISOString()
    };
}

/**
 * Reactive store that exposes Dashboard & Analytics commands and queries.
 * @returns {Object} Store state and actions.
 */
const useDashboardStore = defineStore('dashboard', () => {

    /**
     * Aggregated sales per weekday for the last 7 days.
     * Each entry: { dayIndex, totalAmount, barHeightPercent }. dayIndex is
     * 0=Monday..6=Sunday; the presentation layer translates it to a label
     * via i18n so the domain/application layer stays locale-agnostic.
     * @type {import('vue').Ref<Array>}
     */
    const salesByDay = ref([]);

    /** @type {import('vue').Ref<Array>} */
    const reports = ref([]);

    /** @type {import('vue').Ref<boolean>} */
    const reportsLoaded = ref(false);

    /** @type {import('vue').Ref<Error[]>} */
    const errors = ref([]);

    /** @type {import('vue').ComputedRef<number>} */
    const reportsCount = computed(() => reports.value.length);

    /**
     * Live, all-time business metrics for the Panel's own KPI cards — same
     * shape the old static /metrics snapshot had, so kpiCards didn't need to
     * change how it's consumed, only where it comes from.
     * Reports need figures scoped to a specific date range (and type) instead
     * — see computeReportData below, which this intentionally does NOT feed
     * (the Panel's "Ventas totales" is meant to be cumulative, matching
     * POS's own "Total acumulado").
     * @type {import('vue').ComputedRef<Object>}
     */
    const liveMetrics = computed(() => ({
        ...currentStockMetrics(),
        ...salesMetricsInRange(),
        generatedAt: new Date().toISOString()
    }));

    /**
     * Computes a report's actual content — unlike liveMetrics (the Panel's
     * always-cumulative KPI cards), this depends on both the report's `type`
     * (previously ignored entirely — every type rendered the exact same
     * generic inventory+sales snapshot) and its date range/category filters.
     * See computeInventoryReport/computeSalesReport/computeLowStockReport/
     * computeReplenishmentReport above for what each type actually returns.
     * @param {import('../domain/model/report.entity.js').Report} report
     * @returns {{summary: Array<{key: string, value: number}>, tableRows: Array, generatedAt: string}}
     */
    function computeReportData(report) {
        switch (report?.type) {
            case ReportType.SALES:         return computeSalesReport(report.filters);
            case ReportType.LOW_STOCK:     return computeLowStockReport(report.filters);
            case ReportType.REPLENISHMENT: return computeReplenishmentReport(report.filters);
            case ReportType.INVENTORY:
            default:                       return computeInventoryReport(report?.filters);
        }
    }

    /**
     * Column keys for a report type's detail table, in display order — the
     * presentation layer maps each to a translated header.
     * @param {string} type - A ReportType value.
     * @returns {string[]}
     */
    function getReportTableColumns(type) {
        return REPORT_TABLE_COLUMNS[type] ?? [];
    }

    // ─── Queries ──────────────────────────────────────────────────────────────

    /**
     * Finds a report entity by its identifier.
     * @param {number|string} id
     * @returns {Report|undefined}
     */
    function getReportById(id) {
        return reports.value.find(report => report.id === parseInt(id));
    }

    /**
     * Filters the in-memory report list by type.
     * Returns all reports when type is null or undefined.
     * @param {string|null} type
     * @returns {Report[]}
     */
    function filterReportsByType(type) {
        if (!type) return reports.value;
        return reports.value.filter(report => report.type === type);
    }

    // ─── Commands ─────────────────────────────────────────────────────────────

    /**
     * Re-fetches the real product, inventory and sales data liveMetrics is
     * computed from, so the "refresh" button picks up anything that changed
     * on the server since this session last loaded it (e.g. edited directly
     * in the mock, or from another tab) instead of just touching a timestamp.
     */
    function refreshMetrics() {
        const productStore = useProductStore();
        const salesStore   = useSalesStore();
        productStore.fetchProducts();
        productStore.fetchInventory();
        salesStore.fetchSales();
    }

    /**
     * Fetches sales and sale details for a business, then computes salesByDay
     * — PAID sales aggregated by weekday for the last 7 calendar days.
     *
     * Business rules:
     * - Only sales with status === 'PAID' contribute to revenue totals.
     * - Revenue per sale detail = quantity × unitPrice × (1 - discount), discount
     *   being a decimal fraction (0–1), matching SaleDetail.lineTotal.
     * - barHeightPercent is scaled so the day with maximum revenue = 100%.
     * - Days with no PAID sales render with totalAmount = 0 and barHeightPercent = 0.
     */
    function fetchSalesByDay() {
        dashboardApi.getSales()
            .then(salesResponse => {
                const allSales = salesResponse.data instanceof Array ? salesResponse.data : [];

                // Filter to PAID sales belonging to this business
                const paidSales = allSales.filter(sale => sale.status === 'PAID');

                // Fetch line items one sale at a time (scoped by saleId) so no
                // other business's sale-detail rows are ever requested.
                const detailPromises = paidSales.map(sale =>
                    dashboardApi.getSaleDetailsBySale(sale.id)
                        .then(response => response.data instanceof Array ? response.data : [])
                );

                return Promise.all(detailPromises).then(detailArrays => ({
                    paidSales,
                    allDetails: detailArrays.flat()
                }));
            })
            .then(({ paidSales, allDetails }) => {
                // ── salesByDay computation ──────────────────────────────────
                // Build a map of the last 7 calendar days: key = 'YYYY-MM-DD', value = { dayIndex, totalAmount }
                const today = new Date();
                const dayMap = new Map();

                for (let offset = 6; offset >= 0; offset--) {
                    const date = new Date(today);
                    date.setDate(today.getDate() - offset);
                    const dateKey = date.toISOString().slice(0, 10);

                    // getDay() returns 0=Sunday...6=Saturday; remap to 0=Monday
                    const jsDay        = date.getDay();
                    const mondayIndex  = (jsDay + 6) % 7;

                    dayMap.set(dateKey, { dayIndex: mondayIndex, totalAmount: 0 });
                }

                // Accumulate PAID sale totals per day
                paidSales.forEach(sale => {
                    const saleDateKey = sale.date.slice(0, 10);
                    if (!dayMap.has(saleDateKey)) return;

                    const saleLineDetails = allDetails.filter(detail => detail.saleId === sale.id);
                    const saleTotal = saleLineDetails.reduce((accumulator, detail) => {
                        const lineRevenue = detail.quantity * detail.unitPrice * (1 - (detail.discount ?? 0));
                        return accumulator + lineRevenue;
                    }, 0);

                    const existing = dayMap.get(saleDateKey);
                    dayMap.set(saleDateKey, {
                        ...existing,
                        totalAmount: Math.round((existing.totalAmount + saleTotal) * 100) / 100
                    });
                });

                const dayEntries = Array.from(dayMap.values());

                // Scale bars proportionally to the maximum day
                const maxAmount = Math.max(...dayEntries.map(entry => entry.totalAmount));
                salesByDay.value = dayEntries.map(entry => ({
                    ...entry,
                    barHeightPercent: maxAmount > 0
                        ? Math.round((entry.totalAmount / maxAmount) * 100)
                        : 0
                }));
            })
            .catch(error => errors.value.push(error));
    }

    /**
     * Generates a new Report entity locally and appends it to the in-memory list.
     * Business rule: rejected when ReportFilters has an invalid date range.
     * @param {Object} resource
     */
    function generateReport(resource) {
        const filters = new ReportFilters(resource.filters ?? {});
        if (!filters.isDateRangeValid()) {
            errors.value.push(new Error('Invalid date range: startDate must not be after endDate.'));
            return;
        }
        reports.value.push(new Report({
            id:          reports.value.length + 1,
            businessId:  resource.businessId,
            type:        resource.type,
            filters:     filters,
            generatedAt: new Date().toISOString()
        }));
        reportsLoaded.value = true;
    }

    /**
     * Exports a report as a CSV download: a summary section (always present)
     * plus a detail table section (only when the report type has one — see
     * getReportTableColumns). Uses computeReportData, so the export always
     * matches whatever report-result.vue is showing on screen for that type.
     * Business rule: aborts with an error when the report itself isn't loaded.
     *
     * Labels are supplied by the caller (already translated) so this
     * application-layer function stays locale-agnostic — same DDD principle
     * already applied when Report.typeLabel was moved out of the domain entity.
     *
     * @param {number|string} reportId
     * @param {Object} labels
     * @param {string} labels.headerMetric  - CSV header for the summary's metric column.
     * @param {string} labels.headerValue   - CSV header for the summary's value column.
     * @param {Record<string, string>} labels.summary - summary row key → translated label.
     * @param {Record<string, string>} labels.columns - detail table column key → translated header.
     * @param {Record<string, string>} [labels.values] - enum-like cell value → translated label
     *   (e.g. status/paymentMethod), applied when present, left raw otherwise.
     * @param {string} labels.generatedAt   - Label for the generated-at row.
     */
    function exportReport(reportId, labels) {
        const report = getReportById(reportId);
        if (!report) {
            errors.value.push(new Error(`Report with id ${reportId} not found.`));
            return;
        }
        const data    = computeReportData(report);
        const columns = getReportTableColumns(report.type);
        const values  = labels.values ?? {};

        const csvRows = [
            `${labels.headerMetric},${labels.headerValue}`,
            ...data.summary.map(row => `${labels.summary[row.key] ?? row.key},${row.value}`),
            ''
        ];

        if (data.tableRows.length > 0) {
            csvRows.push(columns.map(column => labels.columns[column] ?? column).join(','));
            data.tableRows.forEach(row => {
                csvRows.push(columns.map(column => values[row[column]] ?? row[column]).join(','));
            });
            csvRows.push('');
        }

        csvRows.push(`${labels.generatedAt},${data.generatedAt}`);

        const blob         = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const downloadUrl  = URL.createObjectURL(blob);
        const anchorElement = document.createElement('a');
        anchorElement.href     = downloadUrl;
        anchorElement.download = `report-${report.type.toLowerCase()}-${report.id}.csv`;
        anchorElement.click();
        URL.revokeObjectURL(downloadUrl);
    }

    return {
        liveMetrics,
        salesByDay,
        reports,
        reportsLoaded,
        errors,
        reportsCount,
        getReportById,
        filterReportsByType,
        refreshMetrics,
        fetchSalesByDay,
        generateReport,
        computeReportData,
        getReportTableColumns,
        exportReport
    };
});

export default useDashboardStore;