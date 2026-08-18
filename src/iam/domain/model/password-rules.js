/**
 * Mirrors the backend's password strength rule
 * (PasswordRuleExtensions.MustBeAStrongPassword): at least 8 characters,
 * containing at least one letter and one digit. Deliberately no symbol
 * requirement — the backend's own rationale is that real bodega staff
 * shouldn't get locked out by a password policy they can't remember.
 *
 * Client-side checks here are a UX convenience only; the backend is the
 * actual authority and re-validates on every request.
 *
 * @param {string} password
 * @returns {boolean}
 */
export function isStrongPassword(password) {
    return typeof password === 'string'
        && password.length >= 8
        && /[A-Za-z]/.test(password)
        && /[0-9]/.test(password);
}
