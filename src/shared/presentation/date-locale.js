/**
 * Maps the active vue-i18n locale ('es'/'en') to the BCP 47 tag used for
 * Date.prototype.toLocaleDateString/toLocaleString calls, so weekday/month
 * names follow the UI language instead of a hardcoded 'es-PE'.
 *
 * @param {string} locale - vue-i18n locale value ('es' or 'en').
 * @returns {string} BCP 47 locale tag.
 */
export function toDateLocale(locale) {
    return locale === 'en' ? 'en-US' : 'es-PE';
}
