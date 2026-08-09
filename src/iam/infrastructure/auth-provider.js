import { IamApi } from './iam.api.js';
import { setSessionToken } from '../../shared/infrastructure/session-token.js';

const iamApi = new IamApi();

/**
 * Abstracts the authentication mechanism behind a stable interface so that
 * `iam.store.js` and the Sign In / Sign Up views never change when the mock
 * (json-server) implementation is swapped for the real backend.
 *
 * Phase 2: signIn/signUp now call the real backend
 * (POST /authentication/sign-in, POST /authentication/sign-up), which
 * validates credentials server-side (BCrypt) and returns a real JWT —
 * replacing the old mock hack of filtering /users by email and comparing
 * the password in the client.
 *
 * @class AuthProvider
 */
export class AuthProvider {
    /**
     * @param {string} email
     * @param {string} password
     * @returns {Promise<Object>} The authenticated user resource (includes the JWT as `token`).
     * @throws {Error} With message 'sign-in.error-credentials' when invalid.
     */
    async signIn(email, password) {
        try {
            const response = await iamApi.signIn(email, password);
            setSessionToken(response.data.token);
            return response.data;
        } catch (error) {
            if (error.response?.status === 401) throw new Error('sign-in.error-credentials');
            throw error;
        }
    }

    /**
     * @param {Object} resource - IAM sign-up resource payload.
     * @returns {Promise<Object>} The authenticated user resource (includes the JWT as `token`)
     *   — the account is usable immediately, no separate sign-in step needed.
     */
    async signUp(resource) {
        const response = await iamApi.signUp(resource);
        setSessionToken(response.data.token);
        return response.data;
    }
}
