<script setup>
import { computed } from 'vue';
import { useI18n }  from 'vue-i18n';

/**
 * CartPanel component for the Sales & POS Management bounded context.
 *
 * Renders the list of items in the current in-progress sale (cart),
 * with quantity controls (+/-), remove buttons, and a total + pay button.
 * Used both as the desktop sidebar panel and inside the mobile bottom drawer.
 *
 * Business rules:
 * - Quantity cannot be decreased below 1 via the minus button (use remove instead).
 * - Quantity cannot be increased above the available stock for that product.
 *
 * @component CartPanel
 */

const props = defineProps({
  /**
   * Array of enriched cart items: SaleDetail + productName + availableStock.
   * @type {Array<{productId: number, quantity: number, unitPrice: number, lineTotal: number, productName: string, availableStock: number}>}
   */
  cartItems: {
    type:     Array,
    required: true
  },
  /**
   * Grand total of the current sale (sum of all lineTotals).
   * @type {number}
   */
  total: {
    type:     Number,
    required: true
  }
});

const emit = defineEmits([
  /** Emitted when the user clicks the minus/plus button on a cart item. payload: { productId, delta } */
  'update-quantity',
  /** Emitted when the user clicks the trash button on a cart item. payload: productId */
  'remove-item',
  /** Emitted when the user clicks the "Cobrar" button. */
  'pay'
]);

const { t } = useI18n();

/**
 * Total number of individual units in the cart (sum of all quantities).
 * @type {import('vue').ComputedRef<number>}
 */
const totalUnitCount = computed(() =>
    props.cartItems.reduce((sum, item) => sum + item.quantity, 0)
);

/**
 * Formats a number as a currency string with S/ prefix.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return `S/ ${amount.toFixed(2)}`;
}

/**
 * Emits an update-quantity event with delta +1 or -1.
 * @param {number} productId
 * @param {number} delta - +1 to increase, -1 to decrease
 */
function changeQuantity(productId, delta) {
  emit('update-quantity', { productId, delta });
}

/**
 * Emits a remove-item event for the given product.
 * @param {number} productId
 */
function removeItem(productId) {
  emit('remove-item', productId);
}
</script>

<template>
  <div class="flex flex-column h-full">

    <!-- Cart header -->
    <div
        class="flex align-items-center gap-2 px-4 py-3"
        style="border-bottom: 1px solid #F1F5F9;"
    >
      <i class="pi pi-shopping-cart" style="color: #0B3558; font-size: 1rem;" />
      <span style="font-size: 0.95rem; font-weight: 700; color: #0B3558;">
                {{ t('pos.cart-title') }}
            </span>
      <span
          v-if="cartItems.length > 0"
          class="ml-auto px-2 py-1 border-round-3xl"
          style="background-color: #0B3558; color: #fff; font-size: 0.7rem; font-weight: 700;"
      >
                {{ totalUnitCount }}
            </span>
    </div>

    <!-- Cart items list -->
    <div class="flex-1 overflow-y-auto px-4 py-2" style="gap: 8px; display: flex; flex-direction: column;">

      <!-- Empty state -->
      <div
          v-if="cartItems.length === 0"
          class="flex flex-column align-items-center justify-content-center h-full text-center"
          style="min-height: 120px;"
      >
        <i class="pi pi-shopping-cart mb-2" style="font-size: 2rem; color: #CBD5E1;" />
        <p class="m-0" style="color: #94A3B8; font-size: 0.8rem;">{{ t('pos.empty-cart') }}</p>
        <p class="m-0 mt-1" style="color: #CBD5E1; font-size: 0.72rem;">{{ t('pos.empty-cart-hint') }}</p>
      </div>

      <!-- Item rows -->
      <div
          v-for="item in cartItems"
          :key="item.productId"
          class="flex align-items-start gap-2 py-2"
          style="border-bottom: 1px solid #F8FAFC;"
      >
        <!-- Product info -->
        <div class="flex-1 min-w-0">
          <p
              class="m-0"
              style="font-size: 0.8rem; font-weight: 600; color: #1E293B; line-height: 1.3;"
          >
            {{ item.productName }}
          </p>
          <p class="m-0" style="font-size: 0.72rem; color: #64748B;">
            {{ formatCurrency(item.unitPrice) }} {{ t('pos.per-unit') }}
          </p>
        </div>

        <!-- Quantity controls -->
        <div class="flex align-items-center shrink-0" style="gap: 6px;">
          <button
              class="flex align-items-center justify-content-center border-round-lg"
              style="width: 24px; height: 24px; background-color: #F1F5F9; color: #64748B; border: none; cursor: pointer;"
              @click="changeQuantity(item.productId, -1)"
          >
            <i class="pi pi-minus" style="font-size: 0.55rem;" />
          </button>
          <span style="font-size: 0.82rem; font-weight: 700; color: #0B3558; min-width: 18px; text-align: center;">
                        {{ item.quantity }}
                    </span>
          <button
              class="flex align-items-center justify-content-center border-round-lg"
              style="width: 24px; height: 24px; background-color: #E0F2FE; color: #0E7490; border: none; cursor: pointer;"
              :disabled="item.quantity >= item.availableStock"
              :style="item.quantity >= item.availableStock ? 'opacity: 0.4; cursor: not-allowed;' : ''"
              @click="changeQuantity(item.productId, 1)"
          >
            <i class="pi pi-plus" style="font-size: 0.55rem;" />
          </button>
          <button
              class="flex align-items-center justify-content-center border-round-lg ml-1"
              style="width: 24px; height: 24px; background-color: #FEE2E2; color: #EF4444; border: none; cursor: pointer;"
              @click="removeItem(item.productId)"
          >
            <i class="pi pi-trash" style="font-size: 0.55rem;" />
          </button>
        </div>

        <!-- Line total -->
        <p
            class="m-0 shrink-0"
            style="font-size: 0.82rem; font-weight: 700; color: #0B3558; min-width: 52px; text-align: right;"
        >
          {{ formatCurrency(item.lineTotal) }}
        </p>
      </div>
    </div>

    <!-- Footer: total + pay button -->
    <div
        v-if="cartItems.length > 0"
        class="px-4 py-3"
        style="border-top: 1px solid #E2E8F0; display: flex; flex-direction: column; gap: 12px;"
    >
      <div class="flex justify-content-between align-items-center">
        <span style="font-size: 0.9rem; color: #64748B;">{{ t('pos.subtotal') }}</span>
        <span style="font-size: 0.9rem; font-weight: 600; color: #1E293B;">{{ formatCurrency(total) }}</span>
      </div>
      <div class="flex justify-content-between align-items-center">
        <span style="font-size: 0.9rem; font-weight: 700; color: #0B3558;">{{ t('pos.grand-total') }}</span>
        <span style="font-size: 1.2rem; font-weight: 800; color: #0B3558;">{{ formatCurrency(total) }}</span>
      </div>
      <button
          class="w-full border-round-xl"
          style="background-color: #0B3558; color: #fff; font-size: 0.92rem; font-weight: 700; padding: 12px; border: none; cursor: pointer;"
          @click="emit('pay')"
          @mouseenter="(e) => e.currentTarget.style.backgroundColor = '#0E7490'"
          @mouseleave="(e) => e.currentTarget.style.backgroundColor = '#0B3558'"
      >
        {{ t('pos.pay-button') }} {{ formatCurrency(total) }}
      </button>
    </div>
  </div>
</template>