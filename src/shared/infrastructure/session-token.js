const TOKEN_STORAGE_KEY = 'bodega.token';

/**
 * Centralized accessor for the bearer token used to authenticate API requests.
 *
 * Kept separate from the IAM session object (`bodega.session`) and outside the
 * IAM bounded context so `BaseApi` can read it without depending on IAM.
 * Today no backend issues a real token, so this always returns null and the
 * Axios request interceptor sends no Authorization header — zero functional
 * impact until phase 2 starts writing a token here after a real sign-in.
 */

/**
 * @returns {string|null} The current bearer token, or null when not signed in
 *   / no real token has been issued yet.
 */
export function getSessionToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
}

/**
 * @param {string|null} token - Token to persist, or null/undefined to clear it.
 * @returns {void}
 */
export function setSessionToken(token) {
    if (token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
}
