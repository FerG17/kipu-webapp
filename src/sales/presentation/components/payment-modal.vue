<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n }       from 'vue-i18n';
import { PaymentMethod } from '../../domain/model/sale.entity.js';

/**
 * PaymentModal component for the Sales & POS Management bounded context.
 *
 * Displays a bottom-sheet modal (mobile) / centered modal (desktop) for
 * registering a payment. Supports four methods: Cash, Card, Yape, Plin.
 *
 * Business rules:
 * - Cash: the cashGiven amount must be >= total to enable the confirm button.
 *   Change is displayed automatically as cashGiven - total.
 * - Card / Yape / Plin: no cash input shown; confirm is always enabled.
 *
 * @component PaymentModal
 */

const props = defineProps({
  /**
   * Grand total amount to be paid.
   * @type {number}
   */
  total: {
    type:     Number,
    required: true
  },
  /**
   * Registered customers for the current business, offered as an optional
   * pick list. Leaving no selection keeps the sale anonymous, same as before.
   * @type {import('../../domain/model/customer.entity.js').Customer[]}
   */
  customers: {
    type:    Array,
    default: () => []
  }
});

const emit = defineEmits([
  /**
   * Emitted when the user confirms the payment.
   * payload: { paymentMethod: string, cashGiven: number, customerId: number|null,
   *            sellOnCredit: boolean, totalInstallments: number|null }
   */
  'confirm',
  /** Emitted when the user cancels/closes the modal. */
  'cancel'
]);

const { t } = useI18n();

/**
 * Currently selected payment method.
 * Defaults to CASH as the most common method in Peruvian bodegas.
 * @type {import('vue').Ref<string>}
 */
const selectedMethod = ref(PaymentMethod.CASH);

/**
 * Cash amount entered by the cashier (only relevant for CASH method).
 * Pre-populated with the ceiling of the total for convenience.
 * @type {import('vue').Ref<string>}
 */
const cashInput = ref(String(Math.ceil(props.total)));

/**
 * Parsed cash amount from the input field.
 * @type {import('vue').ComputedRef<number>}
 */
const cashGiven = computed(() => parseFloat(cashInput.value) || 0);

/**
 * Selected customer id ('' means anonymous/no customer, the previous behavior).
 * @type {import('vue').Ref<string>}
 */
const selectedCustomerId = ref('');

/**
 * Whether the cashier is attaching a credit payment plan to this sale
 * ("vender a cuotas"). Requires a real (non-anonymous) customer, since a
 * plan with no customer would have no one to collect the debt from — see
 * canConfirm.
 * @type {import('vue').Ref<boolean>}
 */
const sellOnCredit = ref(false);

/**
 * Number of installments to split the sale into when sellOnCredit is on.
 * @type {import('vue').Ref<string>}
 */
const installmentsInput = ref('2');

// Unchecking the customer while credit sale is active would otherwise leave
// a checked-but-disabled checkbox and a stale sellOnCredit=true.
watch(selectedCustomerId, (newCustomerId) => {
  if (!newCustomerId) sellOnCredit.value = false;
});

/**
 * Change to return to the customer when paying with cash.
 * Only meaningful when selectedMethod is CASH.
 * @type {import('vue').ComputedRef<number>}
 */
const changeAmount = computed(() =>
    selectedMethod.value === PaymentMethod.CASH
        ? cashGiven.value - props.total
        : 0
);

/**
 * Whether the confirm button should be enabled.
 * For CASH: cashGiven must cover the total.
 * For other methods: always enabled.
 * When selling on credit: a real customer must be selected (to know who
 * owes the debt) and at least 2 installments must be entered.
 * @type {import('vue').ComputedRef<boolean>}
 */
const canConfirm = computed(() => {
  const paymentOk = selectedMethod.value !== PaymentMethod.CASH || changeAmount.value >= 0;
  if (!sellOnCredit.value) return paymentOk;
  return paymentOk && !!selectedCustomerId.value && (parseInt(installmentsInput.value) || 0) >= 2;
});

/**
 * Configuration for each payment method button.
 * @type {Array<{value: string, labelKey: string, icon: string, color: string, background: string}>}
 */
const methodConfigs = [
  { value: PaymentMethod.CASH, labelKey: 'pos.payment-cash', icon: 'pi pi-wallet',       color: '#16A34A', background: '#DCFCE7' },
  { value: PaymentMethod.YAPE, labelKey: 'pos.payment-yape', icon: 'pi pi-mobile',        color: '#7C3AED', background: '#EDE9FE' },
  { value: PaymentMethod.PLIN, labelKey: 'pos.payment-plin', icon: 'pi pi-mobile',        color: '#0891B2', background: '#CFFAFE' },
  { value: PaymentMethod.CARD, labelKey: 'pos.payment-card', icon: 'pi pi-credit-card',   color: '#D97706', background: '#FEF3C7' }
];

/**
 * Formats a number as a currency string with S/ prefix.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return `S/ ${amount.toFixed(2)}`;
}

/**
 * Handles the confirm action by emitting the selected method and cash given.
 */
function handleConfirm() {
  if (!canConfirm.value) return;
  emit('confirm', {
    paymentMethod:     selectedMethod.value,
    cashGiven:         selectedMethod.value === PaymentMethod.CASH ? cashGiven.value : props.total,
    customerId:        selectedCustomerId.value ? parseInt(selectedCustomerId.value) : null,
    sellOnCredit:      sellOnCredit.value,
    totalInstallments: sellOnCredit.value ? (parseInt(installmentsInput.value) || 0) : null
  });
}
</script>

<template>
  <!-- Backdrop -->
  <div
      class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center"
      style="background-color: rgba(0,0,0,0.5);"
      @click.self="emit('cancel')"
  >
    <!-- Modal panel -->
    <div
        class="w-full border-round-top-2xl sm:border-round-2xl p-5 shadow-8"
        style="max-width: 400px; background-color: #fff; border: 1px solid #E2E8F0;"
    >
      <!-- Header -->
      <div class="flex align-items-center justify-content-between mb-4">
        <h2 class="m-0" style="font-size: 1.1rem; font-weight: 700; color: #0B3558;">
          {{ t('pos.payment-modal-title') }}
        </h2>
        <button
            style="background: none; border: none; cursor: pointer; padding: 4px;"
            @click="emit('cancel')"
        >
          <i class="pi pi-times" style="color: #94A3B8; font-size: 1.1rem;" />
        </button>
      </div>

      <!-- Total to charge -->
      <div
          class="border-round-xl p-4 mb-4 text-center"
          style="background-color: #E0F2FE;"
      >
        <p class="m-0 mb-1" style="color: #0E7490; font-size: 0.78rem;">
          {{ t('pos.payment-modal-total-label') }}
        </p>
        <p class="m-0" style="color: #0B3558; font-size: 2rem; font-weight: 800; line-height: 1.2;">
          {{ formatCurrency(total) }}
        </p>
      </div>

      <!-- Customer selector (optional — anonymous sale if left unselected) -->
      <div class="mb-4">
        <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: #64748B;">
          {{ t('pos.payment-modal-customer-label') }}
        </label>
        <select
            v-model="selectedCustomerId"
            class="w-full border-round-lg px-3"
            style="border: 1px solid #E2E8F0; font-size: 0.88rem; color: #1E293B; padding: 10px 12px; outline: none; background: #fff;"
        >
          <option value="">{{ t('pos.payment-modal-customer-anonymous') }}</option>
          <option v-for="customer in customers" :key="customer.id" :value="String(customer.id)">
            {{ customer.fullName }}
          </option>
        </select>
      </div>

      <!-- Sell on credit ("vender a cuotas") — requires a real customer -->
      <div class="mb-4 border-round-xl px-3 py-3" style="border: 1px solid #E2E8F0;">
        <label class="flex align-items-center gap-2" style="cursor: pointer;">
          <input
              v-model="sellOnCredit"
              type="checkbox"
              :disabled="!selectedCustomerId"
              style="width: 16px; height: 16px; accent-color: #0E7490;"
          />
          <span style="font-size: 0.85rem; font-weight: 600; color: #1E293B;">
            {{ t('pos.payment-modal-sell-on-credit') }}
          </span>
        </label>
        <p v-if="!selectedCustomerId" class="m-0 mt-1" style="font-size: 0.72rem; color: #94A3B8;">
          {{ t('pos.payment-modal-credit-needs-customer') }}
        </p>
        <div v-if="sellOnCredit" class="mt-3">
          <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: #64748B;">
            {{ t('pos.payment-modal-installments-label') }}
          </label>
          <input
              v-model="installmentsInput"
              type="number"
              min="2"
              class="w-full border-round-lg px-3"
              style="border: 1px solid #E2E8F0; font-size: 0.95rem; font-weight: 700; color: #0B3558; padding: 8px 12px; outline: none;"
          />
          <p class="m-0 mt-2" style="font-size: 0.75rem; color: #64748B;">
            {{ t('pos.payment-modal-installment-amount', { amount: formatCurrency(total / (parseInt(installmentsInput) || 1)) }) }}
          </p>
        </div>
      </div>

      <!-- Method selector -->
      <p class="m-0 mb-2" style="font-size: 0.78rem; font-weight: 600; color: #64748B;">
        {{ t('pos.payment-modal-method-label') }}
      </p>
      <div class="grid mb-4">
        <div
            v-for="config in methodConfigs"
            :key="config.value"
            class="col-3"
        >
          <button
              class="w-full flex flex-column align-items-center gap-1 border-round-xl py-3"
              :style="{
                            border: `2px solid ${selectedMethod === config.value ? config.color : '#E2E8F0'}`,
                            backgroundColor: selectedMethod === config.value ? config.background : '#fff',
                            color: selectedMethod === config.value ? config.color : '#64748B',
                            cursor: 'pointer'
                        }"
              @click="selectedMethod = config.value"
          >
            <i :class="config.icon" style="font-size: 1.1rem;" />
            <span style="font-size: 0.65rem; font-weight: 600;">{{ t(config.labelKey) }}</span>
          </button>
        </div>
      </div>

      <!-- Cash input (only for CASH method) -->
      <div v-if="selectedMethod === PaymentMethod.CASH" class="mb-4">
        <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: #64748B;">
          {{ t('pos.payment-cash-received') }}
        </label>
        <input
            v-model="cashInput"
            type="number"
            class="w-full border-round-lg px-3"
            style="border: 1px solid #E2E8F0; font-size: 1.1rem; font-weight: 700; color: #0B3558; padding: 10px 12px; outline: none;"
            @focus="(e) => e.target.style.borderColor = '#0E7490'"
            @blur="(e) => e.target.style.borderColor = '#E2E8F0'"
        />
        <!-- Change display -->
        <div v-if="changeAmount >= 0" class="flex justify-content-between mt-2 px-1">
          <span style="font-size: 0.78rem; color: #64748B;">{{ t('pos.payment-change') }}</span>
          <span style="font-size: 0.88rem; font-weight: 700; color: #16A34A;">
                        {{ formatCurrency(changeAmount) }}
                    </span>
        </div>
        <p
            v-else
            class="m-0 mt-1"
            style="font-size: 0.75rem; color: #EF4444;"
        >
          {{ t('pos.payment-insufficient-cash') }}
        </p>
      </div>

      <!-- Action buttons -->
      <div class="flex gap-2">
        <button
            class="flex-1 border-round-xl py-3"
            style="border: 1px solid #E2E8F0; color: #64748B; font-size: 0.88rem; font-weight: 600; background: #fff; cursor: pointer;"
            @click="emit('cancel')"
        >
          {{ t('pos.payment-cancel-sale') }}
        </button>
        <button
            class="flex-1 border-round-xl py-3"
            :style="{
                        backgroundColor: canConfirm ? '#0B3558' : '#CBD5E1',
                        color: '#fff',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: canConfirm ? 'pointer' : 'not-allowed'
                    }"
            :disabled="!canConfirm"
            @click="handleConfirm"
        >
          {{ t('pos.payment-confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>