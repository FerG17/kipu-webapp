import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import es from './locales/es.json';

/**
 * Vue I18n instance configured for English (en) and Spanish (es).
 * Default locale is Spanish (primary market: Peru); falls back to English when a key is missing.
 */
const i18n = createI18n({
    legacy: false,
    locale: 'es',
    fallbackLocale: 'en',
    messages: { en, es }
});

export default i18n;
