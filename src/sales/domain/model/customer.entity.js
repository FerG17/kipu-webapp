/**
 * Customer entity within the Sales & POS Management bounded context.
 * Represents a registered buyer associated with a business.
 *
 * Business rules:
 * - fullName must be a non-empty string.
 * - documentNumber is the DNI or RUC identifier; optional but must be
 *   unique within a business when provided.
 * - phoneNumber is optional.
 * - A Customer belongs to exactly one Business (businessId).
 *
 * @class Customer
 */
export class Customer {
    /**
     * @param {Object}      params
     * @param {number|null} [params.id=null]             - Customer identifier (null before persisting).
     * @param {number|null} [params.businessId=null]     - Foreign key of the owning Business.
     * @param {string}      [params.fullName='']         - Full display name of the customer.
     * @param {string}      [params.documentNumber='']   - DNI or RUC number.
     * @param {string}      [params.phoneNumber='']      - Contact phone number.
     * @param {string}      [params.email='']            - Contact email address (optional).
     * @param {string}      [params.registeredAt='']     - ISO 8601 timestamp of registration.
     */
    constructor({
                    id             = null,
                    businessId     = null,
                    fullName       = '',
                    documentNumber = '',
                    phoneNumber    = '',
                    email          = '',
                    registeredAt   = ''
                }) {
        this.id             = id;
        this.businessId     = businessId;
        this.fullName       = fullName;
        this.documentNumber = documentNumber;
        this.phoneNumber    = phoneNumber;
        this.email          = email;
        this.registeredAt   = registeredAt;
    }

    /**
     * Returns a short display label combining the full name and document number.
     * Used for dropdown options and table displays.
     *
     * @returns {string} Display label in the format "Full Name (DNI: XXXXXXXX)" or just "Full Name".
     */
    get displayLabel() {
        if (this.documentNumber) {
            return `${this.fullName} (DNI: ${this.documentNumber})`;
        }
        return this.fullName;
    }
}