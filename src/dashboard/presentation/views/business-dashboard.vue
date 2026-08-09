<script setup>
import { computed, onMounted, ref, toRefs } from 'vue';
import { useRouter }                   from 'vue-router';
import { useI18n }                     from 'vue-i18n';
import useDashboardStore               from '../../application/dashboard.store.js';
import useAlertsStore                  from '../../../alerts/application/alerts.store.js';
import useProductStore                 from '../../../product/application/product.store.js';
import useSalesStore                   from '../../../sales/application/sales.store.js';
import useIamStore                     from '../../../iam/application/iam.store.js';
import { AlertType }                   from '../../../alerts/domain/model/alert.entity.js';
import { toDateLocale }                from '../../../shared/presentation/date-locale.js';

const { t, locale }  = useI18n();
const router         = useRouter();
const dashboardStore = useDashboardStore();
const alertsStore    = useAlertsStore();
const productStore   = useProductStore();
const salesStore     = useSalesStore();
const iamStore       = useIamStore();

const {
  liveMetrics,
  salesByDay,
  errors
} = toRefs(dashboardStore);

const { alerts, alertsLoaded, expirationActiveCount } = toRefs(alertsStore);

const { fetchSalesByDay, refreshMetrics } = dashboardStore;

const { fetchAlerts } = alertsStore;

/**
 * Warehouses of the current business — resolved client-side against an
 * alert's warehouseId so the recent-alerts panel can say which specific
 * warehouse a LOW_STOCK/OUT_OF_STOCK alert is about, same as the Alertas
 * screen (see active-alerts-dashboard.vue).
 * @type {import('vue').Ref<Array>}
 */
const warehouses = ref([]);

/**
 * @param {import('../../../alerts/domain/model/alert.entity.js').Alert} alert
 * @returns {string|null}
 */
function resolveWarehouseName(alert) {
  if (alert.type !== AlertType.LOW_STOCK && alert.type !== AlertType.OUT_OF_STOCK) return null;
  if (alert.warehouseId == null) return t('alerts.field-unknown-warehouse');
  const warehouse = warehouses.value.find(item => item.id === alert.warehouseId);
  return warehouse ? warehouse.name : `#${alert.warehouseId}`;
}

onMounted(() => {
  const businessId = iamStore.currentUser?.businessId ?? null;
  if (businessId) {
    fetchAlerts();
    productStore.fetchWarehousesForBusiness(businessId).then(fetched => {
      warehouses.value = fetched;
    });
    if (!salesByDay.value.length)       fetchSalesByDay(businessId);
    if (!productStore.productsLoaded)   productStore.fetchProducts(businessId);
    if (!productStore.inventoryLoaded)  productStore.fetchInventory(businessId);
    if (!salesStore.salesLoaded)        salesStore.fetchSales(businessId);
  }
});

/**
 * Re-fetches everything the Panel shows from the server: products/inventory/
 * sales (liveMetrics + Mayor stock), the weekly chart and the alerts.
 */
function handleRefresh() {
  const businessId = iamStore.currentUser?.businessId ?? null;
  if (!businessId) return;
  refreshMetrics(businessId);
  fetchSalesByDay(businessId);
  fetchAlerts();
}

// ─── Navigation ────────────────────────────────────────────────────────────

function navigateToReports()    { router.push({ name: 'dashboard-report-filters' }); }
function navigateToAlerts()     { router.push({ name: 'alerts' }); }
function navigateToNewProduct() { router.push({ name: 'products' }); }
function navigateToSales()      { router.push({ name: 'pos-screen' }); }
function navigateToSuppliers()  { router.push({ name: 'suppliers' }); }

// ─── Computed ──────────────────────────────────────────────────────────────

/**
 * Only ACTIVE alerts appear in the recent-alerts panel.
 * @type {import('vue').ComputedRef<Array>}
 */
const activeAlerts = computed(() =>
    alerts.value.filter(alert => alert.status === 'ACTIVE')
);

/**
 * Count of active EXPIRATION/EXPIRED alerts (used in the "Por Vencer" KPI).
 * Reuses alerts.store.js's own expirationActiveCount so both KPIs (here and
 * on the Alertas screen) always agree on the same number.
 * @type {import('vue').ComputedRef<number>}
 */
const expiringCount = computed(() =>
    alertsLoaded.value
        ? expirationActiveCount.value
        : null
);

// ─── KPI card definitions ──────────────────────────────────────────────────

/**
 * Whether the real data liveMetrics is computed from has loaded at least
 * once — used to show a loading state instead of a misleading "0" flash.
 * @type {import('vue').ComputedRef<boolean>}
 */
const metricsReady = computed(() =>
    productStore.productsLoaded && productStore.inventoryLoaded && salesStore.salesLoaded
);

/**
 * The six KPI cards rendered in the top grid.
 * Each card reads from the loaded metrics / alerts state.
 * @type {import('vue').ComputedRef<Array>}
 */
const kpiCards = computed(() => [
  {
    labelKey:   'dashboard.total-products',
    value:      metricsReady.value ? liveMetrics.value.totalProducts : null,
    icon:       'pi pi-box',
    iconColor:  '#0E7490',
    iconBg:     '#E0F2FE',
    valueColor: '#0B3558'
  },
  {
    labelKey:   'dashboard.low-stock',
    value:      metricsReady.value ? liveMetrics.value.lowStockProducts : null,
    icon:       'pi pi-exclamation-triangle',
    iconColor:  '#F97316',
    iconBg:     '#FFEDD5',
    valueColor: '#F97316'
  },
  {
    labelKey:   'dashboard.expiring-soon',
    value:      expiringCount.value,
    icon:       'pi pi-calendar-times',
    iconColor:  '#EF4444',
    iconBg:     '#FEE2E2',
    valueColor: '#EF4444'
  },
  {
    labelKey:    'dashboard.inventory-value',
    value:       metricsReady.value ? formatCurrency(liveMetrics.value.inventoryValue) : null,
    icon:        'pi pi-warehouse',
    iconColor:   '#22C55E',
    iconBg:      '#DCFCE7',
    valueColor:  '#22C55E'
  },
  {
    labelKey:   'dashboard.total-sales',
    value:      metricsReady.value ? formatCurrency(liveMetrics.value.totalSales) : null,
    icon:       'pi pi-shopping-cart',
    iconColor:  '#6366F1',
    iconBg:     '#EEF2FF',
    valueColor: '#4338CA'
  },
  {
    labelKey:   'dashboard.stock-health',
    value:      metricsReady.value ? (liveMetrics.value.stockHealthPercentage + '%') : null,
    icon:       'pi pi-heart',
    iconColor:  '#0E7490',
    iconBg:     '#CFFAFE',
    valueColor: '#0B3558'
  }
]);

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return `S/ ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * @param {string} isoString
 * @returns {string}
 */
function formatDateTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString(toDateLocale(locale.value), {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

/** @param {string} severity @returns {string} */
function alertIconColor(severity)   { return severity === 'HIGH' ? '#EF4444' : '#F97316'; }
/** @param {string} severity @returns {string} */
function alertBadgeBg(severity)     { return severity === 'HIGH' ? '#FEE2E2' : '#FFEDD5'; }
/** @param {string} severity @returns {string} */
function alertBadgeColor(severity)  { return severity === 'HIGH' ? '#EF4444' : '#F97316'; }
/** @param {string} severity @returns {string} */
function alertSeverityKey(severity) {
  return { HIGH: 'dashboard.severity-high', MEDIUM: 'dashboard.severity-medium', LOW: 'dashboard.severity-low' }[severity]
      ?? 'dashboard.severity-low';
}

/** Chart gridline Y positions (percentage of chart height, top = 0). */
const gridLines = [0, 25, 50, 75];

/**
 * i18n key suffixes for weekday abbreviations, indexed Monday(0)..Sunday(6),
 * matching the dayIndex convention used by dashboard.store.js's salesByDay.
 * @type {string[]}
 */
const WEEKDAY_KEY_SUFFIXES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * Translates a salesByDay entry's dayIndex (0=Monday..6=Sunday) into a
 * locale-aware short weekday label.
 * @param {number} dayIndex
 * @returns {string}
 */
function weekdayLabel(dayIndex) {
  return t(`dashboard.weekday-${WEEKDAY_KEY_SUFFIXES[dayIndex]}`);
}

/**
 * Current date formatted in long format (e.g. "Viernes, 12 de junio de 2026"),
 * following the active UI locale rather than a hardcoded Spanish one.
 * Capitalized because toLocaleDateString returns a lowercase weekday.
 * @type {import('vue').ComputedRef<string>}
 */
const currentDateLabel = computed(() => {
  const formatted = new Date().toLocaleDateString(toDateLocale(locale.value), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
});

/**
 * i18n key for the time-of-day greeting.
 * 0–11 → morning, 12–19 → afternoon, 20–23 → evening.
 * @type {import('vue').ComputedRef<string>}
 */
const greetingKey = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'dashboard.greeting-morning';
  if (hour < 20) return 'dashboard.greeting-afternoon';
  return 'dashboard.greeting-evening';
});

/**
 * First word of the authenticated user's full name, used in the greeting headline.
 * @type {import('vue').ComputedRef<string>}
 */
const currentUserFirstName = computed(() => {
  const full = iamStore.currentUser?.fullName ?? '';
  return full.split(' ')[0];
});

/**
 * Top 5 products sorted descending by REAL current inventory stock, for the
 * "Mayor stock" panel. This used to be wired to sales quantity (how much of
 * each product had been SOLD), which produced numbers that didn't match
 * Inventario at all and even ranked out-of-stock products highly if they'd
 * sold well in the past — it's now sourced from the same InventoryItem data
 * Inventario itself uses, so the numbers always agree.
 * stockPercent is each product's stock relative to the highest-stocked item.
 * @type {import('vue').ComputedRef<Array>}
 */
const topStockProducts = computed(() => {
  const ranked = productStore.products
      .map(product => ({
        productId:    product.id,
        productName:  product.name,
        currentStock: productStore.getTotalInventoryForProduct(product.id)?.currentStock ?? 0
      }))
      .filter(product => product.currentStock > 0)
      .sort((a, b) => b.currentStock - a.currentStock)
      .slice(0, 5);

  const maxStock = ranked[0]?.currentStock ?? 0;
  return ranked.map(product => ({
    ...product,
    stockPercent: maxStock > 0 ? Math.round((product.currentStock / maxStock) * 100) : 0
  }));
});

/**
 * The quick-action cards shown in the actions grid.
 * Each card declares its i18n keys, icon, colors, and navigation handler.
 * Includes "View reports" (navigateToReports) — its only entry point in the
 * whole app, since neither the sidebar nor any other view links to it.
 * @type {import('vue').ComputedRef<Array>}
 */
const quickActions = computed(() => [
  {
    labelKey: 'dashboard.action-new-product',
    subKey:   'dashboard.action-new-product-sub',
    icon:     'pi pi-plus',
    iconBg:   '#E0F2FE',
    iconColor:'#0E7490',
    handler:  navigateToNewProduct
  },
  {
    labelKey: 'dashboard.action-new-sale',
    subKey:   'dashboard.action-new-sale-sub',
    icon:     'pi pi-shopping-cart',
    iconBg:   '#EDE9FE',
    iconColor:'#7C3AED',
    handler:  navigateToSales
  },
  {
    labelKey: 'dashboard.action-purchase-order',
    subKey:   'dashboard.action-purchase-order-sub',
    icon:     'pi pi-clipboard',
    iconBg:   '#FEF3C7',
    iconColor:'#D97706',
    handler:  navigateToSuppliers
  },
  {
    labelKey: 'dashboard.go-to-alerts',
    subKey:   'dashboard.action-alerts-sub',
    icon:     'pi pi-bell',
    iconBg:   '#FEE2E2',
    iconColor:'#EF4444',
    handler:  navigateToAlerts
  },
  {
    labelKey: 'dashboard.action-inventory',
    subKey:   'dashboard.action-inventory-sub',
    icon:     'pi pi-database',
    iconBg:   '#DBEAFE',
    iconColor:'#2563EB',
    handler:  navigateToNewProduct
  },
  {
    labelKey: 'dashboard.action-view-reports',
    subKey:   'dashboard.action-view-reports-sub',
    icon:     'pi pi-chart-bar',
    iconBg:   '#F1F5F9',
    iconColor:'#475569',
    handler:  navigateToReports
  }
]);
</script>

<template>
  <div class="dashboard-wrapper">

    <!-- ── Page header ─────────────────────────────────────────────────────── -->
    <div class="flex align-items-start justify-content-between gap-3 mb-4">
      <div>
        <p class="m-0 mb-1 header-date">{{ currentDateLabel }}</p>
        <h1 class="m-0 header-greeting">
          {{ t(greetingKey) }}, {{ currentUserFirstName }}
        </h1>
      </div>
      <div class="flex align-items-center gap-2">
        <button
            class="refresh-btn"
            :title="t('dashboard.refresh')"
            @click="handleRefresh"
        >
          <i class="pi pi-refresh"/>
        </button>
        <button class="alert-icon-btn" @click="navigateToAlerts">
          <i class="pi pi-bell"/>
          <span v-if="activeAlerts.length > 0" class="alert-icon-btn__badge">
            {{ activeAlerts.length > 9 ? '9+' : activeAlerts.length }}
          </span>
        </button>
      </div>
    </div>

    <!-- ── 6 KPI Cards ─────────────────────────────────────────────────────── -->
    <div class="kpi-grid mb-2">
      <div
          v-for="card in kpiCards"
          :key="card.labelKey"
          class="kpi-card"
      >
        <div class="kpi-card__body">
          <p class="kpi-card__label">{{ t(card.labelKey) }}</p>
          <p v-if="card.value !== null" class="kpi-card__value" :style="{ color: card.valueColor }">
            {{ card.value }}
          </p>
          <div v-else class="kpi-card__skeleton"/>
        </div>
        <div class="kpi-card__icon" :style="{ backgroundColor: card.iconBg }">
          <i :class="card.icon" :style="{ color: card.iconColor }"/>
        </div>
      </div>
    </div>

    <!-- ── Bar chart + Alertas recientes ──────────────────────────────────── -->
    <div class="grid">

      <!-- Movimientos semanales -->
      <div class="col-12 lg:col-8">
        <div class="panel h-full">
          <h3 class="panel__title">{{ t('dashboard.weekly-movements') }}</h3>

          <div v-if="salesByDay.length" class="chart-container">
            <!-- Gridlines -->
            <div class="chart-grid">
              <div
                  v-for="line in gridLines"
                  :key="line"
                  class="chart-grid__line"
                  :style="{ top: line + '%' }"
              >
                <span class="chart-grid__label">
                  {{ line === 0 ? '' : (100 - line) + '%' }}
                </span>
              </div>
            </div>

            <!-- Bars -->
            <div class="chart-bars">
              <div
                  v-for="dayEntry in salesByDay"
                  :key="dayEntry.dayIndex"
                  class="chart-bar-col"
              >
                <span class="chart-bar-col__amount">
                  {{ dayEntry.totalAmount > 0 ? formatCurrency(dayEntry.totalAmount) : '' }}
                </span>
                <div class="chart-bar-col__track">
                  <div
                      class="chart-bar-col__bar"
                      :style="{ height: dayEntry.barHeightPercent + '%' }"
                  />
                </div>
                <span class="chart-bar-col__label">{{ weekdayLabel(dayEntry.dayIndex) }}</span>
              </div>
            </div>
            <div class="chart-axis"/>
          </div>

          <div v-else class="panel__loading">
            <i class="pi pi-spin pi-spinner"/>
          </div>
        </div>
      </div>

      <!-- Alertas recientes -->
      <div class="col-12 lg:col-4">
        <div class="panel h-full">
          <div class="flex align-items-center justify-content-between mb-3">
            <h3 class="panel__title m-0">{{ t('dashboard.recent-alerts') }}</h3>
            <button class="link-btn" @click="navigateToAlerts">
              {{ t('dashboard.see-all') }}
              <i class="pi pi-arrow-right" style="font-size: 0.7rem;"/>
            </button>
          </div>

          <div v-if="!alertsLoaded" class="panel__loading">
            <i class="pi pi-spin pi-spinner"/>
          </div>

          <div v-else-if="activeAlerts.length" class="flex flex-column gap-2">
            <div
                v-for="alert in activeAlerts.slice(0, 3)"
                :key="alert.id"
                class="alert-card"
            >
              <i
                  class="pi pi-exclamation-circle alert-card__icon"
                  :style="{ color: alertIconColor(alert.severity) }"
              />
              <div class="alert-card__body">
                <p class="alert-card__product">
                  {{ alert.productName ?? t('dashboard.unknown-product') }}
                  <span v-if="resolveWarehouseName(alert)" style="font-size: 0.72rem; color: #64748B; font-weight: 400;">
                    · {{ resolveWarehouseName(alert) }}
                  </span>
                </p>
                <p class="alert-card__message">{{ alert.message }}</p>
              </div>
              <span
                  class="alert-card__badge"
                  :style="{
                    backgroundColor: alertBadgeBg(alert.severity),
                    color:           alertBadgeColor(alert.severity)
                  }"
              >
                {{ t(alertSeverityKey(alert.severity)) }}
              </span>
            </div>
          </div>

          <p v-else class="m-0" style="font-size: 0.88rem; color: #64748B;">
            {{ t('dashboard.no-alerts') }}
          </p>
        </div>
      </div>
    </div>

    <!-- ── Acciones rápidas + Mayor stock ────────────────────────────────── -->
    <div class="grid mt-0">

      <!-- Acciones rápidas — 2×3 grid of icon cards -->
      <div class="col-12 lg:col-8">
        <div class="panel h-full">
          <h3 class="panel__title">{{ t('dashboard.quick-actions') }}</h3>
          <div class="action-grid">
            <button
                v-for="action in quickActions"
                :key="action.labelKey"
                class="action-card"
                @click="action.handler"
            >
              <div class="action-card__circle" :style="{ backgroundColor: action.iconBg }">
                <i :class="action.icon" :style="{ color: action.iconColor }"/>
              </div>
              <p class="action-card__label">{{ t(action.labelKey) }}</p>
              <p class="action-card__sub">{{ t(action.subKey) }}</p>
            </button>
          </div>
        </div>
      </div>

      <!-- Mayor stock -->
      <div class="col-12 lg:col-4">
        <div class="panel h-full">
          <div class="flex align-items-center justify-content-between mb-3">
            <h3 class="panel__title m-0">{{ t('dashboard.top-stock') }}</h3>
            <button class="link-btn" @click="navigateToNewProduct">
              {{ t('dashboard.see-all') }}
              <i class="pi pi-arrow-right" style="font-size: 0.7rem;"/>
            </button>
          </div>

          <div v-if="topStockProducts.length" class="flex flex-column gap-3">
            <div
                v-for="stockItem in topStockProducts"
                :key="stockItem.productId"
                class="stock-row"
            >
              <div class="stock-row__info">
                <p class="stock-row__name">{{ stockItem.productName }}</p>
                <p class="stock-row__qty">
                  {{ stockItem.currentStock }} {{ t('dashboard.units') }}
                </p>
              </div>
              <span class="stock-row__badge">{{ stockItem.stockPercent }}%</span>
            </div>
          </div>

          <div v-else-if="!productStore.productsLoaded || !productStore.inventoryLoaded" class="panel__loading">
            <i class="pi pi-spin pi-spinner"/>
          </div>

          <p v-else class="m-0" style="font-size: 0.88rem; color: #64748B;">
            {{ t('dashboard.no-stock-data') }}
          </p>
        </div>
      </div>
    </div>

    <!-- ── Errors ──────────────────────────────────────────────────────────── -->
    <div v-if="errors.length" class="error-banner mt-3">
      <i class="pi pi-exclamation-triangle"/>
      {{ t('errors.occurred') }}: {{ errors.map(error => error.message).join(', ') }}
    </div>

  </div>
</template>

<style scoped>
.dashboard-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ── Header date + greeting ─────────────────────────────────────────── */
.header-date {
  color: #94A3B8;
  font-size: 0.75rem;
}
@media (min-width: 640px) {
  .header-date { font-size: 0.82rem; }
}
.header-greeting {
  color: #0B3558;
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.2;
}
@media (min-width: 640px) {
  .header-greeting { font-size: 1.65rem; }
}

/* ── Refresh button (icon-only) ─────────────────────────────────────── */
.refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid #E2E8F0;
  border-radius: 50%;
  background: #fff;
  color: #64748B;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
  flex-shrink: 0;
}
.refresh-btn:hover {
  background-color: #F1F5F9;
  color: #0B3558;
}

/* ── Alert icon button ──────────────────────────────────────────────── */
.alert-icon-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid #E2E8F0;
  border-radius: 50%;
  background: #fff;
  color: #64748B;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
  flex-shrink: 0;
}
.alert-icon-btn:hover {
  background-color: #FFF7ED;
  color: #F97316;
  border-color: #FED7AA;
}
.alert-icon-btn__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #EF4444;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* ── KPI cards ──────────────────────────────────────────────────────── */
/* 2-col on mobile → 3-col on desktop, matching the product stat-grid standard. */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}
@media (min-width: 1024px) {
  .kpi-grid { grid-template-columns: repeat(3, 1fr); }
}

.kpi-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem;
  background: #fff;
  border: 1px solid #E2E8F0;
  border-radius: 0.875rem;
  transition: box-shadow 0.2s, transform 0.2s;
}
@media (min-width: 640px) {
  .kpi-card { padding: 1.25rem; }
}
.kpi-card:hover {
  box-shadow: 0 4px 16px rgba(11, 53, 88, 0.09);
  transform: translateY(-2px);
}
.kpi-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.kpi-card__label {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: #64748B;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.2;
}
@media (min-width: 640px) {
  .kpi-card__label { font-size: 0.78rem; }
}
.kpi-card__value {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
}
@media (min-width: 640px) {
  .kpi-card__value { font-size: 1.5rem; }
}
.kpi-card__skeleton {
  width: 80px;
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
.kpi-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 0.75rem;
  flex-shrink: 0;
}
@media (min-width: 640px) {
  .kpi-card__icon { width: 52px; height: 52px; }
}
.kpi-card__icon i {
  font-size: 1.15rem;
}
@media (min-width: 640px) {
  .kpi-card__icon i { font-size: 1.4rem; }
}

/* ── Panels ─────────────────────────────────────────────────────────── */
.panel {
  background: #fff;
  border: 1px solid #E2E8F0;
  border-radius: 0.875rem;
  padding: 1.25rem;
}
.panel__title {
  margin: 0 0 1rem 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0B3558;
}
.panel__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: #0E7490;
  font-size: 1.4rem;
}

/* ── Link button ────────────────────────────────────────────────────── */
.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: none;
  background: none;
  color: #0E7490;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s;
}
.link-btn:hover { color: #0B3558; }

/* ── Bar chart ──────────────────────────────────────────────────────── */
.chart-container {
  position: relative;
  padding-bottom: 0.5rem;
}
.chart-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.chart-grid__line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed #E2E8F0;
}
.chart-grid__label {
  position: absolute;
  left: 0;
  top: -12px;
  font-size: 0.65rem;
  color: #CBD5E1;
}
.chart-bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 200px;
  padding: 1rem 0.5rem 0;
  position: relative;
}
@media (min-width: 640px) {
  .chart-bars { gap: 10px; padding: 1rem 2rem 0; }
}
.chart-bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}
.chart-bar-col__amount {
  font-size: 0.55rem;
  color: #64748B;
  text-align: center;
  min-height: 1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
@media (min-width: 640px) {
  .chart-bar-col__amount { font-size: 0.65rem; }
}
/* Fixed-height reference so the bar's height:X% below actually has a real
   pixel height to resolve against — without this, .chart-bar-col__bar's
   percentage height resolves against an auto-sized (content-fit) parent per
   the CSS spec, which computes to nothing, so every bar silently collapsed
   to its min-height regardless of barHeightPercent. */
.chart-bar-col__track {
  width: 100%;
  height: 140px;
  display: flex;
  align-items: flex-end;
}
.chart-bar-col__bar {
  width: 100%;
  background: linear-gradient(180deg, #0E7490 0%, #155E75 100%);
  border-radius: 4px 4px 0 0;
  min-height: 4px;
  transition: height 0.5s ease;
}
.chart-bar-col__label {
  font-size: 0.75rem;
  color: #94A3B8;
  font-weight: 500;
}
.chart-axis {
  height: 1px;
  background: #E2E8F0;
  margin: 0 0.5rem;
}
@media (min-width: 640px) {
  .chart-axis { margin: 0 2rem; }
}

/* ── Alert cards ────────────────────────────────────────────────────── */
.alert-card {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.75rem;
  border: 1px solid #F1F5F9;
  border-radius: 0.625rem;
  background: #FAFAFA;
}
.alert-card__icon {
  font-size: 1rem;
  margin-top: 2px;
  flex-shrink: 0;
}
.alert-card__body {
  flex: 1;
  overflow: hidden;
}
.alert-card__product {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #1E293B;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.alert-card__message {
  margin: 0.2rem 0 0;
  font-size: 0.73rem;
  color: #64748B;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.alert-card__badge {
  flex-shrink: 0;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
}

/* ── Quick-action card grid ─────────────────────────────────────────── */
.action-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}
@media (min-width: 640px) {
  .action-grid { grid-template-columns: repeat(3, 1fr); }
}
.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.5rem;
  padding: 1rem 0.75rem;
  border: 1px solid #E2E8F0;
  border-radius: 0.875rem;
  background: #fff;
  cursor: pointer;
  transition: box-shadow 0.18s, transform 0.15s, border-color 0.15s;
}
.action-card:hover {
  box-shadow: 0 4px 14px rgba(11, 53, 88, 0.09);
  transform: translateY(-2px);
  border-color: #CBD5E1;
}
.action-card:active { transform: translateY(0); }
.action-card__circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
}
.action-card__circle i { font-size: 1.2rem; }
.action-card__label {
  margin: 0;
  font-size: 0.83rem;
  font-weight: 700;
  color: #1E293B;
}
.action-card__sub {
  margin: 0;
  font-size: 0.72rem;
  color: #94A3B8;
  line-height: 1.3;
}

/* ── Mayor stock rows ───────────────────────────────────────────────── */
.stock-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid #F1F5F9;
}
.stock-row:last-child { border-bottom: none; }
.stock-row__info { overflow: hidden; }
.stock-row__name {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: #1E293B;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stock-row__qty {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: #64748B;
}
.stock-row__badge {
  flex-shrink: 0;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.73rem;
  font-weight: 700;
  background: #DCFCE7;
  color: #16A34A;
  white-space: nowrap;
}

/* ── Error banner ───────────────────────────────────────────────────── */
.error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.625rem;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  color: #DC2626;
  font-size: 0.85rem;
}

/* ── Shimmer animation ──────────────────────────────────────────────── */
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
