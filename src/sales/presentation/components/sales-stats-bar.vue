<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n }  from 'vue-i18n';
import { useTodayLocalDateString } from '../../../shared/presentation/use-today-local-date.js';
import useSalesStore from '../../application/sales.store.js';

/**
 * SalesStatsBar component for the Sales & POS Management bounded context.
 *
 * Displays four summary cards at the top of the sales section:
 * - Revenue from today's completed sales
 * - Number of today's completed transactions
 * - Accumulated total from all completed sales
 * - Count of cancelled sales
 *
 * X4 A10: the two revenue cards used to be summed here client-side by
 * filtering `sales` for status PAID — the exact place a credit sale's full
 * total got counted as revenue on the day it was created, before a cent of
 * it was actually collected. They're now fetched from the backend's one
 * true calculation (see sales.store.js#fetchSalesRevenue) instead of a
 * second, locally-reimplemented one. Transaction counts stay client-derived
 * — they're just counts, not money, so there's nothing here for two
 * calculations to disagree about.
 *
 * @component SalesStatsBar
 */

const props = defineProps({
  /**
   * Array of Sale entities loaded from the store.
   * @type {import('../../domain/model/sale.entity.js').Sale[]}
   */
  sales: {
    type:     Array,
    required: true
  }
});

const { t } = useI18n();
const salesStore = useSalesStore();

/**
 * Local (not UTC) date string for today (YYYY-MM-DD), used to filter
 * today's sales — reactive so a shift left open past local midnight
 * starts counting the new day's sales instead of yesterday's.
 * @type {import('vue').Ref<string>}
 */
const todayDateString = useTodayLocalDateString();

/**
 * Sales registered today that are in PAID status — used only for the
 * transaction COUNT card, never for a money figure (see the component's own
 * doc comment on why revenue itself is fetched, not derived, here).
 *
 * Each sale's own local calendar day is derived from its ISO timestamp
 * (`sale.date`, a UTC instant) rather than string-matching the UTC date
 * prefix — a sale made at 19:30 Lima time is already the next UTC day, so
 * comparing raw ISO prefixes against a local "today" would drop every
 * evening sale from this list even with todayDateString itself fixed.
 * @type {import('vue').ComputedRef<import('../../domain/model/sale.entity.js').Sale[]>}
 */
const todayPaidSales = computed(() =>
    props.sales.filter(sale =>
        sale.status === 'PAID' && sale.date &&
        new Date(sale.date).toLocaleDateString('en-CA') === todayDateString.value
    )
);

/**
 * Today's revenue, fetched from the backend — null while loading or if the
 * fetch failed (rendered as "—", never a wrong 0 that looks like a real
 * quiet day).
 * @type {import('vue').Ref<number|null>}
 */
const todayRevenue = ref(null);

/**
 * All-time accumulated revenue, fetched from the backend. Same null-on-
 * loading/error convention as todayRevenue.
 * @type {import('vue').Ref<number|null>}
 */
const accumulatedRevenue = ref(null);

/** Re-fetches both revenue figures from the backend. */
function loadRevenue() {
  salesStore.fetchSalesRevenue(todayDateString.value, todayDateString.value)
      .then(value => { todayRevenue.value = value; })
      .catch(() => { todayRevenue.value = null; });
  salesStore.fetchSalesRevenue()
      .then(value => { accumulatedRevenue.value = value; })
      .catch(() => { accumulatedRevenue.value = null; });
}

onMounted(loadRevenue);

// Re-fetch whenever the loaded sales OR payment plans change (a new sale
// confirmed, one cancelled, an installment registered or reverted from the
// Cuotas tab) — revenue no longer derives from either reactively like the
// transaction/cancelled counts still do, so it needs its own trigger. Deep,
// deliberately: a cancellation/payment mutates an existing Sale/PaymentPlan
// in place rather than replacing the array, and a shallow watch would miss it.
watch(() => props.sales, loadRevenue, { deep: true });
watch(() => salesStore.paymentPlans, loadRevenue, { deep: true });

// The local calendar day can roll over while this component stays mounted
// (a shift left open past midnight) — re-fetch so "today" starts meaning
// the new day instead of silently keeping yesterday's total.
watch(todayDateString, loadRevenue);

/**
 * Number of today's paid transactions.
 * @type {import('vue').ComputedRef<number>}
 */
const todayTransactionCount = computed(() => todayPaidSales.value.length);

/**
 * Total number of cancelled sales.
 * @type {import('vue').ComputedRef<number>}
 */
const cancelledCount = computed(() =>
    props.sales.filter(sale => sale.status === 'CANCELLED').length
);

/**
 * Formats a number as a Peruvian sol currency string — an em dash while the
 * figure is loading or failed to load, never a 0 that reads as "no revenue".
 * @param {number|null} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return amount == null ? '—' : `S/ ${amount.toFixed(2)}`;
}

/**
 * The four stat cards configuration array.
 * Each card has a label key, a value, a foreground color, and a background color.
 * @type {import('vue').ComputedRef<Array<{labelKey: string, value: string, color: string, background: string}>>}
 */
const statCards = computed(() => [
  {
    labelKey:   'sales.stats-today-revenue',
    value:      formatCurrency(todayRevenue.value),
    color:      'var(--brand)',
    background: 'var(--brand-soft)'
  },
  {
    labelKey:   'sales.stats-today-count',
    value:      `${todayTransactionCount.value} ${t('sales.stats-transactions')}`,
    color:      'var(--status-ok-fg)',
    background: 'var(--status-ok-bg)'
  },
  {
    labelKey:   'sales.stats-accumulated',
    value:      formatCurrency(accumulatedRevenue.value),
    color:      '#7C3AED',
    background: '#EDE9FE'
  },
  {
    labelKey:   'sales.stats-cancelled',
    value:      `${cancelledCount.value} ${t('sales.stats-cancelled-unit', { count: cancelledCount.value })}`,
    color:      'var(--status-critical-fg)',
    background: 'var(--status-critical-bg)'
  }
]);
</script>

<template>
  <div
      class="grid"
      style="border-bottom: 1px solid var(--border); padding: 12px 16px;"
  >
    <div
        v-for="card in statCards"
        :key="card.labelKey"
        class="col-6 lg:col-3"
    >
      <div
          class="border-round-xl px-3 py-2"
          :style="{ backgroundColor: card.background }"
      >
        <p
            class="m-0 mb-1"
            style="font-size: 0.68rem;"
            :style="{ color: card.color, opacity: 0.75 }"
        >
          {{ t(card.labelKey) }}
        </p>
        <p
            class="m-0 font-bold"
            style="font-size: 0.92rem;"
            :style="{ color: card.color }"
        >
          {{ card.value }}
        </p>
      </div>
    </div>
  </div>
</template>