<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n }        from 'vue-i18n';
import CartPanel          from '../components/cart-panel.vue';
import PaymentModal       from '../components/payment-modal.vue';
import SaleSuccessModal   from '../components/sale-success-modal.vue';
import useSalesStore      from '../../application/sales.store.js';
import useProductStore    from '../../../product/application/product.store.js';
import useIamStore        from '../../../iam/application/iam.store.js';
import { PaymentMethod }  from '../../domain/model/sale.entity.js';
import { isCustomCategory, filterableCategoryOptions } from '../../../product/presentation/category-options.js';

/**
 * POS screen view for the Sales & POS Management bounded context.
 *
 * Layout:
 * - Left / full: product grid with search bar and category filter pills.
 * - Right (desktop only): CartPanel sidebar.
 * - Bottom bar (mobile only): cart toggle button when cart is not empty.
 * - Modals: PaymentModal, SaleSuccessModal.
 *
 * Business rules:
 * - Only ACTIVE products with currentStock > 0 are shown in the grid.
 * - Adding an out-of-stock product shows a toast-style error.
 * - Quantity increments are capped at availableStock per product.
 * - Confirming a sale persists it, deducts stock, then shows SaleSuccessModal.
 *
 * @view PosScreen
 */

const { t }        = useI18n();
const salesStore   = useSalesStore();
const productStore = useProductStore();
const iamStore     = useIamStore();

// ─── UI state ──────────────────────────────────────────────────────────────

/** @type {import('vue').Ref<string>} Text typed in the search bar. */
const searchQuery = ref('');

/** @type {import('vue').Ref<string>} Currently active category filter ('ALL' or a ProductCategory value). */
const activeCategory = ref('ALL');

/** @type {import('vue').Ref<boolean>} Whether the mobile cart drawer is open. */
const showMobileCart = ref(false);

/** @type {import('vue').Ref<boolean>} Whether the PaymentModal is visible. */
const showPaymentModal = ref(false);

/** @type {import('vue').Ref<import('../../domain/model/sale.entity.js').Sale|null>} The last completed sale for the success modal. */
const completedSale = ref(null);

/**
 * Snapshot of the cart lines at the moment a sale is confirmed, kept for the
 * success modal. `cartItems` can't be reused there: it's derived from
 * `salesStore.currentSale`, which is cleared to null right after a successful
 * confirmSale(), so by the time the modal renders `cartItems` is already [].
 * @type {import('vue').Ref<Array>}
 */
const lastSoldLines = ref([]);

/** @type {import('vue').Ref<string|null>} Inline stock error message shown briefly under the grid. */
const stockErrorMessage = ref(null);

/** @type {import('vue').Ref<boolean>} Whether the confirm call is in progress. */
const isSubmitting = ref(false);

// ─── Category filter config ─────────────────────────────────────────────────

/**
 * Category filter pills: "All", then only the categories actually in use by
 * this business's real products (fixed or custom) — see
 * product-list.vue's category-options.js. OTHER is excluded: it's a form
 * trigger for creating a new category, never a real persisted value, so
 * filtering by it would always return zero products. Custom categories have
 * no i18n key, so they're shown verbatim via `label` instead of being
 * translated via `labelKey`.
 * @type {import('vue').ComputedRef<Array<{value: string, labelKey: string|null, label: string|null}>>}
 */
const categoryFilters = computed(() => [
  { value: 'ALL', labelKey: 'pos.category-all', label: null },
  ...filterableCategoryOptions(productStore.products).map(category => ({
    value:    category,
    labelKey: isCustomCategory(category) ? null : `pos.category-${category.toLowerCase()}`,
    label:    isCustomCategory(category) ? category : null
  }))
]);

// ─── Product grid ───────────────────────────────────────────────────────────

/**
 * Products enriched with their current stock from the inventory.
 * Only ACTIVE products are included.
 *
 * Stock shown/validated here is the product's total across every warehouse
 * it's split into (see getTotalInventoryForProduct) — a single-warehouse
 * lookup would show only whichever InventoryItem happens to come first,
 * which misrepresents both "out of stock" and the max quantity addable to
 * the cart whenever a product is split across 2+ warehouses.
 *
 * @type {import('vue').ComputedRef<Array>}
 */
const enrichedProducts = computed(() =>
    productStore.products
        .filter(product => product.isActive)
        .map(product => {
          const inventoryItem  = productStore.getTotalInventoryForProduct(product.id);
          const availableStock = inventoryItem ? inventoryItem.currentStock : 0;
          return {
            id:             product.id,
            name:           product.name,
            category:       product.category,
            basePrice:      product.basePrice,
            availableStock: availableStock,
            isOutOfStock:   availableStock === 0,
            isLowStock:     availableStock > 0 && inventoryItem && availableStock <= inventoryItem.minimumStock
          };
        })
);

/**
 * Products filtered by the active category and the search query.
 * Search matches against the product name (case-insensitive).
 * @type {import('vue').ComputedRef<Array>}
 */
const filteredProducts = computed(() =>
    enrichedProducts.value.filter(product => {
      const matchesCategory = activeCategory.value === 'ALL' || product.category === activeCategory.value;
      const matchesSearch   = product.name.toLowerCase().includes(searchQuery.value.toLowerCase().trim());
      return matchesCategory && matchesSearch;
    })
);

// ─── Cart ────────────────────────────────────────────────────────────────────

/**
 * Cart items enriched with productName and availableStock for display.
 * @type {import('vue').ComputedRef<Array>}
 */
const cartItems = computed(() => {
  if (!salesStore.currentSale) return [];
  return salesStore.currentSale.details.map(detail => {
    const enriched = enrichedProducts.value.find(product => product.id === detail.productId);
    return {
      productId:      detail.productId,
      quantity:       detail.quantity,
      unitPrice:      detail.unitPrice,
      lineTotal:      detail.lineTotal,
      productName:    enriched ? enriched.name       : t('pos.unknown-product'),
      availableStock: enriched ? enriched.availableStock : 0
    };
  });
});

/**
 * Grand total of the current sale (sum of all lineTotals).
 * @type {import('vue').ComputedRef<number>}
 */
const cartTotal = computed(() =>
    salesStore.currentSale ? salesStore.currentSale.subtotal : 0
);

/**
 * Total number of units in the cart, shown on the mobile cart toggle button.
 * @type {import('vue').ComputedRef<number>}
 */
const cartUnitCount = computed(() =>
    cartItems.value.reduce((sum, item) => sum + item.quantity, 0)
);

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Adds a product to the cart (quantity 1).
 * Shows a brief stock error if the product is out of stock.
 * @param {Object} product - Enriched product object from filteredProducts.
 */
function addProductToCart(product) {
  if (product.isOutOfStock) {
    showStockError(t('pos.error-out-of-stock', { name: product.name }));
    return;
  }

  const result = salesStore.addDetailToCurrentSale({
    productId:      product.id,
    quantity:       1,
    unitPrice:      product.basePrice,
    availableStock: product.availableStock
  });

  if (!result.success) {
    showStockError(t('pos.error-insufficient-stock-for', { name: product.name, stock: product.availableStock }));
  }
}

/**
 * Handles the +/- quantity change events emitted by CartPanel.
 * @param {{ productId: number, delta: number }} payload
 */
function handleQuantityChange({ productId, delta }) {
  const item = cartItems.value.find(cartItem => cartItem.productId === productId);
  if (!item) return;

  const newQuantity = item.quantity + delta;

  if (newQuantity < 1) {
    salesStore.removeDetailFromCurrentSale(productId);
    return;
  }

  const result = salesStore.updateDetailQuantity({
    productId:      productId,
    newQuantity:    newQuantity,
    availableStock: item.availableStock
  });

  if (!result.success) {
    showStockError(t('pos.error-max-stock', { stock: item.availableStock }));
  }
}

/**
 * Handles the remove-item event emitted by CartPanel.
 * @param {number} productId
 */
function handleRemoveItem(productId) {
  salesStore.removeDetailFromCurrentSale(productId);
}

/**
 * Shows a stock error message that disappears after 3 seconds.
 * @param {string} message
 */
function showStockError(message) {
  stockErrorMessage.value = message;
  setTimeout(() => { stockErrorMessage.value = null; }, 3000);
}

/**
 * Opens the PaymentModal if the cart has at least one item.
 */
function openPaymentModal() {
  if (isSubmitting.value) return;
  if (cartItems.value.length === 0) {
    showStockError(t('pos.error-empty-cart'));
    return;
  }
  showMobileCart.value  = false;
  showPaymentModal.value = true;
}

/**
 * Handles the confirm event from PaymentModal.
 * Persists the sale and shows the success modal on success.
 * @param {{ paymentMethod: string, cashGiven: number, customerId: number|null }} payload
 */
async function handlePaymentConfirm({ paymentMethod, customerId }) {
  if (isSubmitting.value) return;

  isSubmitting.value    = true;
  showPaymentModal.value = false;

  const soldLines = [...cartItems.value];

  const result = await salesStore.confirmSale({
    paymentMethod: paymentMethod,
    customerId:    customerId ?? null,
    description:   ''
  });

  if (result.success) {
    // The backend already decremented inventory server-side as part of
    // confirming the sale (SaleRegisteredEvent -> Product's stock decrement) —
    // refresh from that authoritative state rather than recomputing it here.
    try {
      const businessId = iamStore.currentUser?.businessId;
      await productStore.fetchInventory(businessId);
    } catch (error) {
      showStockError(t('pos.error-stock-deduction-failed'));
    }

    lastSoldLines.value  = soldLines;
    completedSale.value  = result.sale;
  } else {
    showStockError(t('pos.error-confirm-failed'));
  }

  isSubmitting.value = false;
}

/**
 * Handles the new-sale event from SaleSuccessModal.
 * Resets the completed sale and starts a fresh POS session.
 */
function handleNewSale() {
  completedSale.value = null;
  lastSoldLines.value = [];
  const businessId    = iamStore.currentUser?.businessId;
  salesStore.startNewSale(businessId);
}

/**
 * Returns whether a product is currently in the cart (any quantity).
 * @param {number} productId
 * @returns {boolean}
 */
function isProductInCart(productId) {
  return cartItems.value.some(item => item.productId === productId);
}

/**
 * Returns the quantity of a product currently in the cart, or 0 if not present.
 * @param {number} productId
 * @returns {number}
 */
function cartQuantityFor(productId) {
  const item = cartItems.value.find(cartItem => cartItem.productId === productId);
  return item ? item.quantity : 0;
}

/**
 * Formats a number as a currency string with S/ prefix.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return `S/ ${amount.toFixed(2)}`;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
  const businessId = iamStore.currentUser?.businessId;
  // Without a businessId the queries would resolve to an empty set yet still
  // flip productsLoaded/inventoryLoaded to true, blocking every later fetch.
  if (!businessId) return;
  if (!productStore.productsLoaded)  productStore.fetchProducts(businessId);
  if (!productStore.inventoryLoaded) productStore.fetchInventory(businessId);
  if (!salesStore.currentSale)       salesStore.startNewSale(businessId);
  if (!salesStore.customersLoaded)   salesStore.fetchCustomers(businessId);
});
</script>

<template>
  <div class="flex flex-column lg:flex-row h-full overflow-hidden">

    <!-- ── Left: product grid area ── -->
    <div class="flex-1 flex flex-column overflow-hidden">

      <!-- Search + category filters -->
      <div
          class="px-4 pt-3 pb-3"
          style="border-bottom: 1px solid #E2E8F0; display: flex; flex-direction: column; gap: 8px;"
      >
        <!-- Search bar -->
        <div style="position: relative;">
          <i
              class="pi pi-search"
              style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.85rem;"
          />
          <input
              v-model="searchQuery"
              type="text"
              :placeholder="t('pos.search-placeholder')"
              class="w-full border-round-lg"
              style="padding: 8px 12px 8px 36px; border: 1px solid #E2E8F0; font-size: 0.85rem; color: #1E293B; background-color: #F8FAFC; outline: none;"
              @focus="(e) => e.target.style.borderColor = '#0E7490'"
              @blur="(e) => e.target.style.borderColor = '#E2E8F0'"
          />
        </div>

        <!-- Category pills -->
        <div
            class="flex gap-2 pb-1"
            style="overflow-x: auto; scrollbar-width: none;"
        >
          <button
              v-for="filter in categoryFilters"
              :key="filter.value"
              class="border-round-3xl px-3 py-1 shrink-0"
              style="white-space: nowrap; font-size: 0.72rem; font-weight: 600; border: none; cursor: pointer;"
              :style="{
                            backgroundColor: activeCategory === filter.value ? '#0B3558' : '#F1F5F9',
                            color:           activeCategory === filter.value ? '#fff'    : '#64748B'
                        }"
              @click="activeCategory = filter.value"
          >
            {{ filter.label ?? t(filter.labelKey) }}
          </button>
        </div>
      </div>

      <!-- Stock error toast -->
      <div
          v-if="stockErrorMessage"
          class="mx-4 mt-2 flex align-items-center gap-2 border-round-xl px-3 py-2"
          style="background-color: #FEE2E2; border: 1px solid #FCA5A5;"
      >
        <i class="pi pi-exclamation-triangle" style="color: #EF4444; font-size: 0.85rem; flex-shrink: 0;" />
        <p class="m-0" style="font-size: 0.78rem; color: #DC2626;">{{ stockErrorMessage }}</p>
      </div>

      <!-- Products grid -->
      <div class="flex-1 overflow-y-auto p-4">
        <div
            class="grid"
            style="gap: 10px;"
        >
          <div
              v-for="product in filteredProducts"
              :key="product.id"
              class="col-6 md:col-4 xl:col-3"
          >
            <button
                class="w-full border-round-xl p-3 text-left flex flex-column justify-content-between"
                :disabled="product.isOutOfStock"
                :style="{
                                border:          `2px solid ${isProductInCart(product.id) ? '#0E7490' : '#E2E8F0'}`,
                                backgroundColor: product.isOutOfStock ? '#F8FAFC' : isProductInCart(product.id) ? '#F0FDFA' : '#fff',
                                cursor:          product.isOutOfStock ? 'not-allowed' : 'pointer',
                                opacity:         product.isOutOfStock ? 0.6 : 1,
                                minHeight:       '90px'
                            }"
                @click="addProductToCart(product)"
            >
              <!-- Product name -->
              <div>
                <p
                    class="m-0 mb-1"
                    style="font-size: 0.78rem; font-weight: 600; line-height: 1.3;"
                    :style="{ color: product.isOutOfStock ? '#94A3B8' : '#1E293B' }"
                >
                  {{ product.name }}
                </p>
              </div>

              <!-- Price + stock -->
              <div class="flex align-items-end justify-content-between gap-1 mt-2">
                <p
                    class="m-0"
                    style="font-size: 0.95rem; font-weight: 800;"
                    :style="{ color: isProductInCart(product.id) ? '#0E7490' : '#0B3558' }"
                >
                  {{ formatCurrency(product.basePrice) }}
                </p>
                <div class="flex align-items-center gap-1">
                  <i
                      v-if="product.isLowStock"
                      class="pi pi-exclamation-triangle"
                      style="color: #D97706; font-size: 0.6rem;"
                  />
                  <span
                      style="font-size: 0.65rem;"
                      :style="{
                                            color:      product.isOutOfStock ? '#94A3B8' : product.isLowStock ? '#D97706' : '#94A3B8',
                                            fontWeight: product.isLowStock ? 600 : 400
                                        }"
                  >
                                        {{ product.isOutOfStock ? t('pos.out-of-stock') : `${product.availableStock} ${t('pos.units')}` }}
                                    </span>
                </div>
              </div>

              <!-- In-cart badge -->
              <div v-if="isProductInCart(product.id)" class="mt-2">
                                <span
                                    class="border-round-md px-2 py-1"
                                    style="background-color: #0E7490; color: #fff; font-size: 0.65rem; font-weight: 700;"
                                >
                                    {{ t('pos.in-cart') }}: {{ cartQuantityFor(product.id) }}
                                </span>
              </div>
            </button>
          </div>

          <!-- Empty state -->
          <div
              v-if="filteredProducts.length === 0"
              class="col-12 flex flex-column align-items-center justify-content-center py-6 text-center"
          >
            <i class="pi pi-box mb-2" style="font-size: 2.25rem; color: #CBD5E1;" />
            <p class="m-0" style="color: #94A3B8; font-size: 0.88rem;">
              {{ t('pos.no-products-found') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Mobile: cart toggle button -->
      <div
          v-if="cartItems.length > 0"
          class="lg:hidden px-4 pb-4 pt-2"
          style="border-top: 1px solid #E2E8F0;"
      >
        <button
            class="w-full flex align-items-center justify-content-between border-round-xl px-4 py-3"
            style="background-color: #0B3558; color: #fff; border: none; cursor: pointer;"
            @click="showMobileCart = true"
        >
          <div class="flex align-items-center gap-2">
            <i class="pi pi-shopping-cart" style="font-size: 1.05rem;" />
            <span style="font-size: 0.88rem; font-weight: 600;">
                            {{ cartUnitCount }} {{ t('pos.cart-units-label') }}
                        </span>
          </div>
          <span style="font-size: 0.95rem; font-weight: 800;">
                        {{ formatCurrency(cartTotal) }}
                    </span>
        </button>
      </div>
    </div>

    <!-- ── Desktop: cart sidebar ── -->
    <div
        class="hidden lg:flex flex-column"
        style="width: 300px; flex-shrink: 0; background-color: #fff; border-left: 1px solid #E2E8F0;"
    >
      <cart-panel
          :cart-items="cartItems"
          :total="cartTotal"
          @update-quantity="handleQuantityChange"
          @remove-item="handleRemoveItem"
          @pay="openPaymentModal"
      />
    </div>

    <!-- ── Mobile: cart drawer ── -->
    <div
        v-if="showMobileCart"
        class="lg:hidden fixed inset-0 z-40 flex align-items-end"
        style="background-color: rgba(0,0,0,0.45);"
        @click.self="showMobileCart = false"
    >
      <div
          class="w-full bg-white border-round-top-2xl shadow-8 flex flex-column"
          style="max-height: 80dvh;"
      >
        <div
            class="flex align-items-center justify-content-between px-4 pt-4 pb-3"
            style="border-bottom: 1px solid #E2E8F0;"
        >
          <p class="m-0" style="font-size: 1rem; font-weight: 700; color: #0B3558;">
            {{ t('pos.cart-title') }}
          </p>
          <button
              style="background: none; border: none; cursor: pointer; padding: 4px;"
              @click="showMobileCart = false"
          >
            <i class="pi pi-times" style="color: #94A3B8; font-size: 1.1rem;" />
          </button>
        </div>
        <cart-panel
            :cart-items="cartItems"
            :total="cartTotal"
            @update-quantity="handleQuantityChange"
            @remove-item="handleRemoveItem"
            @pay="openPaymentModal"
        />
      </div>
    </div>

    <!-- ── Payment modal ── -->
    <payment-modal
        v-if="showPaymentModal"
        :total="cartTotal"
        :customers="salesStore.customers"
        @confirm="handlePaymentConfirm"
        @cancel="showPaymentModal = false"
    />

    <!-- ── Sale success modal ── -->
    <sale-success-modal
        v-if="completedSale"
        :sale="completedSale"
        :sale-items="lastSoldLines"
        @new-sale="handleNewSale"
    />
  </div>
</template>