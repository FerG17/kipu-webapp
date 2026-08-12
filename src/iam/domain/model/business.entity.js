/**
 * The one business type this product supports. This is a single bodega's
 * own inventory/sales/supplier system, not a multi-vertical SaaS — the
 * FARMACIA option that used to live here (and the sign-up/settings picker
 * built around it) implied the opposite. The backend stores `type` as a
 * plain string with no server-side enum restriction, so this only exists to
 * keep the one legitimate value named instead of a magic string.
 * @enum {string}
 */
export const BusinessType = Object.freeze({
    BODEGA: 'BODEGA'
});

/**
 * Business entity within the Identity & Access Management bounded context.
 * Represents the tenant (bodega) that owns products, sales, suppliers and alerts.
 *
 * Business rules:
 * - name and ruc are required, non-empty strings.
 * - ruc must be exactly 11 digits (Peruvian tax identifier).
 * - type must be one of BusinessType.
 *
 * @class Business
 */
export class Business {
    /**
     * @param {Object}      params
     * @param {number|null} [params.id=null]
     * @param {string}      [params.name='']    - Commercial name.
     * @param {string}      [params.type=BusinessType.BODEGA]
     * @param {string}      [params.address='']
     * @param {string}      [params.ruc='']      - Peruvian tax identifier (11 digits).
     * @param {number|null} [params.userId=null] - Owner/admin user identifier.
     */
    constructor({
                    id      = null,
                    name    = '',
                    type    = BusinessType.BODEGA,
                    address = '',
                    ruc     = '',
                    userId  = null
                }) {
        this.id      = id;
        this.name    = name;
        this.type    = type;
        this.address = address;
        this.ruc     = ruc;
        this.userId  = userId;
    }

    /**
     * Validates that the RUC is exactly 11 numeric digits.
     * @returns {boolean}
     */
    get hasValidRuc() {
        return /^\d{11}$/.test(this.ruc);
    }
}
