<script setup>
import { computed, onMounted, ref, toRefs } from 'vue';
import { useRouter }                   from 'vue-router';
import { useI18n }                     from 'vue-i18n';
import useDashboardStore               from '../../application/dashboard.store.js';
import { ReportType }                  from '../../domain/model/report.entity.js';
import { toDateLocale }                from '../../../shared/presentation/date-locale.js';

const { t, locale }  = useI18n();
const router         = useRouter();
const dashboardStore = useDashboardStore();

const { reports, reportsLoaded, errors } = toRefs(dashboardStore);
const { fetchReports, downloadReportCsv, downloadReportPdf } = dashboardStore;

/**
 * Translated label for a report type, reusing the same reports.type-* keys
 * already defined for the filters dropdown.
 * @param {string} type - A ReportType value.
 * @returns {string}
 */
function reportTypeLabel(type) {
  const keys = {
    [ReportType.SALES]:           'reports.type-sales',
    [ReportType.INVENTORY]:       'reports.type-inventory',
    [ReportType.STOCK_MOVEMENTS]: 'reports.type-stock-movements'
  };
  return t(keys[type] ?? type);
}

/**
 * The most recently generated report (last element of the history array —
 * the store appends new reports to the end), shown as a confirmation card
 * right after generating one. There's no on-screen preview of its figures:
 * the backend has no endpoint for that, only persisted metadata plus a
 * live-recomputed file export (CSV always, PDF only for STOCK_MOVEMENTS).
 * @type {import('vue').ComputedRef<import('../../domain/model/report.entity.js').Report|null>}
 */
const latestReport = computed(() => reports.value.length ? reports.value[reports.value.length - 1] : null);

/**
 * History rows excluding the just-generated one, newest first — it already
 * has its own confirmation card above, showing it twice would be redundant.
 * @type {import('vue').ComputedRef<Array>}
 */
const historyReports = computed(() => {
  const rest = latestReport.value ? reports.value.slice(0, -1) : reports.value.slice();
  return rest.slice().reverse();
});

/** @type {import('vue').Ref<Set<number>>} */
const downloadingIds = ref(new Set());

/**
 * @param {number} reportId
 * @param {'csv'|'pdf'} format
 */
function handleDownload(reportId, format) {
  downloadingIds.value = new Set(downloadingIds.value).add(reportId);
  const download = format === 'pdf' ? downloadReportPdf(reportId) : downloadReportCsv(reportId);
  download.catch(() => {}).finally(() => {
    const next = new Set(downloadingIds.value);
    next.delete(reportId);
    downloadingIds.value = next;
  });
}

onMounted(() => {
  if (!reports.value.length) router.push({ name: 'dashboard-report-filters' });
  fetchReports();
});

/** Navigates back to the report filters view to generate a new report. */
function navigateBack() {
  router.push({ name: 'dashboard-report-filters' });
}

/** Navigates to the main dashboard. */
function navigateToDashboard() {
  router.push({ name: 'dashboard' });
}

/**
 * Formats a report's date range for display, or a dash when neither bound
 * was set (valid — INVENTORY ignores dates entirely, and SALES/
 * STOCK_MOVEMENTS accept open-ended ranges).
 * @param {import('../../domain/model/report.entity.js').Report} report
 * @returns {string}
 */
function formatRange(report) {
  if (!report.dateFrom && !report.dateTo) return t('reports.no-date-range');
  const from = report.dateFrom ? new Date(report.dateFrom).toLocaleDateString(toDateLocale(locale.value)) : '…';
  const to   = report.dateTo   ? new Date(report.dateTo).toLocaleDateString(toDateLocale(locale.value))   : '…';
  return `${from} – ${to}`;
}

/**
 * @param {string} isoDate
 * @returns {string}
 */
function formatGeneratedAt(isoDate) {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleString(toDateLocale(locale.value), {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}
</script>

<template>
  <div class="p-4">
    <!-- Header -->
    <div class="flex align-items-center gap-3 mb-4 flex-wrap">
      <pv-button icon="pi pi-arrow-left" text rounded @click="navigateBack"/>
      <div class="flex-1">
        <h1 class="m-0" style="color: var(--brand);">{{ t('reports.result-title') }}</h1>
      </div>
      <pv-button
          :label="t('dashboard.title')"
          icon="pi pi-home"
          severity="secondary"
          outlined
          @click="navigateToDashboard"
      />
    </div>

    <!-- Just-generated report confirmation -->
    <pv-card v-if="latestReport" class="mb-4 shadow-1">
      <template #header>
        <div class="p-3 pb-0 flex align-items-center gap-2">
          <i class="pi pi-check-circle" style="color: var(--status-ok-fg);"/>
          <h3 class="m-0" style="color: var(--brand);">{{ t('reports.generated-confirmation-title') }}</h3>
        </div>
      </template>
      <template #content>
        <div class="grid">
          <div class="col-12 md:col-4">
            <p class="m-0 text-sm" style="color: var(--text-muted);">{{ t('reports.type') }}</p>
            <p class="m-0 mt-1 font-semibold" style="color: var(--brand);">{{ reportTypeLabel(latestReport.type) }}</p>
          </div>
          <div class="col-12 md:col-4">
            <p class="m-0 text-sm" style="color: var(--text-muted);">{{ t('reports.filters') }}</p>
            <p class="m-0 mt-1" style="color: var(--brand);">{{ formatRange(latestReport) }}</p>
          </div>
          <div class="col-12 md:col-4">
            <p class="m-0 text-sm" style="color: var(--text-muted);">{{ t('reports.generated-at') }}</p>
            <p class="m-0 mt-1" style="color: var(--brand);">{{ formatGeneratedAt(latestReport.generatedAt) }}</p>
          </div>
        </div>
        <div class="flex gap-2 mt-4">
          <pv-button
              :label="t('reports.download-csv')"
              icon="pi pi-download"
              :loading="downloadingIds.has(latestReport.id)"
              @click="handleDownload(latestReport.id, 'csv')"
          />
          <pv-button
              v-if="latestReport.type === 'STOCK_MOVEMENTS'"
              :label="t('reports.download-pdf')"
              icon="pi pi-file-pdf"
              severity="secondary"
              outlined
              :loading="downloadingIds.has(latestReport.id)"
              @click="handleDownload(latestReport.id, 'pdf')"
          />
        </div>
      </template>
    </pv-card>

    <!-- Report history -->
    <pv-card class="shadow-1">
      <template #header>
        <div class="p-3 pb-0">
          <h3 class="m-0" style="color: var(--brand);">{{ t('reports.history-title') }}</h3>
        </div>
      </template>
      <template #content>
        <div v-if="!reportsLoaded" class="flex justify-content-center py-5">
          <i class="pi pi-spin pi-spinner" style="color: var(--brand); font-size: 1.4rem;"/>
        </div>
        <p v-else-if="!historyReports.length" class="m-0" style="color: var(--text-muted);">
          {{ t('reports.no-reports') }}
        </p>
        <pv-data-table v-else :value="historyReports" striped-rows table-style="min-width: 30rem">
          <pv-column :header="t('reports.type')">
            <template #body="{ data }">{{ reportTypeLabel(data.type) }}</template>
          </pv-column>
          <pv-column :header="t('reports.filters')">
            <template #body="{ data }">{{ formatRange(data) }}</template>
          </pv-column>
          <pv-column :header="t('reports.generated-at')">
            <template #body="{ data }">{{ formatGeneratedAt(data.generatedAt) }}</template>
          </pv-column>
          <pv-column :header="t('reports.export')" style="width: 1%; white-space: nowrap;">
            <template #body="{ data }">
              <div class="flex gap-2">
                <pv-button
                    icon="pi pi-download"
                    :title="t('reports.download-csv')"
                    text
                    rounded
                    :loading="downloadingIds.has(data.id)"
                    @click="handleDownload(data.id, 'csv')"
                />
                <pv-button
                    v-if="data.type === 'STOCK_MOVEMENTS'"
                    icon="pi pi-file-pdf"
                    :title="t('reports.download-pdf')"
                    text
                    rounded
                    severity="secondary"
                    :loading="downloadingIds.has(data.id)"
                    @click="handleDownload(data.id, 'pdf')"
                />
              </div>
            </template>
          </pv-column>
        </pv-data-table>
      </template>
    </pv-card>

    <!-- Errors -->
    <div v-if="errors.length" class="mt-3">
      <p style="color: var(--status-critical-fg);">{{ t('errors.occurred') }}: {{ errors.map(error => error.message).join(', ') }}</p>
    </div>
  </div>
</template>

<style scoped>
</style>
