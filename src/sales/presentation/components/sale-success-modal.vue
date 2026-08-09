<script setup>
import { useI18n } from 'vue-i18n';

/**
 * SaleSuccessModal component for the Sales & POS Management bounded context.
 *
 * Displays a confirmation modal after a sale has been registered successfully.
 * Shows the sale ID, total, payment method, and the list of items sold.
 * Provides a "Nueva venta" button to start the next transaction.
 *
 * @component SaleSuccessModal
 */

const props = defineProps({
  /**
   * The completed Sale entity just registered.
   * @type {import('../../domain/model/sale.entity.js').Sale}
   */
  sale: {
    type:     Object,
    required: true
  },
  /**
   * Enriched items with product names for display.
   * @type {Array<{productName: string, quantity: number, unitPrice: number, lineTotal: number}>}
   */
  saleItems: {
    type:     Array,
    required: true
  }
});

const emit = defineEmits([
  /** Emitted when the user clicks "Nueva venta" to start a fresh POS session. */
  'new-sale'
]);

const { t } = useI18n();

/**
 * Formats a number as a Peruvian sol currency string.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return `S/ ${Number(amount).toFixed(2)}`;
}

/**
 * Returns the translated payment method label for display.
 * @param {string} method - PaymentMethod enum value.
 * @returns {string}
 */
function formatPaymentMethod(method) {
  if (!method) return '—';
  const key = `pos.payment-${method.toLowerCase()}`;
  return t(key);
}
</script>

<template>
  <!-- Backdrop -->
  <div
      class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center"
      style="background-color: rgba(0,0,0,0.5);"
  >
    <!-- Modal panel -->
    <div
        class="w-full border-round-top-2xl sm:border-round-2xl p-6 shadow-8 text-center"
        style="max-width: 360px; background-color: #fff;"
    >
      <!-- Success icon -->
      <div
          class="flex align-items-center justify-content-center border-round-3xl mx-auto mb-3"
          style="width: 56px; height: 56px; background-color: #DCFCE7;"
      >
        <i class="pi pi-check-circle" style="font-size: 1.75rem; color: #16A34A;" />
      </div>

      <!-- Title -->
      <h2 class="m-0 mb-1" style="font-size: 1.15rem; font-weight: 700; color: #0B3558;">
        {{ t('pos.success-title') }}
      </h2>
      <p class="m-0" style="color: #64748B; font-size: 0.82rem;">
        {{ sale.id ? `#${sale.id}` : '' }}
        · {{ formatCurrency(sale.totalAmount || 0) }}
        · {{ formatPaymentMethod(sale.paymentMethod) }}
      </p>

      <!-- Items breakdown -->
      <div
          class="my-4 border-round-xl p-3 text-left"
          style="background-color: #F8FAFC; border: 1px solid #E2E8F0;"
      >
        <div
            v-for="(item, index) in saleItems"
            :key="index"
            class="flex justify-content-between"
            :style="index > 0 ? 'margin-top: 4px;' : ''"
        >
                    <span style="font-size: 0.8rem; color: #1E293B;">
                        {{ item.productName }} ×{{ item.quantity }}
                    </span>
          <span style="font-size: 0.8rem; color: #64748B;">
                        {{ formatCurrency(item.lineTotal) }}
                    </span>
        </div>
        <div
            class="flex justify-content-between mt-2 pt-2"
            style="border-top: 1px solid #E2E8F0;"
        >
                    <span style="font-size: 0.85rem; font-weight: 700; color: #0B3558;">
                        {{ t('pos.grand-total') }}
                    </span>
          <span style="font-size: 0.85rem; font-weight: 700; color: #0B3558;">
                        {{ formatCurrency(sale.totalAmount || 0) }}
                    </span>
        </div>
      </div>

      <!-- New sale button -->
      <button
          class="w-full border-round-xl"
          style="background-color: #0B3558; color: #fff; font-size: 0.9rem; font-weight: 600; padding: 10px; border: none; cursor: pointer;"
          @click="emit('new-sale')"
      >
        {{ t('pos.success-new-sale') }}
      </button>
    </div>
  </div>
</template>