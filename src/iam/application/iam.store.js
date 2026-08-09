/**
 * Application service store for the Identity & Access Management bounded context.
 * Coordinates sign-in, sign-up, sign-out and user management use cases.
 *
 * Business rules enforced here:
 * - Sign-in requires a non-empty email containing '@' and a non-empty password.
 * - Password must match the stored value (client-side check against mock API).
 * - Sign-up requires a business name, a full name, a valid email, a password
 *   of at least 6 characters, and matching confirmation.
 * - Only one user can be authenticated at a time (currentUser).
 *
 * @module useIamStore
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { IamApi } from '../infrastructure/iam.api.js';
import { AuthProvider } from '../infrastructure/auth-provider.js';
import { UserAccountAssembler } from '../infrastructure/user-account.assembler.js';
import { BusinessAssembler } from '../infrastructure/business.assembler.js';
import { UserAccount } from '../domain/model/user-account.entity.js';
import { SESSION_EXPIRED_EVENT } from '../../shared/infrastructure/base-api.js';

const iamApi = new IamApi();
const authProvider = new AuthProvider();

/**
 * Reactive store that exposes IAM commands and queries.
 *
 * @returns {Object} Store state and actions.
 */
const useIamStore = defineStore('iam', () => {
    /**
     * The currently authenticated user.
     * @type {import('vue').Ref<UserAccount|null>}
     */
    const currentUser = ref(null);

    /**
     * All loaded user accounts (for user management view).
     * @type {import('vue').Ref<UserAccount[]>}
     */
    const users = ref([]);

    /**
     * All available roles, fetched from the API.
     * @type {import('vue').Ref<Array<{id: number, position: string}>>}
     */
    const roles = ref([]);

    /**
     * The business (tenant) the current user belongs to.
     * @type {import('vue').Ref<import('../domain/model/business.entity.js').Business|null>}
     */
    const currentBusiness = ref(null);

    /**
     * Whether the user list has been loaded from the API.
     * @type {import('vue').Ref<boolean>}
     */
    const usersLoaded = ref(false);

    /**
     * Whether the role list has been loaded from the API.
     * @type {import('vue').Ref<boolean>}
     */
    const rolesLoaded = ref(false);

    /**
     * Whether the current business has been loaded from the API.
     * @type {import('vue').Ref<boolean>}
     */
    const businessLoaded = ref(false);

    /**
     * Whether there is an authenticated user session.
     * @type {import('vue').Ref<boolean>}
     */
    const isAuthenticated = ref(false);

    /**
     * Errors encountered during API or validation operations.
     * @type {import('vue').Ref<string[]>}
     */
    const errors = ref([]);

    /**
     * LocalStorage key under which the active session is persisted so the
     * authenticated user (and its businessId) survives a page reload.
     * @type {string}
     */
    const SESSION_STORAGE_KEY = 'bodega.session';

    /**
     * Serialises a UserAccount entity into a plain resource (password excluded)
     * suitable for persisting in localStorage and re-feeding to the assembler.
     * @param {UserAccount} user
     * @returns {Object}
     */
    function toPersistableResource(user) {
        return {
            id:         user.id,
            email:      user.email,
            name:       user.firstName,
            lastName:   user.lastName,
            businessId: user.businessId,
            status:     user.status,
            roleId:     user.roleId,
            phone:      user.phone
        };
    }

    /**
     * Persists the current session so it survives a page reload.
     * @param {UserAccount} user
     * @returns {void}
     */
    function persistSession(user) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toPersistableResource(user)));
    }

    /**
     * Removes any persisted session from localStorage.
     * @returns {void}
     */
    function clearSession() {
        localStorage.removeItem(SESSION_STORAGE_KEY);
    }

    /**
     * Rehydrates the session from localStorage on store initialisation so a
     * page reload keeps the user authenticated and the businessId available.
     * @returns {void}
     */
    function restoreSession() {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return;
        try {
            currentUser.value     = UserAccountAssembler.toEntityFromResource(JSON.parse(raw));
            isAuthenticated.value = true;
        } catch (error) {
            clearSession();
        }
    }

    restoreSession();

    // When BaseApi sees a 401, it clears the token and dispatches this event.
    // Wired here (not in BaseApi) so the shared/infrastructure layer never
    // depends on IAM. Never fires today since no real token is issued yet.
    window.addEventListener(SESSION_EXPIRED_EVENT, () => signOut());

    /**
     * Number of loaded user accounts.
     * @type {import('vue').ComputedRef<number>}
     */
    const usersCount = computed(() => {
        return usersLoaded.value ? users.value.length : 0;
    });

    /**
     * Validates sign-in credentials against the mock API.
     * Business rule: email must be valid; password must match stored value.
     *
     * @param {string} email - User email address.
     * @param {string} password - User password (plain text for mock).
     * @returns {Promise<import('../domain/model/user-account.entity.js').UserAccount>}
     */
    function signIn(email, password) {
        errors.value = [];

        if (!email || !password) {
            errors.value.push('sign-in.error-empty');
            return Promise.reject(new Error('sign-in.error-empty'));
        }
        if (!email.includes('@')) {
            errors.value.push('sign-in.error-invalid-email');
            return Promise.reject(new Error('sign-in.error-invalid-email'));
        }

        return authProvider.signIn(email, password).then(matchedResource => {
            currentUser.value = UserAccountAssembler.toEntityFromResource(matchedResource);
            isAuthenticated.value = true;
            persistSession(currentUser.value);
            return currentUser.value;
        }).catch(error => {
            errors.value.push(error.message);
            throw error;
        });
    }

    /**
     * Registers a new user and business account.
     * Business rule: businessName, fullName, valid email, password >= 6 chars,
     * and password confirmation must match (enforced by the Sign Up view).
     *
     * Phase 2: the backend creates the User and its Business atomically in a
     * single request and returns a JWT — this used to be a client-side chain
     * of 3 calls (create user → create business → PUT user to link them),
     * which is exactly the shape of bug that left businessId permanently null
     * if any step failed partway. The backend also no longer provisions a
     * default warehouse here (that's Product & Inventory's job once that
     * bounded context exists — see the backend's TODO in
     * UserCommandService.Handle(SignUpCommand)), so a freshly-registered
     * business has zero warehouses until Phase 3.
     *
     * @param {Object} payload - Registration form data.
     * @param {string} payload.businessName - Name of the business.
     * @param {string} [payload.businessType] - BODEGA or FARMACIA.
     * @param {string} payload.fullName - Full name of the user.
     * @param {string} payload.email - Email address.
     * @param {string} payload.password - Password (min 6 characters).
     * @returns {Promise<import('../domain/model/user-account.entity.js').UserAccount>}
     */
    function signUp(payload) {
        errors.value = [];

        const resource = {
            name:         payload.fullName.split(' ')[0] ?? payload.fullName,
            lastName:     payload.fullName.split(' ').slice(1).join(' ') ?? '',
            email:        payload.email,
            password:     payload.password,
            businessName: payload.businessName,
            businessType: payload.businessType || 'BODEGA'
        };

        return authProvider.signUp(resource)
            .then(authenticatedResource => {
                currentUser.value = UserAccountAssembler.toEntityFromResource(authenticatedResource);
                isAuthenticated.value = true;
                persistSession(currentUser.value);
                return currentUser.value;
            })
            .catch(error => {
                errors.value.push(error.message);
                throw error;
            });
    }

    /**
     * Signs the current user out and clears session state.
     * @returns {void}
     */
    function signOut() {
        currentUser.value     = null;
        isAuthenticated.value = false;
        errors.value          = [];
        clearSession();
    }

    /**
     * Loads all user accounts scoped to the given business from the API.
     * @param {number|string} businessId
     * @returns {void}
     */
    function fetchUsers(businessId) {
        iamApi.getUsers(businessId).then(response => {
            users.value      = UserAccountAssembler.toEntitiesFromResponse(response);
            usersLoaded.value = true;
        }).catch(error => {
            errors.value.push(error.message);
        });
    }

    /**
     * Loads all roles from the API. Roles are the single source of truth for
     * role labels — presentation components must resolve a roleId to its
     * `position` (ADMIN/CASHIER/WAREHOUSE) via getRolePosition instead of
     * hardcoding their own numeric-id-to-label mapping.
     * @returns {void}
     */
    function fetchRoles() {
        iamApi.getRoles().then(response => {
            roles.value = response.data instanceof Array ? response.data : [];
            rolesLoaded.value = true;
        }).catch(error => {
            errors.value.push(error.message);
        });
    }

    /**
     * Resolves a roleId to its position (ADMIN/CASHIER/WAREHOUSE).
     * @param {number|string} roleId
     * @returns {string|null} The role's position, or null if not loaded/found.
     */
    function getRolePosition(roleId) {
        const numericId = parseInt(roleId);
        const role = roles.value.find(roleItem => roleItem.id === numericId);
        return role ? role.position : null;
    }

    /**
     * Loads the business (tenant) the given identifier points to.
     * @param {number|string} businessId
     * @returns {Promise<void>}
     */
    function fetchBusiness(businessId) {
        if (!businessId) return Promise.resolve();
        return iamApi.getBusinessById(businessId)
            .then(response => {
                currentBusiness.value = BusinessAssembler.toEntityFromResource(response.data);
                businessLoaded.value  = true;
            })
            .catch(error => errors.value.push(error));
    }

    /**
     * Updates profile fields (name, type, address) of the current business.
     * Business rule: name and address must be non-empty (enforced by the caller/view).
     *
     * @param {Object} fields
     * @param {string} [fields.name]
     * @param {string} [fields.type]
     * @param {string} [fields.address]
     * @returns {Promise<{success: boolean}>}
     */
    async function updateBusiness({ name, type, address } = {}) {
        if (!currentBusiness.value) return { success: false };

        const resource = BusinessAssembler.toResourceFromEntity({
            ...currentBusiness.value,
            name:    name    ?? currentBusiness.value.name,
            type:    type    ?? currentBusiness.value.type,
            address: address ?? currentBusiness.value.address
        });

        try {
            const response = await iamApi.updateBusiness(currentBusiness.value.id, resource);
            currentBusiness.value = BusinessAssembler.toEntityFromResource(response.data);
            return { success: true };
        } catch (error) {
            errors.value.push(error);
            return { success: false };
        }
    }

    /**
     * Updates profile fields (full name, phone) of the currently authenticated user.
     * Fetches the raw stored resource first and merges changes into it, since
     * the mock's PUT replaces the entire resource and the UserAccount entity
     * intentionally excludes the password field — merging avoids wiping it.
     *
     * @param {Object} fields
     * @param {string} fields.fullName
     * @param {string} [fields.phone]
     * @returns {Promise<{success: boolean}>}
     */
    async function updateUserProfile({ fullName, phone }) {
        if (!currentUser.value) return { success: false };

        try {
            const existingResponse = await iamApi.getUserById(currentUser.value.id);
            const nameParts = fullName.trim().split(' ');
            const updatedResource = {
                ...existingResponse.data,
                name:     nameParts[0] ?? existingResponse.data.name,
                lastName: nameParts.slice(1).join(' '),
                phone:    phone ?? existingResponse.data.phone ?? ''
            };
            const response = await iamApi.updateUser(updatedResource);
            currentUser.value = UserAccountAssembler.toEntityFromResource(response.data);
            persistSession(currentUser.value);
            return { success: true };
        } catch (error) {
            errors.value.push(error);
            return { success: false };
        }
    }

    /**
     * Changes the password of the currently authenticated user via the real
     * backend's dedicated endpoint, which verifies currentPassword
     * server-side with BCrypt (401 on mismatch) and hashes newPassword
     * before persisting — this can never succeed by comparing against
     * GET /users/{id}'s `password` field: PasswordHash is [JsonIgnore] on
     * the backend and is never sent to the client, so that comparison was
     * always false regardless of what the user typed.
     *
     * @param {string} currentPassword
     * @param {string} newPassword
     * @returns {Promise<{success: boolean, errorKey: string|null}>}
     */
    async function changePassword(currentPassword, newPassword) {
        if (!currentUser.value) return { success: false, errorKey: 'settings.error-current-password' };

        try {
            await iamApi.changePassword(currentUser.value.id, currentPassword, newPassword);
            return { success: true, errorKey: null };
        } catch (error) {
            if (error?.response?.status === 401) {
                return { success: false, errorKey: 'settings.error-current-password-invalid' };
            }
            errors.value.push(error);
            return { success: false, errorKey: 'settings.error-password-change-failed' };
        }
    }

    /**
     * Finds a user account entity by its identifier.
     * @param {number|string} id - User identifier.
     * @returns {UserAccount|undefined} Matching user account, if available.
     */
    function getUserById(id) {
        const idNum = parseInt(id);
        return users.value.find(user => user.id === idNum);
    }

    /**
     * Creates a new user account (team invite) and appends it to local state.
     *
     * Calls the real backend's dedicated invite endpoint (POST /users), not
     * sign-up: sign-up also creates a brand-new Business and requires
     * businessName/businessType, which this modal never collects — sending
     * an invite through sign-up always 400'd on those missing required
     * fields before a single user field was even validated.
     *
     * Business rule: invited users are scoped to the inviting admin's business
     * (resolved from the JWT server-side, not sent by the client).
     *
     * @param {UserAccount} userAccount - UserAccount entity to persist (no password).
     * @param {string} password - Temporary password assigned to the invited user.
     * @returns {Promise<{success: boolean}>}
     */
    async function addUser(userAccount, password) {
        const resource = UserAccountAssembler.toResourceFromEntity(userAccount, { password });

        try {
            const response = await iamApi.inviteUser(resource);
            const newUser = UserAccountAssembler.toEntityFromResource(response.data);
            users.value.push(newUser);
            return { success: true };
        } catch (error) {
            errors.value.push(error.message ?? error);
            return { success: false };
        }
    }

    /**
     * Updates an existing user account and synchronizes local state.
     *
     * Fetches the raw stored resource first and merges changes into it,
     * since the mock's PUT replaces the entire resource and the UserAccount
     * entity intentionally excludes the password field — merging avoids
     * wiping it.
     *
     * @param {UserAccount} userAccount - UserAccount entity with updated data.
     * @returns {Promise<void>}
     */
    async function updateUser(userAccount) {
        try {
            const existingResponse = await iamApi.getUserById(userAccount.id);
            const resource = {
                ...existingResponse.data,
                ...UserAccountAssembler.toResourceFromEntity(userAccount)
            };
            const response = await iamApi.updateUser(resource);
            const updatedUser = UserAccountAssembler.toEntityFromResource(response.data);
            const index = users.value.findIndex(user => user.id === updatedUser.id);
            if (index !== -1) users.value[index] = updatedUser;
        } catch (error) {
            errors.value.push(error.message ?? error);
        }
    }

    /**
     * Deletes a user account and removes it from local state.
     * @param {UserAccount} userAccount - UserAccount entity to remove.
     * @returns {void}
     */
    function deleteUser(userAccount) {
        iamApi.deleteUser(userAccount.id).then(() => {
            const index = users.value.findIndex(user => user.id === userAccount.id);
            if (index !== -1) users.value.splice(index, 1);
        }).catch(error => {
            errors.value.push(error.message);
        });
    }

    return {
        currentUser,
        users,
        roles,
        currentBusiness,
        usersLoaded,
        rolesLoaded,
        businessLoaded,
        isAuthenticated,
        errors,
        usersCount,
        signIn,
        signUp,
        signOut,
        fetchUsers,
        fetchRoles,
        fetchBusiness,
        getRolePosition,
        getUserById,
        addUser,
        updateUser,
        updateBusiness,
        updateUserProfile,
        changePassword,
        deleteUser
    };
});

export default useIamStore;
