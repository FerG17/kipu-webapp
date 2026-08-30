<script setup>
import { computed, nextTick, onMounted, ref, toRefs, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import useProductStore, { parseLocalDate } from '../../../product/application/product.store.js';
import useIamStore from '../../../iam/application/iam.store.js';
import useAlertsStore from '../../../alerts/application/alerts.store.js';
import useSupplierStore from '../../../suppliers/application/supplier.store.js';
import { Product } from '../../../product/domain/model/product.entity.js';
import { toDateLocale } from '../../../shared/presentation/date-locale.js';
import { isCustomCategory, filterableCategoryOptions } from '../../../product/presentation/category-options.js';
import { canWriteInventory, canAccessSuppliers } from '../../../iam/application/permissions.js';
import { useModalScrollLock } from '../../../shared/presentation/use-modal-scroll-lock.js';
import { useTodayLocalDateString } from '../../../shared/presentation/use-today-local-date.js';

const route = useRoute();
const { t, locale } = useI18n();
const toast = useToast();
const productStore  = useProductStore();
const iamStore      = useIamStore();
const alertsStore    = useAlertsStore();
const supplierStore = useSupplierStore();

const { products, productsLoaded, inventory } = toRefs(productStore);
const { fetchProducts, fetchInventory, fetchBatches, registerStockIntake, fetchFilteredStockMovements, invalidateStockMovements } = productStore;
const { suppliers: allSuppliers, suppliersLoaded: suppliersLoadedRef } = toRefs(supplierStore);

const todayIsoDate = useTodayLocalDateString();

/** X6 Kardex — same write gate Inventario uses for its own intake/adjust actions. */
const canWrite = computed(() => canWriteInventory(iamStore.currentUserPosition));
const canViewSuppliers = computed(() => canAccessSuppliers(iamStore.currentUserPosition));

/**
 * Parses a money field's raw string value, tolerating a comma decimal
 * separator — same tolerance product-list.vue's intake/adjust forms apply.
 * @param {string} rawValue
 * @returns {number}
 */
function parseMoneyInput(rawValue) {
  return parseFloat(String(rawValue).replace(',', '.'));
}

/**
 * A quantity only carries decimals for a product sold by weight (X5 Bloque D).
 * @param {string} rawValue
 * @param {boolean} allowsFractionalQuantity
 * @returns {number}
 */
function parseQuantityInput(rawValue, allowsFractionalQuantity) {
  return allowsFractionalQuantity ? (parseMoneyInput(rawValue) || 0) : parseInt(rawValue);
}

function formatCurrency(amount) {
  return `S/ ${Number(amount).toFixed(2)}`;
}

/** Same fixed-vocabulary label pattern product-list.vue uses (pos.category-* keys, shared app-wide). */
function categoryLabel(category) {
  if (isCustomCategory(category)) return category;
  return t(`pos.category-${category.toLowerCase()}`);
}

// ── Warehouses (page-local — fetchWarehousesForBusiness returns a plain array, not store state) ──
const warehouses = ref([]);
const warehousesLoading = ref(true);

/**
 * Active suppliers as option labels — the intake modal's supplier dropdown
 * draws from this, same pool product-list.vue's own intake modal uses.
 */
const activeSupplierOptions = computed(() =>
    allSuppliers.value.filter(supplier => supplier.isActive)
        .map(supplier => ({ label: supplier.fullName, value: supplier.id }))
);

// ── Filters ──────────────────────────────────────────────────────────────

const filterProductId  = ref('');
const filterCategory   = ref('');
const filterDateFrom   = ref('');
const filterDateTo     = ref('');

/** Category options drawn from products actually in use — same helper the product form's category dropdown uses. */
const categoryFilterOptions = computed(() => filterableCategoryOptions(products.value));

/**
 * A specific product turns this into a true kardex — chronological order,
 * unit cost, running balance. With no product picked it's a browsing list
 * across products, newest first, and a balance wouldn't mean anything
 * (there's no single running total across different products).
 * @type {import('vue').ComputedRef<boolean>}
 */
const isKardexMode = computed(() => !!filterProductId.value);

/**
 * Local yyyy-mm-dd for N days before today — mirrors parseLocalDate's own
 * avoidance of toISOString's UTC shift, built from local Date components.
 * @param {number} days
 * @returns {string}
 */
function isoDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Selecting a product switches to full-history kardex mode (its whole trail,
 * so the running balance is accurate from the real beginning, not just from
 * an arbitrary date window) — clearing it back to browsing mode restores a
 * bounded recent-activity default instead of dumping the business's entire
 * unfiltered movement history in one unpaginated request.
 */
watch(filterProductId, (newProductId) => {
  if (newProductId) {
    filterDateFrom.value = '';
    filterDateTo.value = '';
  } else {
    filterDateFrom.value = isoDateDaysAgo(30);
    filterDateTo.value = todayIsoDate.value;
  }
});

function clearFilters() {
  filterProductId.value = '';
  filterCategory.value = '';
  filterDateFrom.value = isoDateDaysAgo(30);
  filterDateTo.value = todayIsoDate.value;
}

// ── Movements ────────────────────────────────────────────────────────────

const movements = ref([]);
const movementsLoading = ref(false);
const movementsError = ref(null);

function loadMovements() {
  movementsLoading.value = true;
  movementsError.value = null;
  fetchFilteredStockMovements({
    productId: filterProductId.value ? parseInt(filterProductId.value) : undefined,
    category:  filterCategory.value || undefined,
    dateFrom:  filterDateFrom.value || undefined,
    dateTo:    filterDateTo.value || undefined,
    ascending: isKardexMode.value
  })
      .then(entities => { movements.value = entities; })
      .catch(error => { movementsError.value = error; })
      .finally(() => { movementsLoading.value = false; });
}

watch([filterProductId, filterCategory, filterDateFrom, filterDateTo], loadMovements);

/**
 * Human-readable message for the results' error state — mirrors
 * product-list.vue's own movementsErrorMessage: a CASHIER gets the real
 * "no permission" reason (GET /stock-movements/filtered is Admin/Warehouse
 * only) instead of a misleading empty state.
 */
const movementsErrorMessage = computed(() => {
  const status = movementsError.value?.response?.status;
  return status === 403 ? t('inventory.toast-movements-forbidden') : t('kardex.toast-load-error');
});

/**
 * Rows with a running balance attached — only meaningful in kardex mode,
 * where `movements` is already ascending (see loadMovements), so a plain
 * left-to-right cumulative sum of each movement's signed quantity is its
 * chronological running total. See kardex.balance-hint for the caveat when
 * a date filter also narrows a kardex-mode view.
 */
const rows = computed(() => {
  if (!isKardexMode.value) return movements.value.map(movement => ({ movement, balance: null }));
  let running = 0;
  return movements.value.map(movement => {
    running += movement.signedQuantity;
    return { movement, balance: running };
  });
});

function movementProductName(productId) {
  const product = products.value.find(p => p.id === parseInt(productId));
  return product ? product.name : `#${productId}`;
}

function formatMovementDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString(toDateLocale(locale.value), {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/** Same visual treatment as product-list.vue's own movement type badge. */
function movementTypeVisual(movement) {
  if (movement.type === 'INTAKE') {
    return { bg: 'var(--status-ok-bg)', fg: 'var(--status-ok-fg)', icon: 'pi-arrow-circle-up', labelKey: 'inventory.movement-intake' };
  }
  if (movement.type === 'SALE') {
    return { bg: 'var(--status-critical-bg)', fg: 'var(--status-critical-fg)', icon: 'pi-arrow-circle-down', labelKey: 'inventory.movement-sale' };
  }
  if (movement.type === 'RETURN') {
    return { bg: 'var(--status-ok-bg)', fg: 'var(--status-ok-fg)', icon: 'pi-replay', labelKey: 'inventory.movement-return' };
  }
  return movement.signedQuantity < 0
      ? { bg: 'var(--status-critical-bg)', fg: 'var(--status-critical-fg)', icon: 'pi-sliders-h', labelKey: 'inventory.movement-adjustment' }
      : { bg: 'var(--status-warning-bg)', fg: 'var(--status-warning-fg)', icon: 'pi-sliders-h', labelKey: 'inventory.movement-adjustment' };
}

// ── Intake modal (ported verbatim from product-list.vue — X6 #4: fully out of Inventario now) ──

const showIntakeModal     = ref(false);
const intakeTargetProduct = ref(null);
const savingIntake        = ref(false);
const intakeForm = ref({ productId: '', quantity: '', cost: '', expirationDate: '', lotLabel: '', supplierId: '', note: '', warehouseId: '', basePrice: '' });

const intakeFormProduct = computed(() =>
    products.value.find(product => product.id === parseInt(intakeForm.value.productId)) ?? null
);

function resolveWarehouseIdForProduct(productId) {
  const inventoryItem = productStore.getInventoryByProduct(productId);
  if (inventoryItem && inventoryItem.warehouseId) return String(inventoryItem.warehouseId);
  return warehouses.value[0] ? String(warehouses.value[0].id) : '';
}

function resolveIntakeDefaultsForProduct(productId) {
  const product = products.value.find(p => p.id === parseInt(productId));
  const activeBatch = productStore.batches.find(
      batch => batch.productId === parseInt(productId) && batch.status === 'ACTIVE'
  );
  return {
    warehouseId:    resolveWarehouseIdForProduct(productId),
    cost:           activeBatch ? String(activeBatch.purchasePrice) : '',
    expirationDate: activeBatch ? activeBatch.expiration : '',
    // Not prefilled from the active batch's own label, unlike cost/expiration
    // above — every intake with expiration/cost/label opens a NEW lot (X5
    // Bloque C), so copying the previous one's name here would just give two
    // different batches the same label, defeating the whole point of X6
    // #3+#11 (telling lots apart).
    lotLabel:       '',
    supplierId:     product?.supplierIds?.[0] ?? '',
    basePrice:      product ? String(product.basePrice) : ''
  };
}

function openIntakeModal(product) {
  intakeTargetProduct.value = product;
  const initialProductId = product ? String(product.id) : (products.value[0] ? String(products.value[0].id) : '');
  intakeForm.value = {
    productId: initialProductId,
    quantity:  '',
    note:      '',
    ...(initialProductId
        ? resolveIntakeDefaultsForProduct(initialProductId)
        : { warehouseId: '', cost: '', expirationDate: '', lotLabel: '', supplierId: '', basePrice: '' })
  };
  showIntakeModal.value = true;
}

watch(() => intakeForm.value.productId, (newProductId) => {
  if (!showIntakeModal.value || !newProductId) return;
  Object.assign(intakeForm.value, resolveIntakeDefaultsForProduct(newProductId));
});

function saveIntake() {
  if (!intakeForm.value.productId) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-intake-product-required'), life: 4500 });
    return;
  }

  const allowsFractionalQuantity = intakeFormProduct.value?.isSoldByWeight ?? false;
  const rawQuantity = intakeForm.value.quantity;
  const quantity = parseQuantityInput(rawQuantity, allowsFractionalQuantity);
  if (!quantity || quantity <= 0) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-intake-quantity-required'), life: 4500 });
    return;
  }
  if (!allowsFractionalQuantity && Number(rawQuantity) !== quantity) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-quantity-not-whole'), life: 4500 });
    return;
  }
  if (!intakeForm.value.warehouseId) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-warehouse-required'), life: 4500 });
    return;
  }

  const targetProduct  = intakeFormProduct.value;
  const newBasePrice   = parseFloat(intakeForm.value.basePrice);
  const basePriceEdited = targetProduct && !isNaN(newBasePrice) && newBasePrice !== targetProduct.basePrice;

  const pickedSupplierId = intakeForm.value.supplierId ? parseInt(intakeForm.value.supplierId) : null;
  const pickedSupplierName = pickedSupplierId
      ? allSuppliers.value.find(supplier => supplier.id === pickedSupplierId)?.fullName ?? ''
      : '';

  savingIntake.value = true;
  registerStockIntake({
    productId:     parseInt(intakeForm.value.productId),
    quantity:      quantity,
    warehouseId:   parseInt(intakeForm.value.warehouseId),
    purchasePrice: parseFloat(intakeForm.value.cost) || null,
    expiration:    intakeForm.value.expirationDate || null,
    supplierId:    pickedSupplierId,
    supplier:      pickedSupplierName,
    note:          intakeForm.value.note,
    label:         intakeForm.value.lotLabel.trim() || null
  })
      .then(() => basePriceEdited
          ? productStore.updateProduct(new Product({ ...targetProduct, basePrice: newBasePrice }))
          : null)
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('inventory.toast-intake-success'), life: 3500 });
        showIntakeModal.value = false;
        loadMovements();
        if (intakeForm.value.cost || intakeForm.value.expirationDate || intakeForm.value.lotLabel.trim()) fetchBatches();
        invalidateStockMovements();
        alertsStore.fetchAlerts();
      })
      .catch(() => {
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('inventory.toast-intake-error'), life: 4500 });
      })
      .finally(() => {
        savingIntake.value = false;
      });
}

// ── "Pérdida rápida" — the exact "Ajustar stock" flow/command Inventario already has, a new entry point only ──

const showAdjustModal    = ref(false);
const adjustTargetProduct = ref(null);
const savingAdjustment   = ref(false);
const adjustForm = ref({
  warehouseId: '', direction: 'REMOVE', quantity: '', reasonPreset: 'SHRINKAGE', reasonDetail: '',
  // X6 #10 — only meaningful when direction is 'ADD'; a removal is always
  // automatic FEFO, decided server-side, with no lot choice in the UI at all.
  batchMode: 'NEW', batchId: '', newBatchExpiration: '', newBatchPurchasePrice: '', newBatchLabel: ''
});

const adjustableWarehouses = computed(() => {
  if (!adjustTargetProduct.value) return [];
  const stockedWarehouseIds = inventory.value
      .filter(item => item.productId === adjustTargetProduct.value.id)
      .map(item => item.warehouseId);
  const stocked = warehouses.value.filter(warehouse => stockedWarehouseIds.includes(warehouse.id));
  return stocked.length > 0 ? stocked : warehouses.value;
});

/** X6 #10 — active lots of the InventoryItem the adjustment currently targets, offered as the "add to an existing lot" choice. */
const adjustableActiveBatches = computed(() => {
  if (!adjustTargetProduct.value || !adjustForm.value.warehouseId) return [];
  const item = inventory.value.find(candidate => candidate.productId === adjustTargetProduct.value.id
      && String(candidate.warehouseId) === String(adjustForm.value.warehouseId));
  if (!item) return [];
  return productStore.batches.filter(batch => batch.inventoryId === item.id && batch.status === 'ACTIVE');
});

const adjustSelectedExistingBatch = computed(() =>
    adjustableActiveBatches.value.find(batch => batch.id === parseInt(adjustForm.value.batchId)) ?? null
);

/** Live "lote actual → lote después" preview — the explicit review step X6 #10 asked for before an "agregar a lote existente" adjustment saves. */
const adjustExistingBatchPreview = computed(() => {
  const batch = adjustSelectedExistingBatch.value;
  if (!batch) return null;
  const allowsFractionalQuantity = adjustTargetProduct.value?.isSoldByWeight ?? false;
  const quantity = parseQuantityInput(adjustForm.value.quantity, allowsFractionalQuantity) || 0;
  return { current: batch.remainingQuantity, after: batch.remainingQuantity + quantity };
});

// Falls back to "new lot" the moment there's nothing to add to — switching
// warehouses, or a lot getting discarded elsewhere, can otherwise leave
// 'EXISTING' selected with no valid choice in the picker.
watch(adjustableActiveBatches, (batches) => {
  if (batches.length === 0 && adjustForm.value.batchMode === 'EXISTING') {
    adjustForm.value.batchMode = 'NEW';
  }
});

watch(() => adjustForm.value.warehouseId, () => {
  adjustForm.value.batchId = '';
});

const reasonPresetLabelKeys = {
  SHRINKAGE:        'inventory.adjust-reason-shrinkage',
  BREAKAGE:         'inventory.adjust-reason-breakage',
  THEFT:            'inventory.adjust-reason-theft',
  COUNT_CORRECTION: 'inventory.adjust-reason-count-correction',
  OTHER:            'inventory.adjust-reason-other'
};

function openAdjustModal(product) {
  adjustTargetProduct.value = product;
  const stockedItem = inventory.value.find(item => item.productId === product.id);
  adjustForm.value = {
    warehouseId:  stockedItem ? String(stockedItem.warehouseId) : (warehouses.value[0] ? String(warehouses.value[0].id) : ''),
    direction:    'REMOVE',
    quantity:     '',
    reasonPreset: 'SHRINKAGE',
    reasonDetail: '',
    batchMode: 'NEW', batchId: '', newBatchExpiration: '', newBatchPurchasePrice: '', newBatchLabel: ''
  };
  showAdjustModal.value = true;
}

/** "Pérdida rápida" — opens the same modal against whichever product is currently filtered. */
function openQuickLoss() {
  const product = products.value.find(p => p.id === parseInt(filterProductId.value));
  if (product) openAdjustModal(product);
}

function saveAdjustment() {
  const allowsFractionalQuantity = adjustTargetProduct.value?.isSoldByWeight ?? false;
  const rawQuantity = adjustForm.value.quantity;
  const quantity = parseQuantityInput(rawQuantity, allowsFractionalQuantity);
  if (!quantity || quantity <= 0) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-intake-quantity-required'), life: 4500 });
    return;
  }
  if (!allowsFractionalQuantity && Number(rawQuantity) !== quantity) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-quantity-not-whole'), life: 4500 });
    return;
  }
  if (!adjustForm.value.warehouseId) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-warehouse-required'), life: 4500 });
    return;
  }

  const delta = adjustForm.value.direction === 'REMOVE' ? -quantity : quantity;
  const presetLabel = t(reasonPresetLabelKeys[adjustForm.value.reasonPreset]);
  const detail = adjustForm.value.reasonDetail.trim();
  const reason = adjustForm.value.reasonPreset === 'OTHER' ? detail : (detail ? `${presetLabel}: ${detail}` : presetLabel);

  if (!reason) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-adjust-reason-required'), life: 4500 });
    return;
  }

  // X6 #10 — a positive adjustment always lands in a lot; the mode decides
  // which one. Removal skips all of this: FEFO is automatic, server-side.
  const batchOptions = {};
  if (adjustForm.value.direction === 'ADD') {
    if (adjustForm.value.batchMode === 'EXISTING') {
      if (!adjustForm.value.batchId) {
        toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-adjust-batch-required'), life: 4500 });
        return;
      }
      batchOptions.batchId = parseInt(adjustForm.value.batchId);
    } else {
      batchOptions.newBatchExpiration = adjustForm.value.newBatchExpiration || null;
      batchOptions.newBatchPurchasePrice = parseMoneyInput(adjustForm.value.newBatchPurchasePrice) || null;
      batchOptions.newBatchLabel = adjustForm.value.newBatchLabel.trim() || null;
    }
  }

  savingAdjustment.value = true;
  productStore.adjustStock(adjustTargetProduct.value.id, adjustForm.value.warehouseId, delta, reason, batchOptions)
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('inventory.toast-adjust-success'), life: 3500 });
        showAdjustModal.value = false;
        loadMovements();
        invalidateStockMovements();
        alertsStore.fetchAlerts();
        // X6 #10 — every adjustment now touches a batch — refresh so a
        // subsequent "Pérdida rápida"/edit sees the current lot state.
        fetchBatches();
      })
      .catch(error => {
        // See product-list.vue's identical saveAdjustment for why REMOVE is
        // the only direction this message actually describes.
        const detail = error?.response?.status === 409 && adjustForm.value.direction === 'REMOVE'
            ? t('inventory.toast-adjust-error-exceeds-stock')
            : t('inventory.toast-adjust-error');
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail, life: 4500 });
      })
      .finally(() => {
        savingAdjustment.value = false;
      });
}

useModalScrollLock(showIntakeModal);
useModalScrollLock(showAdjustModal);

// ── Mount ────────────────────────────────────────────────────────────────

onMounted(() => {
  if (iamStore.currentUser?.businessId) {
    if (!productsLoaded.value) fetchProducts();
    fetchInventory();
    productStore.fetchWarehousesForBusiness().then(list => {
      warehouses.value = list.filter(warehouse => warehouse.status === 'ACTIVE');
      warehousesLoading.value = false;
    });
  }
  if (!productStore.batchesLoaded) fetchBatches();
  if (canViewSuppliers.value && !suppliersLoadedRef.value) supplierStore.fetchSuppliers();

  filterDateFrom.value = isoDateDaysAgo(30);
  filterDateTo.value = todayIsoDate.value;
  loadMovements();

  // Redirected here from Inventario's "scan a known barcode" / "duplicate
  // product detected" flows (X6 #4 moved Registrar ingreso out of that
  // page entirely, so those two flows now land here instead of opening a
  // modal in place) — products may not have loaded yet at this point.
  const intakeProductId = route.query.intake ? parseInt(route.query.intake) : null;
  if (intakeProductId) {
    const openForProduct = () => {
      const product = products.value.find(p => p.id === intakeProductId);
      if (product) openIntakeModal(product);
    };
    if (productsLoaded.value) {
      openForProduct();
    } else {
      const stopWatch = watch(productsLoaded, (loaded) => {
        if (loaded) { openForProduct(); stopWatch(); }
      });
    }
  }
});
</script>

<template>
  <div class="page-wrapper">

    <!-- ── Header ─────────────────────────────────────────────────── -->
    <div style="margin-bottom: 1.25rem;">
      <div class="flex align-items-start justify-content-between gap-3 flex-wrap">
        <div>
          <h1 class="m-0 page-title">{{ t('kardex.title') }}</h1>
          <p class="m-0 mt-1 page-subtitle">{{ t('kardex.subtitle') }}</p>
        </div>
        <div v-if="canWrite" class="flex align-items-center gap-2 flex-shrink-0">
          <button
              class="hidden sm:flex align-items-center gap-2 px-3 py-2 border-round-xl cursor-pointer btn-outline"
              :title="t('inventory.intake-modal-hint')"
              @click="openIntakeModal(null)"
          >
            <i class="pi pi-inbox" style="font-size: 0.9rem;"/>
            {{ t('inventory.btn-register-intake') }}
          </button>
          <button
              class="flex align-items-center gap-2 px-3 py-2 border-round-xl border-none cursor-pointer btn-quick-loss"
              :disabled="!isKardexMode"
              :title="isKardexMode ? '' : t('kardex.btn-quick-loss-hint')"
              @click="openQuickLoss"
          >
            <i class="pi pi-exclamation-triangle" style="font-size: 0.9rem;"/>
            {{ t('kardex.btn-quick-loss') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Filters ────────────────────────────────────────────────── -->
    <div class="border-round-xl px-4 py-4 mb-4 filter-card">
      <div class="flex flex-column sm:flex-row gap-3 flex-wrap">
        <div style="flex: 1; min-width: 180px;">
          <label class="filter-label">{{ t('kardex.filter-product') }}</label>
          <select v-model="filterProductId" class="filter-input">
            <option value="">{{ t('kardex.filter-product-all') }}</option>
            <option v-for="product in products" :key="product.id" :value="String(product.id)">{{ product.name }}</option>
          </select>
        </div>
        <div style="flex: 1; min-width: 160px;">
          <label class="filter-label">{{ t('kardex.filter-category') }}</label>
          <select v-model="filterCategory" class="filter-input">
            <option value="">{{ t('kardex.filter-category-all') }}</option>
            <option v-for="cat in categoryFilterOptions" :key="cat" :value="cat">{{ categoryLabel(cat) }}</option>
          </select>
        </div>
        <div style="min-width: 140px;">
          <label class="filter-label">{{ t('kardex.filter-date-from') }}</label>
          <input v-model="filterDateFrom" type="date" class="filter-input"/>
        </div>
        <div style="min-width: 140px;">
          <label class="filter-label">{{ t('kardex.filter-date-to') }}</label>
          <input v-model="filterDateTo" type="date" class="filter-input"/>
        </div>
        <div class="flex align-items-end">
          <button class="px-3 py-2 border-round-xl cursor-pointer btn-outline" @click="clearFilters">
            {{ t('kardex.btn-clear-filters') }}
          </button>
        </div>
      </div>
      <p v-if="!isKardexMode" class="m-0 mt-3 filter-hint">{{ t('kardex.select-product-hint') }}</p>
      <p v-else class="m-0 mt-3 filter-hint">{{ t('kardex.balance-hint') }}</p>
    </div>

    <!-- ── Results ────────────────────────────────────────────────── -->
    <div class="border-round-xl overflow-hidden table-card">
      <!-- Desktop table -->
      <div class="hidden md:block" style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
          <tr class="table-head">
            <th class="px-4 py-3 text-left col-header">{{ t('inventory.col-date') }}</th>
            <th class="px-4 py-3 text-left col-header">{{ t('inventory.col-movement-product') }}</th>
            <th class="px-4 py-3 text-left col-header">{{ t('inventory.col-type') }}</th>
            <th class="px-4 py-3 text-left col-header">{{ t('inventory.col-qty') }}</th>
            <th v-if="isKardexMode" class="px-4 py-3 text-left col-header">{{ t('kardex.col-unit-cost') }}</th>
            <th v-if="isKardexMode" class="px-4 py-3 text-left col-header">{{ t('kardex.col-balance') }}</th>
            <th class="px-4 py-3 text-left col-header">{{ t('inventory.col-supplier') }}</th>
            <th class="px-4 py-3 text-left col-header">{{ t('inventory.col-note') }}</th>
          </tr>
          </thead>
          <tbody>
          <tr
              v-for="(row, index) in rows"
              :key="row.movement.id"
              class="table-row"
              :style="{ borderBottom: index < rows.length - 1 ? '1px solid var(--surface-alt)' : 'none' }"
          >
            <td class="px-4 py-3 movement-date">{{ formatMovementDate(row.movement.registeredAt) }}</td>
            <td class="px-4 py-3 movement-product">{{ movementProductName(row.movement.productId) }}</td>
            <td class="px-4 py-3">
              <span
                  class="inline-flex align-items-center gap-1 border-round-3xl status-badge"
                  :style="{ backgroundColor: movementTypeVisual(row.movement).bg, color: movementTypeVisual(row.movement).fg }"
              >
                <i :class="`pi ${movementTypeVisual(row.movement).icon}`" style="font-size: 0.65rem;"/>
                {{ t(movementTypeVisual(row.movement).labelKey) }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span class="stock-value" :style="{ color: movementTypeVisual(row.movement).fg }">
                {{ row.movement.signedQuantity > 0 ? '+' : '' }}{{ row.movement.signedQuantity }}
              </span>
              <span class="stock-unit"> und.</span>
            </td>
            <td v-if="isKardexMode" class="px-4 py-3 movement-date">{{ row.movement.unitCost != null ? formatCurrency(row.movement.unitCost) : '—' }}</td>
            <td v-if="isKardexMode" class="px-4 py-3 stock-value">{{ row.balance }}</td>
            <td class="px-4 py-3 movement-date">{{ row.movement.supplier || '—' }}</td>
            <td class="px-4 py-3 product-desc">{{ row.movement.note || '—' }}</td>
          </tr>
          </tbody>
        </table>
        <div v-if="movementsLoading" class="flex flex-column align-items-center py-12 gap-3">
          <i class="pi pi-spin pi-spinner" style="font-size: 1.6rem; color: var(--text-faint);"/>
          <p class="m-0 empty-text">{{ t('kardex.loading') }}</p>
        </div>
        <div v-else-if="movementsError" class="flex flex-column align-items-center py-12 gap-3">
          <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap">
            <i class="pi pi-lock" style="font-size: 1.8rem; color: var(--status-critical-fg);"/>
          </div>
          <p class="m-0 empty-text">{{ movementsErrorMessage }}</p>
        </div>
        <div v-else-if="!rows.length" class="flex flex-column align-items-center py-12 gap-3">
          <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap">
            <i class="pi pi-clock" style="font-size: 1.8rem; color: var(--text-faint);"/>
          </div>
          <p class="m-0 empty-text">{{ t('kardex.empty') }}</p>
        </div>
      </div>

      <!-- Mobile list -->
      <div class="md:hidden">
        <div v-if="movementsLoading" class="flex flex-column align-items-center py-10 gap-3">
          <i class="pi pi-spin pi-spinner" style="font-size: 1.5rem; color: var(--text-faint);"/>
          <p class="m-0 empty-text">{{ t('kardex.loading') }}</p>
        </div>
        <div v-else-if="movementsError" class="flex flex-column align-items-center py-10 gap-3">
          <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap-sm">
            <i class="pi pi-lock" style="font-size: 1.6rem; color: var(--status-critical-fg);"/>
          </div>
          <p class="m-0 empty-text">{{ movementsErrorMessage }}</p>
        </div>
        <div v-else-if="!rows.length" class="flex flex-column align-items-center py-10 gap-3">
          <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap-sm">
            <i class="pi pi-clock" style="font-size: 1.6rem; color: var(--text-faint);"/>
          </div>
          <p class="m-0 empty-text">{{ t('kardex.empty') }}</p>
        </div>
        <div
            v-for="(row, index) in rows"
            :key="row.movement.id"
            class="flex align-items-start gap-3 p-4"
            :style="{ borderBottom: index < rows.length - 1 ? '1px solid var(--surface-alt)' : 'none' }"
        >
          <div
              class="flex align-items-center justify-content-center border-round-lg flex-shrink-0 movement-type-icon"
              :style="{ backgroundColor: movementTypeVisual(row.movement).bg }"
          >
            <i :class="`pi ${movementTypeVisual(row.movement).icon}`" :style="{ fontSize: '1.05rem', color: movementTypeVisual(row.movement).fg }"/>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div class="flex align-items-center justify-content-between gap-2">
              <p class="m-0 mobile-product-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ movementProductName(row.movement.productId) }}</p>
              <p class="m-0 flex-shrink-0 stock-value" :style="{ color: movementTypeVisual(row.movement).fg }">
                {{ row.movement.signedQuantity > 0 ? '+' : '' }}{{ row.movement.signedQuantity }}
              </p>
            </div>
            <div class="flex align-items-center gap-2 mt-1 flex-wrap">
              <span
                  class="border-round-3xl inline-block category-badge-sm"
                  :style="{ backgroundColor: movementTypeVisual(row.movement).bg, color: movementTypeVisual(row.movement).fg }"
              >
                {{ t(movementTypeVisual(row.movement).labelKey) }}
              </span>
              <p class="m-0 product-desc">{{ formatMovementDate(row.movement.registeredAt) }}</p>
            </div>
            <p v-if="isKardexMode" class="m-0 mt-1 product-desc">
              {{ t('kardex.col-unit-cost') }}: {{ row.movement.unitCost != null ? formatCurrency(row.movement.unitCost) : '—' }}
              · {{ t('kardex.col-balance') }}: {{ row.balance }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- FAB: mobile quick intake -->
    <button
        v-if="canWrite"
        class="sm:hidden fixed flex align-items-center justify-content-center border-round-3xl border-none cursor-pointer fab"
        :title="t('inventory.btn-register-intake')"
        @click="openIntakeModal(null)"
    >
      <i class="pi pi-inbox" style="font-size: 1.3rem;"/>
    </button>

    <!-- ══════════════════════════════════════════════════════════════
         MODAL: STOCK INTAKE
    ═══════════════════════════════════════════════════════════════ -->
    <div
        v-if="showIntakeModal"
        class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center modal-overlay"
        @click.self="showIntakeModal = false"
    >
      <div class="w-full border-round-t-2xl sm:border-round-2xl overflow-y-auto modal-container-sm">
        <div class="flex align-items-center justify-content-between px-5 py-4 modal-header">
          <div class="flex align-items-center gap-3">
            <div class="flex align-items-center justify-content-center border-round-lg modal-icon-wrap" style="background: linear-gradient(135deg, var(--status-ok-bg), var(--status-ok-bg));">
              <i class="pi pi-inbox" style="color: var(--status-ok-fg); font-size: 0.95rem;"/>
            </div>
            <p class="m-0 modal-title">{{ t('inventory.intake-modal-title') }}</p>
          </div>
          <button class="p-2 border-round-lg border-none cursor-pointer btn-modal-close" @click="showIntakeModal = false">
            <i class="pi pi-times" style="font-size: 1rem;"/>
          </button>
        </div>

        <div class="px-5 pt-2 pb-0">
          <p class="m-0 intake-modal-hint">
            <i class="pi pi-info-circle" style="font-size: 0.8rem; margin-right: 0.3rem;"/>
            {{ t('inventory.intake-modal-hint') }}
          </p>
        </div>

        <div class="px-5 py-5 flex flex-column gap-4">
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-product') }}</label>
            <select v-model="intakeForm.productId" class="modal-input modal-select">
              <option value="" disabled>{{ t('inventory.intake-field-product-placeholder') }}</option>
              <option v-for="product in products" :key="product.id" :value="String(product.id)">{{ product.name }}</option>
            </select>
          </div>
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-qty') }}</label>
            <input
                v-model="intakeForm.quantity"
                type="number" min="0.01" :step="intakeFormProduct?.isSoldByWeight ? '0.01' : '1'" placeholder="0"
                class="modal-input"
            />
          </div>
          <div class="flex flex-column sm:flex-row gap-4">
            <div style="flex: 1;">
              <label class="modal-label">{{ t('inventory.intake-field-cost') }}</label>
              <input v-model="intakeForm.cost" type="number" min="0" step="0.01" placeholder="0.00" class="modal-input"/>
            </div>
            <div style="flex: 1;">
              <label class="modal-label">{{ t('inventory.intake-field-expiration') }}</label>
              <input v-model="intakeForm.expirationDate" type="date" :min="todayIsoDate" class="modal-input"/>
            </div>
          </div>
          <div>
            <label class="modal-label">{{ t('inventory.modal-field-lot') }}</label>
            <input v-model="intakeForm.lotLabel" type="text" maxlength="60" :placeholder="t('inventory.modal-field-lot-placeholder')" class="modal-input"/>
          </div>
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-sale-price') }}</label>
            <input v-model="intakeForm.basePrice" type="number" min="0" step="0.01" placeholder="0.00" class="modal-input"/>
          </div>
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-warehouse') }}</label>
            <select v-model="intakeForm.warehouseId" class="modal-input modal-select">
              <option value="" disabled>{{ t('inventory.modal-field-warehouse-placeholder') }}</option>
              <option v-for="warehouse in warehouses" :key="warehouse.id" :value="String(warehouse.id)">
                {{ warehouse.name }}
              </option>
            </select>
          </div>
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-supplier') }}</label>
            <select v-model="intakeForm.supplierId" class="modal-input modal-select">
              <option value="">{{ t('inventory.intake-field-supplier-placeholder') }}</option>
              <option v-for="supplier in activeSupplierOptions" :key="supplier.value" :value="supplier.value">
                {{ supplier.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-note') }}</label>
            <input v-model="intakeForm.note" :placeholder="t('inventory.intake-field-note-placeholder')" maxlength="500" class="modal-input"/>
          </div>

          <div class="flex gap-3">
            <button class="flex-1 py-2 border-round-xl cursor-pointer btn-modal-cancel" :disabled="savingIntake" @click="showIntakeModal = false">
              {{ t('inventory.modal-cancel') }}
            </button>
            <button
                class="flex-1 py-2 border-round-xl border-none cursor-pointer btn-intake-confirm"
                :disabled="savingIntake || warehousesLoading"
                @click="saveIntake"
            >
              <i v-if="savingIntake" class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>
              {{ savingIntake ? t('inventory.modal-saving') : t('inventory.intake-btn') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         MODAL: ADJUST STOCK — "Pérdida rápida" entry point
    ═══════════════════════════════════════════════════════════════ -->
    <div
        v-if="showAdjustModal"
        class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center modal-overlay"
        @click.self="showAdjustModal = false"
    >
      <div class="w-full border-round-t-2xl sm:border-round-2xl overflow-y-auto modal-container-sm">
        <div class="flex align-items-center justify-content-between px-5 py-4 modal-header">
          <div class="flex align-items-center gap-3">
            <div class="flex align-items-center justify-content-center border-round-lg modal-icon-wrap" style="background: var(--status-warning-bg);">
              <i class="pi pi-sliders-h" style="color: var(--status-warning-fg); font-size: 0.95rem;"/>
            </div>
            <p class="m-0 modal-title">{{ t('inventory.adjust-modal-title', { name: adjustTargetProduct?.name ?? '' }) }}</p>
          </div>
          <button class="p-2 border-round-lg border-none cursor-pointer btn-modal-close" @click="showAdjustModal = false">
            <i class="pi pi-times" style="font-size: 1rem;"/>
          </button>
        </div>

        <div class="px-5 py-5 flex flex-column gap-4">
          <p class="m-0" style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5;">{{ t('inventory.adjust-modal-hint') }}</p>

          <div>
            <label class="modal-label">{{ t('inventory.adjust-field-direction') }}</label>
            <div class="flex gap-2">
              <button
                  type="button"
                  class="flex-1 py-2 border-round-xl cursor-pointer btn-adjust-direction"
                  :class="{ 'btn-adjust-direction-active-remove': adjustForm.direction === 'REMOVE' }"
                  @click="adjustForm.direction = 'REMOVE'"
              >
                <i class="pi pi-minus-circle" style="margin-right: 0.35rem;"/>{{ t('inventory.adjust-direction-remove') }}
              </button>
              <button
                  type="button"
                  class="flex-1 py-2 border-round-xl cursor-pointer btn-adjust-direction"
                  :class="{ 'btn-adjust-direction-active-add': adjustForm.direction === 'ADD' }"
                  @click="adjustForm.direction = 'ADD'"
              >
                <i class="pi pi-plus-circle" style="margin-right: 0.35rem;"/>{{ t('inventory.adjust-direction-add') }}
              </button>
            </div>
          </div>

          <div>
            <label class="modal-label">{{ t('inventory.adjust-field-quantity') }}</label>
            <input
                v-model="adjustForm.quantity"
                type="number" min="0.01" :step="adjustTargetProduct?.isSoldByWeight ? '0.01' : '1'" placeholder="0"
                class="modal-input"
            />
          </div>

          <div v-if="adjustableWarehouses.length > 1">
            <label class="modal-label">{{ t('inventory.modal-field-warehouse') }}</label>
            <select v-model="adjustForm.warehouseId" class="modal-input modal-select">
              <option v-for="warehouse in adjustableWarehouses" :key="warehouse.id" :value="String(warehouse.id)">
                {{ warehouse.name }}
              </option>
            </select>
          </div>

          <!-- X6 #10 — a positive adjustment always lands in a lot; removal is
               always automatic FEFO, so none of this applies there. -->
          <template v-if="adjustForm.direction === 'ADD'">
            <div>
              <label class="modal-label">{{ t('inventory.adjust-field-batch-mode') }}</label>
              <div class="flex gap-2">
                <button
                    type="button"
                    class="flex-1 py-2 border-round-lg cursor-pointer btn-adjust-direction"
                    :class="{ 'btn-adjust-direction-active-add': adjustForm.batchMode === 'EXISTING' }"
                    @click="adjustForm.batchMode = 'EXISTING'"
                >{{ t('inventory.adjust-batch-mode-existing') }}</button>
                <button
                    type="button"
                    class="flex-1 py-2 border-round-lg cursor-pointer btn-adjust-direction"
                    :class="{ 'btn-adjust-direction-active-add': adjustForm.batchMode === 'NEW' }"
                    @click="adjustForm.batchMode = 'NEW'"
                >{{ t('inventory.adjust-batch-mode-new') }}</button>
              </div>
            </div>

            <div v-if="adjustForm.batchMode === 'EXISTING'">
              <label class="modal-label">{{ t('inventory.adjust-field-existing-batch') }}</label>
              <p v-if="adjustableActiveBatches.length === 0" class="modal-field-hint">
                {{ t('inventory.adjust-existing-batch-no-lots') }}
              </p>
              <select v-else v-model="adjustForm.batchId" class="modal-input modal-select">
                <option value="" disabled>{{ t('inventory.adjust-existing-batch-placeholder') }}</option>
                <option v-for="batch in adjustableActiveBatches" :key="batch.id" :value="String(batch.id)">
                  {{ t('inventory.adjust-existing-batch-option', {
                    label: batch.label || t('inventory.lots-no-expiration'),
                    remaining: batch.remainingQuantity,
                    expiration: batch.expiration ? ` (${parseLocalDate(batch.expiration).toLocaleDateString(toDateLocale(locale), { day: '2-digit', month: '2-digit', year: 'numeric' })})` : ''
                  }) }}
                </option>
              </select>
              <!-- The explicit review step X6 #10 asked for: show the lot's
                   current count and what it becomes, before saving. -->
              <p v-if="adjustExistingBatchPreview" class="modal-field-hint modal-field-hint-emphasis">
                {{ t('inventory.adjust-batch-preview', adjustExistingBatchPreview) }}
              </p>
            </div>

            <div v-else class="flex flex-column gap-3">
              <div class="flex flex-column sm:flex-row gap-4">
                <div style="flex: 1;">
                  <label class="modal-label">{{ t('inventory.adjust-field-new-batch-expiration') }}</label>
                  <input v-model="adjustForm.newBatchExpiration" type="date" :min="todayIsoDate" class="modal-input"/>
                </div>
                <div style="flex: 1;">
                  <label class="modal-label">{{ t('inventory.adjust-field-new-batch-cost') }}</label>
                  <input v-model="adjustForm.newBatchPurchasePrice" type="number" min="0" step="0.01" placeholder="0.00" class="modal-input"/>
                </div>
              </div>
              <div>
                <label class="modal-label">{{ t('inventory.modal-field-lot') }}</label>
                <input v-model="adjustForm.newBatchLabel" type="text" maxlength="60" :placeholder="t('inventory.modal-field-lot-placeholder')" class="modal-input"/>
              </div>
            </div>
          </template>

          <div>
            <label class="modal-label">{{ t('inventory.adjust-field-reason') }}</label>
            <select v-model="adjustForm.reasonPreset" class="modal-input modal-select">
              <option value="SHRINKAGE">{{ t('inventory.adjust-reason-shrinkage') }}</option>
              <option value="BREAKAGE">{{ t('inventory.adjust-reason-breakage') }}</option>
              <option value="THEFT">{{ t('inventory.adjust-reason-theft') }}</option>
              <option value="COUNT_CORRECTION">{{ t('inventory.adjust-reason-count-correction') }}</option>
              <option value="OTHER">{{ t('inventory.adjust-reason-other') }}</option>
            </select>
          </div>

          <div>
            <label class="modal-label">
              {{ adjustForm.reasonPreset === 'OTHER' ? t('inventory.adjust-field-reason-detail-required') : t('inventory.adjust-field-reason-detail-optional') }}
            </label>
            <input v-model="adjustForm.reasonDetail" :placeholder="t('inventory.adjust-field-reason-detail-placeholder')" maxlength="500" class="modal-input"/>
          </div>

          <div class="flex gap-3">
            <button class="flex-1 py-2 border-round-xl cursor-pointer btn-modal-cancel" :disabled="savingAdjustment" @click="showAdjustModal = false">
              {{ t('inventory.modal-cancel') }}
            </button>
            <button
                class="flex-1 py-2 border-round-xl border-none cursor-pointer btn-primary"
                :disabled="savingAdjustment || !adjustForm.quantity
                    || (adjustForm.reasonPreset === 'OTHER' && !adjustForm.reasonDetail.trim())
                    || (adjustForm.direction === 'ADD' && adjustForm.batchMode === 'EXISTING' && !adjustForm.batchId)"
                @click="saveAdjustment"
            >
              <i v-if="savingAdjustment" class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>
              {{ savingAdjustment ? t('inventory.modal-saving') : t('inventory.adjust-btn-confirm') }}
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.page-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
}

.page-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--brand);
  line-height: 1.2;
}

.page-subtitle {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.btn-outline {
  border: 1.5px solid var(--brand);
  color: var(--brand);
  font-size: 0.82rem;
  font-weight: 600;
  background-color: var(--surface);
  transition: all 0.15s;
}
.btn-outline:hover {
  background-color: var(--brand-soft);
  border-color: var(--brand);
}

.btn-quick-loss {
  background: linear-gradient(135deg, var(--status-warning-fg), var(--status-warning-fg));
  color: var(--brand-ink);
  font-size: 0.82rem;
  font-weight: 600;
  box-shadow: 0 2px 10px rgba(217, 119, 6, 0.3);
  transition: all 0.18s;
}
.btn-quick-loss:hover:not(:disabled) {
  box-shadow: 0 4px 16px rgba(217, 119, 6, 0.45);
  transform: translateY(-1px);
}
.btn-quick-loss:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.filter-card {
  background-color: var(--surface);
  border: 1px solid var(--border);
}

.filter-label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.filter-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 10px;
  background-color: var(--surface-alt);
  border: 1.5px solid var(--border);
  color: var(--text);
  font-size: 0.85rem;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}
.filter-input:focus {
  border-color: var(--brand);
  background-color: var(--surface);
}

.filter-hint {
  font-size: 0.74rem;
  color: var(--text-faint);
}

.table-card {
  background-color: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.05);
}

.table-head {
  background: linear-gradient(to right, var(--surface-alt), var(--surface-alt));
  border-bottom: 2px solid var(--border);
}

.col-header {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  white-space: nowrap;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.table-row { transition: background-color 0.1s; }
.table-row:hover { background-color: var(--surface-alt); }

.movement-date {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.movement-product {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}

.movement-type-icon {
  width: 40px;
  height: 40px;
}

.product-desc {
  font-size: 0.72rem;
  color: var(--text-faint);
}

.stock-value {
  font-size: 0.9rem;
  font-weight: 700;
}

.stock-unit {
  font-size: 0.72rem;
  color: var(--text-faint);
}

.status-badge {
  padding: 4px 10px;
  font-size: 0.72rem;
  font-weight: 700;
}

.category-badge-sm {
  padding: 2px 8px;
  font-size: 0.68rem;
  font-weight: 600;
}

.mobile-product-name {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text);
}

.empty-icon-wrap {
  width: 64px;
  height: 64px;
  background-color: var(--surface-alt);
}

.empty-icon-wrap-sm {
  width: 56px;
  height: 56px;
  background-color: var(--surface-alt);
}

.empty-text {
  color: var(--text-faint);
  font-size: 0.9rem;
  font-weight: 500;
}

.fab {
  bottom: 24px;
  right: 20px;
  width: 54px;
  height: 54px;
  background: linear-gradient(135deg, var(--brand), var(--brand));
  color: var(--brand-ink);
  box-shadow: 0 4px 18px rgba(198, 113, 57, 0.5);
  z-index: 20;
  transition: transform 0.18s;
}
.fab:hover { transform: scale(1.1); }

/* ── Modal chrome (mirrors product-list.vue's own — scoped styles don't cross files) ── */
.modal-overlay {
  background-color: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
}

.modal-container-sm {
  max-width: 480px;
  max-height: 92vh;
  background-color: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
}

.modal-header {
  border-bottom: 1px solid var(--border);
}

.modal-icon-wrap {
  width: 36px;
  height: 36px;
}

.modal-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--brand);
}

.modal-label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.02em;
}

.btn-modal-close {
  background: none;
  color: var(--text-muted);
  transition: all 0.15s;
}
.btn-modal-close:hover { background-color: var(--surface-alt); }

.btn-modal-cancel {
  border: 1.5px solid var(--border);
  color: var(--text-muted);
  font-size: 0.88rem;
  background: var(--surface);
  font-weight: 500;
  transition: all 0.15s;
}
.btn-modal-cancel:hover { background-color: var(--surface-alt); }

.btn-primary {
  background: linear-gradient(135deg, var(--brand) 0%, var(--brand) 100%);
  color: var(--brand-ink);
  font-size: 0.82rem;
  font-weight: 600;
  box-shadow: 0 2px 10px rgba(198, 113, 57, 0.35);
  transition: all 0.18s;
}
.btn-primary:hover {
  box-shadow: 0 6px 20px rgba(198, 113, 57, 0.45);
  transform: translateY(-1px);
}

.btn-intake-confirm {
  background: linear-gradient(135deg, var(--status-ok-fg), var(--status-ok-fg));
  color: var(--brand-ink);
  font-size: 0.88rem;
  font-weight: 700;
  box-shadow: 0 2px 10px rgba(22, 163, 74, 0.3);
  transition: all 0.18s;
}
.btn-intake-confirm:hover {
  box-shadow: 0 4px 16px rgba(22, 163, 74, 0.45);
  transform: translateY(-1px);
}

.btn-adjust-direction {
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.15s;
}
.btn-adjust-direction-active-remove {
  border-color: var(--status-critical-fg);
  color: var(--status-critical-fg);
  background: var(--status-critical-bg);
}
.btn-adjust-direction-active-add {
  border-color: var(--status-ok-fg);
  color: var(--status-ok-fg);
  background: var(--status-ok-bg);
}

.modal-field-hint {
  font-size: 0.7rem;
  color: var(--text-faint);
}
.modal-field-hint-emphasis {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--brand);
  margin-top: 0.35rem;
}

.modal-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  background-color: var(--surface-alt);
  border: 1.5px solid var(--border);
  color: var(--brand);
  font-size: 0.88rem;
  outline: none;
  box-sizing: border-box;
  transition: all 0.18s;
  font-family: inherit;
}
.modal-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(198, 113, 57, 0.12);
  background-color: var(--surface);
}
.modal-input:disabled {
  background-color: var(--surface-alt);
  color: var(--text-faint);
  cursor: not-allowed;
}

.modal-select {
  appearance: none;
  cursor: pointer;
}

.intake-modal-hint {
  font-size: 0.76rem;
  color: var(--text-muted);
  background-color: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  padding: 0.6rem 0.75rem;
}
</style>
