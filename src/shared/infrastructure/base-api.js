import axios from 'axios';
import { getSessionToken, setSessionToken } from './session-token.js';

const platformApiUrl = import.meta.env.VITE_BODEGA_API_BASE_URL;

/**
 * Event dispatched on the window when a request comes back 401 Unauthorized,
 * so the IAM bounded context can react (sign the user out) without BaseApi
 * having to depend on IAM directly.
 * @type {string}
 */
export const SESSION_EXPIRED_EVENT = 'bodega:session-expired';

/**
 * Shared infrastructure base class that configures the Axios HTTP client.
 * All bounded-context API classes extend this class to inherit the HTTP client.
 *
 * Extension point for phase 2 (real backend, real JWT):
 * - Request interceptor already attaches `Authorization: Bearer <token>` from
 *   the centralized session-token store. Today `getSessionToken()` always
 *   returns null, so this is a no-op — no `*.api.js` file needs to change
 *   when phase 2 starts issuing real tokens.
 * - Response interceptor already reacts to 401 by clearing the token and
 *   dispatching SESSION_EXPIRED_EVENT. It never fires today (no real tokens
 *   expire yet), but the wiring is in place.
 *
 * @class BaseApi
 */
export class BaseApi {
    /**
     * @private
     * Axios HTTP client instance configured with the platform API base URL.
     * @type {import('axios').AxiosInstance}
     */
    #http;

    /**
     * Initializes the Axios HTTP client with the base URL from environment variables,
     * default JSON headers, and the auth request/response interceptors.
     */
    constructor() {
        this.#http = axios.create({
            baseURL: platformApiUrl,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });

        this.#http.interceptors.request.use(config => {
            const token = getSessionToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        });

        this.#http.interceptors.response.use(
            response => response,
            error => {
                if (error.response?.status === 401) {
                    setSessionToken(null);
                    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
                }
                return Promise.reject(error);
            }
        );
    }

    /**
     * Returns the configured Axios HTTP client instance.
     * @returns {import('axios').AxiosInstance} The Axios HTTP client.
     */
    get http() {
        return this.#http;
    }
}
