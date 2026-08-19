<script setup>
import { computed } from 'vue';
import { useI18n }  from 'vue-i18n';
import { useTodayLocalDateString } from '../../../shared/presentation/use-today-local-date.js';

/**
 * SalesStatsBar component for the Sales & POS Management bounded context.
 *
 * Displays four summary cards at the top of the sales section:
 * - Revenue from today's completed sales
 * - Number of today's completed transactions
 * - Accumulated total from all completed sales
 * - Count of cancelled sales
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

/**
 * Local (not UTC) date string for today (YYYY-MM-DD), used to filter
 * today's sales — reactive so a shift left open past local midnight
 * starts counting the new day's sales instead of yesterday's.
 * @type {import('vue').Ref<string>}
 */
const todayDateString = useTodayLocalDateString();

/**
 * Sales registered today that are in PAID status.
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
 * Total revenue (sum of totalAmount) from today's paid sales.
 * @type {import('vue').ComputedRef<number>}
 */
const todayRevenue = computed(() =>
    todayPaidSales.value.reduce((sum, sale) => sum + sale.subtotal, 0)
);

/**
 * Number of today's paid transactions.
 * @type {import('vue').ComputedRef<number>}
 */
const todayTransactionCount = computed(() => todayPaidSales.value.length);

/**
 * Accumulated total revenue from all paid sales (all time).
 * @type {import('vue').ComputedRef<number>}
 */
const accumulatedRevenue = computed(() =>
    props.sales
        .filter(sale => sale.status === 'PAID')
        .reduce((sum, sale) => sum + sale.subtotal, 0)
);

/**
 * Total number of cancelled sales.
 * @type {import('vue').ComputedRef<number>}
 */
const cancelledCount = computed(() =>
    props.sales.filter(sale => sale.status === 'CANCELLED').length
);

/**
 * Formats a number as a Peruvian sol currency string.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return `S/ ${amount.toFixed(2)}`;
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