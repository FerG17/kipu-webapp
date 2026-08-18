/**
 * Maps a backend IamError (the RFC 7807 ProblemDetails `title` field — see
 * IamActionResultAssembler) to an i18n key so password-related forms can
 * show a message that actually matches what went wrong, instead of one
 * fixed generic string regardless of cause.
 *
 * @type {Record<string, string>}
 */
const IAM_ERROR_MESSAGE_KEYS = {
    InvalidCredentials: 'sign-in.error-credentials',
    CurrentPasswordInvalid: 'settings.error-current-password-invalid',
    WeakPassword: 'iam-errors.weak-password',
    InvalidResetCode: 'forgot-password.error-invalid-code',
    ConcurrentModification: 'iam-errors.concurrent-modification',
    EmailAlreadyTaken: 'sign-up.error-credentials'
};

/**
 * Reads the ProblemDetails `title` off an Axios error and resolves it to an
 * i18n key. Falls back to `fallbackKey` when the title is missing or
 * unrecognized (network error, an IamError not covered above, etc.).
 *
 * @param {unknown} error - The error caught from an iamApi call.
 * @param {string} fallbackKey - i18n key to use when no specific mapping applies.
 * @returns {string}
 */
export function resolveIamErrorKey(error, fallbackKey) {
    const title = error?.response?.data?.title;
    return (title && IAM_ERROR_MESSAGE_KEYS[title]) || fallbackKey;
}
