<script setup>
import { computed, onMounted, ref, toRefs } from 'vue';
import { useI18n }         from 'vue-i18n';
import { useToast }        from 'primevue/usetoast';
import useSupplierStore    from '../../application/supplier.store.js';
import useIamStore         from '../../../iam/application/iam.store.js';
import useProductStore     from '../../../product/application/product.store.js';
import { Supplier, SupplierStatus } from '../../domain/model/supplier.entity.js';
import { ProductCategory } from '../../../product/domain/model/product.entity.js';
import { isCustomCategory, orderedCategoryOptionsFromValues, filterableCategoryOptionsFromValues }
    from '../../../product/presentation/category-options.js';

const { t }         = useI18n();
const toast         = useToast();
const supplierStore = useSupplierStore();
const iamStore      = useIamStore();
const productStore  = useProductStore();

const { suppliers, suppliersLoaded, errors } = toRefs(supplierStore);
const { fetchSuppliers, addSupplier, updateSupplier, deactivateSupplier } = supplierStore;

const savingSupplier      = ref(false);
const deactivatingSupplier = ref(false);

// ─── Search & filter state ─────────────────────────────────────────────────────

const searchQuery      = ref('');
const selectedCategory = ref('ALL');
const expandedRowId    = ref(null);

// ─── Modal state ───────────────────────────────────────────────────────────────

const showSupplierModal  = ref(false);
const showDetailModal    = ref(false);
const showConfirmDeact   = ref(false);
const editingSupplier    = ref(null);
const detailSupplier     = ref(null);
const deactTarget        = ref(null);

const supplierModalForm = ref({
  name:           '',
  lastName:       '',
  ruc:            '',
  contactPerson:  '',
  phone:          '',
  email:          '',
  address:        '',
  category:       ProductCategory.OTHER,
  customCategory: ''
});

const supplierModalErrors = ref({
  name:  '',
  ruc:   '',
  phone: '',
  email: ''
});

// ─── Category options ──────────────────────────────────────────────────────────
// A supplier's category shares the same taxonomy as Product & Inventory
// Management (see product/presentation/category-options.js) instead of a
// separate fixed enum — a supplier's category represents what kind of
// products it supplies, so the options offered here are exactly the
// categories the business already manages for its own products, plus any
// custom category a previous supplier already introduced via "Otros" (so
// that one sticks around and is reusable, same as it does for products).

/**
 * Every category value currently in use by this business, combining its
 * products and its suppliers, deduplicated. Feeds both the filter dropdown
 * and the create/edit modal.
 * @type {import('vue').ComputedRef<string[]>}
 */
const usedCategoryValues = computed(() => [
  ...productStore.products.map(product => product.category),
  ...suppliers.value.map(supplier => supplier.category)
]);

/**
 * Filter dropdown options: only categories actually in use (fixed or
 * custom). OTHER is excluded — it's a form trigger for creating a new
 * category, never a real persisted value, so filtering by it would always
 * return zero suppliers.
 * @type {import('vue').ComputedRef<string[]>}
 */
const categoryFilterOptions = computed(() => filterableCategoryOptionsFromValues(usedCategoryValues.value));

/**
 * Category options for the create/edit supplier modal — same list as the
 * filter, plus OTHER last, so an admin can also create a brand-new category
 * from this form.
 * @type {import('vue').ComputedRef<string[]>}
 */
const categoryModalOptions = computed(() => orderedCategoryOptionsFromValues(usedCategoryValues.value));

/**
 * Translated label for a supplier category, reusing the same pos.category-*
 * keys already defined for Product & Inventory / POS so the wording stays
 * consistent across bounded contexts. Categories outside the fixed
 * ProductCategory enum are custom labels typed in via "Otros" — those have
 * no i18n key, so they're shown verbatim instead of rendering a raw
 * untranslated key on screen.
 * @param {string} category
 * @returns {string}
 */
function categoryLabel(category) {
  if (isCustomCategory(category)) return category;
  return t(`pos.category-${category.toLowerCase()}`);
}

const categoryColorMap = {
  DAIRY:     { background: '#DBEAFE', color: '#1D4ED8' },
  GRAINS:    { background: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)' },
  OILS:      { background: 'var(--status-ok-bg)', color: 'var(--status-ok-fg)' },
  BEVERAGES: { background: '#CFFAFE', color: 'var(--brand)' },
  CLEANING:  { background: '#EDE9FE', color: '#6D28D9' },
  MEDICINE:  { background: 'var(--status-critical-bg)', color: 'var(--status-critical-fg)' },
  OTHER:     { background: 'var(--surface-alt)', color: 'var(--text)' }
};

/**
 * Returns the color pair for a given supplier category. Falls back to
 * OTHER's neutral color for custom labels and for any legacy category value
 * that predates the shared-with-Product taxonomy.
 * @param {string} category
 * @returns {{ background: string, color: string }}
 */
function getCategoryColor(category) {
  return categoryColorMap[category] ?? categoryColorMap.OTHER;
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  if (iamStore.currentUser?.businessId) {
    if (!suppliersLoaded.value) fetchSuppliers();
    if (!productStore.productsLoaded) productStore.fetchProducts();
  }
});

// ─── Computed lists ────────────────────────────────────────────────────────────

const filteredSuppliers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return suppliers.value.filter(supplier => {
    const matchesSearch = !query
        || supplier.fullName.toLowerCase().includes(query)
        || supplier.ruc.includes(query)
        || supplier.contactPerson.toLowerCase().includes(query);
    const matchesCategory = selectedCategory.value === 'ALL'
        || supplier.category === selectedCategory.value;
    return matchesSearch && matchesCategory;
  });
});

// ─── Supplier modal ────────────────────────────────────────────────────────────

/**
 * Opens the supplier create modal with a blank form.
 */
function openCreateSupplierModal() {
  editingSupplier.value    = null;
  supplierModalErrors.value = { name: '', ruc: '', phone: '', email: '' };
  supplierModalForm.value   = {
    name:           '',
    lastName:       '',
    ruc:            '',
    contactPerson:  '',
    phone:          '',
    email:          '',
    address:        '',
    category:       ProductCategory.OTHER,
    customCategory: ''
  };
  showSupplierModal.value = true;
}

/**
 * Opens the supplier edit modal pre-filled with the given supplier's data.
 * A supplier's existing category (fixed or custom) is already one of the
 * dropdown's own options (see categoryModalOptions), so it's selected
 * directly — customCategory only fills in if the admin picks "Otros" again.
 * @param {import('../../domain/model/supplier.entity.js').Supplier} supplier
 */
function openEditSupplierModal(supplier) {
  editingSupplier.value    = supplier;
  supplierModalErrors.value = { name: '', ruc: '', phone: '', email: '' };
  supplierModalForm.value   = {
    name:           supplier.name,
    lastName:       supplier.lastName,
    ruc:            supplier.ruc,
    contactPerson:  supplier.contactPerson,
    phone:          supplier.phone,
    email:          supplier.email,
    address:        supplier.address,
    category:       supplier.category,
    customCategory: ''
  };
  showDetailModal.value   = false;
  showSupplierModal.value = true;
}

/**
 * Validates the supplier modal form fields.
 * @returns {boolean} True when all required fields are valid.
 */
function validateSupplierForm() {
  const formErrors = { name: '', ruc: '', phone: '', email: '' };
  let isValid      = true;

  if (!supplierModalForm.value.name.trim()) {
    formErrors.name = t('suppliers.error-name');
    isValid         = false;
  }

  if (!/^\d{11}$/.test(supplierModalForm.value.ruc.trim())) {
    formErrors.ruc = t('suppliers.error-ruc');
    isValid        = false;
  }

  const phone = supplierModalForm.value.phone.trim();
  if (!phone) {
    formErrors.phone = t('suppliers.error-phone');
    isValid          = false;
  } else {
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 6 || digitsOnly.length > 9) {
      formErrors.phone = t('suppliers.error-phone-invalid');
      isValid          = false;
    }
  }

  // Optional field — only validated when the user actually typed something.
  const email = supplierModalForm.value.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    formErrors.email = t('suppliers.error-email');
    isValid          = false;
  }

  supplierModalErrors.value = formErrors;
  return isValid;
}

/**
 * Submits the supplier form: creates or updates depending on editing state.
 */
function submitSupplierModal() {
  if (!validateSupplierForm()) return;

  const businessId = iamStore.currentUser?.businessId ?? null;

  // When "Otros" is picked and a label is typed in, that label becomes the
  // real category instead of the generic OTHER — same rule as Product &
  // Inventory Management, effectively letting admins create new categories
  // on the fly (see openCreateSupplierModal/categoryModalOptions above).
  const customCategory = supplierModalForm.value.customCategory.trim();
  const resolvedCategory = supplierModalForm.value.category === ProductCategory.OTHER && customCategory
      ? customCategory
      : supplierModalForm.value.category;

  const supplierEntity = new Supplier({
    id:            editingSupplier.value ? editingSupplier.value.id : null,
    businessId:    businessId,
    name:          supplierModalForm.value.name.trim(),
    lastName:      supplierModalForm.value.lastName.trim(),
    ruc:           supplierModalForm.value.ruc.trim(),
    contactPerson: supplierModalForm.value.contactPerson.trim(),
    phone:         supplierModalForm.value.phone.trim(),
    email:         supplierModalForm.value.email.trim(),
    address:       supplierModalForm.value.address.trim(),
    category:      resolvedCategory,
    status:        editingSupplier.value
        ? editingSupplier.value.status
        : SupplierStatus.ACTIVE,
    since:         editingSupplier.value
        ? editingSupplier.value.since
        : new Date().toISOString().slice(0, 10)
  });

  savingSupplier.value = true;
  const savePromise = editingSupplier.value
      ? updateSupplier(supplierEntity)
      : addSupplier(supplierEntity);

  savePromise
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('suppliers.toast-save-success'), life: 3500 });
        showSupplierModal.value = false;
      })
      .catch(() => {
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('suppliers.toast-save-error'), life: 4500 });
      })
      .finally(() => {
        savingSupplier.value = false;
      });
}

// ─── Detail modal ──────────────────────────────────────────────────────────────

/**
 * Opens the detail modal for the given supplier.
 * @param {import('../../domain/model/supplier.entity.js').Supplier} supplier
 */
function openDetailModal(supplier) {
  detailSupplier.value  = supplier;
  showDetailModal.value = true;
}

// ─── Deactivate confirm ────────────────────────────────────────────────────────

/**
 * Initiates the deactivation flow for a supplier.
 * @param {import('../../domain/model/supplier.entity.js').Supplier} supplier
 */
function initiateDeactivation(supplier) {
  deactTarget.value      = supplier;
  showDetailModal.value  = false;
  showConfirmDeact.value = true;
}

/**
 * Confirms and executes supplier deactivation.
 */
function confirmDeactivation() {
  if (!deactTarget.value) {
    showConfirmDeact.value = false;
    return;
  }

  deactivatingSupplier.value = true;
  deactivateSupplier(deactTarget.value.id)
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('suppliers.toast-deactivate-success'), life: 3500 });
        showConfirmDeact.value = false;
        deactTarget.value      = null;
      })
      .catch(error => {
        const detail = error.response?.data?.detail ?? t('suppliers.toast-deactivate-error');
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail, life: 4500 });
      })
      .finally(() => {
        deactivatingSupplier.value = false;
      });
}

// ─── Mobile accordion ─────────────────────────────────────────────────────────

/**
 * Toggles the expanded row for mobile accordion view.
 * @param {number} rowId
 */
function toggleExpandedRow(rowId) {
  expandedRowId.value = expandedRowId.value === rowId ? null : rowId;
}

/**
 * Formats a monetary amount to Peruvian Sol currency string.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return `S/ ${amount.toFixed(2)}`;
}
</script>

<template>
  <div class="supplier-list-container">

    <!-- ── Toolbar ─────────────────────────────────────────────────────── -->
    <div class="supplier-list-toolbar">
      <div class="supplier-list-search-wrapper">
        <i class="pi pi-search supplier-list-search-icon" />
        <input
            v-model="searchQuery"
            class="supplier-list-search-input"
            :placeholder="t('suppliers.search-placeholder')"
        />
      </div>
      <div class="supplier-list-actions">
        <select v-model="selectedCategory" class="supplier-list-category-select">
          <option value="ALL">{{ t('suppliers.filter-all') }}</option>
          <option
              v-for="categoryKey in categoryFilterOptions"
              :key="categoryKey"
              :value="categoryKey"
          >
            {{ categoryLabel(categoryKey) }}
          </option>
        </select>
        <button class="supplier-list-btn-add" @click="openCreateSupplierModal">
          <i class="pi pi-plus" />
          <span class="supplier-list-btn-label">{{ t('suppliers.btn-register') }}</span>
        </button>
      </div>
    </div>

    <!-- ── Loading state ──────────────────────────────────────────────── -->
    <div v-if="!suppliersLoaded" class="supplier-list-loading">
      <i class="pi pi-spin pi-spinner supplier-list-spinner" />
      <span>{{ t('suppliers.loading') }}</span>
    </div>

    <!-- ── Desktop table ──────────────────────────────────────────────── -->
    <div v-else class="supplier-list-table-wrapper">
      <table class="supplier-list-table">
        <thead>
        <tr class="supplier-list-thead-row">
          <th class="supplier-list-th">{{ t('suppliers.col-supplier') }}</th>
          <th class="supplier-list-th">{{ t('suppliers.col-ruc') }}</th>
          <th class="supplier-list-th">{{ t('suppliers.col-contact') }}</th>
          <th class="supplier-list-th">{{ t('suppliers.col-category') }}</th>
          <th class="supplier-list-th">{{ t('suppliers.col-status') }}</th>
          <th class="supplier-list-th supplier-list-th-actions" />
        </tr>
        </thead>
        <tbody>
        <tr
            v-for="supplier in filteredSuppliers"
            :key="supplier.id"
            class="supplier-list-tr"
        >
          <!-- Supplier name -->
          <td class="supplier-list-td">
            <div class="supplier-list-name-cell">
              <div class="supplier-list-avatar">
                <i class="pi pi-truck" style="color: var(--brand);" />
              </div>
              <div>
                <p class="supplier-list-name-text">{{ supplier.fullName }}</p>
                <p class="supplier-list-name-since">
                  {{ t('suppliers.since-label') }} {{ supplier.since || '—' }}
                </p>
              </div>
            </div>
          </td>

          <!-- RUC -->
          <td class="supplier-list-td supplier-list-td-muted">
            {{ supplier.ruc }}
          </td>

          <!-- Contact -->
          <td class="supplier-list-td">
            <p class="supplier-list-contact-name">{{ supplier.contactPerson || '—' }}</p>
            <p class="supplier-list-contact-phone">{{ supplier.phone }}</p>
          </td>

          <!-- Category badge -->
          <td class="supplier-list-td">
                            <span
                                class="supplier-list-badge"
                                :style="{
                                    backgroundColor: getCategoryColor(supplier.category).background,
                                    color:           getCategoryColor(supplier.category).color
                                }"
                            >
                                {{ categoryLabel(supplier.category) }}
                            </span>
          </td>

          <!-- Status badge -->
          <td class="supplier-list-td">
                            <span
                                class="supplier-list-status-badge"
                                :class="supplier.isActive
                                    ? 'supplier-list-status-active'
                                    : 'supplier-list-status-inactive'"
                            >
                                {{ supplier.isActive
                                ? t('suppliers.status-active')
                                : t('suppliers.status-inactive') }}
                            </span>
          </td>

          <!-- Actions -->
          <td class="supplier-list-td">
            <button
                class="supplier-list-btn-view"
                @click="openDetailModal(supplier)"
            >
              <i class="pi pi-eye" />
              <span>{{ t('suppliers.btn-view') }}</span>
            </button>
          </td>
        </tr>
        </tbody>
      </table>

      <!-- Empty state -->
      <div v-if="filteredSuppliers.length === 0" class="supplier-list-empty">
        <i class="pi pi-building supplier-list-empty-icon" />
        <p class="supplier-list-empty-text">{{ t('suppliers.no-results') }}</p>
      </div>
    </div>

    <!-- ── Mobile accordion cards ─────────────────────────────────────── -->
    <div class="supplier-list-mobile-cards">
      <div
          v-for="supplier in filteredSuppliers"
          :key="supplier.id"
          class="supplier-list-card"
      >
        <button
            class="supplier-list-card-header"
            @click="toggleExpandedRow(supplier.id)"
        >
          <div class="supplier-list-avatar supplier-list-avatar-lg">
            <i class="pi pi-truck" style="color: var(--brand);" />
          </div>
          <div class="supplier-list-card-info">
            <p class="supplier-list-card-name">{{ supplier.fullName }}</p>
            <p class="supplier-list-card-ruc">{{ t('suppliers.col-ruc') }}: {{ supplier.ruc }}</p>
          </div>
          <span
              class="supplier-list-badge"
              :style="{
                            backgroundColor: getCategoryColor(supplier.category).background,
                            color:           getCategoryColor(supplier.category).color
                        }"
          >
                        {{ categoryLabel(supplier.category) }}
                    </span>
          <i
              class="pi pi-chevron-down supplier-list-chevron"
              :class="{ 'supplier-list-chevron-open': expandedRowId === supplier.id }"
          />
        </button>

        <div v-if="expandedRowId === supplier.id" class="supplier-list-card-body">
          <div class="supplier-list-card-grid">
            <div class="supplier-list-card-stat">
              <p class="supplier-list-card-stat-label">{{ t('suppliers.col-contact') }}</p>
              <p class="supplier-list-card-stat-value">{{ supplier.contactPerson || '—' }}</p>
            </div>
            <div class="supplier-list-card-stat">
              <p class="supplier-list-card-stat-label">{{ t('suppliers.col-phone') }}</p>
              <p class="supplier-list-card-stat-value">{{ supplier.phone }}</p>
            </div>
          </div>
          <button class="supplier-list-btn-view-full" @click="openDetailModal(supplier)">
            {{ t('suppliers.btn-view-full') }}
          </button>
        </div>
      </div>

      <div v-if="filteredSuppliers.length === 0" class="supplier-list-empty">
        <i class="pi pi-building supplier-list-empty-icon" />
        <p class="supplier-list-empty-text">{{ t('suppliers.no-results') }}</p>
      </div>
    </div>

    <!-- ── Error display ──────────────────────────────────────────────── -->
    <div v-if="errors.length > 0" class="supplier-list-errors">
      {{ t('errors.occurred') }}: {{ errors.map(e => e.message).join(', ') }}
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════
         Modal: Register / Edit Supplier
    ════════════════════════════════════════════════════════════════════ -->
    <div v-if="showSupplierModal" class="supplier-modal-overlay" @click.self="showSupplierModal = false">
      <div class="supplier-modal">

        <!-- Header -->
        <div class="supplier-modal-header">
          <h2 class="supplier-modal-title">
            {{ editingSupplier ? t('suppliers.modal-edit-title') : t('suppliers.modal-new-title') }}
          </h2>
          <button class="supplier-modal-close" @click="showSupplierModal = false">
            <i class="pi pi-times" />
          </button>
        </div>

        <!-- Body -->
        <div class="supplier-modal-body">
          <div class="supplier-modal-grid">

            <!-- Business name -->
            <div class="supplier-modal-field supplier-modal-field-full">
              <label class="supplier-modal-label">
                {{ t('suppliers.modal-field-name') }} *
              </label>
              <input
                  v-model="supplierModalForm.name"
                  class="supplier-modal-input"
                  :class="{ 'supplier-modal-input-error': supplierModalErrors.name }"
                  :placeholder="t('suppliers.modal-field-name-placeholder')"
              />
              <p v-if="supplierModalErrors.name" class="supplier-modal-error-msg">
                {{ supplierModalErrors.name }}
              </p>
            </div>

            <!-- Last name / second part -->
            <div class="supplier-modal-field">
              <label class="supplier-modal-label">
                {{ t('suppliers.modal-field-last-name') }}
              </label>
              <input
                  v-model="supplierModalForm.lastName"
                  class="supplier-modal-input"
                  :placeholder="t('suppliers.modal-field-last-name-placeholder')"
              />
            </div>

            <!-- RUC -->
            <div class="supplier-modal-field">
              <label class="supplier-modal-label">
                {{ t('suppliers.modal-field-ruc') }} *
              </label>
              <input
                  v-model="supplierModalForm.ruc"
                  class="supplier-modal-input"
                  :class="{ 'supplier-modal-input-error': supplierModalErrors.ruc }"
                  :placeholder="t('suppliers.modal-field-ruc-placeholder')"
                  maxlength="11"
              />
              <p v-if="supplierModalErrors.ruc" class="supplier-modal-error-msg">
                {{ supplierModalErrors.ruc }}
              </p>
            </div>

            <!-- Category -->
            <div class="supplier-modal-field">
              <label class="supplier-modal-label">{{ t('suppliers.modal-field-category') }}</label>
              <select v-model="supplierModalForm.category" class="supplier-modal-select">
                <option
                    v-for="categoryKey in categoryModalOptions"
                    :key="categoryKey"
                    :value="categoryKey"
                >
                  {{ categoryLabel(categoryKey) }}
                </option>
              </select>
            </div>

            <!-- Custom category (only shown when "Otros" is selected) -->
            <div v-if="supplierModalForm.category === 'OTHER'" class="supplier-modal-field">
              <label class="supplier-modal-label">{{ t('suppliers.modal-field-custom-category') }}</label>
              <input
                  v-model="supplierModalForm.customCategory"
                  class="supplier-modal-input"
                  :placeholder="t('suppliers.modal-field-custom-category-placeholder')"
              />
              <p class="supplier-modal-field-hint">{{ t('suppliers.modal-field-custom-category-hint') }}</p>
            </div>

            <!-- Contact person -->
            <div class="supplier-modal-field">
              <label class="supplier-modal-label">{{ t('suppliers.modal-field-contact') }}</label>
              <input
                  v-model="supplierModalForm.contactPerson"
                  class="supplier-modal-input"
                  :placeholder="t('suppliers.modal-field-contact-placeholder')"
              />
            </div>

            <!-- Phone -->
            <div class="supplier-modal-field">
              <label class="supplier-modal-label">
                {{ t('suppliers.modal-field-phone') }} *
              </label>
              <input
                  v-model="supplierModalForm.phone"
                  class="supplier-modal-input"
                  :class="{ 'supplier-modal-input-error': supplierModalErrors.phone }"
                  :placeholder="t('suppliers.modal-field-phone-placeholder')"
              />
              <p v-if="supplierModalErrors.phone" class="supplier-modal-error-msg">
                {{ supplierModalErrors.phone }}
              </p>
            </div>

            <!-- Email -->
            <div class="supplier-modal-field">
              <label class="supplier-modal-label">{{ t('suppliers.modal-field-email') }}</label>
              <input
                  v-model="supplierModalForm.email"
                  class="supplier-modal-input"
                  type="email"
                  :class="{ 'supplier-modal-input-error': supplierModalErrors.email }"
                  :placeholder="t('suppliers.modal-field-email-placeholder')"
              />
              <p v-if="supplierModalErrors.email" class="supplier-modal-error-msg">
                {{ supplierModalErrors.email }}
              </p>
            </div>

            <!-- Address -->
            <div class="supplier-modal-field supplier-modal-field-full">
              <label class="supplier-modal-label">{{ t('suppliers.modal-field-address') }}</label>
              <input
                  v-model="supplierModalForm.address"
                  class="supplier-modal-input"
                  :placeholder="t('suppliers.modal-field-address-placeholder')"
              />
            </div>
          </div>

          <!-- Footer buttons -->
          <div class="supplier-modal-footer">
            <button class="supplier-modal-btn-cancel" :disabled="savingSupplier" @click="showSupplierModal = false">
              {{ t('suppliers.modal-cancel') }}
            </button>
            <button class="supplier-modal-btn-save" :disabled="savingSupplier" @click="submitSupplierModal">
              <i v-if="savingSupplier" class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>
              {{ savingSupplier ? t('suppliers.modal-saving') : (editingSupplier ? t('suppliers.modal-save') : t('suppliers.modal-register')) }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════
         Modal: Supplier Detail
    ════════════════════════════════════════════════════════════════════ -->
    <div v-if="showDetailModal && detailSupplier" class="supplier-modal-overlay" @click.self="showDetailModal = false">
      <div class="supplier-detail-modal">

        <!-- Header -->
        <div class="supplier-modal-header">
          <h2 class="supplier-modal-title">{{ t('suppliers.detail-title') }}</h2>
          <button class="supplier-modal-close" @click="showDetailModal = false">
            <i class="pi pi-times" />
          </button>
        </div>

        <div class="supplier-modal-body">
          <!-- Supplier header card -->
          <div class="supplier-detail-card-header">
            <div class="supplier-detail-avatar">
              <i class="pi pi-truck" style="color: var(--brand); font-size: 1.4rem;" />
            </div>
            <div>
              <p class="supplier-detail-name">{{ detailSupplier.fullName }}</p>
              <span
                  class="supplier-list-badge"
                  :style="{
                                    backgroundColor: getCategoryColor(detailSupplier.category).background,
                                    color:           getCategoryColor(detailSupplier.category).color
                                }"
              >
                                {{ categoryLabel(detailSupplier.category) }}
                            </span>
            </div>
          </div>

          <!-- Info rows -->
          <div class="supplier-detail-info-list">
            <div class="supplier-detail-info-row">
              <div class="supplier-detail-info-icon-wrapper">
                <i class="pi pi-hashtag" style="color: var(--text-faint); font-size: 0.78rem;" />
              </div>
              <div>
                <p class="supplier-detail-info-label">{{ t('suppliers.col-ruc') }}</p>
                <p class="supplier-detail-info-value">{{ detailSupplier.ruc }}</p>
              </div>
            </div>
            <div class="supplier-detail-info-row">
              <div class="supplier-detail-info-icon-wrapper">
                <i class="pi pi-user" style="color: var(--text-faint); font-size: 0.78rem;" />
              </div>
              <div>
                <p class="supplier-detail-info-label">{{ t('suppliers.col-contact') }}</p>
                <p class="supplier-detail-info-value">{{ detailSupplier.contactPerson || '—' }}</p>
              </div>
            </div>
            <div class="supplier-detail-info-row">
              <div class="supplier-detail-info-icon-wrapper">
                <i class="pi pi-phone" style="color: var(--text-faint); font-size: 0.78rem;" />
              </div>
              <div>
                <p class="supplier-detail-info-label">{{ t('suppliers.col-phone') }}</p>
                <p class="supplier-detail-info-value">{{ detailSupplier.phone }}</p>
              </div>
            </div>
            <div class="supplier-detail-info-row">
              <div class="supplier-detail-info-icon-wrapper">
                <i class="pi pi-envelope" style="color: var(--text-faint); font-size: 0.78rem;" />
              </div>
              <div>
                <p class="supplier-detail-info-label">{{ t('suppliers.col-email') }}</p>
                <p class="supplier-detail-info-value">{{ detailSupplier.email || '—' }}</p>
              </div>
            </div>
            <div class="supplier-detail-info-row">
              <div class="supplier-detail-info-icon-wrapper">
                <i class="pi pi-map-marker" style="color: var(--text-faint); font-size: 0.78rem;" />
              </div>
              <div>
                <p class="supplier-detail-info-label">{{ t('suppliers.col-address') }}</p>
                <p class="supplier-detail-info-value">{{ detailSupplier.address || '—' }}</p>
              </div>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="supplier-modal-footer">
            <button
                v-if="detailSupplier.isActive"
                class="supplier-detail-btn-deactivate"
                @click="initiateDeactivation(detailSupplier)"
            >
              {{ t('suppliers.btn-deactivate') }}
            </button>
            <button
                class="supplier-modal-btn-cancel"
                @click="openEditSupplierModal(detailSupplier)"
            >
              {{ t('suppliers.btn-edit') }}
            </button>
            <button class="supplier-modal-btn-save" @click="showDetailModal = false">
              {{ t('suppliers.detail-close') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════
         Confirm: Deactivate Supplier
    ════════════════════════════════════════════════════════════════════ -->
    <div v-if="showConfirmDeact" class="supplier-modal-overlay" @click.self="showConfirmDeact = false">
      <div class="supplier-confirm-modal">
        <div class="supplier-modal-header">
          <h2 class="supplier-modal-title">{{ t('suppliers.confirm-deactivate-header') }}</h2>
          <button class="supplier-modal-close" @click="showConfirmDeact = false">
            <i class="pi pi-times" />
          </button>
        </div>
        <div class="supplier-modal-body">
          <p class="supplier-confirm-text">
            {{
              t('suppliers.confirm-deactivate-body', {
                name: deactTarget?.fullName ?? ''
              })
            }}
          </p>
          <div class="supplier-modal-footer">
            <button class="supplier-modal-btn-cancel" :disabled="deactivatingSupplier" @click="showConfirmDeact = false">
              {{ t('suppliers.modal-cancel') }}
            </button>
            <button class="supplier-detail-btn-deactivate" :disabled="deactivatingSupplier" @click="confirmDeactivation">
              <i v-if="deactivatingSupplier" class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>
              {{ deactivatingSupplier ? t('suppliers.modal-saving') : t('suppliers.btn-deactivate-confirm') }}
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ─── Container ─────────────────────────────────────────────────────────────── */
.supplier-list-container {
  display:        flex;
  flex-direction: column;
  min-height:     300px;
}

/* ─── Toolbar ───────────────────────────────────────────────────────────────── */
.supplier-list-toolbar {
  display:         flex;
  align-items:     center;
  gap:             0.75rem;
  padding:         0.75rem 1.25rem;
  border-bottom:   1px solid var(--border);
  flex-wrap:       wrap;
}

.supplier-list-search-wrapper {
  position:    relative;
  flex:        1;
  min-width:   200px;
}

.supplier-list-search-icon {
  position:  absolute;
  left:      0.75rem;
  top:       50%;
  transform: translateY(-50%);
  color:     var(--text-faint);
  font-size: 0.85rem;
}

.supplier-list-search-input {
  width:            100%;
  padding:          0.5rem 0.75rem 0.5rem 2.25rem;
  border:           1px solid var(--border);
  border-radius:    0.5rem;
  font-size:        0.85rem;
  background-color: var(--surface-alt);
  color:            var(--text);
  outline:          none;
  transition:       border-color 0.15s;
}

.supplier-list-search-input:focus {
  border-color: var(--brand);
}

.supplier-list-actions {
  display:     flex;
  gap:         0.5rem;
  align-items: center;
}

.supplier-list-category-select {
  padding:          0.5rem 0.75rem;
  border:           1px solid var(--border);
  border-radius:    0.5rem;
  font-size:        0.82rem;
  color:            var(--text-muted);
  background-color: var(--surface);
  outline:          none;
  cursor:           pointer;
}

.supplier-list-btn-add {
  display:          flex;
  align-items:      center;
  gap:              0.4rem;
  padding:          0.5rem 1rem;
  background-color: var(--brand);
  color:            var(--brand-ink);
  border:           none;
  border-radius:    0.5rem;
  font-size:        0.85rem;
  font-weight:      600;
  cursor:           pointer;
  white-space:      nowrap;
  transition:       background-color 0.15s;
}

.supplier-list-btn-add:hover {
  background-color: var(--brand);
}

/* ─── Loading ───────────────────────────────────────────────────────────────── */
.supplier-list-loading {
  display:         flex;
  align-items:     center;
  justify-content: center;
  gap:             0.5rem;
  padding:         3rem;
  color:           var(--text-faint);
  font-size:       0.88rem;
}

.supplier-list-spinner {
  font-size: 1.2rem;
  color:     var(--brand);
}

/* ─── Desktop table (hidden on mobile) ─────────────────────────────────────── */
.supplier-list-table-wrapper {
  width: 100%;
  overflow-x: auto;
}

.supplier-list-table {
  width:           100%;
  border-collapse: collapse;
}

.supplier-list-thead-row {
  background-color: var(--surface-alt);
  border-bottom:    1px solid var(--border);
}

.supplier-list-th {
  padding:     0.75rem 1rem;
  text-align:  left;
  font-size:   0.72rem;
  font-weight: 600;
  color:       var(--text-faint);
}

.supplier-list-th-actions {
  width: 80px;
}

.supplier-list-tr {
  border-bottom: 1px solid var(--surface-alt);
  transition:    background-color 0.1s;
}

.supplier-list-tr:hover {
  background-color: var(--surface-alt);
}

.supplier-list-td {
  padding:    0.75rem 1rem;
  font-size:  0.82rem;
  color:      var(--text);
  vertical-align: middle;
}

.supplier-list-td-muted {
  color: var(--text-muted);
}

/* ─── Name cell ─────────────────────────────────────────────────────────────── */
.supplier-list-name-cell {
  display:     flex;
  align-items: center;
  gap:         0.6rem;
}

.supplier-list-avatar {
  width:            2rem;
  height:           2rem;
  border-radius:    0.5rem;
  background-color: var(--brand-soft);
  display:          flex;
  align-items:      center;
  justify-content:  center;
  flex-shrink:      0;
}

.supplier-list-avatar-lg {
  width:  2.5rem;
  height: 2.5rem;
}

.supplier-list-name-text {
  font-size:   0.82rem;
  font-weight: 600;
  color:       var(--text);
  margin:      0;
}

.supplier-list-name-since {
  font-size: 0.68rem;
  color:     var(--text-faint);
  margin:    0;
}

.supplier-list-contact-name {
  font-size: 0.78rem;
  color:     var(--text);
  margin:    0;
}

.supplier-list-contact-phone {
  font-size: 0.68rem;
  color:     var(--text-faint);
  margin:    0;
}

/* ─── Badges ────────────────────────────────────────────────────────────────── */
.supplier-list-badge {
  display:       inline-block;
  padding:       0.15rem 0.5rem;
  border-radius: 0.35rem;
  font-size:     0.7rem;
  font-weight:   600;
}

.supplier-list-status-badge {
  display:       inline-block;
  padding:       0.15rem 0.5rem;
  border-radius: 0.35rem;
  font-size:     0.7rem;
  font-weight:   600;
}

.supplier-list-status-active {
  background-color: var(--status-ok-bg);
  color:            var(--status-ok-fg);
}

.supplier-list-status-inactive {
  background-color: var(--surface-alt);
  color:            var(--text-muted);
}

/* ─── View button ───────────────────────────────────────────────────────────── */
.supplier-list-btn-view {
  display:          flex;
  align-items:      center;
  gap:              0.3rem;
  padding:          0.35rem 0.65rem;
  background-color: var(--brand-soft);
  color:            var(--brand);
  border:           none;
  border-radius:    0.4rem;
  font-size:        0.72rem;
  font-weight:      600;
  cursor:           pointer;
  transition:       background-color 0.15s;
}

.supplier-list-btn-view:hover {
  background-color: var(--brand-soft);
}

/* ─── Empty state ───────────────────────────────────────────────────────────── */
.supplier-list-empty {
  display:         flex;
  flex-direction:  column;
  align-items:     center;
  justify-content: center;
  padding:         3rem;
  gap:             0.5rem;
}

.supplier-list-empty-icon {
  font-size: 2.5rem;
  color:     var(--text-faint);
}

.supplier-list-empty-text {
  font-size: 0.88rem;
  color:     var(--text-faint);
  margin:    0;
}

/* ─── Mobile cards (hidden on desktop) ─────────────────────────────────────── */
.supplier-list-mobile-cards {
  display: none;
  padding: 1rem;
  gap:     0.75rem;
  flex-direction: column;
}

.supplier-list-card {
  background-color: var(--surface);
  border:           1px solid var(--border);
  border-radius:    0.75rem;
  overflow:         hidden;
}

.supplier-list-card-header {
  display:     flex;
  align-items: center;
  gap:         0.75rem;
  padding:     1rem;
  width:       100%;
  background:  none;
  border:      none;
  cursor:      pointer;
  text-align:  left;
}

.supplier-list-card-info {
  flex: 1;
  min-width: 0;
}

.supplier-list-card-name {
  font-size:     0.88rem;
  font-weight:   700;
  color:         var(--text);
  margin:        0;
  overflow:      hidden;
  text-overflow: ellipsis;
  white-space:   nowrap;
}

.supplier-list-card-ruc {
  font-size: 0.72rem;
  color:     var(--text-faint);
  margin:    0;
}

.supplier-list-chevron {
  font-size:  0.8rem;
  color:      var(--text-faint);
  flex-shrink: 0;
  transition: transform 0.2s;
}

.supplier-list-chevron-open {
  transform: rotate(180deg);
}

.supplier-list-card-body {
  padding:      0 1rem 1rem;
  border-top:   1px solid var(--surface-alt);
}

.supplier-list-card-grid {
  display:               grid;
  grid-template-columns: 1fr 1fr;
  gap:                   0.5rem;
  padding-top:           0.75rem;
  margin-bottom:         0.75rem;
}

.supplier-list-card-stat {
  background-color: var(--surface-alt);
  border-radius:    0.5rem;
  padding:          0.5rem;
}

.supplier-list-card-stat-label {
  font-size: 0.62rem;
  color:     var(--text-faint);
  margin:    0;
}

.supplier-list-card-stat-value {
  font-size:   0.78rem;
  font-weight: 600;
  color:       var(--text);
  margin:      0;
}

.supplier-list-btn-view-full {
  width:            100%;
  padding:          0.5rem;
  background-color: var(--brand-soft);
  color:            var(--brand);
  border:           none;
  border-radius:    0.5rem;
  font-size:        0.82rem;
  font-weight:      600;
  cursor:           pointer;
  transition:       background-color 0.15s;
}

.supplier-list-btn-view-full:hover {
  background-color: var(--brand-soft);
}

/* ─── Errors ────────────────────────────────────────────────────────────────── */
.supplier-list-errors {
  padding:    0.75rem 1.25rem;
  color:      var(--status-critical-fg);
  font-size:  0.8rem;
  background: var(--status-critical-bg);
  border-top: 1px solid color-mix(in srgb, var(--status-critical-fg) 35%, transparent);
}

/* ─── Modal overlay ─────────────────────────────────────────────────────────── */
.supplier-modal-overlay {
  position:         fixed;
  inset:            0;
  z-index:          50;
  display:          flex;
  align-items:      flex-end;
  justify-content:  center;
  background-color: rgba(0, 0, 0, 0.5);
}

/* ─── Modal base ────────────────────────────────────────────────────────────── */
.supplier-modal,
.supplier-detail-modal,
.supplier-confirm-modal {
  width:            100%;
  background-color: var(--surface);
  border-radius:    1.25rem 1.25rem 0 0;
  border:           1px solid var(--border);
  box-shadow:       0 25px 50px rgba(0, 0, 0, 0.15);
  max-height:       90dvh;
  overflow-y:       auto;
}

.supplier-modal-header {
  display:         flex;
  align-items:     center;
  justify-content: space-between;
  padding:         1.25rem 1.25rem 0.75rem;
  border-bottom:   1px solid var(--surface-alt);
  position:        sticky;
  top:             0;
  background-color: var(--surface);
}

.supplier-modal-title {
  font-size:   1rem;
  font-weight: 700;
  color:       var(--brand);
  margin:      0;
}

.supplier-modal-close {
  background:  none;
  border:      none;
  cursor:      pointer;
  color:       var(--text-faint);
  font-size:   1rem;
  padding:     0.25rem;
  transition:  color 0.15s;
}

.supplier-modal-close:hover {
  color: var(--text);
}

.supplier-modal-body {
  padding: 1rem 1.25rem 1.25rem;
}

/* ─── Modal grid form ───────────────────────────────────────────────────────── */
.supplier-modal-grid {
  display:               grid;
  grid-template-columns: 1fr 1fr;
  gap:                   0.75rem;
}

.supplier-modal-field {
  display:       flex;
  flex-direction: column;
  gap:           0.3rem;
}

.supplier-modal-field-full {
  grid-column: 1 / -1;
}

.supplier-modal-label {
  font-size:   0.75rem;
  font-weight: 600;
  color:       var(--text-muted);
}

.supplier-modal-input,
.supplier-modal-select {
  padding:          0.5rem 0.75rem;
  border:           1px solid var(--border);
  border-radius:    0.5rem;
  font-size:        0.88rem;
  color:            var(--text);
  background-color: var(--surface);
  outline:          none;
  transition:       border-color 0.15s;
  width:            100%;
}

.supplier-modal-input:focus,
.supplier-modal-select:focus {
  border-color: var(--brand);
}

.supplier-modal-input-error {
  border-color: var(--status-critical-fg);
}

.supplier-modal-error-msg {
  font-size: 0.72rem;
  color:     var(--status-critical-fg);
  margin:    0;
}

.supplier-modal-field-hint {
  font-size: 0.7rem;
  color:     var(--text-faint);
  margin:    0;
}

/* ─── Modal footer ──────────────────────────────────────────────────────────── */
.supplier-modal-footer {
  display:         flex;
  gap:             0.5rem;
  margin-top:      1rem;
  justify-content: flex-end;
}

.supplier-modal-btn-cancel {
  padding:      0.6rem 1.25rem;
  border:       1px solid var(--border);
  border-radius: 0.75rem;
  color:         var(--text-muted);
  font-size:     0.88rem;
  font-weight:   600;
  background:    var(--surface);
  cursor:        pointer;
  transition:    background-color 0.15s;
}

.supplier-modal-btn-cancel:hover {
  background-color: var(--surface-alt);
}

.supplier-modal-btn-save {
  padding:          0.6rem 1.5rem;
  background-color: var(--brand);
  color:            var(--brand-ink);
  border:           none;
  border-radius:    0.75rem;
  font-size:        0.88rem;
  font-weight:      600;
  cursor:           pointer;
  transition:       background-color 0.15s;
}

.supplier-modal-btn-save:hover {
  background-color: var(--brand);
}

/* ─── Supplier detail modal specifics ──────────────────────────────────────── */
.supplier-detail-card-header {
  display:          flex;
  align-items:      center;
  gap:              0.75rem;
  margin-bottom:    1rem;
}

.supplier-detail-avatar {
  width:            3rem;
  height:           3rem;
  border-radius:    0.75rem;
  background-color: var(--brand-soft);
  display:          flex;
  align-items:      center;
  justify-content:  center;
  flex-shrink:      0;
}

.supplier-detail-name {
  font-size:   1rem;
  font-weight: 700;
  color:       var(--brand);
  margin:      0 0 0.3rem;
  line-height: 1.3;
}

.supplier-detail-info-list {
  display:        flex;
  flex-direction: column;
  gap:            0.6rem;
  margin-bottom:  1rem;
}

.supplier-detail-info-row {
  display:     flex;
  align-items: flex-start;
  gap:         0.75rem;
}

.supplier-detail-info-icon-wrapper {
  width:            1.75rem;
  height:           1.75rem;
  border-radius:    0.4rem;
  background-color: var(--surface-alt);
  display:          flex;
  align-items:      center;
  justify-content:  center;
  flex-shrink:      0;
  margin-top:       0.1rem;
}

.supplier-detail-info-label {
  font-size: 0.68rem;
  color:     var(--text-faint);
  margin:    0;
}

.supplier-detail-info-value {
  font-size:   0.85rem;
  color:       var(--text);
  font-weight: 500;
  margin:      0;
}

.supplier-detail-btn-deactivate {
  padding:      0.6rem 1.25rem;
  border:       1px solid var(--status-critical-fg);
  border-radius: 0.75rem;
  color:         var(--status-critical-fg);
  font-size:     0.88rem;
  font-weight:   600;
  background:    var(--status-critical-bg);
  cursor:        pointer;
  transition:    background-color 0.15s;
}

.supplier-detail-btn-deactivate:hover {
  background-color: var(--status-critical-bg);
}

/* ─── Confirm modal ─────────────────────────────────────────────────────────── */
.supplier-confirm-modal {
  max-width: 420px;
}

.supplier-confirm-text {
  font-size:     0.9rem;
  color:         var(--text);
  line-height:   1.6;
  margin-bottom: 0.5rem;
}

/* ─── Responsive: swap table ↔ cards ─────────────────────────────────────────── */
@media (max-width: 767px) {
  .supplier-list-table-wrapper {
    display: none;
  }
  .supplier-list-mobile-cards {
    display: flex;
  }
  .supplier-list-btn-label {
    display: none;
  }
  .supplier-modal-grid {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 768px) {
  .supplier-modal-overlay {
    align-items: center;
  }
  .supplier-modal {
    width:         480px;
    border-radius: 1.25rem;
  }
  .supplier-detail-modal {
    width:         440px;
    border-radius: 1.25rem;
  }
  .supplier-confirm-modal {
    width:         420px;
    border-radius: 1.25rem;
  }
}
</style>
