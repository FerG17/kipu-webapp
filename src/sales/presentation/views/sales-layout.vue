<script setup>
import { computed, onMounted } from 'vue';
import { useI18n }     from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import SalesStatsBar   from '../components/sales-stats-bar.vue';
import useSalesStore   from '../../application/sales.store.js';

/**
 * SalesLayout view for the Sales & POS Management bounded context.
 *
 * Acts as the layout shell for the entire sales section.
 * Contains:
 * - Page header with title and subtitle.
 * - SalesStatsBar with today's KPIs.
 * - Tab navigation between POS, Historial, Clientes, and Cuotas.
 * - <router-view> to render the active child view.
 *
 * @view SalesLayout
 */

const { t }    = useI18n();
const route    = useRouter();
const currentRoute = useRoute();
const salesStore   = useSalesStore();

/**
 * SalesStatsBar is mounted here (parent of all three sales tabs) and reads
 * salesStore.sales directly, so sales must be loaded regardless of which
 * tab the user lands on first — previously only sales-history/customer-list
 * called fetchSales, leaving the stats bar stuck at 0 for anyone who only
 * used the POS tab.
 */
onMounted(() => {
  if (!salesStore.salesLoaded) {
    salesStore.fetchSales();
  }
});

/**
 * Tab configuration for the three child views.
 * @type {Array<{routeName: string, labelKey: string}>}
 */
const tabs = [
  { routeName: 'pos-screen',         labelKey: 'sales.tab-pos'         },
  { routeName: 'sales-history',      labelKey: 'sales.tab-history'     },
  { routeName: 'customer-list',      labelKey: 'sales.tab-customers'   },
  { routeName: 'payment-plans-list', labelKey: 'sales.tab-installments'}
];

/**
 * Returns true when the given route name matches the current active route.
 * @param {string} routeName
 * @returns {boolean}
 */
function isActiveTab(routeName) {
  return currentRoute.name === routeName;
}

/**
 * Navigates to the selected tab's route.
 * @param {string} routeName
 */
function navigateToTab(routeName) {
  route.push({ name: routeName });
}
</script>

<template>
  <div class="flex flex-column h-full overflow-hidden">

    <!-- Header -->
    <div class="flex align-items-center justify-content-between px-4 sm:px-6 pb-3">
      <div>
        <h1 class="m-0" style="font-size: 1.3rem; font-weight: 700; color: var(--brand); line-height: 1.2;">
          {{ t('sales.title') }}
        </h1>
        <p class="m-0 mt-1" style="color: var(--text-muted); font-size: 0.78rem;">
          {{ t('sales.subtitle') }}
        </p>
      </div>
    </div>

    <!-- Stats bar -->
    <sales-stats-bar :sales="salesStore.sales" />

    <!-- Tab navigation -->
    <div
        class="flex gap-1 px-4 py-2"
        style="border-bottom: 1px solid var(--border); overflow-x: auto;"
    >
      <button
          v-for="tab in tabs"
          :key="tab.routeName"
          class="border-round-lg px-4 py-2 flex-shrink-0"
          style="font-size: 0.85rem; border: none; cursor: pointer; transition: all 0.15s; white-space: nowrap;"
          :style="{
                    backgroundColor: isActiveTab(tab.routeName) ? 'var(--brand)' : 'transparent',
                    color:           isActiveTab(tab.routeName) ? 'var(--brand-ink)'    : 'var(--text-muted)',
                    fontWeight:      isActiveTab(tab.routeName) ? 700       : 500
                }"
          @click="navigateToTab(tab.routeName)"
      >
        {{ t(tab.labelKey) }}
      </button>
    </div>

    <!-- Child view -->
    <div class="flex-1 overflow-hidden">
      <router-view />
    </div>
  </div>
</template>
