<script setup>
import { computed, onMounted, ref, toRefs } from 'vue';
import { useRouter }                   from 'vue-router';
import { useI18n }                     from 'vue-i18n';
import useDashboardStore               from '../../application/dashboard.store.js';
import useIamStore                     from '../../../iam/application/iam.store.js';
import useProductStore                 from '../../../product/application/product.store.js';
import { ReportType }                  from '../../domain/model/report.entity.js';
import { toDateLocale }                from '../../../shared/presentation/date-locale.js';

const { t, locale }  = useI18n();
const router         = useRouter();
const dashboardStore = useDashboardStore();
const iamStore       = useIamStore();
const productStore   = useProductStore();

/**
 * Translated label for a report type, reusing the same reports.type-* keys
 * already defined for the report-filters type dropdown.
 * @param {string} type - A ReportType value.
 * @returns {string}
 */
function reportTypeLabel(type) {
  const keys = {
    [ReportType.INVENTORY]:     'reports.type-inventory',
    [ReportType.SALES]:         'reports.type-sales',
    [ReportType.LOW_STOCK]:     'reports.type-low-stock',
    [ReportType.REPLENISHMENT]: 'reports.type-replenishment'
  };
  return t(keys[type] ?? type);
}

const { reports, reportsLoaded, errors } = toRefs(dashboardStore);
const { exportReport, computeReportData, getReportTableColumns } = dashboardStore;

/**
 * Warehouses of the current business, resolved client-side against a
 * LOW_STOCK/REPLENISHMENT row's warehouseId — same pattern as the Alerts
 * screen, so a row says which specific warehouse it's about instead of
 * just a raw id.
 * @type {import('vue').Ref<Array>}
 */
const warehouses = ref([]);

/** i18n key for each summary row's label, keyed by computeReportData's row.key. */
const SUMMARY_LABEL_KEYS = {
  totalProducts:       'reports.metrics-total-products',
  lowStockProducts:    'reports.metrics-low-stock',
  inventoryValue:      'reports.metrics-inventory-value',
  stockHealth:         'reports.metrics-stock-health',
  totalSales:          'reports.metrics-total-sales',
  salesCount:          'reports.metrics-sales-count',
  averageSaleValue:    'reports.metrics-average-sale',
  outOfStockCount:     'reports.metrics-out-of-stock',
  lowStockCount:        'reports.metrics-low-stock',
  itemsToReplenish:    'reports.metrics-items-to-replenish',
  suggestedUnitsTotal: 'reports.metrics-suggested-units'
};

/** i18n key for each detail table column's header, keyed by column field name. */
const COLUMN_HEADER_KEYS = {
  category:          'reports.table-header-category',
  productCount:      'reports.table-header-product-count',
  totalValue:        'reports.table-header-total-value',
  paymentMethod:     'reports.table-header-payment-method',
  count:             'reports.table-header-sales-count',
  total:             'reports.table-header-total',
  productName:       'reports.table-header-product',
  warehouseId:       'reports.table-header-warehouse',
  currentStock:      'reports.table-header-current-stock',
  minimumStock:      'reports.table-header-min-stock',
  status:            'reports.table-header-status',
  suggestedQuantity: 'reports.table-header-suggested-quantity'
};

/** Summary row keys whose value is a PEN currency amount. */
const CURRENCY_SUMMARY_KEYS = new Set(['inventoryValue', 'totalSales', 'averageSaleValue']);
/** Detail table columns whose value is a PEN currency amount. */
const CURRENCY_COLUMNS = new Set(['totalValue', 'total']);

/**
 * The most recently generated report (last element of the reports array).
 * The store appends new reports to the end of the list.
 * @type {import('vue').ComputedRef<import('../../domain/model/report.entity.js').Report|null>}
 */
const latestReport = computed(() => {
  if (!reports.value.length) return null;
  return reports.value[reports.value.length - 1];
});

/**
 * The latest report's actual content — type-specific summary + detail table
 * (see computeReportData: INVENTORY gets a by-category value breakdown,
 * SALES a by-payment-method breakdown within the date range, LOW_STOCK every
 * (product, warehouse) at or below its minimum, REPLENISHMENT a suggested
 * reorder quantity for each of those).
 * @type {import('vue').ComputedRef<Object|null>}
 */
const reportData = computed(() =>
    latestReport.value ? computeReportData(latestReport.value) : null
);

/** @type {import('vue').ComputedRef<string[]>} */
const tableColumns = computed(() =>
    latestReport.value ? getReportTableColumns(latestReport.value.type) : []
);

/**
 * Redirects to the filters view when there are no reports to display.
 */
onMounted(() => {
  if (!reportsLoaded.value || !reports.value.length) {
    router.push({ name: 'dashboard-report-filters' });
    return;
  }
  if (iamStore.currentUser?.businessId) {
    productStore.fetchWarehousesForBusiness().then(fetched => {
      warehouses.value = fetched;
    });
  }
});

/**
 * Resolves a warehouseId to its display name, falling back to the raw id.
 * @param {number} warehouseId
 * @returns {string}
 */
function resolveWarehouseName(warehouseId) {
  const warehouse = warehouses.value.find(item => item.id === warehouseId);
  return warehouse ? warehouse.name : `#${warehouseId}`;
}

/**
 * Translated label for a row's status/paymentMethod-like enum cell value —
 * falls back to the raw value for anything not in the map (e.g. a free-text
 * category, which needs no translation).
 * @param {string} value
 * @returns {string}
 */
function translatedCellValue(value) {
  const keys = {
    LOW_STOCK:     'reports.status-low-stock',
    OUT_OF_STOCK:  'reports.status-out-of-stock',
    CASH:          'pos.payment-cash',
    CARD:          'pos.payment-card',
    YAPE:          'pos.payment-yape',
    PLIN:          'pos.payment-plin'
  };
  return keys[value] ? t(keys[value]) : value;
}

/**
 * Formats a single detail-table cell for display, per column semantics:
 * currency, warehouse name lookup, or a translated enum label.
 * @param {string} column
 * @param {Object} row
 * @returns {string|number}
 */
function formatCellValue(column, row) {
  const value = row[column];
  if (CURRENCY_COLUMNS.has(column)) return formatCurrency(value);
  if (column === 'warehouseId') return resolveWarehouseName(value);
  if (column === 'status' || column === 'paymentMethod') return translatedCellValue(value);
  return value;
}

/**
 * Formats a single summary row's value for display (currency or plain).
 * @param {string} key
 * @param {number} value
 * @returns {string|number}
 */
function formatSummaryValue(key, value) {
  if (CURRENCY_SUMMARY_KEYS.has(key)) return formatCurrency(value);
  if (key === 'stockHealth') return `${value}%`;
  return value;
}

/**
 * Triggers the CSV export for the latest report via the store, passing
 * already-translated labels so the exported file matches the active UI
 * locale instead of a hardcoded English fallback.
 */
function handleExportReport() {
  if (!latestReport.value) return;

  const summaryLabels = {};
  Object.entries(SUMMARY_LABEL_KEYS).forEach(([key, i18nKey]) => { summaryLabels[key] = t(i18nKey); });

  const columnLabels = {};
  Object.entries(COLUMN_HEADER_KEYS).forEach(([key, i18nKey]) => { columnLabels[key] = t(i18nKey); });

  const valueLabels = {
    LOW_STOCK:    t('reports.status-low-stock'),
    OUT_OF_STOCK: t('reports.status-out-of-stock'),
    CASH:         t('pos.payment-cash'),
    CARD:         t('pos.payment-card'),
    YAPE:         t('pos.payment-yape'),
    PLIN:         t('pos.payment-plin')
  };
  // Also map each warehouseId to its name, same as the on-screen table
  // (formatCellValue's resolveWarehouseName) — otherwise the CSV would show
  // the raw id where the UI shows a readable name.
  warehouses.value.forEach(warehouse => { valueLabels[warehouse.id] = warehouse.name; });

  exportReport(latestReport.value.id, {
    headerMetric: t('reports.col-metric'),
    headerValue:  t('reports.col-value'),
    summary:      summaryLabels,
    columns:      columnLabels,
    values:       valueLabels,
    generatedAt:  t('reports.generated-at')
  });
}

/**
 * Navigates back to the report filters view to generate a new report.
 */
function navigateBack() {
  router.push({ name: 'dashboard-report-filters' });
}

/**
 * Navigates to the main dashboard.
 */
function navigateToDashboard() {
  router.push({ name: 'dashboard' });
}

/**
 * Formats a monetary amount as a PEN currency string.
 *
 * @param {number} amount - Monetary amount in PEN.
 * @returns {string} Formatted currency string.
 */
function formatCurrency(amount) {
  return `S/ ${Number(amount).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formats an ISO 8601 date string into a readable locale date string.
 *
 * @param {string} isoDate - ISO 8601 date string.
 * @returns {string} Formatted date string.
 */
function formatDate(isoDate) {
  if (!isoDate) return '-';
  return new Date(isoDate).toLocaleDateString(toDateLocale(locale.value));
}
</script>

<template>
  <div class="p-4">
    <!-- Header -->
    <div class="flex align-items-center gap-3 mb-4 flex-wrap">
      <pv-button icon="pi pi-arrow-left" text rounded @click="navigateBack"/>
      <div class="flex-1">
        <h1 class="m-0" style="color: #0B3558;">{{ t('reports.result-title') }}</h1>
      </div>
      <pv-button
          v-if="latestReport"
          :label="t('reports.export')"
          icon="pi pi-download"
          @click="handleExportReport"
      />
      <pv-button
          :label="t('dashboard.title')"
          icon="pi pi-home"
          severity="secondary"
          outlined
          @click="navigateToDashboard"
      />
    </div>

    <!-- No report available -->
    <div v-if="!latestReport" class="flex justify-content-center align-items-center" style="min-height: 200px;">
      <p style="color: #64748B;">{{ t('reports.no-reports') }}</p>
    </div>

    <div v-else>
      <!-- Report metadata -->
      <pv-card class="mb-4 shadow-1">
        <template #content>
          <div class="grid">
            <div class="col-12 md:col-4">
              <p class="m-0 text-sm" style="color: #64748B;">{{ t('reports.type') }}</p>
              <p class="m-0 mt-1 font-semibold" style="color: #0B3558;">{{ reportTypeLabel(latestReport.type) }}</p>
            </div>
            <div class="col-12 md:col-4">
              <p class="m-0 text-sm" style="color: #64748B;">{{ t('reports.filters') }}</p>
              <p class="m-0 mt-1" style="color: #0B3558;">
                {{ formatDate(latestReport.filters.startDate) }} – {{ formatDate(latestReport.filters.endDate) }}
              </p>
              <p v-if="latestReport.filters.category" class="m-0 text-sm" style="color: #64748B;">
                {{ latestReport.filters.category }}
              </p>
            </div>
            <div class="col-12 md:col-4">
              <p class="m-0 text-sm" style="color: #64748B;">{{ t('reports.generated-at') }}</p>
              <p class="m-0 mt-1" style="color: #0B3558;">{{ formatDate(latestReport.generatedAt) }}</p>
            </div>
          </div>
        </template>
      </pv-card>

      <!-- Summary table -->
      <pv-card v-if="reportData" class="shadow-1 mb-4">
        <template #header>
          <div class="p-3 pb-0">
            <h3 class="m-0" style="color: #0B3558;">{{ t('reports.list-title') }}</h3>
          </div>
        </template>
        <template #content>
          <pv-data-table
              :value="reportData.summary.map(row => ({
                metric: t(SUMMARY_LABEL_KEYS[row.key] ?? row.key),
                value: formatSummaryValue(row.key, row.value)
              }))"
              striped-rows
              table-style="min-width: 30rem"
          >
            <pv-column field="metric" :header="t('reports.col-metric')" />
            <pv-column field="value"  :header="t('reports.col-value')"  />
          </pv-data-table>
        </template>
      </pv-card>

      <!-- Detail table (type-specific breakdown) -->
      <pv-card v-if="reportData && tableColumns.length" class="shadow-1">
        <template #header>
          <div class="p-3 pb-0">
            <h3 class="m-0" style="color: #0B3558;">{{ t('reports.detail-title') }}</h3>
          </div>
        </template>
        <template #content>
          <p v-if="reportData.tableRows.length === 0" class="m-0" style="color: #64748B;">
            {{ t('reports.no-table-data') }}
          </p>
          <pv-data-table
              v-else
              :value="reportData.tableRows.map(row => {
                const formatted = {};
                tableColumns.forEach(column => { formatted[column] = formatCellValue(column, row); });
                return formatted;
              })"
              striped-rows
              table-style="min-width: 30rem"
          >
            <pv-column
                v-for="column in tableColumns"
                :key="column"
                :field="column"
                :header="t(COLUMN_HEADER_KEYS[column] ?? column)"
            />
          </pv-data-table>
        </template>
      </pv-card>
    </div>

    <!-- Errors -->
    <div v-if="errors.length" class="mt-3">
      <p style="color: #EF4444;">{{ t('errors.occurred') }}: {{ errors.map(error => error.message).join(', ') }}</p>
    </div>
  </div>
</template>

<style scoped>
</style>
