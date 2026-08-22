/**
 * UserAccount entity within the Identity & Access Management bounded context.
 * Represents a registered user of Kipu.
 *
 * Business rules:
 * - Email must be a valid address (contains '@' and a domain).
 * - Password is intentionally excluded from the entity to avoid exposing
 *   it outside the authentication flow.
 * - A user may be linked to exactly one business via businessId.
 * - Status transitions: ACTIVE → INACTIVE or ACTIVE → BLOCKED.
 *
 * @class UserAccount
 */
export class UserAccount {
    /**
     * @param {Object} params - Entity attributes.
     * @param {?number} [params.id=null] - User identifier.
     * @param {string} [params.email=''] - User email address (used for authentication).
     * @param {string} [params.firstName=''] - User first name.
     * @param {string} [params.lastName=''] - User last name.
     * @param {?number} [params.businessId=null] - Foreign key of the associated business.
     * @param {string} [params.status='ACTIVE'] - Account status: ACTIVE, INACTIVE, or BLOCKED.
     * @param {?number} [params.roleId=null] - Foreign key of the assigned role.
     * @param {string} [params.phone=''] - User contact phone number (optional).
     */
    constructor({
                    id = null,
                    email = '',
                    firstName = '',
                    lastName = '',
                    businessId = null,
                    status = 'ACTIVE',
                    roleId = null,
                    phone = ''
                }) {
        this.id = id;
        this.email = email;
        this.firstName = firstName;
        this.lastName = lastName;
        this.businessId = businessId;
        this.status = status;
        this.roleId = roleId;
        this.phone = phone;
    }

    /**
     * Returns the full display name of the user.
     * @returns {string} Full name in "First Last" format.
     */
    get fullName() {
        return `${this.firstName} ${this.lastName}`.trim();
    }

    /**
     * Returns the initials of the user (up to 2 letters), used for avatar display.
     * @returns {string}
     */
    get initials() {
        const firstInitial = this.firstName ? this.firstName.charAt(0).toUpperCase() : '';
        const lastInitial  = this.lastName  ? this.lastName.charAt(0).toUpperCase()  : '';
        return `${firstInitial}${lastInitial}`;
    }

    /**
     * Returns true if the user account is currently active.
     * @returns {boolean}
     */
    get isActive() {
        return this.status === 'ACTIVE';
    }

    /**
     * Returns true if the email address has a valid format.
     * Business rule: email must contain '@' and have a non-empty domain.
     * @returns {boolean}
     */
    get isEmailValid() {
        const parts = this.email.split('@');
        return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
    }
}
