<script setup>
import { ref, computed, onMounted, toRefs } from 'vue';
import { useRouter }     from 'vue-router';
import { useI18n }       from 'vue-i18n';
import { useToast }      from 'primevue/usetoast';
import useDashboardStore from '../../application/dashboard.store.js';
import useProductStore, { parseLocalDate } from '../../../product/application/product.store.js';
import useIamStore       from '../../../iam/application/iam.store.js';
import { ReportType }    from '../../domain/model/report.entity.js';
import { toDateLocale }  from '../../../shared/presentation/date-locale.js';

/**
 * Combined report generation + result + history view — merges what used to
 * be two separately-routed screens (report-filters / report-result) into one,
 * matching the Claude Design mockup's single two-column "Reportes" layout.
 * All figures here are real: type/date-range/generated-at come straight from
 * the persisted Report the backend returns, and CSV/PDF export re-runs the
 * live query server-side — there is no client-side stat preview (e.g. a
 * "126 movimientos / +312 ingresos" breakdown) because the backend has no
 * endpoint that computes one; showing fabricated numbers here would be worse
 * than not showing them.
 */

const { t, locale } = useI18n();
const router         = useRouter();
const toast          = useToast();
const dashboardStore = useDashboardStore();
const productStore   = useProductStore();
const iamStore       = useIamStore();

const { reports, reportsLoaded } = toRefs(dashboardStore);
const { fetchReports, generateReport, downloadReportExcel, downloadReportPdf } = dashboardStore;

/**
 * Products/suppliers are only needed for the STOCK_MOVEMENTS filter
 * dropdowns — loaded eagerly anyway so switching the type selector doesn't
 * have to wait on a fetch.
 * @type {import('vue').Ref<Array>}
 */
const suppliers = ref([]);

onMounted(() => {
  const businessId = iamStore.currentUser?.businessId ?? null;
  fetchReports();
  if (!businessId) return;
  if (!productStore.productsLoaded) productStore.fetchProducts();
  productStore.fetchSuppliersForBusiness().then(fetched => { suppliers.value = fetched; });
});

/** @type {import('vue').Ref<string>} */
const validationError = ref('');
/** @type {import('vue').Ref<boolean>} */
const generating = ref(false);

/**
 * Reactive form state — mirrors GenerateReportResource exactly (flat
 * fields, no category: the backend has no such filter). productId/supplierId
 * only apply when type === STOCK_MOVEMENTS; the other two types ignore them.
 */
const form = ref({
  type:       ReportType.SALES,
  startDate:  '',
  endDate:    '',
  productId:  '',
  supplierId: ''
});

/**
 * Report type cards for the selector — the 3 the backend actually supports.
 * "Stock bajo"/"Reposición" were frontend-only inventions with no
 * server-side persistence or export; that data is already covered live by
 * Inventario/Alertas.
 * @type {Array<{ value: string, labelKey: string, descKey: string, icon: string }>}
 */
const reportTypeCards = [
  { value: ReportType.SALES,           labelKey: 'reports.type-sales',           descKey: 'reports.type-desc-sales',           icon: 'pi pi-shopping-cart' },
  { value: ReportType.INVENTORY,       labelKey: 'reports.type-inventory',       descKey: 'reports.type-desc-inventory',       icon: 'pi pi-box' },
  { value: ReportType.STOCK_MOVEMENTS, labelKey: 'reports.type-stock-movements', descKey: 'reports.type-desc-stock-movements', icon: 'pi pi-arrow-right-arrow-left' }
];

/** @type {import('vue').ComputedRef<boolean>} */
const isStockMovements = computed(() => form.value.type === ReportType.STOCK_MOVEMENTS);

/**
 * Product dropdown options for the STOCK_MOVEMENTS filter.
 * @type {import('vue').ComputedRef<Array<{label: string, value: string}>>}
 */
const productOptions = computed(() => [
  { label: t('reports.field-product-placeholder'), value: '' },
  ...productStore.products.map(product => ({ label: product.name, value: String(product.id) }))
]);

/**
 * Supplier dropdown options for the STOCK_MOVEMENTS filter.
 * @type {import('vue').ComputedRef<Array<{label: string, value: string}>>}
 */
const supplierOptions = computed(() => [
  { label: t('reports.field-supplier-placeholder'), value: '' },
  ...suppliers.value.map(supplier => ({ label: supplier.name, value: String(supplier.id) }))
]);

/**
 * Validates inputs, delegates to the store. The backend accepts null dates
 * for every type (INVENTORY ignores them entirely) — the only client-side
 * rule left is date order, and only when both are actually filled in,
 * mirroring the backend's own GenerateReportCommandValidator.
 */
function submitGenerateReport() {
  validationError.value = '';

  if (form.value.startDate && form.value.endDate && new Date(form.value.startDate) > new Date(form.value.endDate)) {
    validationError.value = t('reports.error-date-range');
    return;
  }

  generating.value = true;
  generateReport({
    type:       form.value.type,
    dateFrom:   form.value.startDate || null,
    dateTo:     form.value.endDate || null,
    productId:  isStockMovements.value && form.value.productId  ? parseInt(form.value.productId)  : null,
    supplierId: isStockMovements.value && form.value.supplierId ? parseInt(form.value.supplierId) : null
  })
      .catch(error => {
        validationError.value = error.response?.status === 400
            ? (error.response.data?.detail ?? t('reports.error-date-range'))
            : t('errors.occurred');
      })
      .finally(() => { generating.value = false; });
}

/** Navigates back to the main dashboard. */
function navigateBack() {
  router.push({ name: 'dashboard' });
}

// ─── Result + history (previously report-result.vue) ────────────────────────

/**
 * The most recently generated report (last element of the history array —
 * the store appends new reports to the end), shown as a "reporte listo"
 * card. Persists across visits (not just right after generating) since it's
 * simply "the most recent report on file", same as before.
 * @type {import('vue').ComputedRef<import('../../domain/model/report.entity.js').Report|null>}
 */
const latestReport = computed(() => reports.value.length ? reports.value[reports.value.length - 1] : null);

/**
 * History rows excluding the just-generated one, newest first — it already
 * has its own card above, showing it twice would be redundant.
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
 * @param {'excel'|'pdf'} format
 */
function handleDownload(reportId, format) {
  downloadingIds.value = new Set(downloadingIds.value).add(reportId);
  const download = format === 'pdf' ? downloadReportPdf(reportId) : downloadReportExcel(reportId);
  download
      .catch(() => {
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('reports.toast-download-error'), life: 4500 });
      })
      .finally(() => {
        const next = new Set(downloadingIds.value);
        next.delete(reportId);
        downloadingIds.value = next;
      });
}

/**
 * Translated label for a report type.
 * @param {string} type - A ReportType value.
 * @returns {string}
 */
function reportTypeLabel(type) {
  const found = reportTypeCards.find(card => card.value === type);
  return found ? t(found.labelKey) : type;
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
  // parseLocalDate, not `new Date(...)`: a bare 'yyyy-mm-dd' string parses
  // as UTC midnight, which in Peru (UTC-5) displays as the previous day —
  // same off-by-one the weekly sales chart already avoids this way.
  const from = report.dateFrom ? parseLocalDate(report.dateFrom).toLocaleDateString(toDateLocale(locale.value)) : '…';
  const to   = report.dateTo   ? parseLocalDate(report.dateTo).toLocaleDateString(toDateLocale(locale.value))   : '…';
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
  <div class="filters-wrapper">

    <!-- ── Page header ───────────────────────────────────────────────────────── -->
    <div class="filters-header">
      <button class="back-btn" @click="navigateBack">
        <i class="pi pi-arrow-left"/>
      </button>
      <div>
        <h1 class="filters-header__title">{{ t('reports.title') }}</h1>
        <p class="filters-header__subtitle">{{ t('reports.subtitle') }}</p>
      </div>
    </div>

    <div class="reports-layout">

      <!-- ── Left: generate form ─────────────────────────────────────────────── -->
      <div class="form-card">
        <h2 class="form-card__title">{{ t('reports.generate-card-title') }}</h2>

        <!-- Report type cards -->
        <div class="form-field">
          <label class="form-label">{{ t('reports.type') }}</label>
          <div class="type-cards">
            <button
                v-for="card in reportTypeCards"
                :key="card.value"
                type="button"
                class="type-card"
                :class="{ 'type-card--active': form.type === card.value }"
                @click="form.type = card.value"
            >
              <span class="type-card__icon" :class="{ 'type-card__icon--active': form.type === card.value }">
                <i :class="card.icon"/>
              </span>
              <span class="type-card__text">
                <span class="type-card__label">{{ t(card.labelKey) }}</span>
                <span class="type-card__desc">{{ t(card.descKey) }}</span>
              </span>
              <span class="type-card__radio" :class="{ 'type-card__radio--active': form.type === card.value }">
                <span v-if="form.type === card.value" class="type-card__radio-dot"/>
              </span>
            </button>
          </div>
        </div>

        <!-- Date range -->
        <div class="form-field">
          <div class="flex align-items-baseline justify-content-between">
            <label class="form-label" style="margin-bottom: 0;">{{ t('reports.filters') }}</label>
            <span class="date-range-hint">{{ t('reports.date-range-hint') }}</span>
          </div>
          <div class="date-range">
            <div class="form-field">
              <label for="start-date" class="form-label form-label--sub">{{ t('reports.start-date') }}</label>
              <input
                  id="start-date"
                  v-model="form.startDate"
                  type="date"
                  class="date-input"
                  :class="{ 'date-input--error': validationError }"
              />
            </div>
            <div class="date-range__separator">
              <span>—</span>
            </div>
            <div class="form-field">
              <label for="end-date" class="form-label form-label--sub">{{ t('reports.end-date') }}</label>
              <input
                  id="end-date"
                  v-model="form.endDate"
                  type="date"
                  class="date-input"
                  :class="{ 'date-input--error': validationError }"
              />
            </div>
          </div>
        </div>

        <!-- Product/Supplier (only meaningful for STOCK_MOVEMENTS) -->
        <div v-if="isStockMovements" class="stock-movements-panel">
          <p class="stock-movements-panel__label">{{ t('reports.type-stock-movements') }}</p>
          <div class="form-field">
            <label for="filter-product" class="form-label form-label--sub">{{ t('reports.field-product') }}</label>
            <pv-select
                id="filter-product"
                v-model="form.productId"
                :options="productOptions"
                option-label="label"
                option-value="value"
                class="w-full"
            />
          </div>
          <div class="form-field">
            <label for="filter-supplier" class="form-label form-label--sub">{{ t('reports.field-supplier') }}</label>
            <pv-select
                id="filter-supplier"
                v-model="form.supplierId"
                :options="supplierOptions"
                option-label="label"
                option-value="value"
                class="w-full"
            />
          </div>
        </div>

        <!-- Validation error -->
        <div v-if="validationError" class="validation-error">
          <i class="pi pi-exclamation-circle"/>
          {{ validationError }}
        </div>

        <button class="btn-primary btn-generate" :disabled="generating" @click="submitGenerateReport">
          <i :class="generating ? 'pi pi-spin pi-spinner' : 'pi pi-chart-bar'"/>
          {{ generating ? t('reports.apply') + '…' : t('reports.apply') }}
        </button>

      </div>

      <!-- ── Right: result + history ─────────────────────────────────────────── -->
      <div class="result-column">

        <!-- Latest report -->
        <div v-if="latestReport" class="result-card">
          <div class="result-card__header">
            <span class="result-card__icon"><i class="pi pi-check-circle"/></span>
            <div>
              <p class="result-card__title">{{ t('reports.generated-confirmation-title') }}</p>
              <p class="result-card__subtitle">{{ formatGeneratedAt(latestReport.generatedAt) }}</p>
            </div>
          </div>
          <div class="result-card__summary">
            <p class="result-card__summary-title">{{ reportTypeLabel(latestReport.type) }}</p>
            <p class="result-card__summary-range">{{ formatRange(latestReport) }}</p>
          </div>
          <div class="flex gap-2">
            <button class="btn-primary result-card__download-btn" :disabled="downloadingIds.has(latestReport.id)" @click="handleDownload(latestReport.id, 'excel')">
              <i :class="downloadingIds.has(latestReport.id) ? 'pi pi-spin pi-spinner' : 'pi pi-file-excel'"/>
              {{ t('reports.download-excel') }}
            </button>
            <button
                v-if="latestReport.type === 'STOCK_MOVEMENTS'"
                class="btn-secondary result-card__download-btn"
                :disabled="downloadingIds.has(latestReport.id)"
                @click="handleDownload(latestReport.id, 'pdf')"
            >
              <i :class="downloadingIds.has(latestReport.id) ? 'pi pi-spin pi-spinner' : 'pi pi-file-pdf'"/>
              {{ t('reports.download-pdf') }}
            </button>
          </div>
        </div>

        <!-- History -->
        <div class="history-card">
          <div class="flex align-items-baseline justify-content-between mb-3">
            <p class="history-card__title">{{ t('reports.history-title') }}</p>
            <span class="history-card__subtitle">{{ t('reports.history-subtitle') }}</span>
          </div>

          <div v-if="!reportsLoaded" class="flex justify-content-center py-5">
            <i class="pi pi-spin pi-spinner" style="color: var(--brand); font-size: 1.3rem;"/>
          </div>
          <p v-else-if="!historyReports.length" class="history-empty">
            {{ t('reports.no-reports') }}
          </p>
          <div v-else class="history-list">
            <div v-for="report in historyReports" :key="report.id" class="history-row">
              <span class="history-row__icon"><i :class="reportTypeCards.find(c => c.value === report.type)?.icon ?? 'pi pi-file'"/></span>
              <div class="history-row__text">
                <p class="history-row__title">{{ reportTypeLabel(report.type) }}</p>
                <p class="history-row__meta">{{ formatGeneratedAt(report.generatedAt) }} · {{ formatRange(report) }}</p>
              </div>
              <div class="flex gap-2 flex-shrink-0">
                <button class="history-row__chip" :disabled="downloadingIds.has(report.id)" @click="handleDownload(report.id, 'excel')">
                  <i :class="downloadingIds.has(report.id) ? 'pi pi-spin pi-spinner' : 'pi pi-file-excel'"/> {{ t('reports.download-excel') }}
                </button>
                <button v-if="report.type === 'STOCK_MOVEMENTS'" class="history-row__chip" :disabled="downloadingIds.has(report.id)" @click="handleDownload(report.id, 'pdf')">
                  <i :class="downloadingIds.has(report.id) ? 'pi pi-spin pi-spinner' : 'pi pi-file-pdf'"/> {{ t('reports.download-pdf') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filters-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
}

/* ── Header ──────────────────────────────────────────────────────────── */
.filters-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.filters-header__title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--brand);
}
.filters-header__subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.15s, color 0.15s;
  flex-shrink: 0;
}
.back-btn:hover { background-color: var(--surface-alt); color: var(--brand); }

/* ── Two-column layout ──────────────────────────────────────────────── */
.reports-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
  align-items: start;
}
@media (min-width: 960px) {
  .reports-layout { grid-template-columns: 1.15fr 1fr; }
}

/* ── Form card ───────────────────────────────────────────────────────── */
.form-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}
.form-card__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: var(--text);
}

/* ── Fields ──────────────────────────────────────────────────────────── */
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.form-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.form-label--sub { font-size: 0.7rem; }
.date-range-hint { font-size: 0.72rem; color: var(--text-faint); }

/* ── Type cards ──────────────────────────────────────────────────────── */
.type-cards { display: flex; flex-direction: column; gap: 0.5rem; }
.type-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
  border: 1.5px solid var(--border);
  border-radius: 0.9rem;
  background: var(--bg);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background-color 0.15s;
}
.type-card--active {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.type-card__icon {
  flex-shrink: 0;
  width: 34px; height: 34px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-alt);
  color: var(--text-faint);
  font-size: 0.9rem;
}
.type-card__icon--active { background: var(--brand); color: var(--brand-ink); }
.type-card__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
.type-card__label { font-size: 0.85rem; font-weight: 700; color: var(--text); }
.type-card__desc { font-size: 0.72rem; color: var(--text-muted); }
.type-card__radio {
  flex-shrink: 0;
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  display: flex; align-items: center; justify-content: center;
}
.type-card__radio--active { border-color: var(--brand); }
.type-card__radio-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brand); }

/* ── Date range layout ───────────────────────────────────────────────── */
.date-range {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
}
.date-range > .form-field { flex: 1; }
.date-range__separator {
  padding-bottom: 0.6rem;
  font-size: 1rem;
  color: var(--text-faint);
  flex-shrink: 0;
}

/* ── Date native input ───────────────────────────────────────────────── */
.date-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  font-size: 0.9rem;
  color: var(--text);
  background: var(--bg);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.date-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 15%, transparent);
}
.date-input--error {
  border-color: var(--status-critical-fg);
}

/* ── Stock movements sub-panel ───────────────────────────────────────── */
.stock-movements-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.9rem;
  border-radius: 0.9rem;
  background: var(--brand-soft);
}
.stock-movements-panel__label {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--brand);
}

/* ── Validation error ────────────────────────────────────────────────── */
.validation-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.9rem;
  background: var(--status-critical-bg);
  border: 1px solid color-mix(in srgb, var(--status-critical-fg) 35%, transparent);
  border-radius: 0.5rem;
  color: var(--status-critical-fg);
  font-size: 0.83rem;
  font-weight: 500;
}

/* ── Buttons ─────────────────────────────────────────────────────────── */
.btn-primary,
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.6rem 1.25rem;
  border-radius: 0.6rem;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.15s, transform 0.1s;
  border: none;
}
.btn-primary {
  background: var(--brand);
  color: var(--brand-ink);
}
.btn-primary:hover:not(:disabled)  { filter: brightness(1.08); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
}
.btn-secondary:hover:not(:disabled) { background: var(--surface-alt); }
.btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-generate { width: 100%; padding: 0.85rem; font-size: 0.92rem; }
.result-card__download-btn { flex: 1; }

/* ── Result column ───────────────────────────────────────────────────── */
.result-column { display: flex; flex-direction: column; gap: 1.25rem; }

.result-card {
  background: var(--surface);
  border: 2px solid var(--accent);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.result-card__header { display: flex; align-items: center; gap: 0.75rem; }
.result-card__icon {
  flex-shrink: 0;
  width: 40px; height: 40px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent); color: var(--accent-ink);
  font-size: 1.05rem;
}
.result-card__title { margin: 0; font-family: var(--font-display); font-size: 1.05rem; color: var(--text); }
.result-card__subtitle { margin: 0.15rem 0 0; font-size: 0.75rem; color: var(--text-muted); }
.result-card__summary {
  padding: 0.9rem;
  border-radius: 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
}
.result-card__summary-title { margin: 0; font-size: 0.9rem; font-weight: 700; color: var(--text); }
.result-card__summary-range { margin: 0.3rem 0 0; font-size: 0.78rem; color: var(--text-muted); }

/* ── History card ────────────────────────────────────────────────────── */
.history-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 1rem;
  padding: 1.5rem;
}
.history-card__title { margin: 0; font-family: var(--font-display); font-size: 1.05rem; color: var(--text); }
.history-card__subtitle { font-size: 0.75rem; color: var(--text-muted); }
.history-empty { margin: 0; padding: 1rem 0; color: var(--text-faint); font-size: 0.85rem; }

.history-list { display: flex; flex-direction: column; gap: 0.6rem; }
.history-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 0.9rem;
  background: var(--bg);
}
.history-row__icon {
  flex-shrink: 0;
  width: 32px; height: 32px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-alt); color: var(--text-muted);
  font-size: 0.85rem;
}
.history-row__text { flex: 1; min-width: 0; }
.history-row__title { margin: 0; font-size: 0.83rem; font-weight: 600; color: var(--text); }
.history-row__meta { margin: 0.15rem 0 0; font-size: 0.7rem; color: var(--text-faint); }
.history-row__chip {
  display: flex; align-items: center; gap: 0.3rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s;
}
.history-row__chip:hover:not(:disabled) { background: var(--surface-alt); }
.history-row__chip:disabled { opacity: 0.6; cursor: not-allowed; }

@media (max-width: 640px) {
  .history-row { flex-wrap: wrap; }
}
</style>
