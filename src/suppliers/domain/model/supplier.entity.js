/**
 * Enumeration of the supported supplier statuses
 * within the Supplier & Replenishment Management bounded context.
 *
 * Business rules:
 * - ACTIVE:   Supplier is available for new purchase orders.
 * - INACTIVE: Supplier has been deactivated; no new orders can be created for it.
 *
 * @enum {string}
 */
export const SupplierStatus = Object.freeze({
    ACTIVE:   'ACTIVE',
    INACTIVE: 'INACTIVE'
});

/**
 * Supplier entity within the Supplier & Replenishment Management bounded context.
 * Represents a company or individual that provides products to the business.
 *
 * Business rules:
 * - name (razón social) and ruc are required and must be non-empty strings.
 * - ruc must be exactly 11 digits (Peruvian tax identifier).
 * - phone must be provided; email and address are optional.
 * - status defaults to ACTIVE on creation.
 * - category shares the same taxonomy as Product & Inventory Management's
 *   ProductCategory (see product/presentation/category-options.js), instead
 *   of a separate fixed enum — a supplier's category represents what kind of
 *   products it supplies, so it reuses the categories the business already
 *   manages for its products. Defaults to 'OTHER' when not specified.
 *
 * @class Supplier
 */
export class Supplier {
    /**
     * @param {Object}      params
     * @param {number|null} [params.id=null]
     * @param {number|null} [params.businessId=null]
     * @param {string}      [params.name='']          - Business name (razón social).
     * @param {string}      [params.lastName='']      - Last name or second part of business name.
     * @param {string}      [params.ruc='']           - Peruvian tax identifier (11 digits).
     * @param {string}      [params.email='']
     * @param {string}      [params.phone='']
     * @param {string}      [params.address='']
     * @param {string}      [params.contactPerson=''] - Representative contact name.
     * @param {string}      [params.category='OTHER']
     * @param {string}      [params.status=SupplierStatus.ACTIVE]
     * @param {string}      [params.since='']         - ISO date when supplier relationship started.
     */
    constructor({
                    id            = null,
                    businessId    = null,
                    name          = '',
                    lastName      = '',
                    ruc           = '',
                    email         = '',
                    phone         = '',
                    address       = '',
                    contactPerson = '',
                    category      = 'OTHER',
                    status        = SupplierStatus.ACTIVE,
                    since         = ''
                }) {
        this.id            = id;
        this.businessId    = businessId;
        this.name          = name;
        this.lastName      = lastName;
        this.ruc           = ruc;
        this.email         = email;
        this.phone         = phone;
        this.address       = address;
        this.contactPerson = contactPerson;
        this.category      = category;
        this.status        = status;
        this.since         = since;
    }

    /**
     * Returns the full business name combining name and lastName.
     * @returns {string}
     */
    get fullName() {
        return this.lastName ? `${this.name} ${this.lastName}` : this.name;
    }

    /**
     * Returns true when the supplier is available for new purchase orders.
     * @returns {boolean}
     */
    get isActive() {
        return this.status === SupplierStatus.ACTIVE;
    }

    /**
     * Validates that the RUC is exactly 11 numeric digits.
     * @returns {boolean}
     */
    get hasValidRuc() {
        return /^\d{11}$/.test(this.ruc);
    }
}
