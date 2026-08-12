<script setup>
import { computed, onMounted, ref, toRefs, watch } from 'vue';
import { useI18n }        from 'vue-i18n';
import { useToast }       from 'primevue/usetoast';
import { useConfirm }     from 'primevue';
import useProductStore, { parseLocalDate } from '../../application/product.store.js';
import useIamStore        from '../../../iam/application/iam.store.js';
import { Product, ProductCategory, ProductStatus } from '../../domain/model/product.entity.js';
import { toDateLocale }   from '../../../shared/presentation/date-locale.js';
import { isCustomCategory, orderedCategoryOptions, filterableCategoryOptions } from '../category-options.js';

const { t, locale } = useI18n();
const toast        = useToast();
const confirm      = useConfirm();
const productStore = useProductStore();
const iamStore     = useIamStore();

const { products, productsLoaded, inventory, stockMovements, stockMovementsLoaded, errors } = toRefs(productStore);
const { fetchProducts, fetchInventory, fetchBatches, fetchAllStockMovements,
  addProduct, updateProduct, deleteProduct, registerStockIntake, updateMinimumStock,
  createBatchForProduct, isProductExpiringSoon, isProductExpired } = productStore;

const savingProduct  = ref(false);
const savingIntake   = ref(false);
const deletingProductId = ref(null);

const activeTab            = ref('products');
const searchQuery          = ref('');
const selectedCategory     = ref('Todos');
const selectedStatusFilter = ref('all');
const showProductModal     = ref(false);
const editingProduct       = ref(null);
const showIntakeModal      = ref(false);
const intakeTargetProduct  = ref(null);

/**
 * Filter dropdown options: only the categories actually in use by this
 * business's real products (fixed or custom), so admins can filter down to
 * the groups they created — otherwise a custom category would only ever be
 * reachable via "Todos". OTHER is excluded here: it's a form trigger for
 * creating a new category, never a real persisted value, so filtering by it
 * would always return zero products.
 * @type {import('vue').ComputedRef<string[]>}
 */
const categoryFilterOptions = computed(() => ['Todos', ...filterableCategoryOptions(products.value)]);

/**
 * Category options for the create/edit product modal — same ordered list
 * as the filter (fixed categories, then custom ones in use, OTHER last),
 * minus "Todos". Lets an admin pick a previously-created custom category
 * (e.g. "Frutas y verduras") directly, instead of having to reselect
 * "Otros" and retype the same label every time.
 * @type {import('vue').ComputedRef<string[]>}
 */
const categoryModalOptions = computed(() => orderedCategoryOptions(products.value));

/**
 * Translated label for a product category (or 'Todos'), reusing the same
 * pos.category-* keys already defined for the POS product grid so the
 * wording stays consistent across bounded contexts and follows the locale.
 *
 * Categories outside the fixed ProductCategory enum are custom labels the
 * admin typed in when "Otros" didn't fit — those have no i18n key, so
 * they're shown verbatim instead of being run through t(), which would
 * otherwise render the raw untranslated key on screen.
 * @param {string} category
 * @returns {string}
 */
function categoryLabel(category) {
  if (category === 'Todos') return t('pos.category-all');
  if (isCustomCategory(category)) return category;
  return t(`pos.category-${category.toLowerCase()}`);
}

const categoryColors = {
  DAIRY:     { bg: '#DBEAFE', color: '#1D4ED8' },
  GRAINS:    { bg: '#FEF9C3', color: '#A16207' },
  OILS:      { bg: '#D1FAE5', color: '#065F46' },
  BEVERAGES: { bg: '#CFFAFE', color: '#0E7490' },
  CLEANING:  { bg: '#EDE9FE', color: '#6D28D9' },
  MEDICINE:  { bg: '#FFE4E6', color: '#BE123C' },
  OTHER:     { bg: '#F1F5F9', color: '#475569' }
};

function getCategoryColor(category) {
  return categoryColors[category] ?? categoryColors.OTHER;
}

function getProductInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

const statusConfig = {
  normal:   { color: '#16A34A', background: '#DCFCE7', icon: 'pi pi-box'                 },
  low:      { color: '#D97706', background: '#FEF3C7', icon: 'pi pi-exclamation-triangle' },
  expiring: { color: '#EA580C', background: '#FFEDD5', icon: 'pi pi-clock'                },
  critical: { color: '#DC2626', background: '#FEE2E2', icon: 'pi pi-exclamation-circle'   },
  expired:  { color: '#7C2D12', background: '#FFE4E1', icon: 'pi pi-ban'                  },
  out:      { color: '#64748B', background: '#F1F5F9', icon: 'pi pi-times-circle'         }
};

/**
 * Translated label for a resolved product status, reusing the existing
 * inventory.status-* keys.
 * @param {string} statusKey
 * @returns {string}
 */
function statusLabel(statusKey) {
  return t(`inventory.status-${statusKey}`);
}

/**
 * Active warehouses for the current business, used to let the user pick
 * where a product's stock is being placed when registering an intake.
 * Not kept in the store's own state (fetchWarehousesForBusiness returns a
 * plain array), so it's held locally here.
 * @type {import('vue').Ref<Array>}
 */
const warehouses = ref([]);

onMounted(() => {
  // Guards on "is someone actually signed in yet", not on which business —
  // every fetch below is scoped server-side by the JWT.
  if (iamStore.currentUser?.businessId) {
    if (!productsLoaded.value) fetchProducts();
    fetchInventory();
    productStore.fetchWarehousesForBusiness().then(list => {
      warehouses.value = list.filter(warehouse => warehouse.status === 'ACTIVE');
    });
  }
  if (!productStore.batchesLoaded) fetchBatches();
});

/**
 * Lazily loads the real stock-movement history the first time the user
 * opens the "Movimientos" tab, instead of fetching it on every Inventory
 * page load regardless of whether that tab is ever viewed.
 */
watch(activeTab, (tab) => {
  if (tab === 'movements' && !stockMovementsLoaded.value && iamStore.currentUser?.businessId) {
    fetchAllStockMovements();
  }
});

/**
 * Resolves a product's inventory status for the summary cards, filter pills
 * and status badge.
 *
 * Business rule: combines the product's stock-level state, summed across
 * every warehouse it's split into (out/low/normal, see
 * getTotalInventoryForProduct), with an independent expiration check
 * against active batches. A product that is both low on
 * stock and expiring soon is reported as 'critical' — the most urgent case.
 * An already-expired batch is reported as its own 'expired' state, distinct
 * from 'expiring' (soon, not yet expired) — this must match Alerts'
 * EXPIRATION/EXPIRED distinction so both screens agree on the same product.
 *
 * @param {number|string} productId
 * @returns {'out'|'expired'|'critical'|'low'|'expiring'|'normal'}
 */
function resolveProductStatus(productId) {
  const inventoryItem = productStore.getTotalInventoryForProduct(productId);
  if (!inventoryItem || inventoryItem.currentStock === 0) return 'out';
  if (isProductExpired(productId)) return 'expired';

  const isLow      = inventoryItem.isLowStock;
  const isExpiring = isProductExpiringSoon(productId);

  if (isLow && isExpiring) return 'critical';
  if (isExpiring)          return 'expiring';
  if (isLow)                return 'low';
  return 'normal';
}

/**
 * Checks whether a product's resolved status matches a filter/pill key.
 * 'low' and 'expiring' filters also include 'critical' products, since a
 * critical product is by definition both low on stock and expiring soon.
 * 'expiring' also includes 'expired', so the "Por vencer" pill still shows
 * every expiration-related product, with the row badge itself telling them apart.
 * 'critical' also includes 'out' and 'expired': those are urgent on their own
 * terms even without the low+expiring combination, matching how the Alerts
 * bounded context defines isCritical (OUT_OF_STOCK or EXPIRED or HIGH severity).
 * @param {string} productStatus
 * @param {string} filterKey
 * @returns {boolean}
 */
function statusMatchesFilter(productStatus, filterKey) {
  if (filterKey === 'all')      return true;
  if (filterKey === 'low')      return productStatus === 'low' || productStatus === 'critical';
  if (filterKey === 'expiring') return productStatus === 'expiring' || productStatus === 'critical' || productStatus === 'expired';
  if (filterKey === 'critical') return productStatus === 'critical' || productStatus === 'out' || productStatus === 'expired';
  return productStatus === filterKey;
}

function resolveCurrentStock(productId) {
  const inventoryItem = productStore.getTotalInventoryForProduct(productId);
  return inventoryItem ? inventoryItem.currentStock : 0;
}

function resolveMinimumStock(productId) {
  const inventoryItem = productStore.getTotalInventoryForProduct(productId);
  return inventoryItem ? inventoryItem.minimumStock : 0;
}

/**
 * Formats the nearest active batch expiration date for a product, or '—' when
 * the product has no active batch with an expiration date.
 * @param {number|string} productId
 * @returns {string}
 */
function resolveExpirationLabel(productId) {
  const daysToExpiry = productStore.getDaysToNearestExpiry(productId);
  if (daysToExpiry === null) return '—';

  const nearestBatch = productStore.batches
      .filter(batch => batch.productId === parseInt(productId) && batch.status === 'ACTIVE' && batch.expiration)
      .reduce((soonest, batch) =>
          !soonest || parseLocalDate(batch.expiration) < parseLocalDate(soonest.expiration) ? batch : soonest, null);

  return parseLocalDate(nearestBatch.expiration).toLocaleDateString(toDateLocale(locale.value), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Resolves a stock movement's product name for display, falling back to a
 * generic "#id" label if the product isn't in the currently loaded list.
 * @param {number|string} productId
 * @returns {string}
 */
function movementProductName(productId) {
  const product = products.value.find(p => p.id === parseInt(productId));
  return product ? product.name : `#${productId}`;
}

/**
 * Formats a stock movement's registeredAt (a real ISO timestamp) into a
 * locale-aware date + time string.
 * @param {string} isoString
 * @returns {string}
 */
function formatMovementDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString(toDateLocale(locale.value), {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

const summaryCounts = computed(() => {
  const counts = { total: products.value.length, low: 0, expiring: 0, out: 0 };
  products.value.forEach(product => {
    const status = resolveProductStatus(product.id);
    if (status === 'out')      counts.out      += 1;
    if (status === 'low' || status === 'critical') counts.low += 1;
    if (status === 'expiring' || status === 'critical' || status === 'expired') counts.expiring += 1;
  });
  return counts;
});

const filteredProducts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return products.value.filter(product => {
    const matchesSearch   = !query || product.name.toLowerCase().includes(query);
    const matchesCategory = selectedCategory.value === 'Todos' || product.category === selectedCategory.value;
    const productStatus   = resolveProductStatus(product.id);
    const matchesStatus   = statusMatchesFilter(productStatus, selectedStatusFilter.value);
    return matchesSearch && matchesCategory && matchesStatus;
  });
});

function countByStatus(statusKey) {
  return products.value.filter(product => statusMatchesFilter(resolveProductStatus(product.id), statusKey)).length;
}

// ── Product modal ──────────────────────────────────────────────────────────────

const productModalForm = ref({
  name:           '',
  category:       ProductCategory.OTHER,
  customCategory: '',
  supplier:       '',
  currentStock:   '',
  minimumStock:   '',
  basePrice:      '',
  cost:           '',
  expirationDate: '',
  warehouseId:    ''
});

function openCreateProductModal() {
  editingProduct.value   = null;
  productModalForm.value = {
    name: '', category: ProductCategory.OTHER, customCategory: '', supplier: '', currentStock: '', minimumStock: '', basePrice: '', cost: '', expirationDate: '',
    warehouseId: warehouses.value[0] ? String(warehouses.value[0].id) : ''
  };
  showProductModal.value = true;
}

function openEditProductModal(product) {
  editingProduct.value = product;

  // Pre-fill cost/expiration from the product's existing active batch so that
  // leaving these fields untouched doesn't silently reset purchasePrice to 0
  // (createBatchForProduct updates the active batch in place on save).
  const activeBatch = productStore.batches.find(
      batch => batch.productId === product.id && batch.status === 'ACTIVE'
  );

  // A product's custom category (if any) is already one of the dropdown's
  // own options (see categoryModalOptions), so it's selected directly —
  // no need to route through "Otros" + a prefilled text field on edit.
  productModalForm.value = {
    name:           product.name,
    category:       product.category,
    customCategory: '',
    supplier:       product.description ?? '',
    currentStock:   String(resolveCurrentStock(product.id)),
    minimumStock:   String(resolveMinimumStock(product.id)),
    basePrice:      String(product.basePrice),
    cost:           activeBatch ? String(activeBatch.purchasePrice) : '',
    expirationDate: activeBatch ? activeBatch.expiration : '',
    warehouseId:    ''
  };
  showProductModal.value = true;
}

function saveProductFromModal() {
  if (!productModalForm.value.name.trim()) return;

  const businessId = iamStore.currentUser?.businessId ?? null;

  // When "Otros" is picked and the admin actually typed a custom label
  // (e.g. "Frutas"), that label becomes the real category instead of the
  // generic OTHER — effectively letting admins create new categories on
  // the fly. Leaving the text blank keeps the plain OTHER behavior.
  const customCategory = productModalForm.value.customCategory.trim();
  const resolvedCategory = productModalForm.value.category === ProductCategory.OTHER && customCategory
      ? customCategory
      : productModalForm.value.category;

  const productEntity = new Product({
    id:          editingProduct.value ? editingProduct.value.id : null,
    businessId:  businessId,
    name:        productModalForm.value.name.trim(),
    category:    resolvedCategory,
    description: productModalForm.value.supplier,
    basePrice:   parseFloat(productModalForm.value.basePrice) || 0,
    status:      ProductStatus.ACTIVE
  });

  const minimumStock   = parseInt(productModalForm.value.minimumStock) || 0;
  const purchasePrice  = parseFloat(productModalForm.value.cost) || 0;
  const expirationDate = productModalForm.value.expirationDate;

  savingProduct.value = true;
  const savePromise = editingProduct.value
      ? updateProduct(productEntity)
          .then(() => updateMinimumStock(editingProduct.value.id, minimumStock))
          .then(() => {
            if (expirationDate) {
              return createBatchForProduct({ productId: editingProduct.value.id, expiration: expirationDate, purchasePrice });
            }
          })
      : addProduct(productEntity).then(createdProduct => {
        const initialStock = parseInt(productModalForm.value.currentStock) || 0;
        // Always create the inventory record, even with 0 initial stock, so
        // minimumStock has somewhere to persist (see registerStockIntake).
        const warehouseId = productModalForm.value.warehouseId ? parseInt(productModalForm.value.warehouseId) : null;
        const intakePromise = registerStockIntake({ productId: createdProduct.id, quantity: initialStock, minimumStock, warehouseId });

        return intakePromise.then(createdInventoryItem => {
          if (expirationDate) {
            return createBatchForProduct({
              productId:   createdProduct.id,
              expiration:  expirationDate,
              purchasePrice,
              inventoryId: createdInventoryItem ? createdInventoryItem.id : null
            });
          }
        });
      });

  savePromise
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('inventory.toast-save-success'), life: 3500 });
        showProductModal.value = false;
        // A new product with initial stock just recorded a StockMovement
        // server-side (see registerStockIntake) — refresh so "Movimientos"
        // reflects it without requiring a full page reload.
        if (!editingProduct.value) fetchAllStockMovements();
      })
      .catch(() => {
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('inventory.toast-save-error'), life: 4500 });
      })
      .finally(() => {
        savingProduct.value = false;
      });
}

/**
 * Deletes a product after confirmation.
 * Business rule (enforced by the store): a product with stock > 0 cannot be
 * deleted — checked client-side first so the user gets an immediate,
 * friendly explanation instead of a generic error after confirming.
 * @param {import('../../domain/model/product.entity.js').Product} product
 */
function handleDeleteProduct(product) {
  if (resolveCurrentStock(product.id) > 0) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-delete-has-stock'), life: 5000 });
    return;
  }

  confirm.require({
    message: t('inventory.confirm-delete-body', { name: product.name }),
    header:  t('inventory.confirm-delete-header'),
    icon:    'pi pi-exclamation-triangle',
    accept:  () => {
      deletingProductId.value = product.id;
      deleteProduct(product.id)
          .then(() => {
            toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('inventory.toast-delete-success'), life: 3500 });
          })
          .catch(() => {
            toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('inventory.toast-delete-error'), life: 4500 });
          })
          .finally(() => {
            deletingProductId.value = null;
          });
    }
  });
}

// ── Intake modal ───────────────────────────────────────────────────────────────

const intakeForm = ref({ productId: '', quantity: '', supplier: '', note: '', warehouseId: '' });

/**
 * Defaults the intake warehouse to where a product's stock already lives,
 * so leaving the selector untouched never silently moves it elsewhere —
 * only falls back to the first warehouse for a product with no inventory
 * record yet (shouldn't normally happen, since every product gets one).
 * @param {number|string} productId
 * @returns {string}
 */
function resolveWarehouseIdForProduct(productId) {
  const inventoryItem = productStore.getInventoryByProduct(productId);
  if (inventoryItem && inventoryItem.warehouseId) return String(inventoryItem.warehouseId);
  return warehouses.value[0] ? String(warehouses.value[0].id) : '';
}

function openIntakeModal(product) {
  intakeTargetProduct.value = product;
  const initialProductId = product ? String(product.id) : (products.value[0] ? String(products.value[0].id) : '');
  intakeForm.value = {
    productId:   initialProductId,
    quantity:    '',
    supplier:    '',
    note:        '',
    warehouseId: resolveWarehouseIdForProduct(initialProductId)
  };
  showIntakeModal.value = true;
}

/**
 * Keeps the warehouse selector in sync when the admin picks a different
 * product from the dropdown (the generic "Registrar ingreso" entry point,
 * not tied to one product's row), so it still defaults to that product's
 * real current warehouse instead of staying on whatever was selected before.
 */
watch(() => intakeForm.value.productId, (newProductId) => {
  if (!showIntakeModal.value || !newProductId) return;
  intakeForm.value.warehouseId = resolveWarehouseIdForProduct(newProductId);
});

function saveIntake() {
  const quantity = parseInt(intakeForm.value.quantity);
  if (!intakeForm.value.productId || !quantity || quantity <= 0) return;

  savingIntake.value = true;
  registerStockIntake({
    productId:   parseInt(intakeForm.value.productId),
    quantity:    quantity,
    warehouseId: intakeForm.value.warehouseId ? parseInt(intakeForm.value.warehouseId) : null,
    supplier:    intakeForm.value.supplier,
    note:        intakeForm.value.note
  })
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('inventory.toast-intake-success'), life: 3500 });
        showIntakeModal.value = false;
        // The intake just recorded a StockMovement server-side — refresh so
        // "Movimientos" reflects it without requiring a full page reload.
        fetchAllStockMovements();
      })
      .catch(() => {
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('inventory.toast-intake-error'), life: 4500 });
      })
      .finally(() => {
        savingIntake.value = false;
      });
}

function formatCurrency(amount) {
  return `S/ ${Number(amount).toFixed(2)}`;
}

/**
 * Builds one card/table entry for the Almacén tab from the set of inventory
 * items belonging to a single warehouse.
 * @param {number} key
 * @param {string} name
 * @param {string} location
 * @param {import('../../domain/model/inventory-item.entity.js').InventoryItem[]} items
 */
function buildWarehouseSummaryEntry(key, name, location, items) {
  const value = items.reduce((sum, item) => {
    const product = products.value.find(p => p.id === item.productId);
    return sum + (item.currentStock * (product?.basePrice ?? 0));
  }, 0);
  return { key, name, location, itemCount: items.length, value: formatCurrency(value) };
}

/**
 * Per-warehouse stock summary for the Almacén tab.
 *
 * Computed entirely from data already loaded by this view (inventory,
 * products, warehouses) — every InventoryItem already carries its own real
 * warehouseId, so no separate API call or the previously-broken
 * WarehouseStock entity is needed.
 *
 * Business rule: every inventory record is expected to have a real
 * warehouseId — a product with no assigned warehouse is a data problem to
 * fix at the source (see registerStockIntake's warehouse selector), not a
 * state this view should normalize into its own "unassigned" bucket.
 * @type {import('vue').ComputedRef<Array>}
 */
const warehouseSummary = computed(() => warehouses.value.map(warehouse =>
    buildWarehouseSummaryEntry(
        warehouse.id,
        warehouse.name,
        warehouse.address,
        inventory.value.filter(item => item.warehouseId === warehouse.id)
    )
));

/**
 * Currently selected warehouse card (drives which warehouse's products the
 * distribution table below shows). Null means "not chosen yet" — defaults
 * to the first available entry so the table is never empty on first load.
 * @type {import('vue').Ref<number|null>}
 */
const selectedWarehouseKey = ref(null);

const activeWarehouseKey = computed(() => selectedWarehouseKey.value ?? (warehouseSummary.value[0]?.key ?? null));

/**
 * Inventory items belonging to the currently selected warehouse, joined
 * with their product for display in the distribution table.
 * @type {import('vue').ComputedRef<Array>}
 */
const warehouseTableRows = computed(() => {
  const items = inventory.value.filter(item => item.warehouseId === activeWarehouseKey.value);
  return items
      .map(item => ({ item, product: products.value.find(p => p.id === item.productId) }))
      .filter(row => row.product);
});

// ── New warehouse modal ─────────────────────────────────────────────────────

const showWarehouseModal = ref(false);
const savingWarehouse    = ref(false);
const warehouseForm      = ref({ name: '', code: '', address: '', capacity: 'MEDIUM' });

function openWarehouseModal() {
  warehouseForm.value = { name: '', code: '', address: '', capacity: 'MEDIUM' };
  showWarehouseModal.value = true;
}

function saveWarehouse() {
  const name = warehouseForm.value.name.trim();
  if (!name) return;

  savingWarehouse.value = true;

  productStore.createWarehouse({
    name,
    code:     warehouseForm.value.code.trim(),
    address:  warehouseForm.value.address.trim(),
    capacity: warehouseForm.value.capacity
  })
      .then(createdWarehouse => {
        warehouses.value.push(createdWarehouse);
        selectedWarehouseKey.value = createdWarehouse.id;
        showWarehouseModal.value = false;
      })
      .finally(() => {
        savingWarehouse.value = false;
      });
}
</script>

<template>
  <div class="page-wrapper">

    <!-- ── Header ─────────────────────────────────────────────────── -->
    <div style="margin-bottom: 1.25rem;">
      <div class="flex align-items-start justify-content-between gap-3 flex-wrap">
        <div>
          <h1 class="m-0 page-title">{{ t('inventory.title') }}</h1>
          <p class="m-0 mt-1 page-subtitle">{{ t('inventory.subtitle') }}</p>
        </div>
        <div class="flex align-items-center gap-2 flex-shrink-0">
          <!-- Register intake (hidden on mobile, replaced by FAB) -->
          <button
              class="hidden sm:flex align-items-center gap-2 px-3 py-2 border-round-xl cursor-pointer btn-intake-outline"
              :title="t('inventory.intake-modal-hint')"
              @click="openIntakeModal(null)"
          >
            <i class="pi pi-inbox" style="font-size: 0.9rem;"/>
            {{ t('inventory.btn-register-intake') }}
          </button>
          <!-- New product -->
          <button
              class="flex align-items-center gap-2 px-3 py-2 border-round-xl border-none cursor-pointer btn-primary"
              @click="openCreateProductModal"
          >
            <i class="pi pi-plus" style="font-size: 0.9rem;"/>
            {{ t('inventory.btn-new-product') }}
          </button>
        </div>
      </div>

      <!-- Stat cards: 2-col mobile → 4-col desktop -->
      <div class="stat-grid mt-4">
        <div
            v-for="stat in [
              { label: t('inventory.stat-total'),    value: summaryCounts.total,    color: '#0B3558', bg: '#EFF6FF', iconBg: '#DBEAFE', icon: 'pi pi-box'                  },
              { label: t('inventory.stat-low'),      value: summaryCounts.low,      color: '#D97706', bg: '#FFFBEB', iconBg: '#FEF3C7', icon: 'pi pi-exclamation-triangle'  },
              { label: t('inventory.stat-expiring'), value: summaryCounts.expiring, color: '#EA580C', bg: '#FFF7ED', iconBg: '#FFEDD5', icon: 'pi pi-clock'                 },
              { label: t('inventory.stat-out'),      value: summaryCounts.out,      color: '#64748B', bg: '#F8FAFC', iconBg: '#E2E8F0', icon: 'pi pi-times-circle'           }
            ]"
            :key="stat.label"
            class="flex align-items-center gap-3 border-round-xl px-4 py-3"
            :style="{ backgroundColor: stat.bg, border: '1px solid #E2E8F0' }"
        >
          <div
              class="flex align-items-center justify-content-center border-round-xl flex-shrink-0 stat-icon"
              :style="{ backgroundColor: stat.iconBg }"
          >
            <i :class="stat.icon" :style="{ color: stat.color, fontSize: '1rem' }"/>
          </div>
          <div>
            <p class="m-0 stat-label">{{ stat.label }}</p>
            <p class="m-0 mt-1 stat-value" :style="{ color: stat.color }">{{ stat.value }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Tabs ────────────────────────────────────────────────────── -->
    <div class="mb-4">
      <div class="flex gap-1 p-1 border-round-xl tab-bar">
        <button
            v-for="tab in [
              { id: 'products',  label: t('inventory.tab-products'),  icon: 'pi pi-box'      },
              { id: 'movements', label: t('inventory.tab-movements'), icon: 'pi pi-clock'    },
              { id: 'warehouse', label: t('inventory.tab-warehouse'), icon: 'pi pi-building' }
            ]"
            :key="tab.id"
            class="flex align-items-center gap-2 px-3 py-2 border-round-lg border-none cursor-pointer tab-btn"
            :style="{
              fontWeight:      activeTab === tab.id ? 700 : 400,
              backgroundColor: activeTab === tab.id ? '#fff' : 'transparent',
              color:           activeTab === tab.id ? '#0B3558' : '#64748B',
              boxShadow:       activeTab === tab.id ? '0 1px 6px rgba(0,0,0,0.10)' : 'none'
            }"
            @click="activeTab = tab.id"
        >
          <i
              :class="tab.icon"
              style="font-size: 0.82rem;"
              :style="{ color: activeTab === tab.id ? '#0E7490' : '#94A3B8' }"
          />
          <span class="hidden sm:inline">{{ tab.label }}</span>
        </button>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         TAB: PRODUCTS
    ═══════════════════════════════════════════════════════════════ -->
    <div v-if="activeTab === 'products'" style="display: flex; flex-direction: column; gap: 1rem;">

      <!-- Search + category filter -->
      <div class="flex flex-column sm:flex-row gap-3">
        <div class="relative" style="flex: 1;">
          <i class="pi pi-search absolute search-icon"/>
          <input
              v-model="searchQuery"
              :placeholder="t('inventory.search-placeholder')"
              class="search-input"
          />
        </div>
        <div class="relative" style="min-width: 160px;">
          <i class="pi pi-filter absolute filter-icon"/>
          <select v-model="selectedCategory" class="category-select">
            <option v-for="cat in categoryFilterOptions" :key="cat" :value="cat">{{ categoryLabel(cat) }}</option>
          </select>
          <i class="pi pi-chevron-down absolute select-arrow"/>
        </div>
      </div>

      <!-- Status filter pills — horizontally scrollable on mobile -->
      <div class="pills-scroll">
        <div class="flex gap-2" style="white-space: nowrap;">
          <button
              v-for="pill in [
                { key: 'all',      label: t('inventory.pill-all')      },
                { key: 'low',      label: t('inventory.pill-low')      },
                { key: 'expiring', label: t('inventory.pill-expiring') },
                { key: 'critical', label: t('inventory.pill-critical') },
                { key: 'out',      label: t('inventory.pill-out')      }
              ]"
              :key="pill.key"
              class="inline-flex align-items-center gap-1 border-round-3xl border-none cursor-pointer pill-btn"
              :style="{
                fontWeight:      selectedStatusFilter === pill.key ? 700 : 400,
                backgroundColor: selectedStatusFilter === pill.key ? '#0B3558' : '#F1F5F9',
                color:           selectedStatusFilter === pill.key ? '#fff'    : '#64748B',
                border:          selectedStatusFilter === pill.key ? 'none'    : '1px solid #E2E8F0',
                transform:       selectedStatusFilter === pill.key ? 'scale(1.05)' : 'scale(1)'
              }"
              @click="selectedStatusFilter = pill.key"
          >
            {{ pill.label }}
            <span
                v-if="pill.key !== 'all'"
                class="border-round-3xl pill-count"
                :style="{
                  backgroundColor: selectedStatusFilter === pill.key ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
                  color:           selectedStatusFilter === pill.key ? '#fff' : '#64748B'
                }"
            >
              {{ countByStatus(pill.key) }}
            </span>
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="!productsLoaded" class="flex justify-content-center align-items-center gap-3 py-8">
        <i class="pi pi-spin pi-spinner" style="font-size: 1.5rem; color: #0E7490;"/>
        <span class="loading-text">{{ t('inventory.loading') }}</span>
      </div>

      <template v-else>
      <!-- Load errors -->
      <div v-if="errors.length > 0" class="product-list-errors">
        {{ t('errors.occurred') }}: {{ errors.map(error => error.message).join(', ') }}
      </div>

      <!-- Desktop table -->
      <div class="hidden md:block border-round-xl overflow-hidden table-card">
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
            <tr class="table-head">
              <th
                  v-for="header in [t('inventory.col-product'), t('inventory.col-category'), t('inventory.col-stock'), t('inventory.col-min'), t('inventory.col-price'), t('inventory.col-expiration'), t('inventory.col-status'), '']"
                  :key="header"
                  class="px-4 py-3 text-left col-header"
              >
                {{ header }}
              </th>
            </tr>
            </thead>
            <tbody>
            <tr
                v-for="(product, index) in filteredProducts"
                :key="product.id"
                class="table-row"
                :style="{ borderBottom: index < filteredProducts.length - 1 ? '1px solid #F1F5F9' : 'none' }"
            >
              <!-- Product name + avatar -->
              <td class="px-4 py-3">
                <div class="flex align-items-center gap-3">
                  <div
                      class="flex align-items-center justify-content-center border-round-lg flex-shrink-0 product-avatar-sm"
                      :style="{ backgroundColor: getCategoryColor(product.category).bg, color: getCategoryColor(product.category).color }"
                  >
                    {{ getProductInitial(product.name) }}
                  </div>
                  <div>
                    <p class="m-0 product-name">{{ product.name }}</p>
                    <p class="m-0 mt-1 product-desc">{{ product.description || '—' }}</p>
                  </div>
                </div>
              </td>
              <!-- Category badge -->
              <td class="px-4 py-3">
                <span
                    class="border-round-2xl category-badge"
                    :style="{ backgroundColor: getCategoryColor(product.category).bg, color: getCategoryColor(product.category).color }"
                >
                  {{ categoryLabel(product.category) }}
                </span>
              </td>
              <!-- Stock -->
              <td class="px-4 py-3">
                <span class="stock-value" :style="{ color: resolveCurrentStock(product.id) === 0 ? '#CBD5E1' : '#0B3558' }">
                  {{ resolveCurrentStock(product.id) }}
                </span>
                <span class="stock-unit"> {{ t('inventory.und') }}</span>
              </td>
              <!-- Min -->
              <td class="px-4 py-3 min-stock-value">{{ resolveMinimumStock(product.id) }}</td>
              <!-- Price -->
              <td class="px-4 py-3 price-value">{{ formatCurrency(product.basePrice) }}</td>
              <!-- Expiration -->
              <td class="px-4 py-3 expiration-placeholder">{{ resolveExpirationLabel(product.id) }}</td>
              <!-- Status badge -->
              <td class="px-4 py-3">
                <span
                    class="inline-flex align-items-center gap-1 border-round-3xl status-badge"
                    :style="{
                      backgroundColor: statusConfig[resolveProductStatus(product.id)]?.background,
                      color:           statusConfig[resolveProductStatus(product.id)]?.color
                    }"
                >
                  <i :class="statusConfig[resolveProductStatus(product.id)]?.icon" style="font-size: 0.65rem;"/>
                  {{ statusLabel(resolveProductStatus(product.id)) }}
                </span>
              </td>
              <!-- Actions -->
              <td class="px-4 py-3">
                <div class="flex align-items-center gap-1 justify-content-end">
                  <button
                      class="p-2 border-round-lg border-none cursor-pointer btn-icon-intake"
                      :title="t('inventory.btn-register-intake')"
                      :aria-label="t('inventory.btn-register-intake')"
                      @click="openIntakeModal(product)"
                  >
                    <i class="pi pi-inbox" style="font-size: 0.95rem;"/>
                  </button>
                  <button
                      class="p-2 border-round-lg border-none cursor-pointer btn-icon-edit"
                      :title="t('inventory.btn-edit')"
                      :aria-label="t('inventory.btn-edit')"
                      @click="openEditProductModal(product)"
                  >
                    <i class="pi pi-pencil" style="font-size: 0.9rem;"/>
                  </button>
                  <button
                      class="p-2 border-round-lg border-none cursor-pointer btn-icon-delete"
                      :disabled="deletingProductId === product.id"
                      :title="t('inventory.btn-delete')"
                      :aria-label="t('inventory.btn-delete')"
                      @click="handleDeleteProduct(product)"
                  >
                    <i :class="deletingProductId === product.id ? 'pi pi-spin pi-spinner' : 'pi pi-trash'" style="font-size: 0.9rem;"/>
                  </button>
                </div>
              </td>
            </tr>
            </tbody>
          </table>

          <!-- Empty state -->
          <div v-if="filteredProducts.length === 0" class="flex flex-column align-items-center py-12 gap-3">
            <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap">
              <i class="pi pi-box" style="font-size: 1.8rem; color: #CBD5E1;"/>
            </div>
            <p class="m-0 empty-text">{{ t('inventory.no-results') }}</p>
          </div>
        </div>
      </div>
      </template>

      <!-- Mobile cards -->
      <div class="md:hidden" style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div
            v-if="filteredProducts.length === 0"
            class="flex flex-column align-items-center py-10 border-round-xl gap-3 table-card"
        >
          <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap-sm">
            <i class="pi pi-box" style="font-size: 1.6rem; color: #CBD5E1;"/>
          </div>
          <p class="m-0 empty-text">{{ t('inventory.no-results') }}</p>
        </div>

        <div
            v-for="product in filteredProducts"
            :key="product.id"
            class="p-4 border-round-xl mobile-card"
        >
          <!-- Card header: avatar + name + status -->
          <div class="flex align-items-start gap-3 mb-3">
            <div
                class="flex align-items-center justify-content-center border-round-lg flex-shrink-0 product-avatar-lg"
                :style="{ backgroundColor: getCategoryColor(product.category).bg, color: getCategoryColor(product.category).color }"
            >
              {{ getProductInitial(product.name) }}
            </div>
            <div style="flex: 1; min-width: 0;">
              <p class="m-0 mobile-product-name">{{ product.name }}</p>
              <span
                  class="border-round-2xl mt-1 inline-block category-badge-sm"
                  :style="{ backgroundColor: getCategoryColor(product.category).bg, color: getCategoryColor(product.category).color }"
              >
                {{ categoryLabel(product.category) }}
              </span>
            </div>
            <span
                class="inline-flex align-items-center gap-1 border-round-3xl flex-shrink-0 status-badge"
                :style="{
                  backgroundColor: statusConfig[resolveProductStatus(product.id)]?.background,
                  color:           statusConfig[resolveProductStatus(product.id)]?.color
                }"
            >
              <i :class="statusConfig[resolveProductStatus(product.id)]?.icon" style="font-size: 0.65rem;"/>
              {{ statusLabel(resolveProductStatus(product.id)) }}
            </span>
          </div>

          <!-- Stats mini-cards -->
          <div class="mb-3 mini-stats-grid">
            <div class="border-round-lg p-2 text-center mini-stat">
              <p class="m-0 mb-1 mini-stat-label">{{ t('inventory.col-stock') }}</p>
              <p class="m-0 mini-stat-value" :style="{ color: resolveCurrentStock(product.id) === 0 ? '#CBD5E1' : '#0B3558' }">
                {{ resolveCurrentStock(product.id) }}
              </p>
            </div>
            <div class="border-round-lg p-2 text-center mini-stat">
              <p class="m-0 mb-1 mini-stat-label">{{ t('inventory.col-min') }}</p>
              <p class="m-0 mini-stat-value" style="color: #64748B;">{{ resolveMinimumStock(product.id) }}</p>
            </div>
            <div class="border-round-lg p-2 text-center mini-stat">
              <p class="m-0 mb-1 mini-stat-label">{{ t('inventory.col-price') }}</p>
              <p class="m-0 mini-price-value">{{ formatCurrency(product.basePrice) }}</p>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="flex gap-2">
            <button
                class="flex-1 flex align-items-center justify-content-center gap-2 py-2 border-round-xl border-none cursor-pointer btn-mobile-intake"
                @click="openIntakeModal(product)"
            >
              <i class="pi pi-inbox" style="font-size: 0.82rem;"/>
              {{ t('inventory.btn-intake-short') }}
            </button>
            <button
                class="flex-1 flex align-items-center justify-content-center gap-2 py-2 border-round-xl cursor-pointer btn-mobile-edit"
                @click="openEditProductModal(product)"
            >
              <i class="pi pi-pencil" style="font-size: 0.82rem;"/>
              {{ t('inventory.btn-edit') }}
            </button>
            <button
                class="flex align-items-center justify-content-center py-2 px-3 border-round-xl cursor-pointer btn-mobile-delete"
                :disabled="deletingProductId === product.id"
                :aria-label="t('inventory.btn-delete')"
                @click="handleDeleteProduct(product)"
            >
              <i :class="deletingProductId === product.id ? 'pi pi-spin pi-spinner' : 'pi pi-trash'" style="font-size: 0.82rem;"/>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- FAB: mobile quick intake -->
    <button
        v-if="activeTab === 'products'"
        class="sm:hidden fixed flex align-items-center justify-content-center border-round-3xl border-none cursor-pointer fab"
        @click="openIntakeModal(null)"
    >
      <i class="pi pi-inbox" style="font-size: 1.3rem;"/>
    </button>

    <!-- ══════════════════════════════════════════════════════════════
         TAB: MOVEMENTS
    ═══════════════════════════════════════════════════════════════ -->
    <div v-if="activeTab === 'movements'" class="border-round-xl overflow-hidden table-card">
      <!-- Desktop table -->
      <div class="hidden md:block" style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
          <tr class="table-head">
            <th
                v-for="header in [t('inventory.col-date'), t('inventory.col-movement-product'), t('inventory.col-type'), t('inventory.col-qty'), t('inventory.col-supplier'), t('inventory.col-note')]"
                :key="header"
                class="px-4 py-3 text-left col-header"
            >
              {{ header }}
            </th>
          </tr>
          </thead>
          <tbody>
          <tr
              v-for="(movement, index) in stockMovements"
              :key="movement.id"
              class="table-row"
              :style="{ borderBottom: index < stockMovements.length - 1 ? '1px solid #F1F5F9' : 'none' }"
          >
            <td class="px-4 py-3 movement-date">{{ formatMovementDate(movement.registeredAt) }}</td>
            <td class="px-4 py-3 movement-product">{{ movementProductName(movement.productId) }}</td>
            <td class="px-4 py-3">
              <span
                  class="inline-flex align-items-center gap-1 border-round-3xl status-badge"
                  :style="{
                    backgroundColor: movement.type === 'INTAKE' ? '#DCFCE7' : movement.type === 'SALE' ? '#FEE2E2' : '#FEF3C7',
                    color:           movement.type === 'INTAKE' ? '#16A34A' : movement.type === 'SALE' ? '#DC2626' : '#D97706'
                  }"
              >
                <i
                    :class="movement.type === 'INTAKE' ? 'pi pi-arrow-circle-up' : movement.type === 'SALE' ? 'pi pi-arrow-circle-down' : 'pi pi-refresh'"
                    style="font-size: 0.65rem;"
                />
                {{ movement.type === 'INTAKE' ? t('inventory.movement-intake') : movement.type === 'SALE' ? t('inventory.movement-sale') : t('inventory.movement-adjustment') }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span
                  class="stock-value"
                  :style="{ color: movement.signedQuantity !== undefined ? (movement.signedQuantity < 0 ? '#DC2626' : '#16A34A') : '#16A34A' }"
              >
                {{ movement.signedQuantity !== undefined ? (movement.signedQuantity > 0 ? '+' : '') + movement.signedQuantity : '+' + movement.quantity }}
              </span>
              <span class="stock-unit"> und.</span>
            </td>
            <td class="px-4 py-3 movement-date">{{ movement.supplier ?? '—' }}</td>
            <td class="px-4 py-3 product-desc">{{ movement.note ?? '—' }}</td>
          </tr>
          </tbody>
        </table>
        <div v-if="!stockMovements.length" class="flex flex-column align-items-center py-12 gap-3">
          <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap">
            <i class="pi pi-clock" style="font-size: 1.8rem; color: #CBD5E1;"/>
          </div>
          <p class="m-0 empty-text">{{ t('inventory.no-movements') }}</p>
        </div>
      </div>

      <!-- Mobile movement list -->
      <div class="md:hidden">
        <div v-if="!stockMovements.length" class="flex flex-column align-items-center py-10 gap-3">
          <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap-sm">
            <i class="pi pi-clock" style="font-size: 1.6rem; color: #CBD5E1;"/>
          </div>
          <p class="m-0 empty-text">{{ t('inventory.no-movements') }}</p>
        </div>
        <div
            v-for="(movement, index) in stockMovements"
            :key="movement.id"
            class="flex align-items-start gap-3 p-4"
            :style="{ borderBottom: index < stockMovements.length - 1 ? '1px solid #F1F5F9' : 'none' }"
        >
          <!-- Type icon circle -->
          <div
              class="flex align-items-center justify-content-center border-round-lg flex-shrink-0 movement-type-icon"
              :style="{ backgroundColor: movement.type === 'INTAKE' ? '#DCFCE7' : movement.type === 'SALE' ? '#FEE2E2' : '#FEF3C7' }"
          >
            <i
                :class="movement.type === 'INTAKE' ? 'pi pi-arrow-circle-up' : movement.type === 'SALE' ? 'pi pi-arrow-circle-down' : 'pi pi-refresh'"
                style="font-size: 1.05rem;"
                :style="{ color: movement.type === 'INTAKE' ? '#16A34A' : movement.type === 'SALE' ? '#DC2626' : '#D97706' }"
            />
          </div>
          <div style="flex: 1; min-width: 0;">
            <div class="flex align-items-center justify-content-between gap-2">
              <p class="m-0 mobile-product-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ movementProductName(movement.productId) }}</p>
              <p
                  class="m-0 flex-shrink-0 stock-value"
                  :style="{ color: movement.type === 'SALE' ? '#DC2626' : '#16A34A' }"
              >
                {{ movement.type === 'SALE' ? '-' : '+' }}{{ movement.quantity }}
              </p>
            </div>
            <div class="flex align-items-center gap-2 mt-1 flex-wrap">
              <span
                  class="border-round-3xl inline-block category-badge-sm"
                  :style="{
                    backgroundColor: movement.type === 'INTAKE' ? '#DCFCE7' : movement.type === 'SALE' ? '#FEE2E2' : '#FEF3C7',
                    color:           movement.type === 'INTAKE' ? '#16A34A' : movement.type === 'SALE' ? '#DC2626' : '#D97706'
                  }"
              >
                {{ movement.type === 'INTAKE' ? t('inventory.movement-intake') : movement.type === 'SALE' ? t('inventory.movement-sale') : t('inventory.movement-adjustment') }}
              </span>
              <p class="m-0 product-desc">{{ formatMovementDate(movement.registeredAt) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         TAB: WAREHOUSE
    ═══════════════════════════════════════════════════════════════ -->
    <div v-if="activeTab === 'warehouse'" style="display: flex; flex-direction: column; gap: 1rem;">

      <div class="flex justify-content-end">
        <button
            class="flex align-items-center gap-2 px-3 py-2 border-round-xl border-none cursor-pointer btn-primary"
            @click="openWarehouseModal"
        >
          <i class="pi pi-plus" style="font-size: 0.85rem;"/>
          {{ t('inventory.btn-new-warehouse') }}
        </button>
      </div>

      <!-- Warehouse summary cards — double as filter buttons for the table below -->
      <div class="stat-grid">
        <button
            v-for="warehouse in warehouseSummary"
            :key="warehouse.key"
            class="border-round-xl overflow-hidden table-card warehouse-card-btn"
            :class="{ 'warehouse-card-btn-active': activeWarehouseKey === warehouse.key }"
            @click="selectedWarehouseKey = warehouse.key"
        >
          <div style="height: 4px; background: linear-gradient(to right, #0E7490, #0B3558);"/>
          <div class="p-5">
            <div class="flex align-items-start gap-3 mb-4">
              <div class="flex align-items-center justify-content-center border-round-xl flex-shrink-0 warehouse-icon">
                <i class="pi pi-building" style="color: #0E7490; font-size: 1.1rem;"/>
              </div>
              <div>
                <p class="m-0 warehouse-name">{{ warehouse.name }}</p>
                <p v-if="warehouse.location" class="m-0 mt-1 product-desc">
                  <i class="pi pi-map-marker" style="font-size: 0.7rem;"/> {{ warehouse.location }}
                </p>
              </div>
            </div>
            <div class="warehouse-stats-grid">
              <div class="border-round-xl p-3 mini-stat">
                <p class="m-0 mb-1 mini-stat-label">{{ t('inventory.warehouse-card-products') }}</p>
                <p class="m-0 warehouse-count">{{ warehouse.itemCount }}</p>
              </div>
              <div class="border-round-xl p-3 warehouse-value-card">
                <p class="m-0 mb-1 warehouse-value-label">{{ t('inventory.warehouse-col-value') }}</p>
                <p class="m-0 warehouse-value">{{ warehouse.value }}</p>
              </div>
            </div>
          </div>
        </button>
      </div>

      <!-- Distribution table for the selected warehouse -->
      <div class="border-round-xl overflow-hidden table-card">
        <div class="px-5 py-3 flex align-items-center gap-2 section-header">
          <i class="pi pi-table" style="color: #0E7490; font-size: 0.88rem;"/>
          <p class="m-0 section-header-text">{{ t('inventory.warehouse-title') }}</p>
        </div>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
            <tr class="table-head">
              <th
                  v-for="header in [t('inventory.warehouse-col-product'), t('inventory.warehouse-col-stock'), t('inventory.warehouse-col-expiration'), t('inventory.warehouse-col-value')]"
                  :key="header"
                  class="px-4 py-3 text-left col-header"
              >{{ header }}</th>
            </tr>
            </thead>
            <tbody>
            <tr
                v-for="(row, index) in warehouseTableRows"
                :key="row.item.id"
                class="table-row"
                :style="{ borderBottom: index < warehouseTableRows.length - 1 ? '1px solid #F1F5F9' : 'none' }"
            >
              <td class="px-4 py-3">
                <div class="flex align-items-center gap-2">
                  <div
                      class="flex align-items-center justify-content-center border-round flex-shrink-0 product-avatar-xs"
                      :style="{ backgroundColor: getCategoryColor(row.product.category).bg, color: getCategoryColor(row.product.category).color }"
                  >
                    {{ getProductInitial(row.product.name) }}
                  </div>
                  <span class="product-name">{{ row.product.name }}</span>
                </div>
              </td>
              <td class="px-4 py-3 warehouse-stock">{{ row.item.currentStock }} und.</td>
              <td class="px-4 py-3 expiration-placeholder">{{ resolveExpirationLabel(row.product.id) }}</td>
              <td class="px-4 py-3">
                <span class="warehouse-total">{{ formatCurrency(row.item.currentStock * (row.product.basePrice ?? 0)) }}</span>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
        <div v-if="!warehouseTableRows.length" class="flex flex-column align-items-center py-12 gap-3">
          <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap">
            <i class="pi pi-building" style="font-size: 1.8rem; color: #CBD5E1;"/>
          </div>
          <p class="m-0 empty-text">{{ t('inventory.warehouse-empty') }}</p>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         MODAL: PRODUCT CREATE / EDIT
    ═══════════════════════════════════════════════════════════════ -->
    <div
        v-if="showProductModal"
        class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center modal-overlay"
        @click.self="showProductModal = false"
    >
      <div class="w-full border-round-t-2xl sm:border-round-2xl overflow-y-auto modal-container">
        <!-- Modal header -->
        <div class="flex align-items-center justify-content-between px-5 py-4 modal-header">
          <div class="flex align-items-center gap-3">
            <div class="flex align-items-center justify-content-center border-round-lg modal-icon-wrap" style="background: linear-gradient(135deg, #E0F2FE, #DBEAFE);">
              <i class="pi pi-box" style="color: #0E7490; font-size: 0.95rem;"/>
            </div>
            <p class="m-0 modal-title">
              {{ editingProduct ? t('inventory.modal-edit-product') : t('inventory.modal-new-product') }}
            </p>
          </div>
          <button class="p-2 border-round-lg border-none cursor-pointer btn-modal-close" @click="showProductModal = false">
            <i class="pi pi-times" style="font-size: 1rem;"/>
          </button>
        </div>

        <div class="px-5 py-5">
          <div class="flex flex-column gap-4">

            <!-- Name -->
            <div>
              <label class="modal-label">{{ t('inventory.modal-field-name') }}</label>
              <input v-model="productModalForm.name" :placeholder="t('inventory.modal-field-name-placeholder')" class="modal-input"/>
            </div>

            <!-- Category + Supplier (2-col on sm+) -->
            <div class="flex flex-column sm:flex-row gap-4">
              <div style="flex: 1;">
                <label class="modal-label">{{ t('inventory.modal-field-category') }}</label>
                <select v-model="productModalForm.category" class="modal-input modal-select">
                  <option v-for="cat in categoryModalOptions" :key="cat" :value="cat">{{ categoryLabel(cat) }}</option>
                </select>
              </div>
              <div style="flex: 1;">
                <label class="modal-label">{{ t('inventory.modal-field-supplier') }}</label>
                <input v-model="productModalForm.supplier" :placeholder="t('inventory.modal-field-supplier-placeholder')" class="modal-input"/>
              </div>
            </div>

            <!-- Custom category (only shown when "Otros" is selected) -->
            <div v-if="productModalForm.category === 'OTHER'">
              <label class="modal-label">{{ t('inventory.modal-field-custom-category') }}</label>
              <input
                  v-model="productModalForm.customCategory"
                  :placeholder="t('inventory.modal-field-custom-category-placeholder')"
                  class="modal-input"
              />
              <p class="m-0 mt-1 modal-field-hint">{{ t('inventory.modal-field-custom-category-hint') }}</p>
            </div>

            <!-- Stock actual + Stock mínimo -->
            <div class="flex flex-column sm:flex-row gap-4">
              <div style="flex: 1;">
                <label class="modal-label">{{ t('inventory.modal-field-stock') }}</label>
                <input
                    v-model="productModalForm.currentStock"
                    type="number" min="0" placeholder="0"
                    class="modal-input"
                    :disabled="!!editingProduct"
                    :title="editingProduct ? t('inventory.modal-field-stock-readonly-hint') : ''"
                />
                <p v-if="editingProduct" class="m-0 mt-1 modal-field-hint">
                  {{ t('inventory.modal-field-stock-readonly-hint') }}
                </p>
              </div>
              <div style="flex: 1;">
                <label class="modal-label">{{ t('inventory.modal-field-min-stock') }}</label>
                <input v-model="productModalForm.minimumStock" type="number" min="0" placeholder="0" class="modal-input"/>
              </div>
            </div>

            <!-- Warehouse (only relevant when placing initial stock on creation) -->
            <div v-if="!editingProduct">
              <label class="modal-label">{{ t('inventory.modal-field-warehouse') }}</label>
              <select v-model="productModalForm.warehouseId" class="modal-input modal-select">
                <option value="" disabled>{{ t('inventory.modal-field-warehouse-placeholder') }}</option>
                <option v-for="warehouse in warehouses" :key="warehouse.id" :value="String(warehouse.id)">
                  {{ warehouse.name }}
                </option>
              </select>
            </div>

            <!-- Precio venta + Precio costo -->
            <div class="flex flex-column sm:flex-row gap-4">
              <div style="flex: 1;">
                <label class="modal-label">{{ t('inventory.modal-field-price') }}</label>
                <input v-model="productModalForm.basePrice" type="number" min="0" step="0.01" placeholder="0.00" class="modal-input"/>
              </div>
              <div style="flex: 1;">
                <label class="modal-label">{{ t('inventory.modal-field-cost') }}</label>
                <input v-model="productModalForm.cost" type="number" min="0" step="0.01" placeholder="0.00" class="modal-input"/>
              </div>
            </div>

            <!-- Expiration date -->
            <div>
              <label class="modal-label">{{ t('inventory.modal-field-expiration') }}</label>
              <input v-model="productModalForm.expirationDate" type="date" class="modal-input"/>
            </div>
          </div>

          <!-- Modal actions -->
          <div class="flex gap-3 mt-5">
            <button class="flex-1 py-2 border-round-xl cursor-pointer btn-modal-cancel" :disabled="savingProduct" @click="showProductModal = false">
              {{ t('inventory.modal-cancel') }}
            </button>
            <button class="flex-1 py-2 border-round-xl border-none cursor-pointer btn-modal-primary" :disabled="savingProduct" @click="saveProductFromModal">
              <i v-if="savingProduct" class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>
              {{ savingProduct ? t('inventory.modal-saving') : (editingProduct ? t('inventory.modal-save') : t('inventory.modal-register')) }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         MODAL: STOCK INTAKE
    ═══════════════════════════════════════════════════════════════ -->
    <div
        v-if="showIntakeModal"
        class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center modal-overlay"
        @click.self="showIntakeModal = false"
    >
      <div class="w-full border-round-t-2xl sm:border-round-2xl modal-container-sm">
        <!-- Modal header -->
        <div class="flex align-items-center justify-content-between px-5 py-4 modal-header">
          <div class="flex align-items-center gap-3">
            <div class="flex align-items-center justify-content-center border-round-lg modal-icon-wrap" style="background: linear-gradient(135deg, #DCFCE7, #BBF7D0);">
              <i class="pi pi-inbox" style="color: #16A34A; font-size: 0.95rem;"/>
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
          <!-- Product selector -->
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-product') }}</label>
            <select v-model="intakeForm.productId" class="modal-input modal-select">
              <option v-for="product in products" :key="product.id" :value="String(product.id)">{{ product.name }}</option>
            </select>
          </div>
          <!-- Quantity -->
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-qty') }}</label>
            <input v-model="intakeForm.quantity" type="number" min="1" placeholder="0" class="modal-input"/>
          </div>
          <!-- Warehouse -->
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-warehouse') }}</label>
            <select v-model="intakeForm.warehouseId" class="modal-input modal-select">
              <option value="" disabled>{{ t('inventory.modal-field-warehouse-placeholder') }}</option>
              <option v-for="warehouse in warehouses" :key="warehouse.id" :value="String(warehouse.id)">
                {{ warehouse.name }}
              </option>
            </select>
          </div>
          <!-- Supplier -->
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-supplier') }}</label>
            <input v-model="intakeForm.supplier" :placeholder="t('inventory.intake-field-supplier-placeholder')" class="modal-input"/>
          </div>
          <!-- Note -->
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-note') }}</label>
            <input v-model="intakeForm.note" :placeholder="t('inventory.intake-field-note-placeholder')" class="modal-input"/>
          </div>

          <!-- Actions -->
          <div class="flex gap-3">
            <button class="flex-1 py-2 border-round-xl cursor-pointer btn-modal-cancel" :disabled="savingIntake" @click="showIntakeModal = false">
              {{ t('inventory.modal-cancel') }}
            </button>
            <button class="flex-1 py-2 border-round-xl border-none cursor-pointer btn-intake-confirm" :disabled="savingIntake" @click="saveIntake">
              <i v-if="savingIntake" class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>
              {{ savingIntake ? t('inventory.modal-saving') : t('inventory.intake-btn') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         MODAL: NEW WAREHOUSE
    ═══════════════════════════════════════════════════════════════ -->
    <div
        v-if="showWarehouseModal"
        class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center modal-overlay"
        @click.self="showWarehouseModal = false"
    >
      <div class="w-full border-round-t-2xl sm:border-round-2xl modal-container-sm">
        <div class="flex align-items-center justify-content-between px-5 py-4 modal-header">
          <div class="flex align-items-center gap-3">
            <div class="flex align-items-center justify-content-center border-round-lg modal-icon-wrap" style="background: linear-gradient(135deg, #E0F2FE, #BAE6FD);">
              <i class="pi pi-building" style="color: #0E7490; font-size: 0.95rem;"/>
            </div>
            <p class="m-0 modal-title">{{ t('inventory.warehouse-modal-title') }}</p>
          </div>
          <button class="p-2 border-round-lg border-none cursor-pointer btn-modal-close" @click="showWarehouseModal = false">
            <i class="pi pi-times" style="font-size: 1rem;"/>
          </button>
        </div>

        <div class="px-5 py-5 flex flex-column gap-4">
          <div>
            <label class="modal-label">{{ t('inventory.warehouse-field-name') }} *</label>
            <input v-model="warehouseForm.name" :placeholder="t('inventory.warehouse-field-name-placeholder')" class="modal-input"/>
          </div>
          <div>
            <label class="modal-label">{{ t('inventory.warehouse-field-code') }}</label>
            <input v-model="warehouseForm.code" :placeholder="t('inventory.warehouse-field-code-placeholder')" class="modal-input"/>
          </div>
          <div>
            <label class="modal-label">{{ t('inventory.warehouse-field-address') }}</label>
            <input v-model="warehouseForm.address" :placeholder="t('inventory.warehouse-field-address-placeholder')" class="modal-input"/>
          </div>
          <div>
            <label class="modal-label">{{ t('inventory.warehouse-field-capacity') }}</label>
            <select v-model="warehouseForm.capacity" class="modal-input modal-select">
              <option value="SMALL">{{ t('inventory.warehouse-capacity-small') }}</option>
              <option value="MEDIUM">{{ t('inventory.warehouse-capacity-medium') }}</option>
              <option value="LARGE">{{ t('inventory.warehouse-capacity-large') }}</option>
            </select>
          </div>

          <div class="flex gap-3">
            <button class="flex-1 py-2 border-round-xl cursor-pointer btn-modal-cancel" :disabled="savingWarehouse" @click="showWarehouseModal = false">
              {{ t('inventory.modal-cancel') }}
            </button>
            <button
                class="flex-1 py-2 border-round-xl border-none cursor-pointer btn-primary"
                :disabled="savingWarehouse || !warehouseForm.name.trim()"
                @click="saveWarehouse"
            >
              <i v-if="savingWarehouse" class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>
              {{ savingWarehouse ? t('inventory.modal-saving') : t('inventory.warehouse-btn-create') }}
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Page wrapper */
.page-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
}

/* ── Header text ─────────────────────────────────────────────── */
.page-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: #0B3558;
  line-height: 1.2;
}

.page-subtitle {
  color: #64748B;
  font-size: 0.8rem;
}

/* ── Header buttons ──────────────────────────────────────────── */
.btn-intake-outline {
  border: 1.5px solid #0E7490;
  color: #0E7490;
  font-size: 0.82rem;
  font-weight: 600;
  background-color: #fff;
  transition: all 0.15s;
}
.btn-intake-outline:hover {
  background-color: #E0F2FE;
  border-color: #0B3558;
}

.btn-primary {
  background: linear-gradient(135deg, #0E7490 0%, #0B3558 100%);
  color: #fff;
  font-size: 0.82rem;
  font-weight: 600;
  box-shadow: 0 2px 10px rgba(14, 116, 144, 0.35);
  transition: all 0.18s;
}
.btn-primary:hover {
  box-shadow: 0 6px 20px rgba(14, 116, 144, 0.45);
  transform: translateY(-1px);
}

/* ── Stat cards ──────────────────────────────────────────────── */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}
@media (min-width: 768px) {
  .stat-grid { grid-template-columns: repeat(4, 1fr); }
}

.stat-icon {
  width: 42px;
  height: 42px;
}

.stat-label {
  font-size: 0.72rem;
  color: #64748B;
  line-height: 1.2;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
}

/* ── Tab bar ─────────────────────────────────────────────────── */
.tab-bar {
  background-color: #F1F5F9;
  width: fit-content;
  max-width: 100%;
}

.tab-btn {
  transition: all 0.2s;
  font-size: 0.82rem;
  white-space: nowrap;
}

/* ── Search & filters ────────────────────────────────────────── */
.search-icon {
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94A3B8;
  font-size: 0.85rem;
  z-index: 1;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 16px 10px 36px;
  border-radius: 12px;
  background-color: #F8FAFC;
  border: 1.5px solid #E2E8F0;
  color: #0B3558;
  font-size: 0.88rem;
  outline: none;
  box-sizing: border-box;
  transition: all 0.18s;
}
.search-input:focus {
  border-color: #0E7490;
  box-shadow: 0 0 0 3px rgba(14, 116, 144, 0.12);
  background-color: #fff;
}

.filter-icon {
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94A3B8;
  font-size: 0.8rem;
  z-index: 1;
  pointer-events: none;
}

.category-select {
  width: 100%;
  padding: 10px 32px 10px 32px;
  border-radius: 12px;
  background-color: #F8FAFC;
  border: 1.5px solid #E2E8F0;
  color: #0B3558;
  font-size: 0.88rem;
  outline: none;
  appearance: none;
  transition: border-color 0.18s;
  cursor: pointer;
}
.category-select:focus {
  border-color: #0E7490;
}

.select-arrow {
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #94A3B8;
  font-size: 0.72rem;
  pointer-events: none;
}

/* ── Filter pills ────────────────────────────────────────────── */
.pills-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.pills-scroll::-webkit-scrollbar { display: none; }

.pill-btn {
  padding: 6px 14px;
  font-size: 0.78rem;
  transition: all 0.18s;
}

.pill-count {
  padding: 1px 6px;
  font-size: 0.68rem;
  font-weight: 700;
  min-width: 18px;
  text-align: center;
}

/* ── Loading ─────────────────────────────────────────────────── */
.loading-text {
  color: #64748B;
  font-size: 0.88rem;
}

.product-list-errors {
  margin-top: 0.75rem;
  padding: 0.75rem;
  color: #EF4444;
  font-size: 0.8rem;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: 0.75rem;
}

/* ── Table card ──────────────────────────────────────────────── */
.table-card {
  background-color: #ffffff;
  border: 1px solid #E2E8F0;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.05);
}

.warehouse-card-btn {
  display:      block;
  width:        100%;
  text-align:   left;
  cursor:       pointer;
  transition:   border-color 0.15s, box-shadow 0.15s;
  font-family:  inherit;
}

.warehouse-card-btn-active {
  border-color: #0E7490;
  box-shadow:   0 0 0 2px rgba(14, 116, 144, 0.25);
}

.table-head {
  background: linear-gradient(to right, #F8FAFC, #F1F5F9);
  border-bottom: 2px solid #E2E8F0;
}

.col-header {
  font-size: 0.7rem;
  font-weight: 700;
  color: #64748B;
  white-space: nowrap;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.table-row { transition: background-color 0.1s; }
.table-row:hover { background-color: #F8FBFF; }

/* ── Table cell text ─────────────────────────────────────────── */
.product-avatar-sm {
  width: 36px;
  height: 36px;
  font-size: 0.9rem;
  font-weight: 700;
}

.product-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #1E293B;
}

.product-desc {
  font-size: 0.72rem;
  color: #94A3B8;
}

.category-badge {
  padding: 3px 10px;
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
  display: inline-block;
}

.stock-value {
  font-size: 0.9rem;
  font-weight: 700;
}

.stock-unit {
  font-size: 0.72rem;
  color: #94A3B8;
}

.min-stock-value {
  font-size: 0.82rem;
  color: #94A3B8;
}

.price-value {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0B3558;
}

.expiration-placeholder {
  font-size: 0.82rem;
  color: #CBD5E1;
}

.status-badge {
  padding: 4px 10px;
  font-size: 0.72rem;
  font-weight: 700;
}

/* ── Table icon buttons ──────────────────────────────────────── */
.btn-icon-intake {
  background: none;
  color: #0E7490;
  transition: all 0.15s;
}
.btn-icon-intake:hover {
  background-color: #E0F2FE;
  transform: scale(1.12);
}

.btn-icon-edit {
  background: none;
  color: #64748B;
  transition: all 0.15s;
}
.btn-icon-edit:hover {
  background-color: #F1F5F9;
  transform: scale(1.12);
}

.btn-icon-delete {
  background: none;
  color: #EF4444;
  transition: all 0.15s;
}
.btn-icon-delete:hover {
  background-color: #FEE2E2;
  transform: scale(1.12);
}
.btn-icon-delete:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── Empty states ────────────────────────────────────────────── */
.empty-icon-wrap {
  width: 64px;
  height: 64px;
  background-color: #F1F5F9;
}

.empty-icon-wrap-sm {
  width: 56px;
  height: 56px;
  background-color: #F1F5F9;
}

.empty-text {
  color: #94A3B8;
  font-size: 0.9rem;
  font-weight: 500;
}

/* ── Mobile product cards ────────────────────────────────────── */
.mobile-card {
  background-color: #ffffff;
  border: 1px solid #E2E8F0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.product-avatar-lg {
  width: 44px;
  height: 44px;
  font-size: 1rem;
  font-weight: 700;
}

.mobile-product-name {
  font-size: 0.92rem;
  font-weight: 700;
  color: #1E293B;
}

.category-badge-sm {
  padding: 2px 8px;
  font-size: 0.68rem;
  font-weight: 600;
}

.mini-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.mini-stat {
  background-color: #F8FAFC;
}

.mini-stat-label {
  font-size: 0.62rem;
  color: #94A3B8;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.mini-stat-value {
  font-size: 1.05rem;
  font-weight: 700;
}

.mini-price-value {
  font-size: 0.88rem;
  font-weight: 700;
  color: #0B3558;
}

.btn-mobile-intake {
  background: linear-gradient(135deg, #0E7490, #0B3558);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(14, 116, 144, 0.3);
}

.btn-mobile-edit {
  background: none;
  border: 1.5px solid #E2E8F0;
  color: #64748B;
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.15s;
}
.btn-mobile-edit:hover {
  background-color: #F8FAFC;
  border-color: #CBD5E1;
}

.btn-mobile-delete {
  background: none;
  border: 1.5px solid #FECACA;
  color: #EF4444;
  transition: all 0.15s;
}
.btn-mobile-delete:hover {
  background-color: #FEE2E2;
}
.btn-mobile-delete:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── FAB ─────────────────────────────────────────────────────── */
.fab {
  bottom: 24px;
  right: 20px;
  width: 54px;
  height: 54px;
  background: linear-gradient(135deg, #0E7490, #0B3558);
  color: #fff;
  box-shadow: 0 4px 18px rgba(14, 116, 144, 0.5);
  z-index: 20;
  transition: transform 0.18s;
}
.fab:hover { transform: scale(1.1); }

/* ── Movement table specifics ────────────────────────────────── */
.movement-date {
  font-size: 0.82rem;
  color: #64748B;
}

.movement-product {
  font-size: 0.85rem;
  font-weight: 600;
  color: #1E293B;
}

.movement-type-icon {
  width: 40px;
  height: 40px;
}

/* ── Warehouse cards ─────────────────────────────────────────── */
.warehouse-icon {
  width: 46px;
  height: 46px;
  background: linear-gradient(135deg, #E0F2FE, #DBEAFE);
}

.warehouse-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0B3558;
}

.warehouse-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.warehouse-count {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0B3558;
}

.warehouse-value-card {
  background-color: #F0FDF4;
  border: 1px solid #BBF7D0;
}

.warehouse-value-label {
  font-size: 0.62rem;
  color: #16A34A;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.warehouse-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: #16A34A;
}

.warehouse-stock {
  font-size: 0.85rem;
  color: #0B3558;
  font-weight: 500;
}

.warehouse-total {
  font-size: 0.88rem;
  font-weight: 700;
  color: #0E7490;
}

/* ── Section header (warehouse table) ───────────────────────── */
.section-header {
  border-bottom: 1px solid #E2E8F0;
  background-color: #F8FAFC;
}

.section-header-text {
  font-size: 0.88rem;
  font-weight: 700;
  color: #0B3558;
}

/* ── Product avatar (warehouse table) ───────────────────────── */
.product-avatar-xs {
  width: 28px;
  height: 28px;
  font-size: 0.72rem;
  font-weight: 700;
}

/* ── Modal overlay ───────────────────────────────────────────── */
.modal-overlay {
  background-color: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
}

.modal-container {
  max-width: 560px;
  max-height: 92vh;
  background-color: #fff;
  border: 1px solid #E2E8F0;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
}

.modal-container-sm {
  max-width: 480px;
  background-color: #fff;
  border: 1px solid #E2E8F0;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
}

.modal-header {
  border-bottom: 1px solid #E2E8F0;
}

.modal-icon-wrap {
  width: 36px;
  height: 36px;
}

.modal-title {
  font-size: 1rem;
  font-weight: 700;
  color: #0B3558;
}

.modal-label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #374151;
  letter-spacing: 0.02em;
}

/* ── Modal buttons ───────────────────────────────────────────── */
.btn-modal-close {
  background: none;
  color: #64748B;
  transition: all 0.15s;
}
.btn-modal-close:hover { background-color: #F1F5F9; }

.btn-modal-cancel {
  border: 1.5px solid #E2E8F0;
  color: #64748B;
  font-size: 0.88rem;
  background: #fff;
  font-weight: 500;
  transition: all 0.15s;
}
.btn-modal-cancel:hover { background-color: #F8FAFC; }

.btn-modal-primary {
  background: linear-gradient(135deg, #0E7490, #0B3558);
  color: #fff;
  font-size: 0.88rem;
  font-weight: 700;
  box-shadow: 0 2px 10px rgba(14, 116, 144, 0.3);
  transition: all 0.18s;
}
.btn-modal-primary:hover {
  box-shadow: 0 4px 16px rgba(14, 116, 144, 0.45);
  transform: translateY(-1px);
}

.btn-intake-confirm {
  background: linear-gradient(135deg, #16A34A, #15803D);
  color: #fff;
  font-size: 0.88rem;
  font-weight: 700;
  box-shadow: 0 2px 10px rgba(22, 163, 74, 0.3);
  transition: all 0.18s;
}
.btn-intake-confirm:hover {
  box-shadow: 0 4px 16px rgba(22, 163, 74, 0.45);
  transform: translateY(-1px);
}

/* ── Modal input ─────────────────────────────────────────────── */
.modal-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  background-color: #F8FAFC;
  border: 1.5px solid #E2E8F0;
  color: #0B3558;
  font-size: 0.88rem;
  outline: none;
  box-sizing: border-box;
  transition: all 0.18s;
  font-family: inherit;
}
.modal-input:focus {
  border-color: #0E7490;
  box-shadow: 0 0 0 3px rgba(14, 116, 144, 0.12);
  background-color: #fff;
}
.modal-input:disabled {
  background-color: #F1F5F9;
  color: #94A3B8;
  cursor: not-allowed;
}
.modal-field-hint {
  font-size: 0.7rem;
  color: #94A3B8;
}
.intake-modal-hint {
  font-size: 0.76rem;
  color: #64748B;
  background-color: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 0.6rem;
  padding: 0.6rem 0.75rem;
}

.modal-select {
  appearance: none;
  cursor: pointer;
}

/* ── Responsive: hidden/visible helpers ──────────────────────── */
@media (min-width: 768px) {
  .hidden.md\:block { display: block !important; }
  .md\:hidden { display: none !important; }
}
</style>