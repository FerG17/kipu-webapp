<script setup>
import { computed, nextTick, onMounted, ref, toRefs, watch } from 'vue';
import { useI18n }        from 'vue-i18n';
import { useToast }       from 'primevue/usetoast';
import { useConfirm }     from 'primevue';
import useProductStore, { parseLocalDate } from '../../application/product.store.js';
import useIamStore        from '../../../iam/application/iam.store.js';
import useAlertsStore     from '../../../alerts/application/alerts.store.js';
import useSupplierStore   from '../../../suppliers/application/supplier.store.js';
import { Supplier }       from '../../../suppliers/domain/model/supplier.entity.js';
import { Product, ProductCategory, ProductStatus } from '../../domain/model/product.entity.js';
import { toDateLocale }   from '../../../shared/presentation/date-locale.js';
import { isCustomCategory, orderedCategoryOptions, filterableCategoryOptions } from '../category-options.js';
import { canWriteInventory } from '../../../iam/application/permissions.js';
import { useModalScrollLock } from '../../../shared/presentation/use-modal-scroll-lock.js';
import { useTodayLocalDateString } from '../../../shared/presentation/use-today-local-date.js';

const { t, locale } = useI18n();
const toast        = useToast();
const confirm      = useConfirm();
const productStore  = useProductStore();
const iamStore      = useIamStore();
const alertsStore   = useAlertsStore();
const supplierStore = useSupplierStore();

const { products, productsLoaded, inactiveProducts, inactiveProductsLoaded, inventory, stockMovements, stockMovementsLoaded, stockMovementsError } = toRefs(productStore);
const { fetchProducts, fetchInventory, fetchBatches, fetchAllStockMovements,
  addProduct, updateProduct, deleteProduct, registerStockIntake, updateMinimumStock,
  createBatchForProduct, isProductExpiringSoon, isProductExpired,
  fetchInactiveProducts, activateProduct } = productStore;

const { suppliers: allSuppliers, suppliersLoaded: suppliersLoadedRef } = toRefs(supplierStore);
const { addSupplier } = supplierStore;

// Backend rejects a batch whose expiration date is already in the past
// (CreateOrUpdateBatchCommand) — caught here too so the date picker itself
// refuses it instead of letting the request round-trip into a 400 after the
// product/stock intake have already been committed. Local (not UTC) and
// reactive so this page, commonly left open all day, doesn't keep rejecting
// today's own date once local midnight has actually passed.
const todayIsoDate = useTodayLocalDateString();

/**
 * Parses a money field's raw string value into a number, tolerating a comma
 * as the decimal separator. The `type="number"` inputs this feeds normally
 * normalize that themselves, but browser/OS locale can disagree with the
 * page and reject a typed comma outright, leaving the model at '' — which
 * `parseFloat('') || 0` then silently turns into a valid-looking 0 instead
 * of surfacing that the price never actually registered.
 * @param {string} rawValue
 * @returns {number} NaN when unparsable, not silently coerced to 0.
 */
function parseMoneyInput(rawValue) {
  return parseFloat(String(rawValue).replace(',', '.'));
}

const savingProduct  = ref(false);
const savingIntake   = ref(false);
const deletingProductId = ref(null);
const addingSupplier = ref(false);
const showAddSupplierInline = ref(false);
const newSupplierName = ref('');

const activeTab            = ref('products');
const searchQuery          = ref('');
const selectedCategory     = ref('Todos');
const selectedStatusFilter = ref('all');
const showProductModal     = ref(false);
const editingProduct       = ref(null);
const showIntakeModal      = ref(false);
const intakeTargetProduct  = ref(null);
const showScanModal        = ref(false);
const scanInput            = ref('');
const scanInputEl          = ref(null);

/**
 * Whether the current role may create/edit/delete products, register stock
 * intake, or create warehouses — reads stay open to every role (Fase B4),
 * only writes are admin+warehouse. A CASHIER sees this whole tab read-only.
 * @type {import('vue').ComputedRef<boolean>}
 */
const canWrite = computed(() => canWriteInventory(iamStore.currentUserPosition));

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
  GRAINS:    { bg: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)' },
  OILS:      { bg: 'var(--status-ok-bg)', color: 'var(--status-ok-fg)' },
  BEVERAGES: { bg: '#CFFAFE', color: 'var(--brand)' },
  CLEANING:  { bg: '#EDE9FE', color: '#6D28D9' },
  MEDICINE:  { bg: 'var(--status-critical-bg)', color: 'var(--status-critical-fg)' },
  OTHER:     { bg: 'var(--surface-alt)', color: 'var(--text)' }
};

function getCategoryColor(category) {
  return categoryColors[category] ?? categoryColors.OTHER;
}

function getProductInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

const statusConfig = {
  normal:   { color: 'var(--status-ok-fg)', background: 'var(--status-ok-bg)', icon: 'pi pi-box'                 },
  low:      { color: 'var(--status-warning-fg)', background: 'var(--status-warning-bg)', icon: 'pi pi-exclamation-triangle' },
  expiring: { color: 'var(--status-expiring-fg)', background: 'var(--status-expiring-bg)', icon: 'pi pi-clock'                },
  critical: { color: 'var(--status-critical-fg)', background: 'var(--status-critical-bg)', icon: 'pi pi-exclamation-circle'   },
  expired:  { color: 'var(--status-critical-fg)', background: 'var(--status-critical-bg)', icon: 'pi pi-ban'                  },
  out:      { color: 'var(--text-muted)', background: 'var(--surface-alt)', icon: 'pi pi-times-circle'         }
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

/**
 * True until the warehouse list finishes its first load. Both the product
 * and intake modals gate their submit button on this — opening either modal
 * before warehouses arrive used to let the user submit with an empty
 * selector, which silently sent `warehouseId: null` to a backend field
 * that's a non-nullable int, failing with an opaque 400 instead of a
 * readable validation message.
 * @type {import('vue').Ref<boolean>}
 */
const warehousesLoading = ref(true);

onMounted(() => {
  // Guards on "is someone actually signed in yet", not on which business —
  // every fetch below is scoped server-side by the JWT.
  if (iamStore.currentUser?.businessId) {
    if (!productsLoaded.value) fetchProducts();
    fetchInventory();
    productStore.fetchWarehousesForBusiness().then(list => {
      warehouses.value = list.filter(warehouse => warehouse.status === 'ACTIVE');
      warehousesLoading.value = false;
    });
  }
  if (!productStore.batchesLoaded) fetchBatches();
  if (!suppliersLoadedRef.value) supplierStore.fetchSuppliers();
});

/**
 * Active suppliers, resolved to option labels — the pool the product form's
 * multiselect (and the "Otros" quick-add) draws from.
 * @type {import('vue').ComputedRef<Array<{label: string, value: number}>>}
 */
const activeSupplierOptions = computed(() =>
    allSuppliers.value.filter(supplier => supplier.isActive)
        .map(supplier => ({ label: supplier.fullName, value: supplier.id }))
);

/**
 * Resolves a product's tagged supplier ids to display names, in whatever
 * order they were tagged.
 * @param {import('../../domain/model/product.entity.js').Product} product
 * @returns {string[]}
 */
function resolveProductSupplierNames(product) {
  return (product?.supplierIds ?? [])
      .map(supplierId => allSuppliers.value.find(supplier => supplier.id === supplierId)?.fullName)
      .filter(Boolean);
}

/** Resets and toggles the inline "add a new supplier" mini-form under the multiselect. */
function toggleAddSupplierInline() {
  showAddSupplierInline.value = !showAddSupplierInline.value;
  newSupplierName.value = '';
}

/**
 * Quick-creates a supplier from just a name (category defaults to OTHER,
 * same "Otros" vocabulary Product uses) and tags it onto the product being
 * edited — the owner's requested flow: pick from existing suppliers, or
 * start from "Otros" and type the new one in on the spot, instead of having
 * to leave the product form to register it first.
 */
function confirmAddSupplierInline() {
  const name = newSupplierName.value.trim();
  if (!name) return;

  addingSupplier.value = true;
  addSupplier(new Supplier({ name, category: ProductCategory.OTHER }))
      .then(created => {
        productModalForm.value.supplierIds = [...productModalForm.value.supplierIds, created.id];
        showAddSupplierInline.value = false;
        newSupplierName.value = '';
      })
      .catch(() => {
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('inventory.toast-supplier-add-error'), life: 4500 });
      })
      .finally(() => {
        addingSupplier.value = false;
      });
}

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

/**
 * Visual treatment for a "Movimientos" row's type badge. RETURN and
 * ADJUSTMENT used to be indistinguishable — both fell into a single
 * "anything that isn't INTAKE/SALE" bucket, sharing the "Ajuste" label and
 * an always-green (stock added) color even when an adjustment removed
 * stock. Distinguishes all four real types, and reads ADJUSTMENT's
 * direction from its own signed quantity rather than assuming positive.
 * @param {import('../../domain/model/stock-movement.entity.js').StockMovement} movement
 * @returns {{ bg: string, fg: string, icon: string, labelKey: string }}
 */
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

/**
 * Human-readable message for the Movimientos tab's error state — a CASHIER
 * gets the real "no permission" reason (the backend 403s that role on
 * GET /stock-movements) instead of the misleading "no movements yet" empty
 * state a silently-swallowed error used to show.
 * @type {import('vue').ComputedRef<string>}
 */
const movementsErrorMessage = computed(() => {
  const status = stockMovementsError.value?.response?.status;
  return status === 403 ? t('inventory.toast-movements-forbidden') : t('errors.occurred');
});

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
  supplierIds:    [],
  currentStock:   '',
  minimumStock:   '',
  basePrice:      '',
  cost:           '',
  expirationDate: '',
  warehouseId:    '',
  barcode:        ''
});

const productModalErrors = ref({ basePrice: '' });

const supplierMultiselectRef = ref(null);

/**
 * PrimeVue's MultiSelect computes its overlay position (`alignOverlay`)
 * synchronously inside the transition's `onOverlayEnter` hook, while the
 * panel still carries its `p-anchored-overlay-enter-from`/`-enter-active`
 * classes (confirmed by instrumenting a live repro: `getComputedStyle` on
 * the panel reports `insetInlineStart: 0px` even though its own inline
 * `style` attribute already says the correct pixel value — the transition
 * state itself is overriding the freshly-computed position until the enter
 * transition actually finishes advancing, which is exactly what `@show`
 * is supposed to signal, but doesn't reliably fire in time to catch it.
 * Neither a fixed delay (`nextTick`, nor any tested `setTimeout`) nor
 * `@show` reliably lands the correction in the same window the transition
 * resolves in. Since the exact timing can't be pinned down, this instead:
 *
 * 1. Hides the panel the instant it exists, before the user can see it in
 *    the wrong spot — this is what actually kills the "white rectangle"
 *    flash the wrong position caused, regardless of how long it takes.
 * 2. Retries `alignOverlay()` on a short interval, checking after each
 *    attempt whether the panel's left edge now actually matches the
 *    field's — not just trusting that a later call is "probably" right.
 * 3. Reveals the panel only once that check passes (or once retries run
 *    out, so it's never left permanently invisible).
 *
 * `append-to="body"` (already in place from an earlier fix, 2026-08-16)
 * only fixes where the panel lives in the DOM, not this transition race.
 */
function realignSupplierMultiselect() {
  const maxAttempts = 24; // ~50ms * 24 ≈ 1.2s worst case before giving up and revealing anyway
  let attemptsLeft = maxAttempts;
  const attempt = () => {
    const instance = supplierMultiselectRef.value;
    const panel = instance?.overlay;
    const target = instance?.$el;
    if (!instance?.alignOverlay || !panel || !target) return;

    if (attemptsLeft === maxAttempts) panel.style.visibility = 'hidden';

    instance.alignOverlay();
    attemptsLeft -= 1;

    const targetLeft = target.getBoundingClientRect().left;
    // A correctly-aligned panel's left edge sits at (or very near) the
    // field's — the bug instead clamps it near the viewport's own left
    // edge, so "close to 0 while the field itself isn't" is the tell.
    const looksCorrect = Math.abs(panel.getBoundingClientRect().left - targetLeft) < 5 || targetLeft < 5;

    if (looksCorrect || attemptsLeft <= 0) {
      panel.style.visibility = 'visible';
    } else {
      setTimeout(attempt, 50);
    }
  };
  nextTick(attempt);
}

/**
 * @param {string} [prefillBarcode] - Set when opened from the scan entry
 *   point after a code didn't match any known product, so the code isn't
 *   lost — the admin only has to fill in the rest of the manual form.
 */
function openCreateProductModal(prefillBarcode = '') {
  editingProduct.value   = null;
  productModalForm.value = {
    name: '', category: ProductCategory.OTHER, customCategory: '', supplierIds: [], currentStock: '', minimumStock: '', basePrice: '', cost: '', expirationDate: '',
    warehouseId: warehouses.value[0] ? String(warehouses.value[0].id) : '',
    barcode: prefillBarcode
  };
  productModalErrors.value = { basePrice: '' };
  showAddSupplierInline.value = false;
  showProductModal.value = true;
}

/**
 * Entry point for the physical barcode scanner (types digits + Enter into
 * whatever input is focused). Looks up the code among already-loaded
 * products: known → opens the stock-intake modal for it (confirm only,
 * no re-registration); unknown → opens manual product creation with the
 * code pre-filled, so it gets remembered from now on (progressive
 * learning, per the owner's 2026-08-12 request).
 *
 * The scan input is focused programmatically via nextTick + a template ref,
 * not just the `autofocus` HTML attribute: the modal is toggled by a click
 * handler, and Vue patches the DOM asynchronously, so the browser's native
 * autofocus-on-insert heuristic unreliably misses that window — the owner
 * had to click into the box by hand before the scanner's keystrokes landed.
 */
function openScanModal() {
  scanInput.value = '';
  showScanModal.value = true;
  nextTick(() => scanInputEl.value?.focus());
}

function handleScanSubmit() {
  const code = scanInput.value.trim();
  if (!code) return;

  const match = productStore.getProductByBarcode(code);
  showScanModal.value = false;

  if (match) {
    toast.add({ severity: 'info', summary: t('inventory.scan-known-title'), detail: t('inventory.scan-known-detail', { name: match.name }), life: 3500 });
    openIntakeModal(match);
  } else {
    toast.add({ severity: 'info', summary: t('inventory.scan-unknown-title'), detail: t('inventory.scan-unknown-detail'), life: 4500 });
    openCreateProductModal(code);
  }
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
    supplierIds:    [...(product.supplierIds ?? [])],
    currentStock:   String(resolveCurrentStock(product.id)),
    minimumStock:   String(resolveMinimumStock(product.id)),
    basePrice:      String(product.basePrice),
    cost:           activeBatch ? String(activeBatch.purchasePrice) : '',
    expirationDate: activeBatch ? activeBatch.expiration : '',
    warehouseId:    '',
    barcode:        product.barcode ?? ''
  };
  productModalErrors.value = { basePrice: '' };
  showAddSupplierInline.value = false;
  showProductModal.value = true;
}

/**
 * Finds an already-registered ACTIVE product whose defining fields (name,
 * category, base price) match the create-modal form exactly — the case
 * where the admin meant to restock an existing product but went to "Nuevo
 * producto" instead. Stock/expiration are deliberately excluded from the
 * comparison: those are exactly what a real reingreso is for, so they
 * differing (or not) says nothing about whether this is a duplicate.
 *
 * Supplier tags are no longer part of this comparison — a product can now
 * have several, so "the same set" isn't the single, unambiguous identity
 * check a free-text distributor string used to be, and name+category+price
 * already identifies a restock case on its own.
 * @param {string} resolvedCategory
 * @returns {import('../../domain/model/product.entity.js').Product|null}
 */
function findDuplicateProduct(resolvedCategory) {
  const name      = productModalForm.value.name.trim().toLowerCase();
  const basePrice = parseMoneyInput(productModalForm.value.basePrice) || 0;

  return products.value.find(product =>
      product.isActive
      && product.name.trim().toLowerCase() === name
      && product.category === resolvedCategory
      && product.basePrice === basePrice
  ) ?? null;
}

function saveProductFromModal() {
  if (!productModalForm.value.name.trim()) return;

  // Server rejects a base price of 0 or less (ProductRuleExtensions.
  // MustBeAMoneyAmount) — validated here too so the field surfaces a clear
  // reason instead of round-tripping into an opaque 400, and so a comma
  // decimal that the number input silently dropped (leaving the model at
  // '') doesn't slip through as an unintended 0.
  const basePriceValue = parseMoneyInput(productModalForm.value.basePrice);
  if (!(basePriceValue > 0)) {
    productModalErrors.value = { basePrice: t('inventory.error-base-price') };
    return;
  }
  productModalErrors.value = { basePrice: '' };

  // The date input's `:min` attribute only stops the picker widget — typing
  // a past date directly (or a browser that doesn't enforce `min` on native
  // constraint validation for a non-<form> submit, as found in testing on
  // desktop) still reaches here. Catching it before persistProductFromModal
  // matters more than usual: creating a product is 3 separate backend calls
  // (product, then stock intake, then the batch that actually holds cost +
  // expiration), and only the last one validates the date server-side — by
  // then the product and its stock are already committed, so a rejected
  // batch used to leave a half-saved product with no cost/expiration and a
  // confusing error, instead of never being created at all.
  if (productModalForm.value.expirationDate && productModalForm.value.expirationDate < todayIsoDate.value) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.error-expiration-date'), life: 4500 });
    return;
  }

  // Every new product needs a real warehouse, even with 0 initial stock —
  // registerStockIntake is now always called on creation (see its own
  // comment: it persists minimumStock via a 0-quantity intake instead of
  // skipping the call), and warehouseId is a non-nullable int on the
  // backend's stock-intake command, so submitting without one (e.g. the
  // modal was opened before the warehouse list finished loading) would
  // otherwise send `null` and fail with an opaque 400 instead of a
  // readable message.
  const initialStock = parseInt(productModalForm.value.currentStock) || 0;
  if (!editingProduct.value && !productModalForm.value.warehouseId) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-warehouse-required'), life: 4500 });
    return;
  }

  // When "Otros" is picked and the admin actually typed a custom label
  // (e.g. "Frutas"), that label becomes the real category instead of the
  // generic OTHER — effectively letting admins create new categories on
  // the fly. Leaving the text blank keeps the plain OTHER behavior.
  const customCategory = productModalForm.value.customCategory.trim();
  const resolvedCategory = productModalForm.value.category === ProductCategory.OTHER && customCategory
      ? customCategory
      : productModalForm.value.category;

  if (!editingProduct.value) {
    const duplicate = findDuplicateProduct(resolvedCategory);
    if (duplicate) {
      confirm.require({
        message:     t('inventory.confirm-duplicate-body', { name: duplicate.name }),
        header:      t('inventory.confirm-duplicate-header'),
        icon:        'pi pi-info-circle',
        acceptLabel: t('inventory.confirm-duplicate-accept'),
        rejectLabel: t('inventory.confirm-duplicate-reject'),
        accept: () => {
          showProductModal.value = false;
          openIntakeModal(duplicate);
        },
        reject: () => persistProductFromModal(resolvedCategory)
      });
      return;
    }
  }

  persistProductFromModal(resolvedCategory);
}

/**
 * Actually creates/updates the product — split out from saveProductFromModal
 * so the duplicate-product confirm dialog can call it directly on "no,
 * create it anyway" without re-running the check that just fired.
 * @param {string} resolvedCategory
 */
function persistProductFromModal(resolvedCategory) {
  const businessId = iamStore.currentUser?.businessId ?? null;
  const initialStock = parseInt(productModalForm.value.currentStock) || 0;

  const productEntity = new Product({
    id:          editingProduct.value ? editingProduct.value.id : null,
    businessId:  businessId,
    name:        productModalForm.value.name.trim(),
    category:    resolvedCategory,
    // Description no longer doubles as "distributor" (see supplierIds) —
    // there's no dedicated description field in this form, so a new product
    // starts blank and an edit leaves whatever was already there untouched.
    description: editingProduct.value ? editingProduct.value.description : '',
    basePrice:   parseMoneyInput(productModalForm.value.basePrice),
    status:      ProductStatus.ACTIVE,
    barcode:     productModalForm.value.barcode.trim() || null,
    supplierIds: productModalForm.value.supplierIds
  });

  const minimumStock   = parseInt(productModalForm.value.minimumStock) || 0;
  const purchasePrice  = parseMoneyInput(productModalForm.value.cost) || 0;
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
        // A low/zero initial stock, or a near expiration date, may have
        // created an alert server-side — refresh so the sidebar badge picks
        // it up right away instead of only after visiting Alertas.
        alertsStore.fetchAlerts();
      })
      .catch(error => {
        const isDuplicateBarcode = error.response?.status === 409 && error.response?.data?.title === 'DuplicateBarcode';
        // Reached only if the batch step fails for a reason other than a
        // past expiration date (that case is now blocked client-side by the
        // date picker's min attribute) — the product and its initial stock
        // were already committed server-side by this point, so the message
        // must not read as a total failure.
        const isInvalidExpiration = error.response?.status === 400 && error.response?.data?.title === 'InvalidExpirationDate';
        toast.add({
          severity: 'error',
          summary:  t('common.toast-error-title'),
          detail:   isDuplicateBarcode ? t('inventory.toast-duplicate-barcode')
                   : isInvalidExpiration ? t('inventory.toast-invalid-expiration')
                   : t('inventory.toast-save-error'),
          life: 4500
        });
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

const intakeForm = ref({ productId: '', quantity: '', cost: '', expirationDate: '', supplierId: '', note: '', warehouseId: '', basePrice: '' });

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

/**
 * Pre-fills the intake form from what's already known about a product —
 * its last purchase cost/expiration (its active batch), its first tagged
 * supplier (see Product.supplierIds — same pool the product form's
 * multiselect draws from, now a real linked SupplierId here too instead of
 * free text) and its current sale price — so re-stocking a known product
 * (typically via the barcode scanner) only requires typing the quantity
 * instead of retyping everything by hand. Every field stays a normal
 * editable input, this is only the starting value.
 * @param {number|string} productId
 * @returns {{warehouseId: string, cost: string, expirationDate: string, supplierId: string|number, basePrice: string}}
 */
function resolveIntakeDefaultsForProduct(productId) {
  const product = products.value.find(p => p.id === parseInt(productId));
  const activeBatch = productStore.batches.find(
      batch => batch.productId === parseInt(productId) && batch.status === 'ACTIVE'
  );
  return {
    warehouseId:    resolveWarehouseIdForProduct(productId),
    cost:           activeBatch ? String(activeBatch.purchasePrice) : '',
    expirationDate: activeBatch ? activeBatch.expiration : '',
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
        : { warehouseId: '', cost: '', expirationDate: '', supplierId: '', basePrice: '' })
  };
  showIntakeModal.value = true;
}

/**
 * Keeps cost/expiration/supplier/sale-price/warehouse in sync when the
 * admin picks a different product from the dropdown (the generic
 * "Registrar ingreso" entry point, not tied to one product's row), so they
 * still default to that product's own known data instead of staying on
 * whatever the previously selected product had.
 */
watch(() => intakeForm.value.productId, (newProductId) => {
  if (!showIntakeModal.value || !newProductId) return;
  Object.assign(intakeForm.value, resolveIntakeDefaultsForProduct(newProductId));
});

function saveIntake() {
  const quantity = parseInt(intakeForm.value.quantity);
  if (!intakeForm.value.productId || !quantity || quantity <= 0) return;

  // warehouseId is a non-nullable int on the backend's stock-intake command
  // — submitting without one would otherwise send `null` and fail with an
  // opaque 400 instead of a readable message.
  if (!intakeForm.value.warehouseId) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-warehouse-required'), life: 4500 });
    return;
  }

  // The sale price field is pre-filled from the product's current basePrice
  // (see resolveIntakeDefaultsForProduct) purely to save re-typing when it
  // hasn't changed — only persisted as a real product update when the admin
  // actually edited it, so an untouched intake never triggers an extra call.
  const targetProduct  = products.value.find(p => p.id === parseInt(intakeForm.value.productId));
  const newBasePrice   = parseFloat(intakeForm.value.basePrice);
  const basePriceEdited = targetProduct && !isNaN(newBasePrice) && newBasePrice !== targetProduct.basePrice;

  // The picked supplier is a real link (supplierId) now instead of free
  // text — still resolving its name here too so the "Movimientos" table
  // (which only ever displayed a plain string) keeps showing one.
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
    note:          intakeForm.value.note
  })
      .then(() => basePriceEdited
          ? updateProduct(new Product({ ...targetProduct, basePrice: newBasePrice }))
          : null)
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('inventory.toast-intake-success'), life: 3500 });
        showIntakeModal.value = false;
        // The intake just recorded a StockMovement server-side — refresh so
        // "Movimientos" reflects it without requiring a full page reload.
        fetchAllStockMovements();
        // A cost/expiration on this intake may have created or updated the
        // product's active batch server-side (see registerStockIntake) —
        // refresh so the expiration column reflects it immediately.
        if (intakeForm.value.cost || intakeForm.value.expirationDate) fetchBatches();
        // The intake may have resolved a LOW_STOCK/OUT_OF_STOCK alert, or
        // its expiration may have created a new EXPIRATION one — refresh so
        // the sidebar badge picks it up right away.
        alertsStore.fetchAlerts();
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

// ── Reactivate product modal ────────────────────────────────────────────────

const showInactiveModal  = ref(false);
const activatingProductId = ref(null);

/**
 * Opens the "productos inactivos" modal, always refetching — a product
 * deactivated earlier in the same session (after this modal was already
 * opened once) must show up without needing a full page reload, and
 * GetProducts (fetchProducts) excludes deactivated products by default, so
 * they're never already in memory from anywhere else.
 */
function openInactiveModal() {
  showInactiveModal.value = true;
  fetchInactiveProducts();
}

function handleActivateProduct(product) {
  activatingProductId.value = product.id;
  activateProduct(product.id)
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('inventory.toast-activate-success', { name: product.name }), life: 3500 });
      })
      .catch(() => {
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('inventory.toast-activate-error'), life: 4500 });
      })
      .finally(() => {
        activatingProductId.value = null;
      });
}

// ── Stock adjustment modal (I25 — shrinkage/breakage/theft/count fix) ──────

const showAdjustModal   = ref(false);
const adjustTargetProduct = ref(null);
const savingAdjustment  = ref(false);
const adjustForm = ref({ warehouseId: '', direction: 'REMOVE', quantity: '', reasonPreset: 'SHRINKAGE', reasonDetail: '' });

/**
 * Warehouses the target product actually has an InventoryItem in — an
 * adjustment always targets a real row, there is no "create on adjust" like
 * intake has, so the picker only ever offers warehouses the product is
 * already stocked in. Falls back to every business warehouse only in the
 * (should-not-happen) case a product somehow has none yet.
 * @type {import('vue').ComputedRef<Array>}
 */
const adjustableWarehouses = computed(() => {
  if (!adjustTargetProduct.value) return [];
  const stockedWarehouseIds = inventory.value
      .filter(item => item.productId === adjustTargetProduct.value.id)
      .map(item => item.warehouseId);
  const stocked = warehouses.value.filter(warehouse => stockedWarehouseIds.includes(warehouse.id));
  return stocked.length > 0 ? stocked : warehouses.value;
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
    reasonDetail: ''
  };
  showAdjustModal.value = true;
}

function saveAdjustment() {
  const quantity = parseInt(adjustForm.value.quantity);
  if (!quantity || quantity <= 0) return;
  if (!adjustForm.value.warehouseId) return;

  const delta = adjustForm.value.direction === 'REMOVE' ? -quantity : quantity;
  const presetLabel = t(reasonPresetLabelKeys[adjustForm.value.reasonPreset]);
  const detail = adjustForm.value.reasonDetail.trim();
  const reason = adjustForm.value.reasonPreset === 'OTHER' ? detail : (detail ? `${presetLabel}: ${detail}` : presetLabel);

  if (!reason) {
    toast.add({ severity: 'warn', summary: t('common.toast-error-title'), detail: t('inventory.toast-adjust-reason-required'), life: 4500 });
    return;
  }

  savingAdjustment.value = true;
  productStore.adjustStock(adjustTargetProduct.value.id, adjustForm.value.warehouseId, delta, reason)
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('inventory.toast-adjust-success'), life: 3500 });
        showAdjustModal.value = false;
        // The adjustment may have created/resolved a LOW_STOCK/OUT_OF_STOCK
        // alert, and it's a real audit-trail entry the "Movimientos" tab
        // should reflect right away.
        fetchAllStockMovements();
        alertsStore.fetchAlerts();
      })
      .catch(error => {
        const detail = error?.response?.status === 409
            ? t('inventory.toast-adjust-error-exceeds-stock')
            : t('inventory.toast-adjust-error');
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail, life: 4500 });
      })
      .finally(() => {
        savingAdjustment.value = false;
      });
}

// Background content behind these modals was still scrollable on mobile,
// which read as the modal itself being broken once the virtual keyboard
// covered fields further down.
useModalScrollLock(showProductModal);
useModalScrollLock(showIntakeModal);
useModalScrollLock(showWarehouseModal);
useModalScrollLock(showInactiveModal);
useModalScrollLock(showAdjustModal);

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
        <div v-if="canWrite" class="flex align-items-center gap-2 flex-shrink-0">
          <!-- Register intake (hidden on mobile, replaced by FAB) -->
          <button
              class="hidden sm:flex align-items-center gap-2 px-3 py-2 border-round-xl cursor-pointer btn-intake-outline"
              :title="t('inventory.intake-modal-hint')"
              @click="openIntakeModal(null)"
          >
            <i class="pi pi-inbox" style="font-size: 0.9rem;"/>
            {{ t('inventory.btn-register-intake') }}
          </button>
          <!-- Scan barcode -->
          <button
              class="hidden sm:flex align-items-center gap-2 px-3 py-2 border-round-xl cursor-pointer btn-intake-outline"
              :title="t('inventory.btn-scan-barcode')"
              @click="openScanModal"
          >
            <i class="pi pi-qrcode" style="font-size: 0.9rem;"/>
            {{ t('inventory.btn-scan-barcode') }}
          </button>
          <!-- New product -->
          <button
              class="flex align-items-center gap-2 px-3 py-2 border-round-xl border-none cursor-pointer btn-primary"
              @click="openCreateProductModal()"
          >
            <i class="pi pi-plus" style="font-size: 0.9rem;"/>
            {{ t('inventory.btn-new-product') }}
          </button>
        </div>
      </div>

      <button
          v-if="canWrite"
          class="flex align-items-center gap-2 mt-3 border-none bg-transparent cursor-pointer p-0 btn-inactive-link"
          :title="t('inventory.btn-inactive-products-hint')"
          @click="openInactiveModal"
      >
        <i class="pi pi-eye-slash" style="font-size: 0.8rem;"/>
        {{ t('inventory.btn-inactive-products') }}
      </button>

      <!-- Stat cards: 2-col mobile → 4-col desktop -->
      <div class="stat-grid mt-4">
        <div
            v-for="stat in [
              { label: t('inventory.stat-total'),    value: summaryCounts.total,    color: 'var(--brand)', bg: '#EFF6FF', iconBg: '#DBEAFE', icon: 'pi pi-box'                  },
              { label: t('inventory.stat-low'),      value: summaryCounts.low,      color: 'var(--status-warning-fg)', bg: 'var(--status-warning-bg)', iconBg: 'var(--status-warning-bg)', icon: 'pi pi-exclamation-triangle'  },
              { label: t('inventory.stat-expiring'), value: summaryCounts.expiring, color: 'var(--status-expiring-fg)', bg: 'var(--status-expiring-bg)', iconBg: 'var(--status-expiring-bg)', icon: 'pi pi-clock'                 },
              { label: t('inventory.stat-out'),      value: summaryCounts.out,      color: 'var(--text-muted)', bg: 'var(--surface-alt)', iconBg: 'var(--border)', icon: 'pi pi-times-circle'           }
            ]"
            :key="stat.label"
            class="flex align-items-center gap-3 border-round-xl px-4 py-3"
            :style="{ backgroundColor: stat.bg, border: '1px solid var(--border)' }"
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
              backgroundColor: activeTab === tab.id ? 'var(--surface)' : 'transparent',
              color:           activeTab === tab.id ? 'var(--brand)' : 'var(--text-muted)',
              boxShadow:       activeTab === tab.id ? '0 1px 6px rgba(0,0,0,0.10)' : 'none'
            }"
            @click="activeTab = tab.id"
        >
          <i
              :class="tab.icon"
              style="font-size: 0.82rem;"
              :style="{ color: activeTab === tab.id ? 'var(--brand)' : 'var(--text-faint)' }"
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
                backgroundColor: selectedStatusFilter === pill.key ? 'var(--brand)' : 'var(--surface-alt)',
                color:           selectedStatusFilter === pill.key ? 'var(--brand-ink)'    : 'var(--text-muted)',
                border:          selectedStatusFilter === pill.key ? 'none'    : '1px solid var(--border)',
                transform:       selectedStatusFilter === pill.key ? 'scale(1.05)' : 'scale(1)'
              }"
              @click="selectedStatusFilter = pill.key"
          >
            {{ pill.label }}
            <span
                v-if="pill.key !== 'all'"
                class="border-round-3xl pill-count"
                :style="{
                  backgroundColor: selectedStatusFilter === pill.key ? 'rgba(255,255,255,0.25)' : 'var(--border)',
                  color:           selectedStatusFilter === pill.key ? 'var(--brand-ink)' : 'var(--text-muted)'
                }"
            >
              {{ countByStatus(pill.key) }}
            </span>
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="!productsLoaded" class="flex justify-content-center align-items-center gap-3 py-8">
        <i class="pi pi-spin pi-spinner" style="font-size: 1.5rem; color: var(--brand);"/>
        <span class="loading-text">{{ t('inventory.loading') }}</span>
      </div>

      <template v-else>
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
                :style="{ borderBottom: index < filteredProducts.length - 1 ? '1px solid var(--surface-alt)' : 'none' }"
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
                    <p class="m-0 mt-1 product-desc">{{ resolveProductSupplierNames(product).join(', ') || '—' }}</p>
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
                <span class="stock-value" :style="{ color: resolveCurrentStock(product.id) === 0 ? 'var(--text-faint)' : 'var(--brand)' }">
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
                <div v-if="canWrite" class="flex align-items-center gap-1 justify-content-end">
                  <button
                      class="p-2 border-round-lg border-none cursor-pointer btn-icon-intake"
                      :title="t('inventory.btn-register-intake')"
                      :aria-label="t('inventory.btn-register-intake')"
                      @click="openIntakeModal(product)"
                  >
                    <i class="pi pi-inbox" style="font-size: 0.95rem;"/>
                  </button>
                  <button
                      class="p-2 border-round-lg border-none cursor-pointer btn-icon-adjust"
                      :title="t('inventory.btn-adjust-stock')"
                      :aria-label="t('inventory.btn-adjust-stock')"
                      @click="openAdjustModal(product)"
                  >
                    <i class="pi pi-sliders-h" style="font-size: 0.9rem;"/>
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
              <i class="pi pi-box" style="font-size: 1.8rem; color: var(--text-faint);"/>
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
            <i class="pi pi-box" style="font-size: 1.6rem; color: var(--text-faint);"/>
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
              <p class="m-0 mini-stat-value" :style="{ color: resolveCurrentStock(product.id) === 0 ? 'var(--text-faint)' : 'var(--brand)' }">
                {{ resolveCurrentStock(product.id) }}
              </p>
            </div>
            <div class="border-round-lg p-2 text-center mini-stat">
              <p class="m-0 mb-1 mini-stat-label">{{ t('inventory.col-min') }}</p>
              <p class="m-0 mini-stat-value" style="color: var(--text-muted);">{{ resolveMinimumStock(product.id) }}</p>
            </div>
            <div class="border-round-lg p-2 text-center mini-stat">
              <p class="m-0 mb-1 mini-stat-label">{{ t('inventory.col-price') }}</p>
              <p class="m-0 mini-price-value">{{ formatCurrency(product.basePrice) }}</p>
            </div>
          </div>

          <!-- Action buttons -->
          <div v-if="canWrite" class="flex gap-2">
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
                class="flex align-items-center justify-content-center py-2 px-3 border-round-xl cursor-pointer btn-mobile-adjust"
                :aria-label="t('inventory.btn-adjust-stock')"
                @click="openAdjustModal(product)"
            >
              <i class="pi pi-sliders-h" style="font-size: 0.82rem;"/>
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
        v-if="activeTab === 'products' && canWrite"
        class="sm:hidden fixed flex align-items-center justify-content-center border-round-3xl border-none cursor-pointer fab"
        :title="t('inventory.btn-register-intake')"
        @click="openIntakeModal(null)"
    >
      <i class="pi pi-inbox" style="font-size: 1.3rem;"/>
    </button>

    <!-- FAB: mobile quick scan -->
    <button
        v-if="activeTab === 'products' && canWrite"
        class="sm:hidden fixed flex align-items-center justify-content-center border-round-3xl border-none cursor-pointer fab fab-scan"
        :title="t('inventory.btn-scan-barcode')"
        @click="openScanModal"
    >
      <i class="pi pi-qrcode" style="font-size: 1.3rem;"/>
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
              :style="{ borderBottom: index < stockMovements.length - 1 ? '1px solid var(--surface-alt)' : 'none' }"
          >
            <td class="px-4 py-3 movement-date">{{ formatMovementDate(movement.registeredAt) }}</td>
            <td class="px-4 py-3 movement-product">{{ movementProductName(movement.productId) }}</td>
            <td class="px-4 py-3">
              <span
                  class="inline-flex align-items-center gap-1 border-round-3xl status-badge"
                  :style="{ backgroundColor: movementTypeVisual(movement).bg, color: movementTypeVisual(movement).fg }"
              >
                <i :class="`pi ${movementTypeVisual(movement).icon}`" style="font-size: 0.65rem;"/>
                {{ t(movementTypeVisual(movement).labelKey) }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span class="stock-value" :style="{ color: movementTypeVisual(movement).fg }">
                {{ movement.signedQuantity > 0 ? '+' : '' }}{{ movement.signedQuantity }}
              </span>
              <span class="stock-unit"> und.</span>
            </td>
            <td class="px-4 py-3 movement-date">{{ movement.supplier ?? '—' }}</td>
            <td class="px-4 py-3 product-desc">{{ movement.note ?? '—' }}</td>
          </tr>
          </tbody>
        </table>
        <div v-if="stockMovementsError" class="flex flex-column align-items-center py-12 gap-3">
          <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap">
            <i class="pi pi-lock" style="font-size: 1.8rem; color: var(--status-critical-fg);"/>
          </div>
          <p class="m-0 empty-text">{{ movementsErrorMessage }}</p>
        </div>
        <div v-else-if="!stockMovements.length" class="flex flex-column align-items-center py-12 gap-3">
          <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap">
            <i class="pi pi-clock" style="font-size: 1.8rem; color: var(--text-faint);"/>
          </div>
          <p class="m-0 empty-text">{{ t('inventory.no-movements') }}</p>
        </div>
      </div>

      <!-- Mobile movement list -->
      <div class="md:hidden">
        <div v-if="stockMovementsError" class="flex flex-column align-items-center py-10 gap-3">
          <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap-sm">
            <i class="pi pi-lock" style="font-size: 1.6rem; color: var(--status-critical-fg);"/>
          </div>
          <p class="m-0 empty-text">{{ movementsErrorMessage }}</p>
        </div>
        <div v-else-if="!stockMovements.length" class="flex flex-column align-items-center py-10 gap-3">
          <div class="flex align-items-center justify-content-center border-round-xl empty-icon-wrap-sm">
            <i class="pi pi-clock" style="font-size: 1.6rem; color: var(--text-faint);"/>
          </div>
          <p class="m-0 empty-text">{{ t('inventory.no-movements') }}</p>
        </div>
        <div
            v-for="(movement, index) in stockMovements"
            :key="movement.id"
            class="flex align-items-start gap-3 p-4"
            :style="{ borderBottom: index < stockMovements.length - 1 ? '1px solid var(--surface-alt)' : 'none' }"
        >
          <!-- Type icon circle -->
          <div
              class="flex align-items-center justify-content-center border-round-lg flex-shrink-0 movement-type-icon"
              :style="{ backgroundColor: movementTypeVisual(movement).bg }"
          >
            <i :class="`pi ${movementTypeVisual(movement).icon}`" :style="{ fontSize: '1.05rem', color: movementTypeVisual(movement).fg }"/>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div class="flex align-items-center justify-content-between gap-2">
              <p class="m-0 mobile-product-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ movementProductName(movement.productId) }}</p>
              <p class="m-0 flex-shrink-0 stock-value" :style="{ color: movementTypeVisual(movement).fg }">
                {{ movement.signedQuantity > 0 ? '+' : '' }}{{ movement.signedQuantity }}
              </p>
            </div>
            <div class="flex align-items-center gap-2 mt-1 flex-wrap">
              <span
                  class="border-round-3xl inline-block category-badge-sm"
                  :style="{ backgroundColor: movementTypeVisual(movement).bg, color: movementTypeVisual(movement).fg }"
              >
                {{ t(movementTypeVisual(movement).labelKey) }}
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

      <div v-if="canWrite" class="flex justify-content-end">
        <button
            class="flex align-items-center gap-2 px-3 py-2 border-round-xl border-none cursor-pointer btn-primary"
            @click="openWarehouseModal"
        >
          <i class="pi pi-plus" style="font-size: 0.85rem;"/>
          {{ t('inventory.btn-new-warehouse') }}
        </button>
      </div>

      <!-- Warehouse summary cards — double as filter buttons for the table below -->
      <div class="warehouse-grid">
        <button
            v-for="warehouse in warehouseSummary"
            :key="warehouse.key"
            class="border-round-xl overflow-hidden table-card warehouse-card-btn"
            :class="{ 'warehouse-card-btn-active': activeWarehouseKey === warehouse.key }"
            @click="selectedWarehouseKey = warehouse.key"
        >
          <div style="height: 4px; background: linear-gradient(to right, var(--brand), var(--brand));"/>
          <div class="p-5">
            <div class="flex align-items-start gap-3 mb-4">
              <div class="flex align-items-center justify-content-center border-round-xl flex-shrink-0 warehouse-icon">
                <i class="pi pi-building" style="color: var(--brand); font-size: 1.1rem;"/>
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
          <i class="pi pi-table" style="color: var(--brand); font-size: 0.88rem;"/>
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
                :style="{ borderBottom: index < warehouseTableRows.length - 1 ? '1px solid var(--surface-alt)' : 'none' }"
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
            <i class="pi pi-building" style="font-size: 1.8rem; color: var(--text-faint);"/>
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
            <div class="flex align-items-center justify-content-center border-round-lg modal-icon-wrap" style="background: linear-gradient(135deg, var(--brand-soft), #DBEAFE);">
              <i class="pi pi-box" style="color: var(--brand); font-size: 0.95rem;"/>
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

            <!-- Barcode (optional — pre-filled when opened from the scan entry point) -->
            <div>
              <label class="modal-label">{{ t('inventory.modal-field-barcode') }}</label>
              <input v-model="productModalForm.barcode" :placeholder="t('inventory.modal-field-barcode-placeholder')" class="modal-input"/>
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
                <pv-multiselect
                    ref="supplierMultiselectRef"
                    v-model="productModalForm.supplierIds"
                    :options="activeSupplierOptions"
                    option-label="label"
                    option-value="value"
                    display="chip"
                    append-to="body"
                    :placeholder="t('inventory.modal-field-supplier-placeholder')"
                    class="w-full modal-multiselect"
                    @before-show="realignSupplierMultiselect"
                />
                <button type="button" class="modal-link-btn mt-1" @click="toggleAddSupplierInline">
                  <i class="pi pi-plus" style="font-size: 0.65rem;"/> {{ t('inventory.modal-field-supplier-add-new') }}
                </button>
                <div v-if="showAddSupplierInline" class="flex gap-2 mt-2">
                  <input
                      v-model="newSupplierName"
                      :placeholder="t('inventory.modal-field-supplier-new-placeholder')"
                      class="modal-input"
                      style="flex: 1;"
                      @keyup.enter="confirmAddSupplierInline"
                  />
                  <button
                      type="button"
                      class="border-round-lg border-none cursor-pointer btn-modal-primary"
                      style="padding: 0 0.9rem;"
                      :disabled="addingSupplier || !newSupplierName.trim()"
                      @click="confirmAddSupplierInline"
                  >
                    <i :class="addingSupplier ? 'pi pi-spin pi-spinner' : 'pi pi-check'"/>
                  </button>
                </div>
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
                <input
                    v-model="productModalForm.basePrice"
                    type="number" min="0.01" step="0.01" placeholder="0.00"
                    class="modal-input"
                    :class="{ 'modal-input-error': productModalErrors.basePrice }"
                    @input="productModalErrors.basePrice = ''"
                />
                <p v-if="productModalErrors.basePrice" class="modal-field-error">{{ productModalErrors.basePrice }}</p>
              </div>
              <div style="flex: 1;">
                <label class="modal-label">{{ t('inventory.modal-field-cost') }}</label>
                <input v-model="productModalForm.cost" type="number" min="0" step="0.01" placeholder="0.00" class="modal-input"/>
              </div>
            </div>

            <!-- Expiration date -->
            <div>
              <label class="modal-label">{{ t('inventory.modal-field-expiration') }}</label>
              <input v-model="productModalForm.expirationDate" type="date" :min="todayIsoDate" class="modal-input"/>
            </div>
          </div>

          <!-- Modal actions -->
          <div class="flex gap-3 mt-5">
            <button class="flex-1 py-2 border-round-xl cursor-pointer btn-modal-cancel" :disabled="savingProduct" @click="showProductModal = false">
              {{ t('inventory.modal-cancel') }}
            </button>
            <button
                class="flex-1 py-2 border-round-xl border-none cursor-pointer btn-modal-primary"
                :disabled="savingProduct || (!editingProduct && warehousesLoading)"
                @click="saveProductFromModal"
            >
              <i v-if="savingProduct" class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>
              {{ savingProduct ? t('inventory.modal-saving') : (editingProduct ? t('inventory.modal-save') : t('inventory.modal-register')) }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         MODAL: SCAN BARCODE
    ═══════════════════════════════════════════════════════════════ -->
    <div
        v-if="showScanModal"
        class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center modal-overlay"
        @click.self="showScanModal = false"
    >
      <div class="w-full border-round-t-2xl sm:border-round-2xl overflow-y-auto modal-container" style="max-width: 420px;">
        <div class="flex align-items-center justify-content-between px-5 py-4 modal-header">
          <div class="flex align-items-center gap-3">
            <div class="flex align-items-center justify-content-center border-round-lg modal-icon-wrap" style="background: linear-gradient(135deg, var(--brand-soft), #DBEAFE);">
              <i class="pi pi-qrcode" style="color: var(--brand); font-size: 0.95rem;"/>
            </div>
            <p class="m-0 modal-title">{{ t('inventory.scan-modal-title') }}</p>
          </div>
          <button class="p-2 border-round-lg border-none cursor-pointer btn-modal-close" @click="showScanModal = false">
            <i class="pi pi-times" style="font-size: 1rem;"/>
          </button>
        </div>

        <div class="px-5 py-5">
          <label class="modal-label">{{ t('inventory.scan-modal-hint') }}</label>
          <input
              ref="scanInputEl"
              v-model="scanInput"
              :placeholder="t('inventory.scan-modal-placeholder')"
              class="modal-input"
              @keyup.enter="handleScanSubmit"
          />

          <div class="flex gap-3 mt-5">
            <button class="flex-1 py-2 border-round-xl cursor-pointer btn-modal-cancel" @click="showScanModal = false">
              {{ t('inventory.modal-cancel') }}
            </button>
            <button class="flex-1 py-2 border-round-xl border-none cursor-pointer btn-modal-primary" @click="handleScanSubmit">
              {{ t('inventory.scan-modal-submit') }}
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
      <div class="w-full border-round-t-2xl sm:border-round-2xl overflow-y-auto modal-container-sm">
        <!-- Modal header -->
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
          <!-- Product selector -->
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-product') }}</label>
            <select v-model="intakeForm.productId" class="modal-input modal-select">
              <option value="" disabled>{{ t('inventory.intake-field-product-placeholder') }}</option>
              <option v-for="product in products" :key="product.id" :value="String(product.id)">{{ product.name }}</option>
            </select>
          </div>
          <!-- Quantity -->
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-qty') }}</label>
            <input v-model="intakeForm.quantity" type="number" min="1" placeholder="0" class="modal-input"/>
          </div>
          <!-- Cost + Expiration (2-col on sm+) — updates the product's active batch atomically -->
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
          <!-- Sale price -->
          <div>
            <label class="modal-label">{{ t('inventory.intake-field-sale-price') }}</label>
            <input v-model="intakeForm.basePrice" type="number" min="0" step="0.01" placeholder="0.00" class="modal-input"/>
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
            <select v-model="intakeForm.supplierId" class="modal-input modal-select">
              <option value="">{{ t('inventory.intake-field-supplier-placeholder') }}</option>
              <option v-for="supplier in activeSupplierOptions" :key="supplier.value" :value="supplier.value">
                {{ supplier.label }}
              </option>
            </select>
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
         MODAL: NEW WAREHOUSE
    ═══════════════════════════════════════════════════════════════ -->
    <div
        v-if="showWarehouseModal"
        class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center modal-overlay"
        @click.self="showWarehouseModal = false"
    >
      <div class="w-full border-round-t-2xl sm:border-round-2xl overflow-y-auto modal-container-sm">
        <div class="flex align-items-center justify-content-between px-5 py-4 modal-header">
          <div class="flex align-items-center gap-3">
            <div class="flex align-items-center justify-content-center border-round-lg modal-icon-wrap" style="background: linear-gradient(135deg, var(--brand-soft), var(--brand-soft));">
              <i class="pi pi-building" style="color: var(--brand); font-size: 0.95rem;"/>
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

    <!-- ═══════════════════════════════════════════════════════════════
         MODAL: INACTIVE PRODUCTS (reactivate)
    ═══════════════════════════════════════════════════════════════ -->
    <div
        v-if="showInactiveModal"
        class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center modal-overlay"
        @click.self="showInactiveModal = false"
    >
      <div class="w-full border-round-t-2xl sm:border-round-2xl overflow-y-auto modal-container-sm">
        <div class="flex align-items-center justify-content-between px-5 py-4 modal-header">
          <div class="flex align-items-center gap-3">
            <div class="flex align-items-center justify-content-center border-round-lg modal-icon-wrap" style="background: linear-gradient(135deg, var(--brand-soft), var(--brand-soft));">
              <i class="pi pi-eye-slash" style="color: var(--brand); font-size: 0.95rem;"/>
            </div>
            <p class="m-0 modal-title">{{ t('inventory.inactive-modal-title') }}</p>
          </div>
          <button class="p-2 border-round-lg border-none cursor-pointer btn-modal-close" @click="showInactiveModal = false">
            <i class="pi pi-times" style="font-size: 1rem;"/>
          </button>
        </div>

        <div class="px-5 py-5 flex flex-column gap-3">
          <p v-if="!inactiveProductsLoaded" class="m-0" style="font-size: 0.85rem; color: var(--text-muted);">
            <i class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>{{ t('inventory.inactive-loading') }}
          </p>
          <p v-else-if="inactiveProducts.length === 0" class="m-0" style="font-size: 0.85rem; color: var(--text-muted);">
            {{ t('inventory.inactive-empty') }}
          </p>
          <div
              v-for="product in inactiveProducts"
              :key="product.id"
              class="flex align-items-center justify-content-between gap-3 px-3 py-2 border-round-lg"
              style="border: 1px solid var(--border); background: var(--surface-alt);"
          >
            <span style="font-size: 0.85rem; font-weight: 600; color: var(--text);">{{ product.name }}</span>
            <button
                class="flex align-items-center gap-2 px-3 py-1 border-round-lg border-none cursor-pointer btn-primary"
                :disabled="activatingProductId === product.id"
                @click="handleActivateProduct(product)"
            >
              <i :class="activatingProductId === product.id ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'" style="font-size: 0.8rem;"/>
              {{ t('inventory.inactive-btn-reactivate') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════
         MODAL: ADJUST STOCK (I25 — shrinkage/breakage/theft/count fix)
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
            <input v-model="adjustForm.quantity" type="number" min="1" step="1" placeholder="0" class="modal-input"/>
          </div>

          <div v-if="adjustableWarehouses.length > 1">
            <label class="modal-label">{{ t('inventory.modal-field-warehouse') }}</label>
            <select v-model="adjustForm.warehouseId" class="modal-input modal-select">
              <option v-for="warehouse in adjustableWarehouses" :key="warehouse.id" :value="String(warehouse.id)">
                {{ warehouse.name }}
              </option>
            </select>
          </div>

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
            <input v-model="adjustForm.reasonDetail" :placeholder="t('inventory.adjust-field-reason-detail-placeholder')" class="modal-input"/>
          </div>

          <div class="flex gap-3">
            <button class="flex-1 py-2 border-round-xl cursor-pointer btn-modal-cancel" :disabled="savingAdjustment" @click="showAdjustModal = false">
              {{ t('inventory.modal-cancel') }}
            </button>
            <button
                class="flex-1 py-2 border-round-xl border-none cursor-pointer btn-primary"
                :disabled="savingAdjustment || !adjustForm.quantity || (adjustForm.reasonPreset === 'OTHER' && !adjustForm.reasonDetail.trim())"
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
  color: var(--brand);
  line-height: 1.2;
}

.page-subtitle {
  color: var(--text-muted);
  font-size: 0.8rem;
}

/* ── Header buttons ──────────────────────────────────────────── */
.btn-intake-outline {
  border: 1.5px solid var(--brand);
  color: var(--brand);
  font-size: 0.82rem;
  font-weight: 600;
  background-color: var(--surface);
  transition: all 0.15s;
}
.btn-intake-outline:hover {
  background-color: var(--brand-soft);
  border-color: var(--brand);
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

.btn-inactive-link {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
  transition: color 0.15s;
}
.btn-inactive-link:hover {
  color: var(--brand);
}

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

/* ── Stat cards ──────────────────────────────────────────────── */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}
@media (min-width: 768px) {
  .stat-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

/* Warehouse cards are a variable-length list (1-N items), unlike the fixed
   4-tile .stat-grid — reusing that grid squeezed a single warehouse into
   half the row width instead of using the space it actually has. */
.warehouse-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.75rem;
}

.stat-icon {
  width: 42px;
  height: 42px;
}

.stat-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.2;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
}

/* ── Tab bar ─────────────────────────────────────────────────── */
.tab-bar {
  background-color: var(--surface-alt);
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
  color: var(--text-faint);
  font-size: 0.85rem;
  z-index: 1;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 16px 10px 36px;
  border-radius: 12px;
  background-color: var(--surface-alt);
  border: 1.5px solid var(--border);
  color: var(--brand);
  font-size: 0.88rem;
  outline: none;
  box-sizing: border-box;
  transition: all 0.18s;
}
.search-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(198, 113, 57, 0.12);
  background-color: var(--surface);
}

.filter-icon {
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-faint);
  font-size: 0.8rem;
  z-index: 1;
  pointer-events: none;
}

.category-select {
  width: 100%;
  padding: 10px 32px 10px 32px;
  border-radius: 12px;
  background-color: var(--surface-alt);
  border: 1.5px solid var(--border);
  color: var(--brand);
  font-size: 0.88rem;
  outline: none;
  appearance: none;
  transition: border-color 0.18s;
  cursor: pointer;
}
.category-select:focus {
  border-color: var(--brand);
}

.select-arrow {
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-faint);
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
  color: var(--text-muted);
  font-size: 0.88rem;
}

/* ── Table card ──────────────────────────────────────────────── */
.table-card {
  background-color: var(--surface);
  border: 1px solid var(--border);
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
  border-color: var(--brand);
  box-shadow:   0 0 0 2px rgba(198, 113, 57, 0.25);
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
  color: var(--text);
}

.product-desc {
  font-size: 0.72rem;
  color: var(--text-faint);
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
  color: var(--text-faint);
}

.min-stock-value {
  font-size: 0.82rem;
  color: var(--text-faint);
}

.price-value {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--brand);
}

.expiration-placeholder {
  font-size: 0.82rem;
  color: var(--text-faint);
}

.status-badge {
  padding: 4px 10px;
  font-size: 0.72rem;
  font-weight: 700;
}

/* ── Table icon buttons ──────────────────────────────────────── */
.btn-icon-intake {
  background: none;
  color: var(--brand);
  transition: all 0.15s;
}
.btn-icon-intake:hover {
  background-color: var(--brand-soft);
  transform: scale(1.12);
}

.btn-icon-adjust {
  background: none;
  color: var(--status-warning-fg);
  transition: all 0.15s;
}
.btn-icon-adjust:hover {
  background-color: var(--status-warning-bg);
  transform: scale(1.12);
}

.btn-icon-edit {
  background: none;
  color: var(--text-muted);
  transition: all 0.15s;
}
.btn-icon-edit:hover {
  background-color: var(--surface-alt);
  transform: scale(1.12);
}

.btn-icon-delete {
  background: none;
  color: var(--status-critical-fg);
  transition: all 0.15s;
}
.btn-icon-delete:hover {
  background-color: var(--status-critical-bg);
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

/* ── Mobile product cards ────────────────────────────────────── */
.mobile-card {
  background-color: var(--surface);
  border: 1px solid var(--border);
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
  color: var(--text);
}

.category-badge-sm {
  padding: 2px 8px;
  font-size: 0.68rem;
  font-weight: 600;
}

.mini-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.mini-stat {
  background-color: var(--surface-alt);
}

.mini-stat-label {
  font-size: 0.62rem;
  color: var(--text-faint);
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
  color: var(--brand);
}

.btn-mobile-intake {
  background: linear-gradient(135deg, var(--brand), var(--brand));
  color: var(--brand-ink);
  font-size: 0.8rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(198, 113, 57, 0.3);
}

.btn-mobile-edit {
  background: none;
  border: 1.5px solid var(--border);
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.15s;
}
.btn-mobile-edit:hover {
  background-color: var(--surface-alt);
  border-color: var(--text-faint);
}

.btn-mobile-adjust {
  background: none;
  border: 1.5px solid var(--status-warning-fg);
  color: var(--status-warning-fg);
  transition: all 0.15s;
}
.btn-mobile-adjust:hover {
  background-color: var(--status-warning-bg);
}

.btn-mobile-delete {
  background: none;
  border: 1.5px solid var(--status-critical-fg);
  color: var(--status-critical-fg);
  transition: all 0.15s;
}
.btn-mobile-delete:hover {
  background-color: var(--status-critical-bg);
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
  background: linear-gradient(135deg, var(--brand), var(--brand));
  color: var(--brand-ink);
  box-shadow: 0 4px 18px rgba(198, 113, 57, 0.5);
  z-index: 20;
  transition: transform 0.18s;
}
.fab:hover { transform: scale(1.1); }

.fab-scan {
  bottom: 90px;
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, var(--accent), var(--accent));
  color: var(--accent-ink);
  box-shadow: 0 4px 18px rgba(111, 128, 85, 0.5);
}

/* ── Movement table specifics ────────────────────────────────── */
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

/* ── Warehouse cards ─────────────────────────────────────────── */
.warehouse-icon {
  width: 46px;
  height: 46px;
  background: linear-gradient(135deg, var(--brand-soft), #DBEAFE);
}

.warehouse-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--brand);
}

.warehouse-stats-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.75rem;
}

.warehouse-count {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--brand);
}

.warehouse-value-card {
  background-color: var(--status-ok-bg);
  border: 1px solid var(--status-ok-bg);
}

.warehouse-value-label {
  font-size: 0.62rem;
  color: var(--status-ok-fg);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.warehouse-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--status-ok-fg);
}

.warehouse-stock {
  font-size: 0.85rem;
  color: var(--brand);
  font-weight: 500;
}

.warehouse-total {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--brand);
}

/* ── Section header (warehouse table) ───────────────────────── */
.section-header {
  border-bottom: 1px solid var(--border);
  background-color: var(--surface-alt);
}

.section-header-text {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--brand);
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
  background-color: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
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

/* ── Modal buttons ───────────────────────────────────────────── */
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

.btn-modal-primary {
  background: linear-gradient(135deg, var(--brand), var(--brand));
  color: var(--brand-ink);
  font-size: 0.88rem;
  font-weight: 700;
  box-shadow: 0 2px 10px rgba(198, 113, 57, 0.3);
  transition: all 0.18s;
}
.btn-modal-primary:hover {
  box-shadow: 0 4px 16px rgba(198, 113, 57, 0.45);
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

/* ── Modal input ─────────────────────────────────────────────── */
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
.modal-field-hint {
  font-size: 0.7rem;
  color: var(--text-faint);
}
.modal-input-error {
  border-color: var(--status-critical-fg);
}
.modal-field-error {
  font-size: 0.7rem;
  color: var(--status-critical-fg);
  margin-top: 0.25rem;
}
.intake-modal-hint {
  font-size: 0.76rem;
  color: var(--text-muted);
  background-color: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  padding: 0.6rem 0.75rem;
}

.modal-select {
  appearance: none;
  cursor: pointer;
}

.modal-multiselect {
  border-radius: 10px;
}
.modal-multiselect :deep(.p-multiselect-label) {
  padding: 8px 14px;
  font-size: 0.88rem;
}

.modal-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: none;
  border: none;
  padding: 0;
  color: var(--brand);
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
}
.modal-link-btn:hover {
  color: var(--accent);
}

/* ── Responsive: hidden/visible helpers ──────────────────────── */
@media (min-width: 768px) {
  .hidden.md\:block { display: block !important; }
  .md\:hidden { display: none !important; }
}
</style>