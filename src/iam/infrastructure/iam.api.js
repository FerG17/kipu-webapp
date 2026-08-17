import { BaseApi } from '../../shared/infrastructure/base-api.js';
import { BaseEndpoint } from '../../shared/infrastructure/base-endpoint.js';

const usersEndpointPath     = import.meta.env.VITE_USERS_ENDPOINT_PATH;
const rolesEndpointPath     = import.meta.env.VITE_ROLES_ENDPOINT_PATH;
const businessesEndpointPath = import.meta.env.VITE_BUSINESSES_ENDPOINT_PATH;

/**
 * Not resource-scoped like the other endpoints (no collection to filter/page
 * through) — sign-in/sign-up are actions, called directly via BaseApi's http
 * client rather than through a BaseEndpoint instance.
 */
const authenticationEndpointPath = import.meta.env.VITE_AUTHENTICATION_ENDPOINT_PATH ?? '/authentication';

/**
 * Infrastructure gateway for the Identity & Access Management bounded context.
 * Handles sign-in, sign-up, and user/role CRUD operations.
 *
 * Phase 2: signIn/signUp now call the real backend
 * (POST /authentication/sign-in, POST /authentication/sign-up), which
 * returns a real JWT — replacing the old mock hack of filtering /users by
 * email and comparing the password on the client.
 *
 * @class IamApi
 * @extends BaseApi
 */
export class IamApi extends BaseApi {
    /**
     * @private
     * @type {BaseEndpoint}
     */
    #usersEndpoint;

    /**
     * @private
     * @type {BaseEndpoint}
     */
    #rolesEndpoint;

    /**
     * @private
     * @type {BaseEndpoint}
     */
    #businessesEndpoint;

    /** Creates endpoint clients for users, roles and businesses. */
    constructor() {
        super();
        this.#usersEndpoint      = new BaseEndpoint(this, usersEndpointPath);
        this.#rolesEndpoint      = new BaseEndpoint(this, rolesEndpointPath);
        this.#businessesEndpoint = new BaseEndpoint(this, businessesEndpointPath);
    }

    /**
     * Authenticates a user against the real backend.
     * @param {string} email
     * @param {string} password
     * @returns {Promise<import('axios').AxiosResponse>} AuthenticatedUserResource (user fields + JWT token).
     */
    signIn(email, password) {
        return this.http.post(`${authenticationEndpointPath}/sign-in`, { email, password });
    }

    /**
     * Creates a User and its Business atomically, and returns a JWT — the
     * account is usable immediately, no separate sign-in step needed.
     * @param {Object} resource - { email, password, name, lastName, phone, businessName, businessType, ruc, address }
     * @returns {Promise<import('axios').AxiosResponse>} AuthenticatedUserResource (user fields + JWT token).
     */
    signUp(resource) {
        return this.http.post(`${authenticationEndpointPath}/sign-up`, resource);
    }

    /**
     * Ends the current session server-side: clears the httpOnly session
     * cookie and revokes the token everywhere (see AuthenticationController).
     * @returns {Promise<import('axios').AxiosResponse>} 204 No Content.
     */
    signOut() {
        return this.http.post(`${authenticationEndpointPath}/sign-out`);
    }

    /**
     * Fetches all user accounts scoped to the given business.
     * @param {number|string} businessId
     * @returns {Promise<import('axios').AxiosResponse>} User resources for that business.
     */
    getUsers(businessId) {
        return this.#usersEndpoint.getAllByParam('businessId', businessId);
    }

    /**
     * Fetches a single user account by its identifier.
     * @param {number|string} id - User identifier.
     * @returns {Promise<import('axios').AxiosResponse>} User resource.
     */
    getUserById(id) {
        return this.#usersEndpoint.getById(id);
    }

    /**
     * Invites (creates) a new team member for the current business via the
     * real backend's dedicated endpoint — distinct from signUp, which also
     * creates a brand-new Business and is only for the first account.
     * @param {Object} resource - { email, password, name, lastName, roleId, phone }
     * @returns {Promise<import('axios').AxiosResponse>} Created user resource.
     */
    inviteUser(resource) {
        return this.#usersEndpoint.create(resource);
    }

    /**
     * Updates an existing user account.
     * @param {Object} resource - Updated user resource payload (must include id).
     * @returns {Promise<import('axios').AxiosResponse>} Updated user resource.
     */
    updateUser(resource) {
        return this.#usersEndpoint.update(resource.id, resource);
    }

    /**
     * Changes a user's password via the real backend's dedicated endpoint,
     * which verifies currentPassword server-side with BCrypt (401 if wrong)
     * and hashes newPassword before persisting.
     * @param {number|string} id - User identifier.
     * @param {string} currentPassword
     * @param {string} newPassword
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    changePassword(id, currentPassword, newPassword) {
        return this.http.post(`${usersEndpointPath}/${id}/change-password`, { currentPassword, newPassword });
    }

    /**
     * Deletes a user account by its identifier.
     * @param {number|string} id - User identifier.
     * @returns {Promise<import('axios').AxiosResponse>} Delete response.
     */
    deleteUser(id) {
        return this.#usersEndpoint.delete(id);
    }

    /**
     * Suspends a team member's access without deleting the account.
     * @param {number|string} id - User identifier.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    deactivateUser(id) {
        return this.http.patch(`${usersEndpointPath}/${id}/deactivate`);
    }

    /**
     * Restores a previously suspended team member's access.
     * @param {number|string} id - User identifier.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    reactivateUser(id) {
        return this.http.patch(`${usersEndpointPath}/${id}/reactivate`);
    }

    /**
     * Fetches all available roles.
     * @returns {Promise<import('axios').AxiosResponse>} All role resources.
     */
    getRoles() {
        return this.#rolesEndpoint.getAll();
    }

    /**
     * Fetches a single business by its identifier.
     * @param {number|string} id - Business identifier.
     * @returns {Promise<import('axios').AxiosResponse>} Business resource.
     */
    getBusinessById(id) {
        return this.#businessesEndpoint.getById(id);
    }

    /**
     * Updates an existing business (profile fields and/or plan).
     * @param {number|string} id - Business identifier.
     * @param {Object} resource - Updated business resource payload.
     * @returns {Promise<import('axios').AxiosResponse>} Updated business resource.
     */
    updateBusiness(id, resource) {
        return this.#businessesEndpoint.update(id, resource);
    }

    /**
     * Creates a new business. Used on sign-up so a new account is actually
     * linked to a business instead of being left with businessId: null.
     * @param {Object} resource
     * @returns {Promise<import('axios').AxiosResponse>} Created business resource.
     */
    createBusiness(resource) {
        return this.#businessesEndpoint.create(resource);
    }
}
