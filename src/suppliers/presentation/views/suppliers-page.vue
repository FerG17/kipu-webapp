<script setup>
import { computed, onMounted, ref, toRefs } from 'vue';
import { useI18n }       from 'vue-i18n';
import useSupplierStore  from '../../application/supplier.store.js';
import useIamStore       from '../../../iam/application/iam.store.js';
import SupplierList      from './supplier-list.vue';
import PurchaseOrderList from './purchase-order-list.vue';

const { t }         = useI18n();
const supplierStore = useSupplierStore();
const iamStore      = useIamStore();

const {
  suppliers,
  suppliersLoaded,
  purchaseOrders,
  activeSupplierCount,
  pendingOrderCount,
  pendingOrderTotal,
  delayedOrderCount
} = toRefs(supplierStore);

const { fetchSuppliers, fetchPurchaseOrders } = supplierStore;

// ─── Tab state ─────────────────────────────────────────────────────────────────

/** @type {import('vue').Ref<'suppliers'|'orders'>} */
const activeTab = ref('suppliers');

/**
 * Tab definition list.
 * @type {{ id: string, labelKey: string, icon: string }[]}
 */
const tabs = [
  { id: 'suppliers', labelKey: 'suppliers.tab-suppliers', icon: 'pi-building'    },
  { id: 'orders',    labelKey: 'suppliers.tab-orders',    icon: 'pi-shopping-bag' }
];

// ─── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Summary stats for the stats bar.
 * Each stat has a label key, computed value, display color, and background color.
 *
 * @type {import('vue').ComputedRef<{ labelKey: string, value: string, color: string, background: string }[]>}
 */
const statsBarItems = computed(() => [
  {
    labelKey:   'suppliers.stat-active',
    value:      String(activeSupplierCount.value),
    color:      '#0B3558',
    background: '#E0F2FE'
  },
  {
    labelKey:   'suppliers.stat-pending-orders',
    value:      String(pendingOrderCount.value),
    color:      '#D97706',
    background: '#FEF3C7'
  },
  {
    labelKey:   'suppliers.stat-pending-total',
    value:      `S/ ${pendingOrderTotal.value.toFixed(2)}`,
    color:      '#7C3AED',
    background: '#EDE9FE'
  },
  {
    labelKey:   'suppliers.stat-delayed',
    value:      String(delayedOrderCount.value),
    color:      '#EA580C',
    background: '#FFEDD5'
  }
]);

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  const businessId = iamStore.currentUser?.businessId ?? null;
  if (businessId) {
    if (!suppliersLoaded.value) {
      fetchSuppliers(businessId);
    }
    fetchPurchaseOrders(businessId);
  }
});
</script>

<template>
  <div class="suppliers-page">

    <!-- ── Page header ──────────────────────────────────────────── -->
    <div class="flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
      <div>
        <h1 class="suppliers-page-title">{{ t('suppliers.page-title') }}</h1>
        <p class="suppliers-page-subtitle">{{ t('suppliers.page-subtitle') }}</p>
      </div>
    </div>

    <!-- ── Stats bar ────────────────────────────────────────────── -->
    <div class="suppliers-stats-bar mb-4">
      <div
          v-for="stat in statsBarItems"
          :key="stat.labelKey"
          class="suppliers-stat-card"
          :style="{ backgroundColor: stat.background }"
      >
        <p class="suppliers-stat-label" :style="{ color: stat.color }">{{ t(stat.labelKey) }}</p>
        <p class="suppliers-stat-value" :style="{ color: stat.color }">{{ stat.value }}</p>
      </div>
    </div>

    <!-- ── Tabs ─────────────────────────────────────────────────── -->
    <div class="suppliers-tabs mb-3">
      <button
          v-for="tab in tabs"
          :key="tab.id"
          class="suppliers-tab-btn"
          :class="{ 'suppliers-tab-btn-active': activeTab === tab.id }"
          @click="activeTab = tab.id"
      >
        <i :class="`pi ${tab.icon}`" />
        <span>{{ t(tab.labelKey) }}</span>
      </button>
    </div>

    <!-- ── Tab content ───────────────────────────────────────────── -->
    <div class="suppliers-tab-content">
      <SupplierList v-if="activeTab === 'suppliers'" />
      <PurchaseOrderList v-else-if="activeTab === 'orders'" />
    </div>

  </div>
</template>

<style scoped>
.suppliers-page { background-color: #F8FAFC; min-height: 100%; }
.suppliers-page-title { font-size: 1.3rem; font-weight: 700; color: #0B3558; margin: 0; }
.suppliers-page-subtitle { font-size: 0.78rem; color: #64748B; margin: 0.2rem 0 0; }
.suppliers-page {
  width: 100%;
  max-width: none;
}

.suppliers-stats-bar { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
.suppliers-stat-card { border-radius: 0.75rem; padding: 1rem 0.75rem; }
.suppliers-stat-label { font-size: 0.9rem; opacity: 0.8; margin: 0; }
.suppliers-stat-value { font-size: 1.5rem; font-weight: 800; margin: 0; }

.suppliers-tabs { display: flex; gap: 0.25rem; }
.suppliers-tab-btn {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.5rem 1rem; border: none; border-radius: 0.5rem;
  font-size: 0.85rem; font-weight: 500; cursor: pointer;
  color: #64748B; background: transparent; transition: all 0.15s;
}
.suppliers-tab-btn:hover { background-color: #F1F5F9; }
.suppliers-tab-btn-active { background-color: #0B3558; color: #fff; font-weight: 700; }

.suppliers-tab-content {
  background-color: #fff; border-radius: 0.75rem;
  border: 1px solid #E2E8F0; overflow: hidden;
  width: 100%;
}

@media (min-width: 768px) {
  .suppliers-stats-bar { grid-template-columns: repeat(4, 1fr); }
}
</style>