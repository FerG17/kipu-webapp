<script setup>
import Layout from './shared/presentation/components/layout.vue';
import { useI18n } from 'vue-i18n';
import { watch } from 'vue';
import { usePrimeVue } from 'primevue/config';
import { primeVueLocaleEs } from './shared/presentation/primevue-locale.js';

const { t, locale } = useI18n();

// PrimeVue's own strings (ConfirmDialog's Yes/No, Calendar month names,
// DataTable filter labels, ...) ship English-only and don't follow
// vue-i18n on their own — this keeps them in sync with the language
// switcher instead of leaving PrimeVue's chrome stuck in English while the
// rest of the UI is in Spanish.
const primeVue = usePrimeVue();
const primeVueLocaleEn = { ...primeVue.config.locale };
watch(locale, newLocale => {
  primeVue.config.locale = newLocale === 'es' ? primeVueLocaleEs : primeVueLocaleEn;
}, { immediate: true });
</script>

<template>
  <router-view/>
</template>
