<script setup>
import { computed, onMounted, ref, toRefs } from 'vue';
import { useI18n }        from 'vue-i18n';
import { useToast }       from 'primevue/usetoast';
import { useConfirm }     from 'primevue';
import useSupplierStore   from '../../application/supplier.store.js';
import useIamStore        from '../../../iam/application/iam.store.js';
import useProductStore    from '../../../product/application/product.store.js';
import useAlertsStore     from '../../../alerts/application/alerts.store.js';
import { PurchaseOrderStatus } from '../../domain/model/purchase-order.entity.js';
import { useTodayLocalDateString } from '../../../shared/presentation/use-today-local-date.js';

const { t }         = useI18n();
const toast         = useToast();
const confirm       = useConfirm();
const supplierStore = useSupplierStore();
const iamStore      = useIamStore();
const productStore  = useProductStore();
const alertsStore   = useAlertsStore();

/**
 * Local (not UTC) today's date, used as the minimum selectable expected
 * date on the new-order modal — reactive so a page left open across local
 * midnight doesn't keep rejecting today's own date as "in the past".
 * @type {import('vue').Ref<string>}
 */
const todayLocalDate = useTodayLocalDateString();

const savingNewOrder      = ref(false);
const updatingOrderStatus = ref(false);

const {
  purchaseOrders,
  purchaseOrdersLoaded,
  suppliers,
  pendingOrderCount,
  pendingOrderTotal
} = toRefs(supplierStore);

const {
  fetchPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrderStatus
} = supplierStore;

// ─── Filter state ──────────────────────────────────────────────────────────────

const searchQuery    = ref('');
const selectedStatus = ref('ALL');

// ─── Modal state ───────────────────────────────────────────────────────────────

const showNewOrderModal    = ref(false);
const showOrderDetailModal = ref(false);
const selectedOrder        = ref(null);

// ─── New order form ────────────────────────────────────────────────────────────

const newOrderForm = ref({
  supplierId:   '',
  expectedDate: '',
  description:  '',
  lines:        [{ productId: '', productName: '', quantity: 1, unitPrice: 0, discount: 0, batchLabel: '' }]
});

const newOrderErrors = ref({
  supplierId:   '',
  expectedDate: '',
  lines:        ''
});

// ─── Status config map ─────────────────────────────────────────────────────────

/**
 * Visual configuration for each purchase order status.
 * @type {Record<string, { labelKey: string, color: string, background: string, icon: string }>}
 */
const statusConfig = {
  PENDING:   { labelKey: 'suppliers.order-status-pending',   color: 'var(--status-warning-fg)', background: 'var(--status-warning-bg)', icon: 'pi-clock'           },
  RECEIVED:  { labelKey: 'suppliers.order-status-received',  color: 'var(--status-ok-fg)', background: 'var(--status-ok-bg)', icon: 'pi-check-circle'    },
  DELAYED:   { labelKey: 'suppliers.order-status-delayed',   color: 'var(--status-warning-fg)', background: 'var(--status-warning-bg)', icon: 'pi-exclamation-triangle' },
  CANCELLED: { labelKey: 'suppliers.order-status-cancelled', color: 'var(--status-critical-fg)', background: 'var(--status-critical-bg)', icon: 'pi-times-circle'    }
};

/**
 * Returns the status visual config for a given status key.
 * @param {string} status
 * @returns {{ labelKey: string, color: string, background: string, icon: string }}
 */
function getStatusConfig(status) {
  return statusConfig[status] ?? statusConfig.PENDING;
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  if (iamStore.currentUser?.businessId) {
    if (!purchaseOrdersLoaded.value) {
      fetchPurchaseOrders();
    }
    if (!productStore.productsLoaded) {
      productStore.fetchProducts();
    }
    if (!productStore.inventoryLoaded) {
      productStore.fetchInventory();
    }
  }
});

// ─── Computed ─────────────────────────────────────────────────────────────────

const filteredOrders = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return purchaseOrders.value.filter(order => {
    const matchesSearch = !query
        || order.id?.toString().includes(query)
        || order.supplierName.toLowerCase().includes(query);
    const matchesStatus = selectedStatus.value === 'ALL'
        || order.status === selectedStatus.value;
    return matchesSearch && matchesStatus;
  });
});

const activeSuppliers = computed(() =>
    suppliers.value.filter(supplier => supplier.isActive)
);

const availableProducts = computed(() =>
    productStore.products.filter(product => product.isActive)
);

// ─── New order modal ───────────────────────────────────────────────────────────

/**
 * Opens the new purchase order modal with a blank form.
 */
function openNewOrderModal() {
  newOrderErrors.value = { supplierId: '', expectedDate: '', lines: '' };
  newOrderForm.value   = {
    supplierId:   activeSuppliers.value.length > 0 ? String(activeSuppliers.value[0].id) : '',
    expectedDate: '',
    description:  '',
    lines:        [{ productId: '', productName: '', quantity: 1, unitPrice: 0, discount: 0, batchLabel: '' }]
  };
  showNewOrderModal.value = true;
}

/**
 * Adds a new empty line to the new order form.
 */
function addOrderLine() {
  newOrderForm.value.lines.push({
    productId:   '',
    productName: '',
    quantity:    1,
    unitPrice:   0,
    discount:    0,
    batchLabel:  ''
  });
}

/**
 * Removes a line from the order form at the given index.
 * A minimum of one line is always required.
 * @param {number} lineIndex
 */
function removeOrderLine(lineIndex) {
  if (newOrderForm.value.lines.length <= 1) return;
  newOrderForm.value.lines.splice(lineIndex, 1);
}

/**
 * Updates the productName on a line when the productId changes.
 * @param {number} lineIndex
 */
function onProductSelected(lineIndex) {
  const selectedProductId = parseInt(newOrderForm.value.lines[lineIndex].productId);
  const foundProduct      = productStore.products.find(product => product.id === selectedProductId);
  if (foundProduct) {
    newOrderForm.value.lines[lineIndex].productName = foundProduct.name;
  }
}

/**
 * Calculates the computed total for the new order form.
 * @returns {number}
 */
const newOrderComputedTotal = computed(() => {
  const total = newOrderForm.value.lines.reduce((accumulator, line) => {
    const grossAmount    = (parseInt(line.quantity) || 0) * (parseFloat(line.unitPrice) || 0);
    const discountAmount = grossAmount * (parseFloat(line.discount) || 0);
    return accumulator + (grossAmount - discountAmount);
  }, 0);
  return Math.round(total * 100) / 100;
});

/**
 * Validates the new order form.
 * @returns {boolean}
 */
function validateNewOrderForm() {
  const formErrors = { supplierId: '', expectedDate: '', lines: '' };
  let isValid      = true;

  if (!newOrderForm.value.supplierId) {
    formErrors.supplierId = t('suppliers.order-error-supplier');
    isValid               = false;
  }

  if (!newOrderForm.value.expectedDate) {
    formErrors.expectedDate = t('suppliers.order-error-date');
    isValid                 = false;
  } else if (newOrderForm.value.expectedDate < todayLocalDate.value) {
    formErrors.expectedDate = t('suppliers.order-error-date-past');
    isValid                 = false;
  }

  const hasInvalidLine = newOrderForm.value.lines.some(
      line => !line.productId || !line.quantity || line.quantity <= 0
          || !line.unitPrice || line.unitPrice <= 0
  );

  if (hasInvalidLine) {
    formErrors.lines = t('suppliers.order-error-lines');
    isValid          = false;
  }

  newOrderErrors.value = formErrors;
  return isValid;
}

/**
 * Submits the new purchase order.
 */
function submitNewOrder() {
  if (!validateNewOrderForm()) return;

  const businessId = iamStore.currentUser?.businessId ?? null;

  savingNewOrder.value = true;
  createPurchaseOrder({
    businessId:   businessId,
    supplierId:   parseInt(newOrderForm.value.supplierId),
    expectedDate: newOrderForm.value.expectedDate,
    description:  newOrderForm.value.description.trim(),
    detailLines:  newOrderForm.value.lines.map(line => ({
      productId:   parseInt(line.productId),
      productName: line.productName,
      quantity:    parseInt(line.quantity),
      unitPrice:   parseFloat(line.unitPrice),
      discount:    parseFloat(line.discount ?? 0),
      batchLabel:  line.batchLabel?.trim() || null
    }))
  })
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('suppliers.order-toast-create-success'), life: 3500 });
        showNewOrderModal.value = false;
      })
      .catch(error => {
        const detail = error.response?.data?.detail ?? t('suppliers.order-toast-create-error');
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail, life: 4500 });
      })
      .finally(() => {
        savingNewOrder.value = false;
      });
}

// ─── Order detail modal ────────────────────────────────────────────────────────

/**
 * Opens the detail modal for the given order.
 * @param {import('../../domain/model/purchase-order.entity.js').PurchaseOrder} order
 */
function openOrderDetail(order) {
  selectedOrder.value        = order;
  showOrderDetailModal.value = true;
}

/**
 * Transitions the selected order to RECEIVED status. The backend does the
 * actual stock replenishment atomically, in the same transaction as the
 * status change (see PurchaseOrderCommandService.MarkReceived, which calls
 * IProductContextFacade.RegisterStockIntake per line) — this must NOT also
 * call registerStockIntake client-side, or every line's quantity gets
 * applied twice (once server-side, once from here).
 */
function receiveOrder() {
  if (!selectedOrder.value) return;

  const order = selectedOrder.value;

  confirm.require({
    message: t('suppliers.confirm-receive-body'),
    header:  t('suppliers.confirm-receive-header'),
    icon:    'pi pi-inbox',
    accept:  () => {
      updatingOrderStatus.value = true;
      updatePurchaseOrderStatus(order.id, PurchaseOrderStatus.RECEIVED)
          .then(() => {
            toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('suppliers.order-toast-receive-success'), life: 3500 });
            showOrderDetailModal.value = false;
            // The backend just replenished stock for every line of this order
            // (see MarkReceived), which may have resolved LOW_STOCK/OUT_OF_STOCK
            // alerts and created/updated batches — unlike saveIntake, this
            // touches several products at once, so there's no single response to
            // patch state from; a real refresh is needed for all three.
            productStore.fetchInventory();
            productStore.fetchBatches();
            // X4 M20: receiving an order books a real StockMovement per line
            // server-side, but the cached list here was never told — an
            // admin visiting Inventario → Movimientos right after receiving
            // an order saw it missing until an unrelated refresh happened to
            // invalidate it, or a full page reload.
            productStore.invalidateStockMovements();
            alertsStore.fetchAlerts();
          })
          .catch(() => {
            toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('suppliers.order-toast-status-error'), life: 4500 });
          })
          .finally(() => {
            updatingOrderStatus.value = false;
          });
    }
  });
}

/**
 * Transitions the selected order to DELAYED status.
 */
function delayOrder() {
  if (!selectedOrder.value) return;

  updatingOrderStatus.value = true;
  updatePurchaseOrderStatus(selectedOrder.value.id, PurchaseOrderStatus.DELAYED)
      .then(() => {
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('suppliers.order-toast-delay-success'), life: 3500 });
        showOrderDetailModal.value = false;
      })
      .catch(() => {
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('suppliers.order-toast-status-error'), life: 4500 });
      })
      .finally(() => {
        updatingOrderStatus.value = false;
      });
}

/**
 * Transitions the selected order to CANCELLED status.
 */
function cancelOrder() {
  if (!selectedOrder.value) return;

  confirm.require({
    message: t('suppliers.confirm-cancel-order-body'),
    header:  t('suppliers.confirm-cancel-order-header'),
    icon:    'pi pi-exclamation-triangle',
    accept:  () => {
      updatingOrderStatus.value = true;
      updatePurchaseOrderStatus(selectedOrder.value.id, PurchaseOrderStatus.CANCELLED)
          .then(() => {
            toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('suppliers.order-toast-cancel-success'), life: 3500 });
            showOrderDetailModal.value = false;
          })
          .catch(() => {
            toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('suppliers.order-toast-status-error'), life: 4500 });
          })
          .finally(() => {
            updatingOrderStatus.value = false;
          });
    }
  });
}

/**
 * Formats a monetary amount to Peruvian Sol string.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return `S/ ${(amount || 0).toFixed(2)}`;
}

/**
 * Builds the status timeline steps for the currently selected order's detail
 * modal. Only reflects real domain statuses (PENDING/RECEIVED/DELAYED/
 * CANCELLED) — there is no "shipped" status in the backend, so the timeline
 * doesn't invent one.
 * @type {import('vue').ComputedRef<Array<{ labelKey: string, state: 'done'|'pending'|'delayed'|'cancelled' }>>}
 */
const orderTimelineSteps = computed(() => {
  if (!selectedOrder.value) return [];
  const status = selectedOrder.value.status;

  if (status === PurchaseOrderStatus.CANCELLED) {
    return [
      { labelKey: 'suppliers.order-timeline-created',   state: 'done' },
      { labelKey: 'suppliers.order-timeline-cancelled', state: 'cancelled' }
    ];
  }

  return [
    { labelKey: 'suppliers.order-timeline-created',  state: 'done' },
    {
      labelKey: 'suppliers.order-timeline-received',
      state: status === PurchaseOrderStatus.RECEIVED
          ? 'done'
          : status === PurchaseOrderStatus.DELAYED
              ? 'delayed'
              : 'pending'
    }
  ];
});

/**
 * Resolves a purchase order detail line's product name. Orders created in the
 * current session already carry a denormalized productName; preexisting
 * orders loaded from the mock don't, so fall back to looking it up in the
 * already-loaded product catalog before falling back to the raw id.
 * @param {Object} detail - A purchase order detail line.
 * @returns {string}
 */
function resolveProductName(detail) {
  if (detail.productName) return detail.productName;
  const product = productStore.getProductById(detail.productId);
  return product ? product.name : `#${detail.productId}`;
}

</script>

<template>
  <div class="orders-container">

    <!-- ── Pending banner ────────────────────────────────────────────── -->
    <div v-if="pendingOrderCount > 0" class="orders-pending-banner">
      <i class="pi pi-clock orders-pending-icon" />
      <p class="orders-pending-text">
        <strong>{{ pendingOrderCount }}</strong>
        {{ t('suppliers.order-banner-text') }}
        <strong>{{ formatCurrency(pendingOrderTotal) }}</strong>
      </p>
    </div>

    <!-- ── Toolbar ───────────────────────────────────────────────────── -->
    <div class="orders-toolbar">
      <div class="orders-search-wrapper">
        <i class="pi pi-search orders-search-icon" />
        <input
            v-model="searchQuery"
            class="orders-search-input"
            :placeholder="t('suppliers.order-search-placeholder')"
        />
      </div>

      <!-- Status filter pills -->
      <div class="orders-status-filters">
        <button
            v-for="statusOption in ['ALL', 'PENDING', 'DELAYED', 'RECEIVED', 'CANCELLED']"
            :key="statusOption"
            class="orders-status-pill"
            :class="{ 'orders-status-pill-active': selectedStatus === statusOption }"
            :style="selectedStatus === statusOption && statusOption !== 'ALL'
                        ? {
                            backgroundColor: getStatusConfig(statusOption).background,
                            color:           getStatusConfig(statusOption).color,
                            borderColor:     getStatusConfig(statusOption).color
                        }
                        : {}"
            @click="selectedStatus = statusOption"
        >
          {{ statusOption === 'ALL'
            ? t('suppliers.order-filter-all')
            : t(getStatusConfig(statusOption).labelKey) }}
        </button>
      </div>

      <button class="orders-btn-new" @click="openNewOrderModal">
        <i class="pi pi-plus" />
        <span class="orders-btn-label">{{ t('suppliers.order-btn-new') }}</span>
      </button>
    </div>

    <!-- ── Loading ───────────────────────────────────────────────────── -->
    <div v-if="!purchaseOrdersLoaded" class="orders-loading">
      <i class="pi pi-spin pi-spinner orders-spinner" />
      <span>{{ t('suppliers.order-loading') }}</span>
    </div>

    <!-- ── Desktop table ─────────────────────────────────────────────── -->
    <div v-else class="orders-table-wrapper">
      <table class="orders-table">
        <thead>
        <tr class="orders-thead-row">
          <th class="orders-th">{{ t('suppliers.order-col-id') }}</th>
          <th class="orders-th">{{ t('suppliers.order-col-supplier') }}</th>
          <th class="orders-th">{{ t('suppliers.order-col-created') }}</th>
          <th class="orders-th">{{ t('suppliers.order-col-expected') }}</th>
          <th class="orders-th">{{ t('suppliers.order-col-items') }}</th>
          <th class="orders-th">{{ t('suppliers.order-col-total') }}</th>
          <th class="orders-th">{{ t('suppliers.order-col-status') }}</th>
          <th class="orders-th orders-th-actions" />
        </tr>
        </thead>
        <tbody>
        <tr
            v-for="order in filteredOrders"
            :key="order.id"
            class="orders-tr"
        >
          <!-- ID -->
          <td class="orders-td orders-td-id">
            {{ `OC-${String(order.id).padStart(4, '0')}` }}
          </td>

          <!-- Supplier -->
          <td class="orders-td">
            <div class="orders-supplier-cell">
              <i class="pi pi-truck" style="color: var(--text-faint); font-size: 0.8rem;" />
              <span class="orders-supplier-name">{{ order.supplierName }}</span>
            </div>
          </td>

          <!-- Created date -->
          <td class="orders-td orders-td-muted">
            {{ order.date ? order.date.slice(0, 10) : '—' }}
          </td>

          <!-- Expected date -->
          <td class="orders-td orders-td-muted">
            {{ order.expectedDate || '—' }}
          </td>

          <!-- Items count -->
          <td class="orders-td orders-td-muted">
            {{ order.itemCount }}
            {{ order.itemCount === 1 ? t('suppliers.order-item-singular') : t('suppliers.order-item-plural') }}
          </td>

          <!-- Total -->
          <td class="orders-td orders-td-total">
            {{ formatCurrency(order.totalAmount) }}
          </td>

          <!-- Status badge -->
          <td class="orders-td">
                            <span
                                class="orders-status-badge"
                                :style="{
                                    backgroundColor: getStatusConfig(order.status).background,
                                    color:           getStatusConfig(order.status).color
                                }"
                            >
                                <i :class="`pi ${getStatusConfig(order.status).icon}`" style="font-size: 0.6rem;" />
                                {{ t(getStatusConfig(order.status).labelKey) }}
                            </span>
          </td>

          <!-- View action -->
          <td class="orders-td">
            <button class="orders-btn-view" @click="openOrderDetail(order)">
              <i class="pi pi-eye" />
              <span>{{ t('suppliers.order-btn-view') }}</span>
            </button>
          </td>
        </tr>
        </tbody>
      </table>

      <!-- Empty state -->
      <div v-if="filteredOrders.length === 0" class="orders-empty">
        <i class="pi pi-clipboard orders-empty-icon" />
        <p class="orders-empty-text">{{ t('suppliers.order-no-results') }}</p>
      </div>
    </div>

    <!-- ── Mobile cards ──────────────────────────────────────────────── -->
    <div class="orders-mobile-cards">
      <div
          v-for="order in filteredOrders"
          :key="order.id"
          class="orders-mobile-card"
      >
        <div class="orders-mobile-card-top">
          <div>
            <p class="orders-mobile-card-id">
              {{ `OC-${String(order.id).padStart(4, '0')}` }}
            </p>
            <p class="orders-mobile-card-supplier">{{ order.supplierName }}</p>
          </div>
          <span
              class="orders-status-badge"
              :style="{
                            backgroundColor: getStatusConfig(order.status).background,
                            color:           getStatusConfig(order.status).color
                        }"
          >
                        <i :class="`pi ${getStatusConfig(order.status).icon}`" style="font-size: 0.6rem;" />
                        {{ t(getStatusConfig(order.status).labelKey) }}
                    </span>
        </div>

        <div class="orders-mobile-card-grid">
          <div class="orders-mobile-stat">
            <p class="orders-mobile-stat-label">{{ t('suppliers.order-col-created') }}</p>
            <p class="orders-mobile-stat-value">{{ order.date ? order.date.slice(0, 10) : '—' }}</p>
          </div>
          <div class="orders-mobile-stat">
            <p class="orders-mobile-stat-label">{{ t('suppliers.order-col-expected') }}</p>
            <p class="orders-mobile-stat-value">{{ order.expectedDate || '—' }}</p>
          </div>
          <div class="orders-mobile-stat">
            <p class="orders-mobile-stat-label">{{ t('suppliers.order-col-items') }}</p>
            <p class="orders-mobile-stat-value">{{ order.itemCount }}</p>
          </div>
        </div>

        <div class="orders-mobile-card-bottom">
          <span class="orders-mobile-total">{{ formatCurrency(order.totalAmount) }}</span>
          <button class="orders-btn-view" @click="openOrderDetail(order)">
            <i class="pi pi-eye" />
            {{ t('suppliers.order-btn-view-detail') }}
          </button>
        </div>
      </div>

      <div v-if="filteredOrders.length === 0" class="orders-empty">
        <i class="pi pi-clipboard orders-empty-icon" />
        <p class="orders-empty-text">{{ t('suppliers.order-no-results') }}</p>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════
         Modal: New Purchase Order
    ════════════════════════════════════════════════════════════════════ -->
    <div v-if="showNewOrderModal" class="orders-modal-overlay" @click.self="showNewOrderModal = false">
      <div class="orders-modal">

        <!-- Header -->
        <div class="orders-modal-header">
          <h2 class="orders-modal-title">{{ t('suppliers.order-modal-new-title') }}</h2>
          <button class="orders-modal-close" @click="showNewOrderModal = false">
            <i class="pi pi-times" />
          </button>
        </div>

        <div class="orders-modal-body">

          <!-- Supplier + Date row -->
          <div class="orders-modal-row">
            <div class="orders-modal-field">
              <label class="orders-modal-label">
                {{ t('suppliers.order-modal-supplier') }} *
              </label>
              <select
                  v-model="newOrderForm.supplierId"
                  class="orders-modal-select"
                  :class="{ 'orders-modal-input-error': newOrderErrors.supplierId }"
              >
                <option value="" disabled>{{ t('suppliers.order-modal-supplier-placeholder') }}</option>
                <option
                    v-for="supplier in activeSuppliers"
                    :key="supplier.id"
                    :value="String(supplier.id)"
                >
                  {{ supplier.fullName }}
                </option>
              </select>
              <p v-if="newOrderErrors.supplierId" class="orders-modal-error-msg">
                {{ newOrderErrors.supplierId }}
              </p>
            </div>

            <div class="orders-modal-field">
              <label class="orders-modal-label">
                {{ t('suppliers.order-modal-expected-date') }} *
              </label>
              <input
                  v-model="newOrderForm.expectedDate"
                  type="date"
                  class="orders-modal-input"
                  :class="{ 'orders-modal-input-error': newOrderErrors.expectedDate }"
                  :min="todayLocalDate"
              />
              <p v-if="newOrderErrors.expectedDate" class="orders-modal-error-msg">
                {{ newOrderErrors.expectedDate }}
              </p>
            </div>
          </div>

          <!-- Order lines header -->
          <div class="orders-lines-header">
            <label class="orders-modal-label">
              {{ t('suppliers.order-modal-lines') }} *
            </label>
            <button class="orders-btn-add-line" @click="addOrderLine">
              <i class="pi pi-plus" style="font-size: 0.7rem;" />
              {{ t('suppliers.order-modal-add-line') }}
            </button>
          </div>

          <p v-if="newOrderErrors.lines" class="orders-modal-error-msg">
            {{ newOrderErrors.lines }}
          </p>

          <!-- Order lines -->
          <div class="orders-lines-list">
            <div
                v-for="(line, lineIndex) in newOrderForm.lines"
                :key="lineIndex"
                class="orders-line-row"
            >
              <!-- Product selector -->
              <div class="orders-line-field orders-line-field-product">
                <label class="orders-line-field-label">{{ t('suppliers.order-detail-col-product') }}</label>
                <select
                    v-model="line.productId"
                    class="orders-line-product-select"
                    @change="onProductSelected(lineIndex)"
                >
                  <option value="" disabled>{{ t('suppliers.order-modal-product-placeholder') }}</option>
                  <option
                      v-for="product in availableProducts"
                      :key="product.id"
                      :value="String(product.id)"
                  >
                    {{ product.name }}
                  </option>
                </select>
              </div>

              <!-- Quantity -->
              <div class="orders-line-field">
                <label class="orders-line-field-label">{{ t('suppliers.order-detail-col-qty') }}</label>
                <input
                    v-model.number="line.quantity"
                    type="number"
                    min="1"
                    class="orders-line-qty-input"
                    :placeholder="t('suppliers.order-modal-qty-placeholder')"
                />
              </div>

              <!-- Unit price -->
              <div class="orders-line-field">
                <label class="orders-line-field-label">{{ t('suppliers.order-detail-col-unit-price') }}</label>
                <input
                    v-model.number="line.unitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    class="orders-line-price-input"
                    :placeholder="t('suppliers.order-modal-price-placeholder')"
                />
              </div>

              <!-- Lot name for the batch this line opens on RECEIVED (X6 #3+#11) -->
              <div class="orders-line-field">
                <label class="orders-line-field-label">{{ t('suppliers.order-detail-col-lot') }}</label>
                <input
                    v-model="line.batchLabel"
                    type="text"
                    maxlength="60"
                    class="orders-line-label-input"
                    :placeholder="t('suppliers.order-modal-lot-placeholder')"
                />
              </div>

              <!-- Remove line -->
              <button
                  class="orders-line-remove-btn"
                  :disabled="newOrderForm.lines.length === 1"
                  :class="{ 'orders-line-remove-btn-disabled': newOrderForm.lines.length === 1 }"
                  @click="removeOrderLine(lineIndex)"
              >
                <i class="pi pi-times" style="font-size: 0.8rem;" />
              </button>
            </div>
          </div>

          <!-- Total preview -->
          <div class="orders-total-preview">
            <span class="orders-total-label">{{ t('suppliers.order-modal-total') }}</span>
            <span class="orders-total-value">{{ formatCurrency(newOrderComputedTotal) }}</span>
          </div>

          <!-- Notes -->
          <div class="orders-modal-field orders-modal-field-full">
            <label class="orders-modal-label">{{ t('suppliers.order-modal-notes') }}</label>
            <input
                v-model="newOrderForm.description"
                class="orders-modal-input"
                :placeholder="t('suppliers.order-modal-notes-placeholder')"
            />
          </div>

          <!-- Footer -->
          <div class="orders-modal-footer">
            <button class="orders-modal-btn-cancel" :disabled="savingNewOrder" @click="showNewOrderModal = false">
              {{ t('suppliers.order-modal-cancel') }}
            </button>
            <button class="orders-modal-btn-save" :disabled="savingNewOrder" @click="submitNewOrder">
              <i v-if="savingNewOrder" class="pi pi-spin pi-spinner" style="margin-right: 0.4rem;"/>
              {{ savingNewOrder ? t('suppliers.order-modal-saving') : t('suppliers.order-modal-submit') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════
         Modal: Order Detail & Status Actions
    ════════════════════════════════════════════════════════════════════ -->
    <div
        v-if="showOrderDetailModal && selectedOrder"
        class="orders-modal-overlay"
        @click.self="showOrderDetailModal = false"
    >
      <div class="orders-detail-modal">

        <!-- Header -->
        <div class="orders-modal-header">
          <div>
            <h2 class="orders-modal-title">
              {{ `OC-${String(selectedOrder.id).padStart(4, '0')}` }}
            </h2>
            <span
                class="orders-status-badge"
                :style="{
                                backgroundColor: getStatusConfig(selectedOrder.status).background,
                                color:           getStatusConfig(selectedOrder.status).color
                            }"
            >
                            <i :class="`pi ${getStatusConfig(selectedOrder.status).icon}`" style="font-size: 0.6rem;" />
                            {{ t(getStatusConfig(selectedOrder.status).labelKey) }}
                        </span>
          </div>
          <button class="orders-modal-close" @click="showOrderDetailModal = false">
            <i class="pi pi-times" />
          </button>
        </div>

        <div class="orders-modal-body">

          <!-- Supplier info row -->
          <div class="orders-detail-supplier-row">
            <i class="pi pi-truck" style="color: var(--brand); font-size: 1rem; flex-shrink: 0;" />
            <div>
              <p class="orders-detail-supplier-name">{{ selectedOrder.supplierName }}</p>
              <p class="orders-detail-supplier-dates">
                {{ t('suppliers.order-created-label') }}: {{ selectedOrder.date ? selectedOrder.date.slice(0, 10) : '—' }}
                &middot;
                {{ t('suppliers.order-expected-label') }}: {{ selectedOrder.expectedDate || '—' }}
                <template v-if="selectedOrder.receivedDate">
                  &middot;
                  {{ t('suppliers.order-received-label') }}: {{ selectedOrder.receivedDate }}
                </template>
              </p>
            </div>
          </div>

          <!-- Detail lines table -->
          <div class="orders-detail-lines-section">
            <p class="orders-detail-section-label">{{ t('suppliers.order-detail-products') }}</p>
            <div class="orders-detail-table-wrapper">
              <table class="orders-detail-table">
                <thead>
                <tr class="orders-detail-thead-row">
                  <th class="orders-detail-th">{{ t('suppliers.order-detail-col-product') }}</th>
                  <th class="orders-detail-th orders-detail-th-center">{{ t('suppliers.order-detail-col-qty') }}</th>
                  <th class="orders-detail-th orders-detail-th-right">{{ t('suppliers.order-detail-col-unit-price') }}</th>
                  <th class="orders-detail-th orders-detail-th-right">{{ t('suppliers.order-detail-col-subtotal') }}</th>
                </tr>
                </thead>
                <tbody>
                <tr
                    v-for="(detail, detailIndex) in selectedOrder.details"
                    :key="detailIndex"
                    class="orders-detail-tr"
                >
                  <td class="orders-detail-td">{{ resolveProductName(detail) }}</td>
                  <td class="orders-detail-td orders-detail-td-center">{{ detail.quantity }}</td>
                  <td class="orders-detail-td orders-detail-td-right orders-detail-td-muted">
                    {{ formatCurrency(detail.unitPrice) }}
                  </td>
                  <td class="orders-detail-td orders-detail-td-right orders-detail-td-bold">
                    {{ formatCurrency(detail.lineTotal) }}
                  </td>
                </tr>
                </tbody>
                <tfoot>
                <tr class="orders-detail-tfoot-row">
                  <td colspan="3" class="orders-detail-td orders-detail-tfoot-label">
                    {{ t('suppliers.order-detail-total') }}
                  </td>
                  <td class="orders-detail-td orders-detail-td-right orders-detail-tfoot-total">
                    {{ formatCurrency(selectedOrder.totalAmount) }}
                  </td>
                </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <!-- Status timeline -->
          <div class="orders-detail-timeline-section">
            <p class="orders-detail-section-label">{{ t('suppliers.order-timeline-title') }}</p>
            <div class="orders-timeline">
              <template v-for="(step, stepIndex) in orderTimelineSteps" :key="step.labelKey">
                <div class="orders-timeline-step">
                  <span class="orders-timeline-dot" :class="`orders-timeline-dot--${step.state}`">
                    <i v-if="step.state === 'done'" class="pi pi-check" style="font-size: 0.6rem;" />
                    <i v-else-if="step.state === 'delayed'" class="pi pi-exclamation-triangle" style="font-size: 0.6rem;" />
                    <i v-else-if="step.state === 'cancelled'" class="pi pi-times" style="font-size: 0.6rem;" />
                  </span>
                  <span class="orders-timeline-label" :class="`orders-timeline-label--${step.state}`">
                    {{ t(step.labelKey) }}
                  </span>
                </div>
                <div
                    v-if="stepIndex < orderTimelineSteps.length - 1"
                    class="orders-timeline-connector"
                    :class="{ 'orders-timeline-connector--done': step.state === 'done' }"
                />
              </template>
            </div>
            <p v-if="selectedOrder.status === PurchaseOrderStatus.DELAYED" class="orders-timeline-delayed-note">
              <i class="pi pi-exclamation-triangle" style="font-size: 0.72rem; margin-right: 0.3rem;" />
              {{ t('suppliers.order-timeline-delayed-note') }}
            </p>
          </div>

          <!-- Notes -->
          <div
              v-if="selectedOrder.description"
              class="orders-detail-notes"
          >
            <p class="orders-detail-notes-label">{{ t('suppliers.order-detail-notes') }}</p>
            <p class="orders-detail-notes-text">{{ selectedOrder.description }}</p>
          </div>

          <!-- Status action buttons (only for actionable orders) -->
          <div v-if="selectedOrder.isActionable" class="orders-detail-actions-section">
            <p class="orders-detail-section-label">{{ t('suppliers.order-detail-update-status') }}</p>
            <p class="orders-detail-receive-hint">
              <i class="pi pi-info-circle" style="font-size: 0.78rem; margin-right: 0.3rem;"/>
              {{ t('suppliers.order-detail-receive-hint') }}
            </p>
            <div class="orders-detail-action-buttons">
              <button class="orders-action-btn orders-action-btn-receive" :disabled="updatingOrderStatus" @click="receiveOrder" :title="t('suppliers.order-detail-receive-hint')">
                <i :class="updatingOrderStatus ? 'pi pi-spin pi-spinner' : 'pi pi-check-circle'" />
                <span>{{ t('suppliers.order-action-receive') }}</span>
              </button>
              <button class="orders-action-btn orders-action-btn-delay" :disabled="updatingOrderStatus" @click="delayOrder">
                <i :class="updatingOrderStatus ? 'pi pi-spin pi-spinner' : 'pi pi-clock'" />
                <span>{{ t('suppliers.order-action-delay') }}</span>
              </button>
              <button class="orders-action-btn orders-action-btn-cancel" :disabled="updatingOrderStatus" @click="cancelOrder">
                <i :class="updatingOrderStatus ? 'pi pi-spin pi-spinner' : 'pi pi-times-circle'" />
                <span>{{ t('suppliers.order-action-cancel') }}</span>
              </button>
            </div>
          </div>

          <!-- Close button -->
          <button class="orders-detail-close-btn" @click="showOrderDetailModal = false">
            {{ t('suppliers.order-detail-close') }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ─── Container ─────────────────────────────────────────────────────────────── */
.orders-container {
  display:        flex;
  flex-direction: column;
  min-height:     300px;
}

/* ─── Pending banner ────────────────────────────────────────────────────────── */
.orders-pending-banner {
  display:          flex;
  align-items:      center;
  gap:              0.5rem;
  margin:           0.75rem 1.25rem 0;
  padding:          0.6rem 0.75rem;
  background-color: var(--status-warning-bg);
  border:           1px solid var(--status-warning-bg);
  border-radius:    0.75rem;
}

.orders-pending-icon {
  color:     var(--status-warning-fg);
  font-size: 0.88rem;
  flex-shrink: 0;
}

.orders-pending-text {
  font-size: 0.78rem;
  color:     var(--status-warning-fg);
  margin:    0;
}

/* ─── Toolbar ───────────────────────────────────────────────────────────────── */
.orders-toolbar {
  display:       flex;
  align-items:   center;
  gap:           0.75rem;
  padding:       0.75rem 1.25rem;
  border-bottom: 1px solid var(--border);
  flex-wrap:     wrap;
}

.orders-search-wrapper {
  position:  relative;
  flex:      1;
  min-width: 180px;
}

.orders-search-icon {
  position:  absolute;
  left:      0.75rem;
  top:       50%;
  transform: translateY(-50%);
  color:     var(--text-faint);
  font-size: 0.85rem;
}

.orders-search-input {
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

.orders-search-input:focus {
  border-color: var(--brand);
}

.orders-status-filters {
  display:    flex;
  gap:        0.3rem;
  overflow-x: auto;
}

.orders-status-pill {
  padding:          0.35rem 0.75rem;
  border-radius:    0.5rem;
  border:           1.5px solid transparent;
  font-size:        0.72rem;
  font-weight:      600;
  background-color: var(--surface-alt);
  color:            var(--text-muted);
  cursor:           pointer;
  white-space:      nowrap;
  transition:       all 0.15s;
}

.orders-status-pill-active {
  background-color: var(--brand);
  color:            var(--brand-ink);
  border-color:     var(--brand);
}

.orders-btn-new {
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

.orders-btn-new:hover {
  background-color: var(--brand);
}

/* ─── Loading ───────────────────────────────────────────────────────────────── */
.orders-loading {
  display:         flex;
  align-items:     center;
  justify-content: center;
  gap:             0.5rem;
  padding:         3rem;
  color:           var(--text-faint);
  font-size:       0.88rem;
}

.orders-spinner {
  font-size: 1.2rem;
  color:     var(--brand);
}

/* ─── Desktop table ─────────────────────────────────────────────────────────── */
.orders-table-wrapper {
  width:      100%;
  overflow-x: auto;
}

.orders-table {
  width:           100%;
  border-collapse: collapse;
}

.orders-thead-row {
  background-color: var(--surface-alt);
  border-bottom:    1px solid var(--border);
}

.orders-th {
  padding:     0.75rem 1rem;
  text-align:  left;
  font-size:   0.72rem;
  font-weight: 600;
  color:       var(--text-faint);
}

.orders-th-actions {
  width: 80px;
}

.orders-tr {
  border-bottom: 1px solid var(--surface-alt);
  transition:    background-color 0.1s;
}

.orders-tr:hover {
  background-color: var(--surface-alt);
}

.orders-td {
  padding:        0.75rem 1rem;
  font-size:      0.82rem;
  color:          var(--text);
  vertical-align: middle;
}

.orders-td-id {
  font-weight: 700;
  color:       var(--brand);
}

.orders-td-muted {
  color: var(--text-muted);
}

.orders-td-total {
  font-size:   0.88rem;
  font-weight: 700;
  color:       var(--brand);
}

.orders-supplier-cell {
  display:     flex;
  align-items: center;
  gap:         0.4rem;
}

.orders-supplier-name {
  font-size: 0.78rem;
  color:     var(--text);
}

/* ─── Status badge ──────────────────────────────────────────────────────────── */
.orders-status-badge {
  display:       inline-flex;
  align-items:   center;
  gap:           0.25rem;
  padding:       0.15rem 0.5rem;
  border-radius: 0.35rem;
  font-size:     0.7rem;
  font-weight:   600;
}

/* ─── View button ───────────────────────────────────────────────────────────── */
.orders-btn-view {
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

.orders-btn-view:hover {
  background-color: var(--brand-soft);
}

/* ─── Empty state ───────────────────────────────────────────────────────────── */
.orders-empty {
  display:         flex;
  flex-direction:  column;
  align-items:     center;
  justify-content: center;
  padding:         3rem;
  gap:             0.5rem;
}

.orders-empty-icon {
  font-size: 2.5rem;
  color:     var(--text-faint);
}

.orders-empty-text {
  font-size: 0.88rem;
  color:     var(--text-faint);
  margin:    0;
}

/* ─── Mobile cards ──────────────────────────────────────────────────────────── */
.orders-mobile-cards {
  display:        none;
  flex-direction: column;
  gap:            0.75rem;
  padding:        1rem;
}

.orders-mobile-card {
  background-color: var(--surface);
  border:           1px solid var(--border);
  border-radius:    0.75rem;
  padding:          1rem;
}

.orders-mobile-card-top {
  display:         flex;
  justify-content: space-between;
  align-items:     flex-start;
  margin-bottom:   0.75rem;
}

.orders-mobile-card-id {
  font-size:   0.88rem;
  font-weight: 700;
  color:       var(--brand);
  margin:      0;
}

.orders-mobile-card-supplier {
  font-size: 0.72rem;
  color:     var(--text-faint);
  margin:    0;
}

.orders-mobile-card-grid {
  display:               grid;
  grid-template-columns: repeat(3, 1fr);
  gap:                   0.5rem;
  margin-bottom:         0.75rem;
}

.orders-mobile-stat {
  background-color: var(--surface-alt);
  border-radius:    0.5rem;
  padding:          0.4rem 0.5rem;
}

.orders-mobile-stat-label {
  font-size: 0.6rem;
  color:     var(--text-faint);
  margin:    0;
}

.orders-mobile-stat-value {
  font-size:   0.75rem;
  font-weight: 600;
  color:       var(--text);
  margin:      0;
}

.orders-mobile-card-bottom {
  display:         flex;
  align-items:     center;
  justify-content: space-between;
}

.orders-mobile-total {
  font-size:   1rem;
  font-weight: 800;
  color:       var(--brand);
}


/* ─── Modal overlay ─────────────────────────────────────────────────────────── */
.orders-modal-overlay {
  position:         fixed;
  inset:            0;
  z-index:          50;
  display:          flex;
  align-items:      flex-end;
  justify-content:  center;
  background-color: rgba(0, 0, 0, 0.5);
}

/* ─── Modal base ────────────────────────────────────────────────────────────── */
.orders-modal,
.orders-detail-modal {
  width:            100%;
  background-color: var(--surface);
  border-radius:    1.25rem 1.25rem 0 0;
  border:           1px solid var(--border);
  box-shadow:       0 25px 50px rgba(0, 0, 0, 0.15);
  max-height:       92dvh;
  overflow-y:       auto;
}

.orders-modal-header {
  display:          flex;
  align-items:      flex-start;
  justify-content:  space-between;
  padding:          1.25rem 1.25rem 0.75rem;
  border-bottom:    1px solid var(--surface-alt);
  position:         sticky;
  top:              0;
  background-color: var(--surface);
  gap:              0.5rem;
}

.orders-modal-title {
  font-size:   1rem;
  font-weight: 700;
  color:       var(--brand);
  margin:      0 0 0.25rem;
}

.orders-modal-close {
  background: none;
  border:     none;
  cursor:     pointer;
  color:      var(--text-faint);
  font-size:  1rem;
  padding:    0.25rem;
  flex-shrink: 0;
}

.orders-modal-body {
  padding: 1rem 1.25rem 1.25rem;
}

/* ─── New order modal internals ─────────────────────────────────────────────── */
.orders-modal-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap:     0.75rem;
  margin-bottom: 1rem;
}

.orders-modal-field {
  display:        flex;
  flex-direction: column;
  gap:            0.3rem;
  margin-bottom:  0.75rem;
}

.orders-modal-field-full {
  grid-column: 1 / -1;
}

.orders-modal-label {
  font-size:   0.75rem;
  font-weight: 600;
  color:       var(--text-muted);
}

.orders-modal-input,
.orders-modal-select {
  padding:       0.5rem 0.75rem;
  border:        1px solid var(--border);
  border-radius: 0.5rem;
  font-size:     0.88rem;
  color:         var(--text);
  background:    var(--surface);
  outline:       none;
  transition:    border-color 0.15s;
  width:         100%;
}

.orders-modal-input:focus,
.orders-modal-select:focus {
  border-color: var(--brand);
}

.orders-modal-input-error {
  border-color: var(--status-critical-fg);
}

.orders-modal-error-msg {
  font-size:    0.72rem;
  color:        var(--status-critical-fg);
  margin:       0 0 0.5rem;
}

/* ─── Order lines ───────────────────────────────────────────────────────────── */
.orders-lines-header {
  display:         flex;
  align-items:     center;
  justify-content: space-between;
  margin-bottom:   0.5rem;
}

.orders-btn-add-line {
  display:          flex;
  align-items:      center;
  gap:              0.3rem;
  padding:          0.3rem 0.6rem;
  background-color: var(--brand-soft);
  color:            var(--brand);
  border:           none;
  border-radius:    0.4rem;
  font-size:        0.72rem;
  font-weight:      600;
  cursor:           pointer;
  transition:       background-color 0.15s;
}

.orders-btn-add-line:hover {
  background-color: var(--brand-soft);
}

.orders-lines-list {
  display:        flex;
  flex-direction: column;
  gap:            0.5rem;
  margin-bottom:  0.75rem;
}

.orders-line-row {
  display:     flex;
  align-items: flex-end;
  gap:         0.4rem;
}

.orders-line-field {
  display:        flex;
  flex-direction: column;
  gap:            0.2rem;
}

.orders-line-field-product {
  flex:      1;
  min-width: 0;
}

.orders-line-field-label {
  font-size:   0.68rem;
  font-weight: 600;
  color:       var(--text-muted);
}

.orders-line-product-select {
  width:         100%;
  padding:       0.45rem 0.6rem;
  border:        1px solid var(--border);
  border-radius: 0.5rem;
  font-size:     0.82rem;
  color:         var(--text);
  background:    var(--surface);
  outline:       none;
}

.orders-line-qty-input {
  width:         4rem;
  padding:       0.45rem 0.5rem;
  border:        1px solid var(--border);
  border-radius: 0.5rem;
  font-size:     0.82rem;
  color:         var(--text);
  text-align:    center;
  outline:       none;
}

.orders-line-label-input {
  width:         8rem;
  padding:       0.45rem 0.5rem;
  border:        1px solid var(--border);
  border-radius: 0.5rem;
  font-size:     0.82rem;
}

.orders-line-price-input {
  width:         6rem;
  padding:       0.45rem 0.5rem;
  border:        1px solid var(--border);
  border-radius: 0.5rem;
  font-size:     0.82rem;
  color:         var(--text);
  outline:       none;
}

.orders-line-remove-btn {
  width:            2rem;
  height:           2rem;
  display:          flex;
  align-items:      center;
  justify-content:  center;
  background-color: var(--status-critical-bg);
  color:            var(--status-critical-fg);
  border:           none;
  border-radius:    0.4rem;
  cursor:           pointer;
  flex-shrink:      0;
  transition:       background-color 0.15s;
}

.orders-line-remove-btn:hover {
  background-color: var(--status-critical-bg);
}

.orders-line-remove-btn-disabled {
  background-color: var(--surface-alt);
  color:            var(--text-faint);
  cursor:           not-allowed;
}

/* ─── Total preview ─────────────────────────────────────────────────────────── */
.orders-total-preview {
  display:          flex;
  align-items:      center;
  justify-content:  space-between;
  padding:          0.6rem 0.75rem;
  background-color: var(--brand-soft);
  border-radius:    0.75rem;
  margin-bottom:    0.75rem;
}

.orders-total-label {
  font-size:   0.85rem;
  color:       var(--brand);
  font-weight: 600;
}

.orders-total-value {
  font-size:   1.1rem;
  font-weight: 800;
  color:       var(--brand);
}

/* ─── Modal footer ──────────────────────────────────────────────────────────── */
.orders-modal-footer {
  display:         flex;
  gap:             0.5rem;
  justify-content: flex-end;
  margin-top:      0.75rem;
}

.orders-modal-btn-cancel {
  padding:       0.6rem 1.25rem;
  border:        1px solid var(--border);
  border-radius: 0.75rem;
  color:         var(--text-muted);
  font-size:     0.88rem;
  font-weight:   600;
  background:    var(--surface);
  cursor:        pointer;
}

.orders-modal-btn-save {
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

.orders-modal-btn-save:hover {
  background-color: var(--brand);
}

/* ─── Order detail modal specifics ──────────────────────────────────────────── */
.orders-detail-supplier-row {
  display:          flex;
  align-items:      flex-start;
  gap:              0.75rem;
  padding:          0.75rem;
  background-color: var(--surface-alt);
  border:           1px solid var(--border);
  border-radius:    0.75rem;
  margin-bottom:    1rem;
}

.orders-detail-supplier-name {
  font-size:   0.85rem;
  font-weight: 600;
  color:       var(--text);
  margin:      0;
}

.orders-detail-supplier-dates {
  font-size: 0.72rem;
  color:     var(--text-faint);
  margin:    0;
}

.orders-detail-lines-section {
  margin-bottom: 0.75rem;
}

.orders-detail-section-label {
  font-size:     0.75rem;
  font-weight:   600;
  color:         var(--text-muted);
  margin-bottom: 0.5rem;
}

.orders-detail-receive-hint {
  font-size:        0.74rem;
  color:            var(--text-muted);
  background-color: var(--surface-alt);
  border:           1px solid var(--border);
  border-radius:    0.6rem;
  padding:          0.55rem 0.7rem;
  margin:           0 0 0.75rem 0;
}

.orders-detail-table-wrapper {
  border:        1px solid var(--border);
  border-radius: 0.75rem;
  overflow:      hidden;
}

.orders-detail-table {
  width:           100%;
  border-collapse: collapse;
}

.orders-detail-thead-row {
  background-color: var(--surface-alt);
}

.orders-detail-th {
  padding:     0.5rem 0.75rem;
  font-size:   0.68rem;
  font-weight: 600;
  color:       var(--text-faint);
  text-align:  left;
}

.orders-detail-th-center {
  text-align: center;
}

.orders-detail-th-right {
  text-align: right;
}

.orders-detail-tr {
  border-top: 1px solid var(--surface-alt);
}

.orders-detail-td {
  padding:   0.5rem 0.75rem;
  font-size: 0.8rem;
  color:     var(--text);
}

.orders-detail-td-center {
  text-align: center;
  color:      var(--text-muted);
}

.orders-detail-td-right {
  text-align: right;
}

.orders-detail-td-muted {
  color: var(--text-muted);
}

.orders-detail-td-bold {
  font-weight: 600;
  color:       var(--brand);
}

.orders-detail-tfoot-row {
  border-top:       2px solid var(--border);
  background-color: var(--surface-alt);
}

.orders-detail-tfoot-label {
  font-size:   0.85rem;
  font-weight: 700;
  color:       var(--brand);
}

.orders-detail-tfoot-total {
  font-size:   0.95rem;
  font-weight: 800;
  color:       var(--brand);
}

/* ─── Status timeline ───────────────────────────────────────────────────────── */
.orders-detail-timeline-section {
  margin-bottom: 0.75rem;
}

.orders-timeline {
  display:     flex;
  align-items: center;
  padding:     0.75rem;
  background-color: var(--surface-alt);
  border:      1px solid var(--border);
  border-radius: 0.75rem;
}

.orders-timeline-step {
  display:        flex;
  flex-direction: column;
  align-items:    center;
  gap:            0.35rem;
  flex-shrink:    0;
}

.orders-timeline-dot {
  width:           1.6rem;
  height:          1.6rem;
  border-radius:   50%;
  display:         flex;
  align-items:     center;
  justify-content: center;
  border:          2px solid var(--border-strong);
  color:           var(--text-faint);
  background-color: var(--surface);
  flex-shrink:     0;
}
.orders-timeline-dot--done      { background-color: var(--status-ok-fg); border-color: var(--status-ok-fg); color: var(--surface); }
.orders-timeline-dot--pending   { background-color: var(--surface); border-color: var(--border-strong); }
.orders-timeline-dot--delayed   { background-color: var(--status-warning-fg); border-color: var(--status-warning-fg); color: var(--surface); }
.orders-timeline-dot--cancelled { background-color: var(--status-critical-fg); border-color: var(--status-critical-fg); color: var(--surface); }

.orders-timeline-label {
  font-size:   0.7rem;
  font-weight: 600;
  color:       var(--text-muted);
  white-space: nowrap;
}
.orders-timeline-label--done      { color: var(--status-ok-fg); }
.orders-timeline-label--delayed   { color: var(--status-warning-fg); }
.orders-timeline-label--cancelled { color: var(--status-critical-fg); }

.orders-timeline-connector {
  flex:           1;
  height:         2px;
  min-width:      1.5rem;
  margin:         0 0.4rem 1.3rem;
  background-color: var(--border-strong);
}
.orders-timeline-connector--done { background-color: var(--status-ok-fg); }

.orders-timeline-delayed-note {
  display:          flex;
  align-items:      center;
  margin:           0.5rem 0 0;
  font-size:        0.74rem;
  font-weight:      600;
  color:            var(--status-warning-fg);
}

/* ─── Notes ─────────────────────────────────────────────────────────────────── */
.orders-detail-notes {
  padding:          0.75rem;
  background-color: var(--status-warning-bg);
  border:           1px solid var(--status-warning-bg);
  border-radius:    0.75rem;
  margin-bottom:    0.75rem;
}

.orders-detail-notes-label {
  font-size:   0.72rem;
  font-weight: 600;
  color:       var(--status-warning-fg);
  margin:      0 0 0.2rem;
}

.orders-detail-notes-text {
  font-size: 0.82rem;
  color:     var(--status-warning-fg);
  margin:    0;
}

/* ─── Action buttons ────────────────────────────────────────────────────────── */
.orders-detail-actions-section {
  margin-bottom: 0.75rem;
}

.orders-detail-action-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap:     0.5rem;
}

.orders-action-btn {
  display:        flex;
  flex-direction: column;
  align-items:    center;
  gap:            0.3rem;
  padding:        0.6rem;
  border:         none;
  border-radius:  0.75rem;
  font-size:      0.72rem;
  font-weight:    600;
  cursor:         pointer;
  transition:     background-color 0.15s;
}

.orders-action-btn-receive {
  background-color: var(--status-ok-bg);
  color:            var(--status-ok-fg);
}

.orders-action-btn-receive:hover {
  background-color: var(--status-ok-bg);
}

.orders-action-btn-delay {
  background-color: var(--status-warning-bg);
  color:            var(--status-warning-fg);
}

.orders-action-btn-delay:hover {
  background-color: var(--status-warning-bg);
}

.orders-action-btn-cancel {
  background-color: var(--status-critical-bg);
  color:            var(--status-critical-fg);
}

.orders-action-btn-cancel:hover {
  background-color: var(--status-critical-bg);
}

.orders-detail-close-btn {
  width:            100%;
  padding:          0.65rem;
  background-color: var(--brand);
  color:            var(--brand-ink);
  border:           none;
  border-radius:    0.75rem;
  font-size:        0.88rem;
  font-weight:      600;
  cursor:           pointer;
  transition:       background-color 0.15s;
}

.orders-detail-close-btn:hover {
  background-color: var(--brand);
}

/* ─── Responsive ────────────────────────────────────────────────────────────── */
@media (max-width: 767px) {
  .orders-table-wrapper {
    display: none;
  }
  .orders-mobile-cards {
    display: flex;
  }
  .orders-btn-label {
    display: none;
  }
  .orders-modal-row {
    grid-template-columns: 1fr;
  }
  .orders-line-row {
    flex-wrap: wrap;
  }
  .orders-line-product-select {
    width: 100%;
  }
}

@media (min-width: 768px) {
  .orders-modal-overlay {
    align-items: center;
  }
  .orders-modal {
    width:         520px;
    border-radius: 1.25rem;
  }
  .orders-detail-modal {
    width:         460px;
    border-radius: 1.25rem;
  }
}
</style>
