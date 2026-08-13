<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter }     from 'vue-router';
import { useI18n }       from 'vue-i18n';
import useDashboardStore from '../../application/dashboard.store.js';
import useProductStore   from '../../../product/application/product.store.js';
import useIamStore       from '../../../iam/application/iam.store.js';
import { ReportType }    from '../../domain/model/report.entity.js';

const { t }          = useI18n();
const router         = useRouter();
const dashboardStore = useDashboardStore();
const productStore   = useProductStore();
const iamStore       = useIamStore();

const { errors, generateReport } = dashboardStore;

/**
 * Products/suppliers are only needed for the STOCK_MOVEMENTS filter
 * dropdowns — loaded eagerly anyway so switching the type selector doesn't
 * have to wait on a fetch.
 * @type {import('vue').Ref<Array>}
 */
const suppliers = ref([]);

onMounted(() => {
  const businessId = iamStore.currentUser?.businessId ?? null;
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
 * Available report types for the dropdown — the 3 the backend actually
 * supports. "Stock bajo"/"Reposición" were frontend-only inventions with no
 * server-side persistence or export; that data is already covered live by
 * Inventario/Alertas.
 * @type {Array<{label: string, value: string}>}
 */
const reportTypeOptions = [
  { label: t('reports.type-sales'),           value: ReportType.SALES           },
  { label: t('reports.type-inventory'),       value: ReportType.INVENTORY       },
  { label: t('reports.type-stock-movements'), value: ReportType.STOCK_MOVEMENTS }
];

/** @type {Record<string, string>} Icon per report type value */
const reportTypeIcons = {
  [ReportType.SALES]:           'pi pi-shopping-cart',
  [ReportType.INVENTORY]:       'pi pi-box',
  [ReportType.STOCK_MOVEMENTS]: 'pi pi-arrow-right-arrow-left'
};

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
 * Validates inputs, delegates to the store, and navigates to the result
 * view on success. The backend accepts null dates for every type (INVENTORY
 * ignores them entirely) — the only client-side rule left is date order,
 * and only when both are actually filled in, mirroring the backend's own
 * GenerateReportCommandValidator.
 */
function applyFilters() {
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
      .then(() => router.push({ name: 'dashboard-report-result' }))
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

    <!-- ── Form card ─────────────────────────────────────────────────────────── -->
    <div class="form-card">

      <!-- Report type -->
      <div class="form-field">
        <label for="report-type" class="form-label">
          <i :class="reportTypeIcons[form.type]" class="form-label__icon"/>
          {{ t('reports.type') }}
        </label>
        <pv-select
            id="report-type"
            v-model="form.type"
            :options="reportTypeOptions"
            option-label="label"
            option-value="value"
            class="w-full"
        />
      </div>

      <!-- Date range -->
      <div class="date-range">
        <div class="form-field">
          <label for="start-date" class="form-label">
            <i class="pi pi-calendar form-label__icon"/>
            {{ t('reports.start-date') }}
          </label>
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
          <label for="end-date" class="form-label">
            <i class="pi pi-calendar form-label__icon"/>
            {{ t('reports.end-date') }}
          </label>
          <input
              id="end-date"
              v-model="form.endDate"
              type="date"
              class="date-input"
              :class="{ 'date-input--error': validationError }"
          />
        </div>
      </div>

      <!-- Product/Supplier (only meaningful for STOCK_MOVEMENTS) -->
      <template v-if="isStockMovements">
        <div class="form-field">
          <label for="filter-product" class="form-label">
            <i class="pi pi-box form-label__icon"/>
            {{ t('reports.field-product') }}
          </label>
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
          <label for="filter-supplier" class="form-label">
            <i class="pi pi-truck form-label__icon"/>
            {{ t('reports.field-supplier') }}
          </label>
          <pv-select
              id="filter-supplier"
              v-model="form.supplierId"
              :options="supplierOptions"
              option-label="label"
              option-value="value"
              class="w-full"
          />
        </div>
      </template>

      <!-- Validation error -->
      <div v-if="validationError" class="validation-error">
        <i class="pi pi-exclamation-circle"/>
        {{ validationError }}
      </div>

      <!-- Actions -->
      <div class="form-actions">
        <button class="btn-secondary" :disabled="generating" @click="navigateBack">
          {{ t('reports.cancel') }}
        </button>
        <button class="btn-primary" :disabled="generating" @click="applyFilters">
          <i :class="generating ? 'pi pi-spin pi-spinner' : 'pi pi-chart-bar'"/>
          {{ t('reports.apply') }}
        </button>
      </div>

      <!-- Store-level errors -->
      <div v-if="errors.length" class="store-errors">
        <i class="pi pi-exclamation-triangle"/>
        {{ t('errors.occurred') }}: {{ errors.map(error => error.message).join(', ') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.filters-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 560px;
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

/* ── Form card ───────────────────────────────────────────────────────── */
.form-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.875rem;
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ── Fields ──────────────────────────────────────────────────────────── */
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.form-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.035em;
}
.form-label__icon {
  font-size: 0.75rem;
  color: var(--brand);
}

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
  border: 1px solid var(--text-faint);
  border-radius: 0.5rem;
  font-size: 0.9rem;
  color: var(--text);
  background: var(--surface);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.date-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(14, 116, 144, 0.12);
}
.date-input--error {
  border-color: var(--status-critical-fg);
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

/* ── Actions ─────────────────────────────────────────────────────────── */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}
.btn-primary,
.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s, transform 0.1s;
  border: none;
}
.btn-primary {
  background: var(--brand);
  color: var(--brand-ink);
}
.btn-primary:hover  { filter: brightness(1.1); }
.btn-primary:active { transform: scale(0.98); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary {
  background: var(--surface-alt);
  color: var(--text);
  border: 1px solid var(--border);
}
.btn-secondary:hover { background: var(--border); }
.btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }

/* ── Store errors ────────────────────────────────────────────────────── */
.store-errors {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.9rem;
  background: var(--status-critical-bg);
  border: 1px solid color-mix(in srgb, var(--status-critical-fg) 35%, transparent);
  border-radius: 0.5rem;
  color: var(--status-critical-fg);
  font-size: 0.82rem;
}
</style>
