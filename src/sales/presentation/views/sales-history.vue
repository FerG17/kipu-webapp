<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n }      from 'vue-i18n';
import { useToast }     from 'primevue/usetoast';
import useSalesStore    from '../../application/sales.store.js';
import useProductStore  from '../../../product/application/product.store.js';
import useIamStore      from '../../../iam/application/iam.store.js';
import { SaleStatus }   from '../../domain/model/sale.entity.js';
import { toDateLocale } from '../../../shared/presentation/date-locale.js';

/**
 * SalesHistory view for the Sales & POS Management bounded context.
 *
 * Displays all registered sales for the business in a searchable,
 * filterable, expandable table (desktop) and card list (mobile).
 *
 * Features:
 * - Search by sale ID or customer name.
 * - Filter by status: All / Completed (PAID) / Cancelled.
 * - Expandable rows to see the line items of each sale.
 * - Cancel action for non-cancelled sales.
 *
 * @view SalesHistory
 */

const { t, locale } = useI18n();
const toast        = useToast();
const salesStore   = useSalesStore();
const productStore = useProductStore();
const iamStore     = useIamStore();

// ─── UI state ──────────────────────────────────────────────────────────────

/** @type {import('vue').Ref<string>} Text in the search input. */
const searchQuery = ref('');

/** @type {import('vue').Ref<string>} Active status filter: 'ALL', 'PAID', or 'CANCELLED'. */
const activeStatusFilter = ref('ALL');

/** @type {import('vue').Ref<string|null>} The id of the currently expanded sale row. */
const expandedSaleId = ref(null);

/** @type {import('vue').Ref<number|null>} The id of the sale whose line items are being fetched. */
const loadingDetailsSaleId = ref(null);

// ─── Computed ──────────────────────────────────────────────────────────────

/**
 * Sales filtered by search query and status filter.
 * Sorted descending by date (most recent first).
 * @type {import('vue').ComputedRef<import('../../domain/model/sale.entity.js').Sale[]>}
 */
const filteredSales = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  return [...salesStore.sales]
      .filter(sale => {
        const matchesStatus = activeStatusFilter.value === 'ALL' ||
            sale.status === activeStatusFilter.value;

        const customerName = getCustomerName(sale.customerId).toLowerCase();
        const saleIdString = String(sale.id).toLowerCase();
        const matchesSearch = !query ||
            saleIdString.includes(query) ||
            customerName.includes(query);

        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
});

/**
 * Status filter options configuration.
 * @type {Array<{value: string, labelKey: string}>}
 */
const statusFilters = [
  { value: 'ALL',                   labelKey: 'sales.filter-all'       },
  { value: SaleStatus.PAID,         labelKey: 'sales.filter-paid'      },
  { value: SaleStatus.CANCELLED,    labelKey: 'sales.filter-cancelled' }
];

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Returns the full name of the customer by id, or a default label.
 * @param {number|null} customerId
 * @returns {string}
 */
function getCustomerName(customerId) {
  if (!customerId) return t('pos.anonymous-customer');
  const customer = salesStore.getCustomerById(customerId);
  return customer ? customer.fullName : t('pos.unknown-customer');
}

/**
 * Returns the product name for a productId, falling back to a default.
 * @param {number} productId
 * @returns {string}
 */
function getProductName(productId) {
  const product = productStore.products.find(product => product.id === productId);
  return product ? product.name : t('pos.unknown-product');
}

/**
 * Returns the badge style config for a given SaleStatus.
 * @param {string} status
 * @returns {{ label: string, color: string, background: string }}
 */
function getStatusConfig(status) {
  if (status === SaleStatus.PAID) {
    return { labelKey: 'sales.status-paid',      color: '#16A34A', background: '#DCFCE7' };
  }
  if (status === SaleStatus.CANCELLED) {
    return { labelKey: 'sales.status-cancelled', color: '#EF4444', background: '#FEE2E2' };
  }
  return { labelKey: 'sales.status-open',          color: '#D97706', background: '#FEF3C7' };
}

/**
 * Returns the badge style for a payment method.
 * @param {string|null} method
 * @returns {{ label: string, color: string, background: string }}
 */
function getMethodConfig(method) {
  const configs = {
    CASH: { color: '#16A34A', background: '#DCFCE7' },
    YAPE: { color: '#7C3AED', background: '#EDE9FE' },
    PLIN: { color: '#0891B2', background: '#CFFAFE' },
    CARD: { color: '#D97706', background: '#FEF3C7' }
  };
  return configs[method] || { color: '#64748B', background: '#F1F5F9' };
}

/**
 * Formats an ISO date string as a short locale date + time.
 * @param {string} dateString
 * @returns {string}
 */
function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString(toDateLocale(locale.value), {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Formats a number as a currency string with S/ prefix.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return `S/ ${Number(amount).toFixed(2)}`;
}

/**
 * Toggles the expanded state of a sale row.
 *
 * `fetchSales()` loads sales without their line items (the mock API doesn't
 * nest them), so `sale.details` is always [] right after the list loads.
 * The first time a row is expanded, its details are fetched lazily and
 * cached on the entity so later toggles don't refetch.
 *
 * @param {import('../../domain/model/sale.entity.js').Sale} sale
 */
async function toggleExpand(sale) {
  if (expandedSaleId.value === sale.id) {
    expandedSaleId.value = null;
    return;
  }

  expandedSaleId.value = sale.id;

  if (sale.details.length === 0) {
    loadingDetailsSaleId.value = sale.id;
    sale.details = await salesStore.fetchSaleDetailsForSale(sale.id);
    loadingDetailsSaleId.value = null;
  }
}

/**
 * Cancels a sale after inline confirmation, then restores the sold
 * quantities back into inventory (the cancellation itself only flips
 * the sale's status; restocking is a Product & Inventory concern).
 * @param {import('../../domain/model/sale.entity.js').Sale} sale
 */
async function handleCancelSale(sale) {
  const businessId = iamStore.currentUser?.businessId;
  const result = await salesStore.cancelSale(sale);

  if (!result.success) {
    toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('sales.toast-cancel-error'), life: 4500 });
    return;
  }

  try {
    await Promise.all(result.restockedDetails.map(detail =>
        productStore.registerStockIntake({
          productId:   detail.productId,
          businessId:  businessId,
          quantity:    detail.quantity,
          warehouseId: productStore.getInventoryByProduct(detail.productId)?.warehouseId
        })
    ));
    toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('sales.toast-cancel-success'), life: 3500 });
  } catch {
    toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('sales.toast-cancel-error'), life: 4500 });
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
  const businessId = iamStore.currentUser?.businessId;
  if (!salesStore.salesLoaded)      salesStore.fetchSales(businessId);
  if (!salesStore.customersLoaded)  salesStore.fetchCustomers(businessId);
  if (!productStore.productsLoaded) productStore.fetchProducts(businessId);
  if (!productStore.inventoryLoaded) productStore.fetchInventory(businessId);
});
</script>

<template>
  <div class="flex flex-column h-full overflow-hidden">

    <!-- Filters bar -->
    <div
        class="px-4 py-3"
        style="border-bottom: 1px solid #E2E8F0; display: flex; flex-direction: column; gap: 8px;"
    >
      <!-- Search -->
      <div style="position: relative;">
        <i
            class="pi pi-search"
            style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.85rem;"
        />
        <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('sales.search-placeholder')"
            class="w-full border-round-lg"
            style="padding: 8px 12px 8px 36px; border: 1px solid #E2E8F0; font-size: 0.85rem; background-color: #F8FAFC; outline: none;"
            @focus="(e) => e.target.style.borderColor = '#0E7490'"
            @blur="(e) => e.target.style.borderColor = '#E2E8F0'"
        />
      </div>

      <!-- Status filter pills -->
      <div class="flex gap-2">
        <button
            v-for="filter in statusFilters"
            :key="filter.value"
            class="border-round-3xl px-3 py-1"
            style="font-size: 0.72rem; font-weight: 600; border: none; cursor: pointer;"
            :style="{
                        backgroundColor: activeStatusFilter === filter.value ? '#0B3558' : '#F1F5F9',
                        color:           activeStatusFilter === filter.value ? '#fff'    : '#64748B'
                    }"
            @click="activeStatusFilter = filter.value"
        >
          {{ t(filter.labelKey) }}
        </button>
      </div>
    </div>

    <!-- Content area -->
    <div class="flex-1 overflow-y-auto">

      <!-- ── Desktop table ── -->
      <div class="hidden md:block">
        <table class="w-full" style="border-collapse: collapse;">
          <thead>
          <tr style="background-color: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
            <th
                v-for="header in [
                                    t('sales.col-id'),
                                    t('sales.col-date'),
                                    t('sales.col-customer'),
                                    t('sales.col-payment'),
                                    t('sales.col-total'),
                                    t('sales.col-status'),
                                    ''
                                ]"
                :key="header"
                class="px-4 py-3 text-left"
                style="font-size: 0.72rem; font-weight: 600; color: #94A3B8;"
            >
              {{ header }}
            </th>
          </tr>
          </thead>
          <tbody>
          <template
              v-for="sale in filteredSales"
              :key="sale.id"
          >
            <!-- Main row -->
            <tr
                style="border-bottom: 1px solid #F1F5F9; cursor: pointer;"
                @click="toggleExpand(sale)"
                @mouseenter="(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'"
                @mouseleave="(e) => e.currentTarget.style.backgroundColor = 'transparent'"
            >
              <td class="px-4 py-3" style="font-size: 0.82rem; font-weight: 600; color: #0B3558;">
                #{{ sale.id }}
              </td>
              <td class="px-4 py-3" style="font-size: 0.78rem; color: #64748B;">
                {{ formatDate(sale.date) }}
              </td>
              <td class="px-4 py-3" style="font-size: 0.78rem; color: #1E293B;">
                {{ getCustomerName(sale.customerId) }}
              </td>
              <td class="px-4 py-3">
                                    <span
                                        v-if="sale.paymentMethod"
                                        class="border-round-md px-2 py-1"
                                        style="font-size: 0.7rem; font-weight: 600;"
                                        :style="{
                                            backgroundColor: getMethodConfig(sale.paymentMethod).background,
                                            color:           getMethodConfig(sale.paymentMethod).color
                                        }"
                                    >
                                        {{ t(`pos.payment-${sale.paymentMethod.toLowerCase()}`) }}
                                    </span>
                <span v-else style="color: #94A3B8;">—</span>
              </td>
              <td class="px-4 py-3" style="font-size: 0.88rem; font-weight: 700; color: #0B3558;">
                {{ formatCurrency(sale.subtotal) }}
              </td>
              <td class="px-4 py-3">
                                    <span
                                        class="border-round-md px-2 py-1"
                                        style="font-size: 0.7rem; font-weight: 600;"
                                        :style="{
                                            backgroundColor: getStatusConfig(sale.status).background,
                                            color:           getStatusConfig(sale.status).color
                                        }"
                                    >
                                        {{ t(getStatusConfig(sale.status).labelKey) }}
                                    </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex align-items-center gap-2">
                  <button
                      v-if="sale.status !== SaleStatus.CANCELLED"
                      class="border-round-lg px-2 py-1"
                      style="background-color: #FEE2E2; color: #EF4444; font-size: 0.72rem; font-weight: 600; border: none; cursor: pointer;"
                      @click.stop="handleCancelSale(sale)"
                  >
                    {{ t('sales.cancel-action') }}
                  </button>
                  <i
                      class="pi pi-chevron-down"
                      style="color: #94A3B8; font-size: 0.75rem; transition: transform 0.2s;"
                      :style="{ transform: expandedSaleId === sale.id ? 'rotate(180deg)' : 'rotate(0deg)' }"
                  />
                </div>
              </td>
            </tr>

            <!-- Loading line items -->
            <tr
                v-if="expandedSaleId === sale.id && loadingDetailsSaleId === sale.id"
                :key="`${sale.id}-loading`"
                style="background-color: #F8FAFC;"
            >
              <td colspan="7" class="px-6 py-3">
                <i class="pi pi-spin pi-spinner" style="color: #94A3B8; font-size: 0.85rem;"/>
              </td>
            </tr>

            <!-- Expanded detail row -->
            <tr
                v-if="expandedSaleId === sale.id && sale.details && sale.details.length > 0"
                :key="`${sale.id}-detail`"
                style="background-color: #F8FAFC;"
            >
              <td colspan="7" class="px-6 py-3">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <div
                      v-for="(detail, index) in sale.details"
                      :key="index"
                      class="flex justify-content-between"
                  >
                                            <span style="font-size: 0.78rem; color: #1E293B;">
                                                {{ getProductName(detail.productId) }} ×{{ detail.quantity }}
                                            </span>
                    <span style="font-size: 0.78rem; color: #64748B;">
                                                {{ formatCurrency(detail.lineTotal) }}
                                            </span>
                  </div>
                </div>
              </td>
            </tr>
          </template>
          </tbody>
        </table>
      </div>

      <!-- ── Mobile cards ── -->
      <div class="md:hidden p-4" style="display: flex; flex-direction: column; gap: 12px;">
        <div
            v-for="sale in filteredSales"
            :key="sale.id"
            class="bg-white border-round-xl p-4"
            style="border: 1px solid #E2E8F0;"
        >
          <!-- Top row -->
          <div class="flex align-items-start justify-content-between mb-2">
            <div>
              <p class="m-0" style="font-size: 0.85rem; font-weight: 700; color: #0B3558;">
                #{{ sale.id }}
              </p>
              <p class="m-0" style="font-size: 0.72rem; color: #94A3B8;">
                {{ formatDate(sale.date) }}
              </p>
            </div>
            <span
                class="border-round-md px-2 py-1"
                style="font-size: 0.7rem; font-weight: 600;"
                :style="{
                                backgroundColor: getStatusConfig(sale.status).background,
                                color:           getStatusConfig(sale.status).color
                            }"
            >
                            {{ t(getStatusConfig(sale.status).labelKey) }}
                        </span>
          </div>

          <!-- Bottom row -->
          <div class="flex align-items-center justify-content-between">
                        <span
                            v-if="sale.paymentMethod"
                            class="border-round-md px-2 py-1"
                            style="font-size: 0.7rem; font-weight: 600;"
                            :style="{
                                backgroundColor: getMethodConfig(sale.paymentMethod).background,
                                color:           getMethodConfig(sale.paymentMethod).color
                            }"
                        >
                            {{ t(`pos.payment-${sale.paymentMethod.toLowerCase()}`) }}
                        </span>
            <span v-else />
            <span style="font-size: 1rem; font-weight: 800; color: #0B3558;">
                            {{ formatCurrency(sale.subtotal) }}
                        </span>
          </div>

          <!-- Customer -->
          <div
              v-if="sale.customerId"
              class="flex align-items-center gap-2 mt-2"
          >
            <i class="pi pi-user" style="color: #94A3B8; font-size: 0.75rem;" />
            <span style="font-size: 0.75rem; color: #64748B;">
                            {{ getCustomerName(sale.customerId) }}
                        </span>
          </div>

          <!-- Expand / collapse items -->
          <button
              class="w-full flex align-items-center justify-content-center gap-1 mt-3 border-round-lg py-2"
              style="background-color: #F1F5F9; color: #64748B; border: none; cursor: pointer;"
              @click="toggleExpand(sale)"
          >
                        <span style="font-size: 0.72rem; font-weight: 600;">
                            {{ expandedSaleId === sale.id ? t('sales.hide-items') : t('sales.show-items') }}
                        </span>
            <i
                class="pi pi-chevron-down"
                style="font-size: 0.65rem; transition: transform 0.2s;"
                :style="{ transform: expandedSaleId === sale.id ? 'rotate(180deg)' : 'rotate(0deg)' }"
            />
          </button>

          <!-- Loading line items -->
          <div
              v-if="expandedSaleId === sale.id && loadingDetailsSaleId === sale.id"
              class="mt-2 pt-2"
              style="border-top: 1px solid #F1F5F9;"
          >
            <i class="pi pi-spin pi-spinner" style="color: #94A3B8; font-size: 0.85rem;"/>
          </div>

          <!-- Expanded items -->
          <div
              v-if="expandedSaleId === sale.id && sale.details && sale.details.length > 0"
              class="mt-2 pt-2"
              style="border-top: 1px solid #F1F5F9; display: flex; flex-direction: column; gap: 4px;"
          >
            <div
                v-for="(detail, index) in sale.details"
                :key="index"
                class="flex justify-content-between"
            >
                            <span style="font-size: 0.78rem; color: #1E293B;">
                                {{ getProductName(detail.productId) }} ×{{ detail.quantity }}
                            </span>
              <span style="font-size: 0.78rem; color: #64748B;">
                                {{ formatCurrency(detail.lineTotal) }}
                            </span>
            </div>
          </div>

          <!-- Cancel action -->
          <button
              v-if="sale.status !== SaleStatus.CANCELLED"
              class="w-full mt-3 border-round-lg py-2"
              style="background-color: #FEE2E2; color: #EF4444; font-size: 0.78rem; font-weight: 600; border: none; cursor: pointer;"
              @click="handleCancelSale(sale)"
          >
            {{ t('sales.cancel-action') }}
          </button>
        </div>
      </div>

      <!-- Empty state -->
      <div
          v-if="filteredSales.length === 0"
          class="flex flex-column align-items-center justify-content-center py-12 text-center"
      >
        <i class="pi pi-receipt mb-2" style="font-size: 2.25rem; color: #CBD5E1;" />
        <p class="m-0" style="color: #94A3B8; font-size: 0.88rem;">
          {{ t('sales.no-results') }}
        </p>
      </div>
    </div>
  </div>
</template>