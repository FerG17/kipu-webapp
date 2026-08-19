<script setup>
import { computed, onMounted, ref, toRefs } from 'vue';
import { useI18n }        from 'vue-i18n';
import { useToast }       from 'primevue/usetoast';
import { useConfirm }     from 'primevue';
import useAlertsStore     from '../../application/alerts.store.js';
import useIamStore        from '../../../iam/application/iam.store.js';
import useProductStore    from '../../../product/application/product.store.js';
import { AlertStatus, AlertType } from '../../domain/model/alert.entity.js';
import { toDateLocale } from '../../../shared/presentation/date-locale.js';
import { canModerateAlerts, canManageAlertRules } from '../../../iam/application/permissions.js';

const { t, locale } = useI18n();
const toast       = useToast();
const confirm     = useConfirm();
const alertsStore = useAlertsStore();
const iamStore    = useIamStore();
const productStore = useProductStore();

const {
  alerts,
  alertsLoaded,
  alertRules,
  activeAlertsCount,
  criticalActiveCount,
  lowStockActiveCount,
  expirationActiveCount
} = toRefs(alertsStore);

const { fetchAlerts, fetchAlertRules, acknowledgeAlert, resolveAlert, toggleAlertRule, updateAlertRuleThreshold } = alertsStore;
const { discardBatch } = productStore;

/**
 * Whether the current role may acknowledge/resolve alerts — reads stay open
 * to every role (Fase B4), a CASHIER can only view.
 * @type {import('vue').ComputedRef<boolean>}
 */
const canModerate = computed(() => canModerateAlerts(iamStore.currentUserPosition));

/**
 * Whether the current role may edit alert-rule thresholds — admin only,
 * stricter than canModerate (WAREHOUSE can acknowledge/resolve alerts but
 * not change the thresholds that generate them).
 * @type {import('vue').ComputedRef<boolean>}
 */
const canManageRules = computed(() => canManageAlertRules(iamStore.currentUserPosition));

/**
 * Warehouses of the current business, fetched once so LOW_STOCK/OUT_OF_STOCK
 * alerts can show which specific warehouse they're about instead of reading
 * as a business-wide problem (a product split across warehouses can be
 * critically low in one and perfectly healthy in another).
 * @type {import('vue').Ref<Array>}
 */
const warehouses = ref([]);

/**
 * Resolves an alert's warehouseId to its display name, falling back to the
 * raw id (or a generic label when the alert has no warehouse at all, e.g.
 * EXPIRATION/EXPIRED alerts, which are batch-scoped instead).
 * @param {import('../../domain/model/alert.entity.js').Alert} alert
 * @returns {string|null}
 */
function resolveWarehouseName(alert) {
  if (alert.type !== AlertType.LOW_STOCK && alert.type !== AlertType.OUT_OF_STOCK) return null;
  if (alert.warehouseId == null) return t('alerts.field-unknown-warehouse');
  const warehouse = warehouses.value.find(item => item.id === alert.warehouseId);
  return warehouse ? warehouse.name : `#${alert.warehouseId}`;
}

// ─── Tab state ─────────────────────────────────────────────────────────────────
const activeTab = ref('activas');

// ─── Filter state ──────────────────────────────────────────────────────────────
const searchQuery  = ref('');
const statusFilter = ref('ACTIVE');
const typeFilter   = ref('ALL');

// ─── Modal state ───────────────────────────────────────────────────────────────
const selectedAlert = ref(null);

// ─── Rule edit state ───────────────────────────────────────────────────────────
const editingRuleType  = ref(null);
const editingThreshold = ref('');

// ─── Config maps ───────────────────────────────────────────────────────────────
const typeConfig = {
  LOW_STOCK:    { labelKey: 'alerts.type-low-stock',    color: 'var(--status-warning-fg)', background: 'var(--status-warning-bg)', border: 'var(--status-warning-bg)', icon: 'pi-chart-line'  },
  OUT_OF_STOCK: { labelKey: 'alerts.type-out-of-stock', color: 'var(--status-critical-fg)', background: 'var(--status-critical-bg)', border: 'color-mix(in srgb, var(--status-critical-fg) 35%, transparent)', icon: 'pi-box'          },
  EXPIRATION:   { labelKey: 'alerts.type-expiration',   color: 'var(--status-warning-fg)', background: 'var(--status-warning-bg)', border: 'var(--status-warning-bg)', icon: 'pi-calendar'     },
  EXPIRED:      { labelKey: 'alerts.type-expired',      color: 'var(--status-critical-fg)', background: 'var(--status-critical-bg)', border: 'color-mix(in srgb, var(--status-critical-fg) 35%, transparent)', icon: 'pi-times-circle' }
};
const severityConfig = {
  HIGH:   { labelKey: 'alerts.severity-high',   color: 'var(--status-critical-fg)', background: 'var(--status-critical-bg)' },
  MEDIUM: { labelKey: 'alerts.severity-medium', color: 'var(--status-warning-fg)', background: 'var(--status-warning-bg)' },
  LOW:    { labelKey: 'alerts.severity-low',    color: 'var(--brand)', background: '#CFFAFE' }
};
const statusConfig = {
  ACTIVE:       { labelKey: 'alerts.status-active',       color: 'var(--status-critical-fg)', background: 'var(--status-critical-bg)', icon: 'pi-exclamation-circle' },
  ACKNOWLEDGED: { labelKey: 'alerts.status-acknowledged', color: 'var(--status-warning-fg)', background: 'var(--status-warning-bg)', icon: 'pi-eye'                },
  SENT:         { labelKey: 'alerts.status-sent',         color: 'var(--brand)', background: '#CFFAFE', icon: 'pi-send'              },
  RESOLVED:     { labelKey: 'alerts.status-resolved',     color: 'var(--status-ok-fg)', background: 'var(--status-ok-bg)', icon: 'pi-check-circle'      }
};

function getTypeConfig(type)         { return typeConfig[type]         ?? typeConfig.LOW_STOCK;    }
function getSeverityConfig(severity) { return severityConfig[severity] ?? severityConfig.LOW;      }
function getStatusConfig(status)     { return statusConfig[status]     ?? statusConfig.ACTIVE;     }

// ─── Lifecycle ─────────────────────────────────────────────────────────────────
/**
 * Loads real, server-persisted alerts and rules, plus the business's
 * warehouses (so LOW_STOCK/OUT_OF_STOCK alerts can show which one they're
 * about — see resolveWarehouseName).
 */
onMounted(() => {
  fetchAlerts();
  fetchAlertRules();
  if (iamStore.currentUser?.businessId) {
    productStore.fetchWarehousesForBusiness().then(fetched => {
      warehouses.value = fetched;
    });
  }
});

// ─── Stats ─────────────────────────────────────────────────────────────────────
const statsBarItems = computed(() => [
  { labelKey: 'alerts.stat-active',     value: String(activeAlertsCount.value),     color: 'var(--status-critical-fg)', background: 'var(--status-critical-bg)' },
  { labelKey: 'alerts.stat-critical',   value: String(criticalActiveCount.value),   color: 'var(--status-critical-fg)', background: 'var(--status-critical-bg)' },
  { labelKey: 'alerts.stat-stock',      value: String(lowStockActiveCount.value),   color: 'var(--status-warning-fg)', background: 'var(--status-warning-bg)' },
  { labelKey: 'alerts.stat-expiration', value: String(expirationActiveCount.value), color: 'var(--status-warning-fg)', background: 'var(--status-warning-bg)' }
]);

// ─── Filtered alerts ───────────────────────────────────────────────────────────
const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const statusOrder   = { ACTIVE: 0, ACKNOWLEDGED: 1, SENT: 2, RESOLVED: 3 };

const filteredAlerts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return alerts.value
      .filter(alert => {
        const matchesSearch = !query
            || alert.message.toLowerCase().includes(query)
            || (alert.productName && alert.productName.toLowerCase().includes(query));
        const matchesStatus = statusFilter.value === 'ALL' || alert.status === statusFilter.value;
        const matchesType   = typeFilter.value   === 'ALL' || alert.type   === typeFilter.value;
        return matchesSearch && matchesStatus && matchesType;
      })
      .slice()
      .sort((alertA, alertB) => {
        const statusDiff = (statusOrder[alertA.status] ?? 9) - (statusOrder[alertB.status] ?? 9);
        if (statusDiff !== 0) return statusDiff;
        return (severityOrder[alertA.severity] ?? 9) - (severityOrder[alertB.severity] ?? 9);
      });
});

// ─── Modal actions ─────────────────────────────────────────────────────────────
const acknowledging = ref(false);
const resolving     = ref(false);
const discarding    = ref(false);

function openDetail(alert) { selectedAlert.value = alert; }

function handleAcknowledge() {
  if (!selectedAlert.value) return;
  acknowledging.value = true;
  acknowledgeAlert(selectedAlert.value)
      .then(() => {
        selectedAlert.value = { ...selectedAlert.value, status: AlertStatus.ACKNOWLEDGED, isActionable: true };
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('alerts.toast-ack-success'), life: 3500 });
      })
      .catch(() => {
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('alerts.toast-ack-error'), life: 4500 });
      })
      .finally(() => {
        acknowledging.value = false;
      });
}

function handleResolve() {
  if (!selectedAlert.value) return;
  resolving.value = true;
  resolveAlert(selectedAlert.value)
      .then(() => {
        selectedAlert.value = null;
        toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('alerts.toast-resolve-success'), life: 3500 });
      })
      .catch(() => {
        toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('alerts.toast-resolve-error'), life: 4500 });
      })
      .finally(() => {
        resolving.value = false;
      });
}

/**
 * Discards the batch behind an EXPIRATION/EXPIRED alert — the goods left
 * the shelf (thrown out, returned), so it should stop alerting. Closes the
 * detail modal on success since the alert itself gets resolved server-side
 * as part of discarding (BatchDiscardedEventHandler).
 *
 * Confirms first because discarding a batch does NOT touch inventory —
 * there is no stock-adjustment feature yet (a batch doesn't even track its
 * own quantity, only cost/expiration), so the unit count stays exactly as
 * it was. Skipping this warning would let someone believe the units are
 * gone from stock when they are not.
 */
function handleDiscardBatch() {
  if (!selectedAlert.value?.batchId) return;
  confirm.require({
    message:     t('alerts.confirm-discard-body'),
    header:      t('alerts.confirm-discard-header'),
    icon:        'pi pi-exclamation-triangle',
    accept: () => {
      discarding.value = true;
      discardBatch(selectedAlert.value.batchId)
          .then(() => {
            selectedAlert.value = null;
            fetchAlerts();
            toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('alerts.toast-discard-success'), life: 3500 });
          })
          .catch(() => {
            toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('alerts.toast-discard-error'), life: 4500 });
          })
          .finally(() => {
            discarding.value = false;
          });
    }
  });
}

// ─── Rule editing ──────────────────────────────────────────────────────────────
function startEditRule(rule) {
  editingRuleType.value  = rule.type;
  editingThreshold.value = String(rule.threshold);
}

function saveRuleThreshold(type) {
  const parsedValue = parseFloat(editingThreshold.value);
  if (!isNaN(parsedValue) && parsedValue >= 0) updateAlertRuleThreshold(type, parsedValue);
  editingRuleType.value = null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(isoDate) {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleDateString(toDateLocale(locale.value), { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(isoDate) {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleDateString(toDateLocale(locale.value), {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}
</script>

<template>
  <div class="alerts-page">

    <!-- ── Page header ─────────────────────────────────────────────────── -->
    <div class="alerts-header">
      <div>
        <h1 class="alerts-title">{{ t('alerts.title') }}</h1>
        <p class="alerts-subtitle">{{ t('alerts.subtitle') }}</p>
      </div>
      <div v-if="activeAlertsCount > 0" class="alerts-active-badge">
        <i class="pi pi-bell" style="font-size: 0.85rem;" />
        <span>{{ activeAlertsCount }}</span>
      </div>
    </div>

    <!-- ── Loading ─────────────────────────────────────────────────────── -->
    <div v-if="!alertsLoaded" class="alerts-loading">
      <i class="pi pi-spin pi-spinner alerts-spinner" />
      <span>{{ t('alerts.loading') }}</span>
    </div>

    <div v-else>

      <!-- ── Stats bar ─────────────────────────────────────────────── -->
      <div class="alerts-stats-bar">
        <div
            v-for="stat in statsBarItems"
            :key="stat.labelKey"
            class="alerts-stat-card"
            :style="{ backgroundColor: stat.background }"
        >
          <p class="alerts-stat-label" :style="{ color: stat.color }">{{ t(stat.labelKey) }}</p>
          <p class="alerts-stat-value" :style="{ color: stat.color }">{{ stat.value }}</p>
        </div>
      </div>

      <!-- ── Critical banner ─────────────────────────────────────────── -->
      <div v-if="criticalActiveCount > 0" class="alerts-critical-banner">
        <div class="alerts-pulse-wrapper">
          <span class="alerts-pulse-dot" />
          <span class="alerts-pulse-ring" />
        </div>
        <p class="alerts-critical-text">
          <strong>{{ criticalActiveCount }}</strong>
          {{ criticalActiveCount === 1 ? t('alerts.critical-banner-singular') : t('alerts.critical-banner-plural') }}
        </p>
      </div>

      <!-- ── Main tabs ──────────────────────────────────────────────── -->
      <div class="alerts-tabs">
        <button class="alerts-tab-btn" :class="{ 'alerts-tab-btn-active': activeTab === 'activas' }" @click="activeTab = 'activas'">
          <i class="pi pi-bell" />
          <span>{{ t('alerts.tab-active') }}</span>
          <span v-if="activeAlertsCount > 0" class="alerts-tab-badge">{{ activeAlertsCount }}</span>
        </button>
        <button class="alerts-tab-btn" :class="{ 'alerts-tab-btn-active': activeTab === 'reglas' }" @click="activeTab = 'reglas'">
          <i class="pi pi-cog" />
          <span>{{ t('alerts.tab-rules') }}</span>
        </button>
      </div>

      <!-- ════════════════════════════════════ TAB: Alertas ═══════════ -->
      <div v-if="activeTab === 'activas'">

        <!-- Filters -->
        <div class="alerts-filters">
          <div class="alerts-search-wrapper">
            <i class="pi pi-search alerts-search-icon" />
            <input v-model="searchQuery" class="alerts-search-input" :placeholder="t('alerts.search-placeholder')" />
          </div>
          <div class="alerts-filter-pills">
            <!-- Status pills -->
            <button
                v-for="statusOption in ['ALL', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED']"
                :key="statusOption"
                class="alerts-pill"
                :class="{ 'alerts-pill-active-default': statusFilter === statusOption && statusOption === 'ALL' }"
                :style="statusFilter === statusOption && statusOption !== 'ALL'
                                ? { backgroundColor: getStatusConfig(statusOption).background, color: getStatusConfig(statusOption).color, borderColor: getStatusConfig(statusOption).color }
                                : {}"
                @click="statusFilter = statusOption"
            >
              {{ statusOption === 'ALL' ? t('alerts.filter-all') : t(getStatusConfig(statusOption).labelKey) }}
            </button>
            <div class="alerts-filter-divider" />
            <!-- Type pills -->
            <button
                v-for="typeOption in ['ALL', 'OUT_OF_STOCK', 'LOW_STOCK', 'EXPIRATION', 'EXPIRED']"
                :key="typeOption"
                class="alerts-pill alerts-pill-type"
                :class="{ 'alerts-pill-type-all-active': typeFilter === typeOption && typeOption === 'ALL' }"
                :style="typeFilter === typeOption && typeOption !== 'ALL'
                                ? { backgroundColor: getTypeConfig(typeOption).background, color: getTypeConfig(typeOption).color, borderColor: getTypeConfig(typeOption).border }
                                : {}"
                @click="typeFilter = typeOption"
            >
              {{ typeOption === 'ALL' ? t('alerts.filter-type-all') : t(getTypeConfig(typeOption).labelKey) }}
            </button>
          </div>
        </div>

        <!-- Desktop table -->
        <div class="alerts-table-wrapper">
          <table class="alerts-table">
            <thead>
            <tr class="alerts-thead-row">
              <th class="alerts-th">{{ t('alerts.col-type') }}</th>
              <th class="alerts-th">{{ t('alerts.col-product') }}</th>
              <th class="alerts-th">{{ t('alerts.col-detail') }}</th>
              <th class="alerts-th">{{ t('alerts.col-severity') }}</th>
              <th class="alerts-th">{{ t('alerts.col-date') }}</th>
              <th class="alerts-th">{{ t('alerts.col-status') }}</th>
              <th class="alerts-th" />
            </tr>
            </thead>
            <tbody>
            <tr
                v-for="alert in filteredAlerts"
                :key="alert.id"
                class="alerts-tr"
                :style="alert.status === 'ACTIVE' ? { backgroundColor: `${getTypeConfig(alert.type).background}60` } : {}"
            >
              <td class="alerts-td">
                                    <span class="alerts-type-badge" :style="{ backgroundColor: getTypeConfig(alert.type).background, color: getTypeConfig(alert.type).color, borderColor: getTypeConfig(alert.type).border }">
                                        <i :class="`pi ${getTypeConfig(alert.type).icon}`" style="font-size: 0.65rem;" />
                                        {{ t(getTypeConfig(alert.type).labelKey) }}
                                    </span>
              </td>
              <td class="alerts-td alerts-td-product">
                {{ alert.productName || `#${alert.productId}` }}
                <span v-if="resolveWarehouseName(alert)" style="display: block; font-size: 0.72rem; color: var(--text-muted); font-weight: 400;">
                  <i class="pi pi-building" style="font-size: 0.65rem; margin-right: 0.2rem;" />{{ resolveWarehouseName(alert) }}
                </span>
              </td>
              <td class="alerts-td alerts-td-message">{{ alert.message }}</td>
              <td class="alerts-td">
                                    <span class="alerts-severity-badge" :style="{ backgroundColor: getSeverityConfig(alert.severity).background, color: getSeverityConfig(alert.severity).color }">
                                        {{ t(getSeverityConfig(alert.severity).labelKey) }}
                                    </span>
              </td>
              <td class="alerts-td alerts-td-muted">{{ formatDate(alert.date) }}</td>
              <td class="alerts-td">
                                    <span class="alerts-status-badge" :style="{ backgroundColor: getStatusConfig(alert.status).background, color: getStatusConfig(alert.status).color }">
                                        <i :class="`pi ${getStatusConfig(alert.status).icon}`" style="font-size: 0.6rem;" />
                                        {{ t(getStatusConfig(alert.status).labelKey) }}
                                    </span>
              </td>
              <td class="alerts-td">
                <button class="alerts-btn-view" @click="openDetail(alert)">
                  <i class="pi pi-eye" />
                  <span>{{ t('alerts.btn-view') }}</span>
                </button>
              </td>
            </tr>
            </tbody>
          </table>
          <div v-if="filteredAlerts.length === 0" class="alerts-empty">
            <i class="pi pi-bell-slash alerts-empty-icon" />
            <p class="alerts-empty-text">{{ t('alerts.no-results') }}</p>
            <p v-if="statusFilter === 'ACTIVE' && typeFilter === 'ALL'" class="alerts-empty-sub">{{ t('alerts.no-results-sub') }}</p>
          </div>
        </div>

        <!-- Mobile cards -->
        <div class="alerts-mobile-cards">
          <button
              v-for="alert in filteredAlerts"
              :key="alert.id"
              class="alerts-mobile-card"
              :style="{ borderColor: alert.status === 'ACTIVE' ? getTypeConfig(alert.type).border : 'var(--border)', backgroundColor: alert.status === 'ACTIVE' ? getTypeConfig(alert.type).background : 'var(--surface)' }"
              @click="openDetail(alert)"
          >
            <div class="alerts-mobile-card-top">
              <div class="alerts-mobile-card-left">
                <div class="alerts-mobile-icon-wrapper">
                  <i :class="`pi ${getTypeConfig(alert.type).icon}`" :style="{ color: getTypeConfig(alert.type).color, fontSize: '1rem' }" />
                </div>
                <div class="alerts-mobile-card-info">
                  <div class="alerts-mobile-card-badges">
                                        <span class="alerts-type-badge" :style="{ backgroundColor: getTypeConfig(alert.type).background, color: getTypeConfig(alert.type).color, borderColor: getTypeConfig(alert.type).border }">
                                            {{ t(getTypeConfig(alert.type).labelKey) }}
                                        </span>
                    <span class="alerts-severity-badge" :style="{ backgroundColor: getSeverityConfig(alert.severity).background, color: getSeverityConfig(alert.severity).color }">
                                            {{ t(getSeverityConfig(alert.severity).labelKey) }}
                                        </span>
                  </div>
                  <p class="alerts-mobile-card-product">
                    {{ alert.productName || `#${alert.productId}` }}
                    <span v-if="resolveWarehouseName(alert)" style="font-size: 0.72rem; color: var(--text-muted); font-weight: 400;">
                      · {{ resolveWarehouseName(alert) }}
                    </span>
                  </p>
                  <p class="alerts-mobile-card-message">{{ alert.message }}</p>
                </div>
              </div>
              <span class="alerts-status-badge" :style="{ backgroundColor: getStatusConfig(alert.status).background, color: getStatusConfig(alert.status).color }">
                                <i :class="`pi ${getStatusConfig(alert.status).icon}`" style="font-size: 0.6rem;" />
                                {{ t(getStatusConfig(alert.status).labelKey) }}
                            </span>
            </div>
            <div class="alerts-mobile-card-footer" :style="{ borderTopColor: alert.status === 'ACTIVE' ? getTypeConfig(alert.type).border : 'var(--surface-alt)' }">
              <span class="alerts-mobile-date">{{ formatDate(alert.date) }}</span>
              <span v-if="alert.notified" class="alerts-mobile-notified">
                                <i class="pi pi-bell" style="font-size: 0.65rem;" />
                                {{ t('alerts.notified-label') }}
                            </span>
            </div>
          </button>
          <div v-if="filteredAlerts.length === 0" class="alerts-empty">
            <i class="pi pi-bell-slash alerts-empty-icon" />
            <p class="alerts-empty-text">{{ t('alerts.no-results') }}</p>
          </div>
        </div>
      </div>

      <!-- ════════════════════════════════════ TAB: Reglas ════════════ -->
      <div v-if="activeTab === 'reglas'" class="alerts-rules-container">
        <div class="alerts-rules-info-banner">
          <i class="pi pi-bolt" style="color: var(--brand); font-size: 0.85rem; flex-shrink: 0;" />
          <p class="alerts-rules-info-text">{{ t('alerts.rules-info') }}</p>
        </div>
        <div class="alerts-rules-list">
          <div
              v-for="rule in alertRules"
              :key="rule.type"
              class="alerts-rule-card"
              :style="{ borderColor: rule.active ? getTypeConfig(rule.type).border : 'var(--border)', opacity: rule.active ? 1 : 0.65 }"
          >
            <div class="alerts-rule-card-header">
              <div class="alerts-rule-card-left">
                <div class="alerts-rule-icon-wrapper" :style="{ backgroundColor: rule.active ? getTypeConfig(rule.type).background : 'var(--surface-alt)' }">
                  <i :class="`pi ${getTypeConfig(rule.type).icon}`" :style="{ color: rule.active ? getTypeConfig(rule.type).color : 'var(--text-faint)', fontSize: '1rem' }" />
                </div>
                <div>
                  <p class="alerts-rule-name">{{ t(rule.nameKey) }}</p>
                  <p class="alerts-rule-desc">{{ t(rule.descKey) }}</p>
                </div>
              </div>
              <button v-if="canManageRules" class="alerts-rule-toggle" :style="{ backgroundColor: rule.active ? 'var(--brand)' : 'var(--text-faint)' }" @click="toggleAlertRule(rule.type)">
                <span class="alerts-rule-toggle-thumb" :style="{ left: rule.active ? '22px' : '2px' }" />
              </button>
            </div>
            <div v-if="rule.hasThreshold" class="alerts-rule-threshold">
              <span class="alerts-rule-threshold-label">{{ t('alerts.rule-threshold-label') }}:</span>
              <template v-if="editingRuleType === rule.type">
                <input
                    v-model="editingThreshold"
                    type="number"
                    class="alerts-rule-threshold-input"
                    :style="{ borderColor: getTypeConfig(rule.type).color }"
                    @keydown.enter="saveRuleThreshold(rule.type)"
                    @keydown.escape="editingRuleType = null"
                />
                <span class="alerts-rule-threshold-unit">{{ t(rule.unitKey) }}</span>
                <button class="alerts-rule-threshold-save" @click="saveRuleThreshold(rule.type)">{{ t('alerts.rule-save') }}</button>
                <button class="alerts-rule-threshold-cancel" @click="editingRuleType = null">{{ t('alerts.rule-cancel') }}</button>
              </template>
              <template v-else>
                                <span class="alerts-rule-threshold-value" :style="{ color: getTypeConfig(rule.type).color }">
                                    {{ rule.threshold }} {{ t(rule.unitKey) }}
                                </span>
                <button v-if="rule.active && canManageRules" class="alerts-rule-threshold-edit-btn" @click="startEditRule(rule)">
                  {{ t('alerts.rule-edit-threshold') }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- ═════════════════════════════ Modal: Detail ══════════════════════ -->
    <div v-if="selectedAlert" class="alerts-modal-overlay" @click.self="selectedAlert = null">
      <div class="alerts-modal">
        <div class="alerts-modal-header">
          <div class="alerts-modal-header-left">
            <span class="alerts-modal-id">#{{ selectedAlert.id }}</span>
            <span class="alerts-status-badge" :style="{ backgroundColor: getStatusConfig(selectedAlert.status).background, color: getStatusConfig(selectedAlert.status).color }">
                            <i :class="`pi ${getStatusConfig(selectedAlert.status).icon}`" style="font-size: 0.6rem;" />
                            {{ t(getStatusConfig(selectedAlert.status).labelKey) }}
                        </span>
          </div>
          <button class="alerts-modal-close" @click="selectedAlert = null">
            <i class="pi pi-times" />
          </button>
        </div>
        <div class="alerts-modal-body">
          <!-- Type banner -->
          <div class="alerts-modal-type-banner" :style="{ backgroundColor: getTypeConfig(selectedAlert.type).background, borderColor: getTypeConfig(selectedAlert.type).border }">
            <div class="alerts-modal-type-icon">
              <i :class="`pi ${getTypeConfig(selectedAlert.type).icon}`" :style="{ color: getTypeConfig(selectedAlert.type).color, fontSize: '1.1rem' }" />
            </div>
            <div>
              <p class="alerts-modal-type-label" :style="{ color: getTypeConfig(selectedAlert.type).color }">
                {{ t(getTypeConfig(selectedAlert.type).labelKey) }}
              </p>
              <p class="alerts-modal-product-name">{{ selectedAlert.productName || `#${selectedAlert.productId}` }}</p>
              <p v-if="resolveWarehouseName(selectedAlert)" class="alerts-modal-detail-text" style="font-weight: 600;">
                <i class="pi pi-building" style="font-size: 0.75rem; margin-right: 0.3rem;" />{{ resolveWarehouseName(selectedAlert) }}
              </p>
              <p class="alerts-modal-detail-text">{{ selectedAlert.message }}</p>
            </div>
          </div>
          <!-- Info grid -->
          <div class="alerts-modal-info-grid">
            <div v-if="resolveWarehouseName(selectedAlert)" class="alerts-modal-info-cell">
              <p class="alerts-modal-info-label">{{ t('alerts.field-warehouse') }}</p>
              <p class="alerts-modal-info-value">{{ resolveWarehouseName(selectedAlert) }}</p>
            </div>
            <div class="alerts-modal-info-cell">
              <p class="alerts-modal-info-label">{{ t('alerts.field-severity') }}</p>
              <span class="alerts-severity-badge" :style="{ backgroundColor: getSeverityConfig(selectedAlert.severity).background, color: getSeverityConfig(selectedAlert.severity).color }">
                                {{ t(getSeverityConfig(selectedAlert.severity).labelKey) }}
                            </span>
            </div>
            <div class="alerts-modal-info-cell">
              <p class="alerts-modal-info-label">{{ t('alerts.field-date') }}</p>
              <p class="alerts-modal-info-value">{{ formatDateTime(selectedAlert.date) }}</p>
            </div>
            <div class="alerts-modal-info-cell">
              <p class="alerts-modal-info-label">{{ t('alerts.field-notified') }}</p>
              <p class="alerts-modal-info-value">
                {{ selectedAlert.notified
                  ? `${t('alerts.field-notified-yes')} · ${formatDateTime(selectedAlert.notifiedAt)}`
                  : t('alerts.field-notified-no') }}
              </p>
            </div>
            <div v-if="selectedAlert.currentStock !== null" class="alerts-modal-info-cell">
              <p class="alerts-modal-info-label">{{ t('alerts.field-current-stock') }}</p>
              <p class="alerts-modal-info-value">{{ selectedAlert.currentStock }} {{ t('alerts.field-units') }}</p>
            </div>
            <div v-if="selectedAlert.minStock !== null" class="alerts-modal-info-cell">
              <p class="alerts-modal-info-label">{{ t('alerts.field-min-stock') }}</p>
              <p class="alerts-modal-info-value">{{ selectedAlert.minStock }} {{ t('alerts.field-units') }}</p>
            </div>
            <div v-if="selectedAlert.daysToExpiry !== null" class="alerts-modal-info-cell">
              <p class="alerts-modal-info-label">{{ t('alerts.field-days-to-expiry') }}</p>
              <p class="alerts-modal-info-value">
                {{ selectedAlert.daysToExpiry < 0
                  ? t('alerts.field-expired-days-ago', { days: Math.abs(selectedAlert.daysToExpiry) })
                  : `${selectedAlert.daysToExpiry} ${t('alerts.field-days')}` }}
              </p>
            </div>
            <div v-if="selectedAlert.resolvedAt" class="alerts-modal-info-cell">
              <p class="alerts-modal-info-label">{{ t('alerts.field-resolved-at') }}</p>
              <p class="alerts-modal-info-value">{{ formatDateTime(selectedAlert.resolvedAt) }}</p>
            </div>
          </div>
          <!-- Actions -->
          <div v-if="selectedAlert.status !== 'RESOLVED' && canModerate" class="alerts-modal-actions">
            <button v-if="selectedAlert.status === 'ACTIVE'" class="alerts-modal-btn-acknowledge" :disabled="acknowledging" @click="handleAcknowledge">
              <i :class="acknowledging ? 'pi pi-spin pi-spinner' : 'pi pi-eye'" /> {{ t('alerts.btn-acknowledge') }}
            </button>
            <button class="alerts-modal-btn-resolve" :disabled="resolving" @click="handleResolve">
              <i :class="resolving ? 'pi pi-spin pi-spinner' : 'pi pi-check'" /> {{ t('alerts.btn-resolve') }}
            </button>
            <button
                v-if="(selectedAlert.type === 'EXPIRATION' || selectedAlert.type === 'EXPIRED') && selectedAlert.batchId"
                class="alerts-modal-btn-discard"
                :disabled="discarding"
                @click="handleDiscardBatch"
            >
              <i :class="discarding ? 'pi pi-spin pi-spinner' : 'pi pi-trash'" /> {{ t('alerts.btn-discard-batch') }}
            </button>
          </div>
          <button class="alerts-modal-btn-close" @click="selectedAlert = null">{{ t('alerts.modal-close') }}</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.alerts-page { min-height: 100%; }

.alerts-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1rem; }
.alerts-title { font-size: 1.3rem; font-weight: 700; color: var(--brand); margin: 0; line-height: 1.2; }
.alerts-subtitle { font-size: 0.78rem; color: var(--text-muted); margin: 0.2rem 0 0; }
.alerts-active-badge { display: flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.65rem; background-color: var(--status-critical-bg); border-radius: 0.75rem; color: var(--status-critical-fg); font-size: 0.78rem; font-weight: 700; flex-shrink: 0; }

.alerts-loading { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 3rem; color: var(--text-faint); font-size: 0.88rem; }
.alerts-spinner { font-size: 1.2rem; color: var(--brand); }

.alerts-stats-bar { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
.alerts-stat-card { border-radius: 0.75rem; padding: 0.6rem 0.75rem; }
.alerts-stat-label { font-size: 0.68rem; opacity: 0.8; margin: 0; }
.alerts-stat-value { font-size: 1.1rem; font-weight: 800; margin: 0; }

.alerts-critical-banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.65rem 0.85rem; background-color: var(--status-critical-bg); border: 1.5px solid color-mix(in srgb, var(--status-critical-fg) 35%, transparent); border-radius: 0.75rem; margin-bottom: 0.75rem; }
.alerts-pulse-wrapper { position: relative; width: 0.75rem; height: 0.75rem; flex-shrink: 0; }
.alerts-pulse-dot { display: block; width: 0.75rem; height: 0.75rem; border-radius: 50%; background-color: var(--status-critical-fg); }
.alerts-pulse-ring { position: absolute; inset: 0; border-radius: 50%; background-color: var(--status-critical-fg); opacity: 0.4; animation: pulse 1.5s infinite; }
@keyframes pulse { 0% { transform: scale(1); opacity: 0.4; } 70% { transform: scale(2); opacity: 0; } 100% { transform: scale(2); opacity: 0; } }
.alerts-critical-text { font-size: 0.82rem; color: var(--status-critical-fg); font-weight: 600; margin: 0; }

.alerts-tabs { display: flex; gap: 0.25rem; margin-bottom: 0.75rem; }
.alerts-tab-btn { display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem; border: none; border-radius: 0.5rem; font-size: 0.85rem; font-weight: 500; cursor: pointer; color: var(--text-muted); background: transparent; transition: all 0.15s; position: relative; }
.alerts-tab-btn:hover:not(.alerts-tab-btn-active) { background-color: var(--surface-alt); }
.alerts-tab-btn-active { background-color: var(--brand); color: var(--surface); font-weight: 700; }
.alerts-tab-badge { position: absolute; top: -0.25rem; right: -0.25rem; width: 1rem; height: 1rem; border-radius: 50%; background-color: var(--status-critical-fg); color: var(--surface); font-size: 0.6rem; font-weight: 800; display: flex; align-items: center; justify-content: center; }

.alerts-filters { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; padding: 0.75rem; background: var(--surface); border-radius: 0.75rem; border: 1px solid var(--border); }
.alerts-search-wrapper { position: relative; }
.alerts-search-icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-faint); font-size: 0.85rem; }
.alerts-search-input { width: 100%; padding: 0.5rem 0.75rem 0.5rem 2.25rem; border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.85rem; background-color: var(--surface-alt); color: var(--text); outline: none; transition: border-color 0.15s; }
.alerts-search-input:focus { border-color: var(--brand); }
.alerts-filter-pills { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
.alerts-pill { padding: 0.3rem 0.65rem; border-radius: 999px; border: 1.5px solid transparent; font-size: 0.72rem; font-weight: 600; background: var(--surface-alt); color: var(--text-muted); cursor: pointer; white-space: nowrap; transition: all 0.15s; }
.alerts-pill-active-default { background-color: var(--brand); color: var(--surface); }
.alerts-pill-type { background: var(--surface-alt); color: var(--text-faint); }
.alerts-pill-type-all-active { background-color: var(--text-muted); color: var(--surface); }
.alerts-filter-divider { width: 1px; height: 1.25rem; background-color: var(--border); flex-shrink: 0; }

.alerts-table-wrapper { background: var(--surface); border-radius: 0.75rem; border: 1px solid var(--border); overflow: hidden; }
.alerts-table { width: 100%; border-collapse: collapse; }
.alerts-thead-row { background-color: var(--surface-alt); border-bottom: 1px solid var(--border); }
.alerts-th { padding: 0.65rem 1rem; text-align: left; font-size: 0.72rem; font-weight: 600; color: var(--text-faint); }
.alerts-tr { border-bottom: 1px solid var(--surface-alt); transition: opacity 0.1s; }
.alerts-tr:hover { opacity: 0.85; }
.alerts-td { padding: 0.65rem 1rem; font-size: 0.82rem; color: var(--text); vertical-align: middle; }
.alerts-td-product { font-weight: 600; color: var(--brand); }
.alerts-td-message { color: var(--text-muted); font-size: 0.75rem; max-width: 220px; }
.alerts-td-muted { color: var(--text-faint); font-size: 0.72rem; }

.alerts-type-badge { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.15rem 0.5rem; border-radius: 0.35rem; border: 1px solid transparent; font-size: 0.68rem; font-weight: 600; white-space: nowrap; }
.alerts-severity-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 0.35rem; font-size: 0.68rem; font-weight: 700; }
.alerts-status-badge { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.15rem 0.5rem; border-radius: 0.35rem; font-size: 0.68rem; font-weight: 600; white-space: nowrap; }

.alerts-btn-view { display: flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.6rem; background-color: var(--brand-soft); color: var(--brand); border: none; border-radius: 0.4rem; font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: background-color 0.15s; }
.alerts-btn-view:hover { background-color: var(--brand-soft); }

.alerts-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; gap: 0.35rem; }
.alerts-empty-icon { font-size: 2.5rem; color: var(--text-faint); }
.alerts-empty-text { font-size: 0.88rem; color: var(--text-faint); margin: 0; }
.alerts-empty-sub { font-size: 0.75rem; color: var(--text-faint); margin: 0; }

.alerts-mobile-cards { display: none; flex-direction: column; gap: 0.75rem; }
.alerts-mobile-card { width: 100%; text-align: left; border-radius: 0.75rem; padding: 1rem; border: 1.5px solid transparent; background: none; cursor: pointer; transition: all 0.15s; }
.alerts-mobile-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem; }
.alerts-mobile-card-left { display: flex; gap: 0.75rem; flex: 1; min-width: 0; }
.alerts-mobile-icon-wrapper { width: 2.25rem; height: 2.25rem; border-radius: 0.6rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background-color: rgba(255,255,255,0.7); }
.alerts-mobile-card-info { flex: 1; min-width: 0; }
.alerts-mobile-card-badges { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-bottom: 0.25rem; }
.alerts-mobile-card-product { font-size: 0.85rem; font-weight: 600; color: var(--brand); margin: 0; }
.alerts-mobile-card-message { font-size: 0.73rem; color: var(--text-muted); margin: 0.1rem 0 0; }
.alerts-mobile-card-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 0.5rem; margin-top: 0.5rem; border-top: 1px solid transparent; }
.alerts-mobile-date { font-size: 0.68rem; color: var(--text-faint); }
.alerts-mobile-notified { display: flex; align-items: center; gap: 0.25rem; font-size: 0.68rem; color: var(--brand); }

.alerts-rules-container { display: flex; flex-direction: column; gap: 0.75rem; }
.alerts-rules-info-banner { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.65rem 0.85rem; background-color: var(--brand-soft); border: 1px solid var(--brand-soft); border-radius: 0.75rem; }
.alerts-rules-info-text { font-size: 0.78rem; color: var(--brand); margin: 0; line-height: 1.5; }
.alerts-rules-list { display: flex; flex-direction: column; gap: 0.75rem; }
.alerts-rule-card { background-color: var(--surface); border-radius: 0.75rem; border: 1.5px solid transparent; padding: 1rem; transition: opacity 0.2s; }
.alerts-rule-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.75rem; }
.alerts-rule-card-left { display: flex; gap: 0.75rem; flex: 1; min-width: 0; }
.alerts-rule-icon-wrapper { width: 2.5rem; height: 2.5rem; border-radius: 0.6rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background-color 0.2s; }
.alerts-rule-name { font-size: 0.88rem; font-weight: 700; color: var(--brand); margin: 0 0 0.2rem; }
.alerts-rule-desc { font-size: 0.72rem; color: var(--text-muted); margin: 0; line-height: 1.4; }
.alerts-rule-toggle { position: relative; width: 2.5rem; height: 1.25rem; border-radius: 999px; border: none; cursor: pointer; flex-shrink: 0; transition: background-color 0.2s; }
.alerts-rule-toggle-thumb { position: absolute; top: 0.125rem; width: 1rem; height: 1rem; border-radius: 50%; background-color: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: left 0.2s; }
.alerts-rule-threshold { display: flex; align-items: center; gap: 0.5rem; padding-top: 0.65rem; border-top: 1px solid var(--surface-alt); flex-wrap: wrap; }
.alerts-rule-threshold-label { font-size: 0.72rem; color: var(--text-faint); }
.alerts-rule-threshold-value { font-size: 0.88rem; font-weight: 700; }
.alerts-rule-threshold-input { width: 4rem; padding: 0.25rem 0.4rem; border-radius: 0.4rem; border: 1.5px solid transparent; font-size: 0.88rem; font-weight: 700; color: var(--brand); text-align: center; outline: none; }
.alerts-rule-threshold-unit { font-size: 0.72rem; color: var(--text-muted); }
.alerts-rule-threshold-save { margin-left: auto; padding: 0.25rem 0.6rem; background-color: var(--status-ok-bg); color: var(--status-ok-fg); border: none; border-radius: 0.4rem; font-size: 0.72rem; font-weight: 600; cursor: pointer; }
.alerts-rule-threshold-cancel { padding: 0.25rem 0.6rem; background-color: var(--surface-alt); color: var(--text-muted); border: none; border-radius: 0.4rem; font-size: 0.72rem; font-weight: 600; cursor: pointer; }
.alerts-rule-threshold-edit-btn { margin-left: auto; padding: 0.25rem 0.6rem; background-color: var(--surface-alt); color: var(--text-muted); border: none; border-radius: 0.4rem; font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: background-color 0.15s; }
.alerts-rule-threshold-edit-btn:hover { background-color: var(--border); }


.alerts-modal-overlay { position: fixed; inset: 0; z-index: 50; display: flex; align-items: flex-end; justify-content: center; background-color: rgba(0,0,0,0.5); }
.alerts-modal { width: 100%; background-color: var(--surface); border-radius: 1.25rem 1.25rem 0 0; border: 1px solid var(--border); box-shadow: 0 25px 50px rgba(0,0,0,0.15); max-height: 90dvh; overflow-y: auto; }
.alerts-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.1rem 1.25rem 0.75rem; border-bottom: 1px solid var(--surface-alt); position: sticky; top: 0; background-color: var(--surface); }
.alerts-modal-header-left { display: flex; align-items: center; gap: 0.5rem; }
.alerts-modal-id { font-size: 0.82rem; font-weight: 700; color: var(--text-muted); }
.alerts-modal-close { background: none; border: none; cursor: pointer; color: var(--text-faint); font-size: 1rem; padding: 0.25rem; }
.alerts-modal-body { padding: 1rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.85rem; }
.alerts-modal-type-banner { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem; border-radius: 0.75rem; border: 1px solid transparent; }
.alerts-modal-type-icon { width: 2.5rem; height: 2.5rem; border-radius: 0.6rem; background-color: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.alerts-modal-type-label { font-size: 0.78rem; font-weight: 700; margin: 0 0 0.15rem; }
.alerts-modal-product-name { font-size: 1rem; font-weight: 700; color: var(--brand); margin: 0 0 0.1rem; }
.alerts-modal-detail-text { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
.alerts-modal-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.alerts-modal-info-cell { background-color: var(--surface-alt); border: 1px solid var(--border); border-radius: 0.6rem; padding: 0.5rem 0.65rem; }
.alerts-modal-info-label { font-size: 0.65rem; color: var(--text-faint); margin: 0 0 0.15rem; }
.alerts-modal-info-value { font-size: 0.82rem; font-weight: 600; color: var(--text); margin: 0; }
.alerts-modal-actions { display: flex; flex-direction: column; gap: 0.5rem; }
.alerts-modal-btn-acknowledge { width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.65rem; background-color: var(--status-warning-bg); color: var(--status-warning-fg); border: none; border-radius: 0.75rem; font-size: 0.88rem; font-weight: 600; cursor: pointer; transition: background-color 0.15s; }
.alerts-modal-btn-acknowledge:hover { background-color: var(--status-warning-bg); }
.alerts-modal-btn-resolve { width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.65rem; background-color: var(--status-ok-bg); color: var(--status-ok-fg); border: none; border-radius: 0.75rem; font-size: 0.88rem; font-weight: 600; cursor: pointer; transition: background-color 0.15s; }
.alerts-modal-btn-resolve:hover { background-color: var(--status-ok-bg); }
.alerts-modal-btn-discard { width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.65rem; background-color: var(--status-critical-bg); color: var(--status-critical-fg); border: none; border-radius: 0.75rem; font-size: 0.88rem; font-weight: 600; cursor: pointer; transition: background-color 0.15s; }
.alerts-modal-btn-discard:hover { background-color: var(--status-critical-bg); }
.alerts-modal-btn-close { width: 100%; padding: 0.65rem; background-color: var(--brand); color: var(--surface); border: none; border-radius: 0.75rem; font-size: 0.88rem; font-weight: 600; cursor: pointer; transition: background-color 0.15s; }
.alerts-modal-btn-close:hover { background-color: var(--brand); }

@media (max-width: 767px) {
  .alerts-table-wrapper { display: none; }
  .alerts-mobile-cards { display: flex; }
}
@media (min-width: 768px) {
  .alerts-stats-bar { grid-template-columns: repeat(4, 1fr); }
  .alerts-modal-overlay { align-items: center; }
  .alerts-modal { width: 440px; border-radius: 1.25rem; }
}
</style>