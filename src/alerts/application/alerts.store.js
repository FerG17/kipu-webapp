/**
 * Application service store for the Alerts & Operational Monitoring bounded context.
 *
 * Business rules enforced here:
 * - fetchAlerts loads both active (ACTIVE/ACKNOWLEDGED/SENT) and resolved
 *   alerts for the authenticated business — the real backend persists and
 *   evaluates alerts entirely server-side (reactive event handlers +
 *   AlertExpirationSweepJob), so there is no client-side re-evaluation here
 *   anymore.
 * - Only ACTIVE alerts may be acknowledged (→ ACKNOWLEDGED).
 * - Only non-RESOLVED alerts may be resolved (→ RESOLVED).
 * - OUT_OF_STOCK and EXPIRED alerts always count as critical regardless of severity field.
 * - filterByType sorts EXPIRATION/EXPIRED ascending by date (most urgent first).
 * - filterByType sorts LOW_STOCK/OUT_OF_STOCK descending by severity (HIGH first).
 * - LOW_STOCK/OUT_OF_STOCK alerts are scoped per (product, warehouse): a
 *   product split across warehouses can be low in one and healthy in
 *   another, so alert.warehouseId says which one — see
 *   active-alerts-dashboard.vue's warehouse-name resolution.
 * - Alert rules are real, per-business, backend-configured resources
 *   (/alert-rules) — only Enabled matters for LOW_STOCK/OUT_OF_STOCK (the
 *   real threshold is each product's own minimumStock); ThresholdValue is
 *   only meaningful for EXPIRATION (days before expiry to warn).
 *
 * @module useAlertsStore
 */
import { defineStore }   from 'pinia';
import { computed, ref } from 'vue';
import { AlertsApi }     from '../infrastructure/alerts.api.js';
import { AlertAssembler } from '../infrastructure/alert.assembler.js';
import { AlertStatus, AlertType, AlertSeverity } from '../domain/model/alert.entity.js';

const alertsApi = new AlertsApi();

/**
 * Numeric weight for sorting severity levels highest to lowest urgency.
 * @param {string} severity
 * @returns {number}
 */
function severityWeight(severity) {
    if (severity === AlertSeverity.HIGH)   return 3;
    if (severity === AlertSeverity.MEDIUM) return 2;
    return 1;
}

const useAlertsStore = defineStore('alerts', () => {

    /** @type {import('vue').Ref<import('../domain/model/alert.entity.js').Alert[]>} */
    const alerts = ref([]);

    /** @type {import('vue').Ref<boolean>} */
    const alertsLoaded = ref(false);

    /**
     * Alert rules, one per real backend AlertType — LOW_STOCK and
     * OUT_OF_STOCK only ever expose `active` (their threshold is each
     * product's own minimumStock, not configurable here); EXPIRATION also
     * exposes an editable `threshold` (days), which governs both the
     * "expiring soon" and the "already expired" alerts server-side (there is
     * no separate EXPIRED rule on the backend).
     *
     * Populated from the real /alert-rules endpoint on fetchAlertRules — a
     * type with no saved row yet keeps this default (Enabled=true
     * server-side, matching the backend's own `?? true` fallback).
     *
     * @type {import('vue').Ref<Object[]>}
     */
    const alertRules = ref([
        {
            type:         AlertType.LOW_STOCK,
            nameKey:      'alerts.rule-low-stock-name',
            descKey:      'alerts.rule-low-stock-desc',
            unitKey:      'alerts.rule-unit-units',
            active:       true,
            threshold:    0,
            hasThreshold: false
        },
        {
            type:         AlertType.OUT_OF_STOCK,
            nameKey:      'alerts.rule-out-of-stock-name',
            descKey:      'alerts.rule-out-of-stock-desc',
            unitKey:      'alerts.rule-unit-units',
            active:       true,
            threshold:    0,
            hasThreshold: false
        },
        {
            type:         AlertType.EXPIRATION,
            nameKey:      'alerts.rule-expiration-name',
            descKey:      'alerts.rule-expiration-desc',
            unitKey:      'alerts.rule-unit-days',
            active:       true,
            threshold:    7,
            hasThreshold: true
        }
    ]);

    /** @type {import('vue').Ref<boolean>} */
    const alertRulesLoaded = ref(false);

    // ---- Computed ----

    /** @type {import('vue').ComputedRef<number>} */
    const alertsCount = computed(() => alerts.value.length);

    /**
     * Number of alerts whose status is ACTIVE.
     * @type {import('vue').ComputedRef<number>}
     */
    const activeAlertsCount = computed(() =>
        alerts.value.filter(alert => alert.status === AlertStatus.ACTIVE).length
    );

    /**
     * Number of alerts that are critical and still active.
     * Business rule: OUT_OF_STOCK, EXPIRED types, or HIGH severity count as critical.
     * @type {import('vue').ComputedRef<number>}
     */
    const criticalActiveCount = computed(() =>
        alerts.value.filter(alert => alert.isActive && alert.isCritical).length
    );

    /**
     * Number of LOW_STOCK and OUT_OF_STOCK active alerts combined.
     * @type {import('vue').ComputedRef<number>}
     */
    const lowStockActiveCount = computed(() =>
        alerts.value.filter(
            alert => (alert.type === AlertType.LOW_STOCK || alert.type === AlertType.OUT_OF_STOCK)
                && alert.status === AlertStatus.ACTIVE
        ).length
    );

    /**
     * Number of EXPIRATION and EXPIRED active alerts combined.
     * @type {import('vue').ComputedRef<number>}
     */
    const expirationActiveCount = computed(() =>
        alerts.value.filter(
            alert => (alert.type === AlertType.EXPIRATION || alert.type === AlertType.EXPIRED)
                && alert.status === AlertStatus.ACTIVE
        ).length
    );

    // ----- Queries  -----

    /**
     * @param {number|string} id
     * @returns {import('../domain/model/alert.entity.js').Alert|undefined}
     */
    function getAlertById(id) {
        return alerts.value.find(alert => alert.id === parseInt(id));
    }

    /**
     * Returns alerts filtered by type with business-rule sorting applied.
     * @param {string} type - One of AlertType values.
     * @returns {import('../domain/model/alert.entity.js').Alert[]}
     */
    function filterByType(type) {
        const filtered = alerts.value.filter(alert => alert.type === type);
        if (type === AlertType.EXPIRATION || type === AlertType.EXPIRED) {
            return filtered.slice().sort(
                (alertA, alertB) => new Date(alertA.date).getTime() - new Date(alertB.date).getTime()
            );
        }
        return filtered.slice().sort(
            (alertA, alertB) => severityWeight(alertB.severity) - severityWeight(alertA.severity)
        );
    }

    /**
     * Returns alerts filtered by status.
     * @param {string} status - One of AlertStatus values.
     * @returns {import('../domain/model/alert.entity.js').Alert[]}
     */
    function filterByStatus(status) {
        return alerts.value.filter(alert => alert.status === status);
    }

    // ----- Commands -----

    /**
     * Loads both active (ACTIVE/ACKNOWLEDGED/SENT) and resolved alerts for
     * the authenticated business — scoping happens server-side via the JWT,
     * so no businessId parameter is needed anymore.
     * @returns {Promise<void>}
     */
    function fetchAlerts() {
        alertsLoaded.value = false;
        return Promise.all([alertsApi.getActiveAlerts(), alertsApi.getAlertHistory()])
            .then(([activeResponse, historyResponse]) => {
                const active  = AlertAssembler.toEntitiesFromResponse(activeResponse);
                const history = AlertAssembler.toEntitiesFromResponse(historyResponse);
                alerts.value       = [...active, ...history];
                alertsLoaded.value = true;
            })
            .catch(() => {
                alertsLoaded.value = true;
            });
    }

    /**
     * Loads the configured alert rules for the authenticated business and
     * merges them into the default rule list (a type with no saved row yet
     * keeps its default: Enabled=true, matching the backend's own fallback).
     * @returns {Promise<void>}
     */
    function fetchAlertRules() {
        return alertsApi.getAlertRules()
            .then(response => {
                const rawRules = response.data instanceof Array ? response.data : [];
                alertRules.value = alertRules.value.map(defaultRule => {
                    const saved = rawRules.find(raw => raw.alertType === defaultRule.type);
                    return saved
                        ? { ...defaultRule, active: saved.enabled, threshold: saved.thresholdValue }
                        : defaultRule;
                });
                alertRulesLoaded.value = true;
            })
            .catch(() => {
                alertRulesLoaded.value = true;
            });
    }

    /**
     * Acknowledges an alert — transitions ACTIVE → ACKNOWLEDGED.
     * Business rule: only ACTIVE alerts may be acknowledged.
     * @param {import('../domain/model/alert.entity.js').Alert} alert
     * @returns {Promise<import('../domain/model/alert.entity.js').Alert>}
     */
    function acknowledgeAlert(alert) {
        if (alert.status !== AlertStatus.ACTIVE) return Promise.resolve(alert);

        return alertsApi.acknowledgeAlert(alert.id)
            .then(response => {
                const updatedAlert = AlertAssembler.toEntityFromResource(response.data);
                const index = alerts.value.findIndex(existing => existing.id === updatedAlert.id);
                if (index !== -1) alerts.value[index] = updatedAlert;
                return updatedAlert;
            });
    }

    /**
     * Resolves an alert — transitions ACTIVE/ACKNOWLEDGED/SENT → RESOLVED.
     * Business rule: RESOLVED alerts are immutable (409 from the backend).
     * @param {import('../domain/model/alert.entity.js').Alert} alert
     * @returns {Promise<import('../domain/model/alert.entity.js').Alert>}
     */
    function resolveAlert(alert) {
        if (alert.status === AlertStatus.RESOLVED) return Promise.resolve(alert);

        return alertsApi.resolveAlert(alert.id)
            .then(response => {
                const updatedAlert = AlertAssembler.toEntityFromResource(response.data);
                const index = alerts.value.findIndex(existing => existing.id === updatedAlert.id);
                if (index !== -1) alerts.value[index] = updatedAlert;
                return updatedAlert;
            });
    }

    /**
     * Toggles a rule's enabled state on/off, persisting it via the real
     * alert-rules endpoint (upsert — creates the row the first time a type
     * is ever touched).
     * @param {string} type - One of AlertType values.
     * @returns {Promise<void>}
     */
    function toggleAlertRule(type) {
        const rule = alertRules.value.find(existingRule => existingRule.type === type);
        if (!rule) return Promise.resolve();

        return alertsApi.createOrUpdateAlertRule({
            alertType:      type,
            thresholdValue: rule.threshold,
            enabled:        !rule.active
        })
            .then(response => {
                rule.active    = response.data.enabled;
                rule.threshold = response.data.thresholdValue;
                // Disabling a rule resolves its active alerts server-side
                // right away (see AlertRuleCommandService) — refresh so they
                // drop out of "Activas" without needing a page reload.
                return fetchAlerts();
            });
    }

    /**
     * Updates the threshold (days) of the EXPIRATION rule — the only rule
     * type where a threshold is meaningful server-side.
     * Business rule: threshold must be ≥ 0.
     * @param {string} type - One of AlertType values.
     * @param {number} newThreshold
     * @returns {Promise<void>}
     */
    function updateAlertRuleThreshold(type, newThreshold) {
        if (newThreshold < 0) return Promise.resolve();
        const rule = alertRules.value.find(existingRule => existingRule.type === type);
        if (!rule) return Promise.resolve();

        return alertsApi.createOrUpdateAlertRule({
            alertType:      type,
            thresholdValue: newThreshold,
            enabled:        rule.active
        })
            .then(response => {
                rule.threshold = response.data.thresholdValue;
                rule.active    = response.data.enabled;
            });
    }

    return {
        alerts,
        alertsLoaded,
        alertRules,
        alertRulesLoaded,
        alertsCount,
        activeAlertsCount,
        criticalActiveCount,
        lowStockActiveCount,
        expirationActiveCount,
        getAlertById,
        filterByType,
        filterByStatus,
        fetchAlerts,
        fetchAlertRules,
        acknowledgeAlert,
        resolveAlert,
        toggleAlertRule,
        updateAlertRuleThreshold
    };
});

export default useAlertsStore;
