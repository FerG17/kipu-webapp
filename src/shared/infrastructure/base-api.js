import axios from 'axios';

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
 * Session auth is an httpOnly cookie set by the backend on sign-in/sign-up
 * (see AuthenticationController) — this class never touches the raw JWT
 * itself, it just tells Axios to include credentials (`withCredentials`) so
 * the browser sends the cookie automatically. There is deliberately no
 * request interceptor attaching an Authorization header anymore.
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
     * Initializes the Axios HTTP client with the base URL from environment
     * variables, default JSON headers, credentialed requests, and the 401
     * response interceptor.
     */
    constructor() {
        this.#http = axios.create({
            baseURL: platformApiUrl,
            withCredentials: true,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        this.#http.interceptors.response.use(
            response => response,
            error => {
                if (error.response?.status === 401) {
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
