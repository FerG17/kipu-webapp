<script setup>
import { computed } from 'vue';
import { useI18n }  from 'vue-i18n';
import { toDateLocale } from '../../../shared/presentation/date-locale.js';

/**
 * CustomerDetailModal component for the Sales & POS Management bounded context.
 *
 * Displays a read-only detail view of a Customer entity.
 * Shows avatar initials, contact info, and purchase summary metrics.
 *
 * @component CustomerDetailModal
 */

const props = defineProps({
  /**
   * The Customer entity to display.
   * @type {import('../../domain/model/customer.entity.js').Customer}
   */
  customer: {
    type:     Object,
    required: true
  },
  /**
   * All sales associated with this business, used to compute customer metrics.
   * @type {import('../../domain/model/sale.entity.js').Sale[]}
   */
  sales: {
    type:    Array,
    default: () => []
  }
});

const emit = defineEmits([
  /** Emitted when the user closes the modal. */
  'close'
]);

const { t, locale } = useI18n();

/**
 * Two-letter avatar initials derived from the customer's full name.
 * Takes the first letter of each word, up to 2 words.
 * @type {import('vue').ComputedRef<string>}
 */
const avatarInitials = computed(() =>
    (props.customer.fullName || '')
        .split(' ')
        .filter(word => word.length > 0)
        .slice(0, 2)
        .map(word => word[0].toUpperCase())
        .join('')
);

/**
 * Total number of completed (PAID) sales for this customer.
 * @type {import('vue').ComputedRef<number>}
 */
const totalPurchases = computed(() =>
    props.sales.filter(
        sale => sale.customerId === props.customer.id && sale.status === 'PAID'
    ).length
);

/**
 * Total amount spent by this customer across all paid sales.
 * @type {import('vue').ComputedRef<number>}
 */
const totalSpent = computed(() =>
    props.sales
        .filter(sale => sale.customerId === props.customer.id && sale.status === 'PAID')
        .reduce((sum, sale) => sum + sale.subtotal, 0)
);

/**
 * Formats an ISO date string as a short locale date (DD/MM/YYYY).
 * @param {string} dateString
 * @returns {string}
 */
function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString(toDateLocale(locale.value));
}

/**
 * Formats a number as a Peruvian sol currency string.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return `S/ ${amount.toFixed(2)}`;
}
</script>

<template>
  <!-- Backdrop -->
  <div
      class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center"
      style="background-color: rgba(0,0,0,0.5);"
      @click.self="emit('close')"
  >
    <!-- Modal panel -->
    <div
        class="w-full border-round-top-2xl sm:border-round-2xl shadow-8"
        style="max-width: 400px; background-color: var(--surface); border: 1px solid var(--border);"
    >
      <!-- Header -->
      <div
          class="flex align-items-center justify-content-between px-5 pt-5 pb-3"
          style="border-bottom: 1px solid var(--surface-alt);"
      >
        <h2 class="m-0" style="font-size: 1.05rem; font-weight: 700; color: var(--brand);">
          {{ t('customers.detail-title') }}
        </h2>
        <button
            style="background: none; border: none; cursor: pointer; padding: 4px;"
            @click="emit('close')"
        >
          <i class="pi pi-times" style="color: var(--text-faint); font-size: 1.1rem;" />
        </button>
      </div>

      <!-- Body -->
      <div class="px-5 py-4" style="display: flex; flex-direction: column; gap: 16px;">

        <!-- Avatar + name -->
        <div class="flex align-items-center gap-3">
          <div
              class="flex align-items-center justify-content-center border-round-3xl shrink-0"
              style="width: 48px; height: 48px; background-color: var(--brand-soft);"
          >
                        <span style="font-size: 1.1rem; font-weight: 700; color: var(--brand);">
                            {{ avatarInitials }}
                        </span>
          </div>
          <div>
            <p class="m-0" style="font-weight: 700; color: var(--brand); font-size: 1rem;">
              {{ customer.fullName }}
            </p>
            <p class="m-0" style="color: var(--text-muted); font-size: 0.78rem;">
              {{ t('customers.detail-since') }} {{ formatDate(customer.registeredAt) }}
            </p>
          </div>
        </div>

        <!-- Info grid -->
        <div class="grid">
          <div
              v-for="info in [
                            { label: t('customer-form.document-number'), value: customer.documentNumber || '—' },
                            { label: t('customer-form.phone-number'),    value: customer.phoneNumber    || '—' },
                            { label: t('customer-form.email'),           value: customer.email          || '—' },
                            { label: t('customers.detail-purchases'),    value: String(totalPurchases)        }
                        ]"
              :key="info.label"
              class="col-6"
          >
            <div
                class="border-round-xl p-3"
                style="background-color: var(--surface-alt); border: 1px solid var(--border);"
            >
              <p class="m-0 mb-1" style="font-size: 0.68rem; color: var(--text-faint);">{{ info.label }}</p>
              <p class="m-0" style="font-size: 0.88rem; font-weight: 600; color: var(--text);">{{ info.value }}</p>
            </div>
          </div>
        </div>

        <!-- Total spent highlight -->
        <div
            class="border-round-xl p-4 flex align-items-center justify-content-between"
            style="background-color: var(--brand-soft);"
        >
          <div>
            <p class="m-0" style="font-size: 0.72rem; color: var(--brand);">
              {{ t('customers.detail-total-spent') }}
            </p>
            <p class="m-0" style="font-size: 1.4rem; font-weight: 800; color: var(--brand); line-height: 1.1;">
              {{ formatCurrency(totalSpent) }}
            </p>
          </div>
          <i class="pi pi-receipt" style="font-size: 1.75rem; color: var(--brand); opacity: 0.6;" />
        </div>

        <!-- Close button -->
        <button
            class="w-full border-round-xl"
            style="background-color: var(--brand); color: var(--surface); font-size: 0.88rem; font-weight: 600; padding: 10px; border: none; cursor: pointer;"
            @click="emit('close')"
        >
          {{ t('customers.detail-close') }}
        </button>
      </div>
    </div>
  </div>
</template>