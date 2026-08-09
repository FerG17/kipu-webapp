import { BaseApi }      from '../../shared/infrastructure/base-api.js';
import { BaseEndpoint } from '../../shared/infrastructure/base-endpoint.js';

const alertsEndpointPath     = import.meta.env.VITE_ALERTS_ENDPOINT_PATH;
const alertRulesEndpointPath = import.meta.env.VITE_ALERT_RULES_ENDPOINT_PATH;

/**
 * Infrastructure gateway for the Alerts & Operational Monitoring bounded-context endpoints.
 *
 * The real backend persists alerts server-side (a reactive event-driven
 * engine plus a periodic expiration sweep) and exposes real, configurable
 * AlertRule resources — there is no client-side re-evaluation or synthesis
 * here anymore.
 *
 * @class AlertsApi
 * @extends BaseApi
 */
export class AlertsApi extends BaseApi {
    /** @type {BaseEndpoint} @private */
    #alertsEndpoint;

    constructor() {
        super();
        this.#alertsEndpoint = new BaseEndpoint(this, alertsEndpointPath);
    }

    /**
     * Fetches active (non-resolved) alerts for the authenticated business.
     * Scoping to the business happens server-side via the JWT.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getActiveAlerts() {
        return this.#alertsEndpoint.getAll();
    }

    /**
     * Fetches resolved alerts (immutable history) for the authenticated business.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getAlertHistory() {
        return this.http.get(`${alertsEndpointPath}/history`);
    }

    /**
     * Acknowledges an alert — a domain action (POST), not a field replacement.
     * Business rule: only ACTIVE alerts may be acknowledged.
     * @param {number|string} id - Alert identifier.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    acknowledgeAlert(id) {
        return this.http.post(`${alertsEndpointPath}/${id}/acknowledge`);
    }

    /**
     * Resolves an alert — a domain action (POST), not a field replacement.
     * Business rule: only non-RESOLVED alerts may be resolved (409 otherwise).
     * @param {number|string} id - Alert identifier.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    resolveAlert(id) {
        return this.http.post(`${alertsEndpointPath}/${id}/resolve`);
    }

    // ─── Alert rules ────────────────────────────────────────────────────────

    /**
     * Fetches the configured alert rules for the authenticated business.
     * Only rule types the business has explicitly saved come back — a type
     * with no row yet behaves as Enabled=true server-side (see
     * StockLevelChangedEventHandler/BatchRegisteredEventHandler).
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    getAlertRules() {
        return this.http.get(alertRulesEndpointPath);
    }

    /**
     * Creates or updates the rule for a given alert type (upsert — one rule
     * per business+type).
     * @param {Object} resource - { alertType, thresholdValue, enabled }
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    createOrUpdateAlertRule(resource) {
        return this.http.post(alertRulesEndpointPath, resource);
    }
}
