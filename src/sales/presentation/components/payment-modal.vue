<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n }       from 'vue-i18n';
import { PaymentMethod } from '../../domain/model/sale.entity.js';
import { useModalScrollLock } from '../../../shared/presentation/use-modal-scroll-lock.js';

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

// This component is only ever mounted while the parent's v-if is open
// (see pos-screen.vue), so the lock's lifetime just follows the component's.
useModalScrollLock(ref(true));

/**
 * Whether the inline "cancel this sale?" confirmation panel is showing.
 * Built as a small overlay local to this component, rather than PrimeVue's
 * global ConfirmDialog (which this app also uses in Settings) — that global
 * dialog's default z-index sits below this modal's own backdrop (z-50, see
 * style.css's z-index scale), so it rendered invisibly behind the payment
 * modal instead of on top of it. A local overlay sidesteps that entirely.
 * @type {import('vue').Ref<boolean>}
 */
const showCancelConfirm = ref(false);

/** Confirms cancelling the in-progress sale and closes the payment modal. */
function confirmCancel() {
  showCancelConfirm.value = false;
  emit('cancel');
}

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
 * Quick cash-amount shortcuts: the exact total (rounded up to the sol) plus
 * the common Peruvian bill denominations that are at least the total, so a
 * cashier can just tap the bill they were handed instead of typing it.
 * @type {import('vue').ComputedRef<number[]>}
 */
const quickCashAmounts = computed(() => {
  const exact = Math.ceil(props.total);
  const bills = [10, 20, 50, 100].filter(bill => bill >= props.total && bill !== exact);
  return [exact, ...bills].slice(0, 4);
});

/**
 * Sets the cash input to the given quick amount.
 * @param {number} amount
 */
function selectQuickAmount(amount) {
  cashInput.value = String(amount);
}

/**
 * Configuration for each payment method button.
 * @type {Array<{value: string, labelKey: string, icon: string, color: string, background: string}>}
 */
const methodConfigs = [
  { value: PaymentMethod.CASH, labelKey: 'pos.payment-cash', icon: 'pi pi-wallet',       color: 'var(--status-ok-fg)', background: 'var(--status-ok-bg)' },
  { value: PaymentMethod.YAPE, labelKey: 'pos.payment-yape', icon: 'pi pi-mobile',        color: '#7C3AED', background: '#EDE9FE' },
  { value: PaymentMethod.PLIN, labelKey: 'pos.payment-plin', icon: 'pi pi-mobile',        color: 'var(--brand)', background: '#CFFAFE' },
  { value: PaymentMethod.CARD, labelKey: 'pos.payment-card', icon: 'pi pi-credit-card',   color: 'var(--status-warning-fg)', background: 'var(--status-warning-bg)' }
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
        class="w-full border-round-top-2xl sm:border-round-2xl p-5 shadow-8 overflow-y-auto"
        style="max-width: 400px; max-height: 92vh; background-color: var(--surface); border: 1px solid var(--border);"
    >
      <!-- Header -->
      <div class="flex align-items-center justify-content-between mb-4">
        <h2 class="m-0" style="font-size: 1.1rem; font-weight: 700; color: var(--brand);">
          {{ t('pos.payment-modal-title') }}
        </h2>
        <button
            style="background: none; border: none; cursor: pointer; padding: 4px;"
            @click="emit('cancel')"
        >
          <i class="pi pi-times" style="color: var(--text-faint); font-size: 1.1rem;" />
        </button>
      </div>

      <!-- Total to charge -->
      <div
          class="border-round-xl p-4 mb-4 text-center"
          style="background-color: var(--brand-soft);"
      >
        <p class="m-0 mb-1" style="color: var(--brand); font-size: 0.78rem;">
          {{ t('pos.payment-modal-total-label') }}
        </p>
        <p class="m-0" style="color: var(--brand); font-size: 2rem; font-weight: 800; line-height: 1.2;">
          {{ formatCurrency(total) }}
        </p>
      </div>

      <!-- Customer selector (optional — anonymous sale if left unselected) -->
      <div class="mb-4">
        <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">
          {{ t('pos.payment-modal-customer-label') }}
        </label>
        <select
            v-model="selectedCustomerId"
            class="w-full border-round-lg px-3"
            style="border: 1px solid var(--border); font-size: 0.88rem; color: var(--text); padding: 10px 12px; outline: none; background: var(--surface);"
        >
          <option value="">{{ t('pos.payment-modal-customer-anonymous') }}</option>
          <option v-for="customer in customers" :key="customer.id" :value="String(customer.id)">
            {{ customer.fullName }}
          </option>
        </select>
      </div>

      <!-- Sell on credit ("vender a cuotas") — requires a real customer -->
      <div class="mb-4 border-round-xl px-3 py-3" style="border: 1px solid var(--border);">
        <label class="flex align-items-center gap-2" style="cursor: pointer;">
          <input
              v-model="sellOnCredit"
              type="checkbox"
              :disabled="!selectedCustomerId"
              style="width: 16px; height: 16px; accent-color: var(--brand);"
          />
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text);">
            {{ t('pos.payment-modal-sell-on-credit') }}
          </span>
        </label>
        <p v-if="!selectedCustomerId" class="m-0 mt-1" style="font-size: 0.72rem; color: var(--text-faint);">
          {{ t('pos.payment-modal-credit-needs-customer') }}
        </p>
        <div v-if="sellOnCredit" class="mt-3">
          <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">
            {{ t('pos.payment-modal-installments-label') }}
          </label>
          <input
              v-model="installmentsInput"
              type="number"
              min="2"
              class="w-full border-round-lg px-3"
              style="border: 1px solid var(--border); font-size: 0.95rem; font-weight: 700; color: var(--brand); padding: 8px 12px; outline: none;"
          />
          <p class="m-0 mt-2" style="font-size: 0.75rem; color: var(--text-muted);">
            {{ t('pos.payment-modal-installment-amount', { amount: formatCurrency(total / (parseInt(installmentsInput) || 1)) }) }}
          </p>
        </div>
      </div>

      <!-- Method selector -->
      <p class="m-0 mb-2" style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">
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
                            border: `2px solid ${selectedMethod === config.value ? config.color : 'var(--border)'}`,
                            backgroundColor: selectedMethod === config.value ? config.background : 'var(--surface)',
                            color: selectedMethod === config.value ? config.color : 'var(--text-muted)',
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
        <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">
          {{ t('pos.payment-cash-received') }}
        </label>
        <!-- Quick amount shortcuts -->
        <div class="flex gap-2 mb-2">
          <button
              v-for="(amount, amountIndex) in quickCashAmounts"
              :key="amount"
              type="button"
              class="flex-1 border-round-lg py-2"
              :style="{
                            border: `1.5px solid ${cashGiven === amount ? 'var(--status-ok-fg)' : 'var(--border)'}`,
                            backgroundColor: cashGiven === amount ? 'var(--status-ok-bg)' : 'var(--surface)',
                            color: cashGiven === amount ? 'var(--status-ok-fg)' : 'var(--text-muted)',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }"
              @click="selectQuickAmount(amount)"
          >
            {{ amountIndex === 0 ? t('pos.payment-quick-exact') : formatCurrency(amount) }}
          </button>
        </div>
        <input
            v-model="cashInput"
            type="number"
            class="w-full border-round-lg px-3"
            style="border: 1px solid var(--border); font-size: 1.1rem; font-weight: 700; color: var(--brand); padding: 10px 12px; outline: none;"
            @focus="(e) => e.target.style.borderColor = 'var(--brand)'"
            @blur="(e) => e.target.style.borderColor = 'var(--border)'"
        />
        <!-- Change display -->
        <div v-if="changeAmount >= 0" class="flex justify-content-between mt-2 px-1">
          <span style="font-size: 0.78rem; color: var(--text-muted);">{{ t('pos.payment-change') }}</span>
          <span style="font-size: 0.88rem; font-weight: 700; color: var(--status-ok-fg);">
                        {{ formatCurrency(changeAmount) }}
                    </span>
        </div>
        <p
            v-else
            class="m-0 mt-1"
            style="font-size: 0.75rem; color: var(--status-critical-fg);"
        >
          {{ t('pos.payment-insufficient-cash') }}
        </p>
      </div>

      <!-- Action buttons -->
      <div class="flex gap-2">
        <button
            class="flex-1 border-round-xl py-3"
            style="border: 1px solid var(--border); color: var(--text-muted); font-size: 0.88rem; font-weight: 600; background: var(--surface); cursor: pointer;"
            @click="showCancelConfirm = true"
        >
          {{ t('pos.payment-cancel-sale') }}
        </button>
        <button
            class="flex-1 border-round-xl py-3"
            :style="{
                        backgroundColor: canConfirm ? 'var(--brand)' : 'var(--text-faint)',
                        color: 'var(--brand-ink)',
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

      <!-- Cancel confirmation overlay — local to this component, always on
           top of the modal above (see the note on showCancelConfirm). -->
      <div
          v-if="showCancelConfirm"
          class="fixed inset-0 flex align-items-center justify-content-center px-4"
          style="background-color: rgba(0,0,0,0.35); z-index: 60;"
          @click.self="showCancelConfirm = false"
      >
        <div
            class="w-full border-round-2xl p-4 text-center shadow-8"
            style="max-width: 320px; background-color: var(--surface); border: 1px solid var(--border);"
        >
          <div
              class="flex align-items-center justify-content-center border-round-3xl mx-auto mb-3"
              style="width: 48px; height: 48px; background-color: var(--status-warning-bg);"
          >
            <i class="pi pi-exclamation-triangle" style="font-size: 1.4rem; color: var(--status-warning-fg);" />
          </div>
          <p class="m-0 mb-1" style="font-size: 1rem; font-weight: 700; color: var(--text);">
            {{ t('pos.payment-cancel-confirm-header') }}
          </p>
          <p class="m-0 mb-4" style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5;">
            {{ t('pos.payment-cancel-confirm-message') }}
          </p>
          <div class="flex gap-2">
            <button
                class="flex-1 border-round-xl py-2"
                style="border: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; font-weight: 600; background: var(--surface); cursor: pointer;"
                @click="showCancelConfirm = false"
            >
              {{ t('pos.payment-cancel-confirm-back') }}
            </button>
            <button
                class="flex-1 border-round-xl py-2"
                style="border: none; color: var(--brand-ink); font-size: 0.85rem; font-weight: 700; background: var(--status-critical-fg); cursor: pointer;"
                @click="confirmCancel"
            >
              {{ t('pos.payment-cancel-confirm-accept') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>