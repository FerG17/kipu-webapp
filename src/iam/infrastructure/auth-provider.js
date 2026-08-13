import { IamApi } from './iam.api.js';

const iamApi = new IamApi();

/**
 * Abstracts the authentication mechanism behind a stable interface so that
 * `iam.store.js` and the Sign In / Sign Up views never change when the mock
 * (json-server) implementation is swapped for the real backend.
 *
 * signIn/signUp/signOut call the real backend (POST /authentication/sign-in,
 * /sign-up, /sign-out). The JWT itself is never handled here — the backend
 * sets it as an httpOnly cookie the browser manages on its own; this class
 * only cares about the rest of the response (or, for signOut, that the
 * request completed).
 *
 * @class AuthProvider
 */
export class AuthProvider {
    /**
     * @param {string} email
     * @param {string} password
     * @returns {Promise<Object>} The authenticated user resource.
     * @throws {Error} With message 'sign-in.error-credentials' when invalid.
     */
    async signIn(email, password) {
        try {
            const response = await iamApi.signIn(email, password);
            return response.data;
        } catch (error) {
            if (error.response?.status === 401) throw new Error('sign-in.error-credentials');
            throw error;
        }
    }

    /**
     * @param {Object} resource - IAM sign-up resource payload.
     * @returns {Promise<Object>} The authenticated user resource — the account
     *   is usable immediately, no separate sign-in step needed.
     */
    async signUp(resource) {
        const response = await iamApi.signUp(resource);
        return response.data;
    }

    /**
     * Ends the session server-side (clears the cookie, revokes the token
     * everywhere). Errors are swallowed — signing out locally must still
     * succeed even if this request fails (e.g. offline, already expired).
     * @returns {Promise<void>}
     */
    async signOut() {
        try {
            await iamApi.signOut();
        } catch {
            // Local sign-out proceeds regardless — see docstring above.
        }
    }
}
