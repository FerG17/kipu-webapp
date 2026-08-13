<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter }     from 'vue-router';
import { useI18n }       from 'vue-i18n';
import useDashboardStore from '../../application/dashboard.store.js';
import useProductStore   from '../../../product/application/product.store.js';
import useSalesStore     from '../../../sales/application/sales.store.js';
import useIamStore       from '../../../iam/application/iam.store.js';
import { ReportType }    from '../../domain/model/report.entity.js';
import { filterableCategoryOptions, isCustomCategory } from '../../../product/presentation/category-options.js';

const { t }          = useI18n();
const router         = useRouter();
const dashboardStore = useDashboardStore();
const productStore   = useProductStore();
const salesStore     = useSalesStore();
const iamStore       = useIamStore();

const { errors, generateReport } = dashboardStore;

/**
 * Ensures the real product/inventory/sales data liveMetrics is computed from
 * is loaded even when this screen is reached without ever visiting the Panel
 * first (e.g. a direct link or a page refresh) — otherwise the generated
 * report would silently show all zeros instead of real business metrics.
 */
onMounted(() => {
  const businessId = iamStore.currentUser?.businessId ?? null;
  if (!businessId) return;
  if (!productStore.productsLoaded)  productStore.fetchProducts();
  if (!productStore.inventoryLoaded) productStore.fetchInventory();
  if (!salesStore.salesLoaded)       salesStore.fetchSales();
});

/** @type {import('vue').Ref<string>} */
const validationError = ref('');

/**
 * Reactive form state. businessId is read from the IAM store — never hardcoded.
 */
const form = ref({
  type:      ReportType.SALES,
  startDate: '',
  endDate:   '',
  category:  ''
});

/**
 * Available report types for the dropdown, mapped to their i18n labels.
 * @type {Array<{label: string, value: string}>}
 */
const reportTypeOptions = [
  { label: t('reports.type-inventory'),     value: ReportType.INVENTORY     },
  { label: t('reports.type-sales'),         value: ReportType.SALES         },
  { label: t('reports.type-low-stock'),     value: ReportType.LOW_STOCK     },
  { label: t('reports.type-replenishment'), value: ReportType.REPLENISHMENT }
];

/**
 * Translated label for a product category, reusing the same pos.category-*
 * keys used throughout the app (see product-list.vue's categoryLabel) —
 * custom free-text categories (typed in when "Otros" didn't fit) have no
 * i18n key and are shown verbatim.
 * @param {string} category
 * @returns {string}
 */
function categoryLabel(category) {
  if (isCustomCategory(category)) return category;
  return t(`pos.category-${category.toLowerCase()}`);
}

/**
 * Category dropdown options, scoped to categories this business actually
 * uses (same categories Inventario's own filter shows) — a real dropdown
 * instead of free text, since the report's category filter compares against
 * Product.category's exact stored value, not a translated display label.
 * @type {import('vue').ComputedRef<Array<{label: string, value: string}>>}
 */
const categoryOptions = computed(() => [
  { label: t('reports.category-placeholder'), value: '' },
  ...filterableCategoryOptions(productStore.products).map(category => ({
    label: categoryLabel(category),
    value: category
  }))
]);

/** @type {Record<string, string>} Icon per report type value */
const reportTypeIcons = {
  [ReportType.INVENTORY]:     'pi pi-box',
  [ReportType.SALES]:         'pi pi-shopping-cart',
  [ReportType.LOW_STOCK]:     'pi pi-exclamation-triangle',
  [ReportType.REPLENISHMENT]: 'pi pi-refresh'
};

/**
 * Validates inputs, delegates to the store, and navigates to the result view on success.
 * Rules: both dates required; startDate must not be after endDate.
 */
function applyFilters() {
  validationError.value = '';

  if (!form.value.startDate || !form.value.endDate) {
    validationError.value = t('reports.error-empty-dates');
    return;
  }

  if (new Date(form.value.startDate) > new Date(form.value.endDate)) {
    validationError.value = t('reports.error-date-range');
    return;
  }

  const businessId = iamStore.currentUser?.businessId ?? null;

  generateReport({
    businessId: businessId,
    type:       form.value.type,
    filters: {
      startDate: form.value.startDate,
      endDate:   form.value.endDate,
      category:  form.value.category
    }
  });

  router.push({ name: 'dashboard-report-result' });
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

      <!-- Category (optional) -->
      <div class="form-field">
        <label for="category" class="form-label">
          <i class="pi pi-tag form-label__icon"/>
          {{ t('reports.category') }}
        </label>
        <pv-select
            id="category"
            v-model="form.category"
            :options="categoryOptions"
            option-label="label"
            option-value="value"
            class="w-full"
        />
      </div>

      <!-- Validation error -->
      <div v-if="validationError" class="validation-error">
        <i class="pi pi-exclamation-circle"/>
        {{ validationError }}
      </div>

      <!-- Actions -->
      <div class="form-actions">
        <button class="btn-secondary" @click="navigateBack">
          {{ t('reports.cancel') }}
        </button>
        <button class="btn-primary" @click="applyFilters">
          <i class="pi pi-chart-bar"/>
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
.btn-secondary {
  background: var(--surface-alt);
  color: var(--text);
  border: 1px solid var(--border);
}
.btn-secondary:hover { background: var(--border); }

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
