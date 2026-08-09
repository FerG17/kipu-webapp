<script setup>
import { useI18n } from 'vue-i18n';

const { t, locale, availableLocales } = useI18n();
</script>

<template>
  <div class="lang-switch-wrapper" :aria-label="t('sidebar.language-label')" :title="t('sidebar.language-label')">
    <i class="pi pi-globe lang-switch-icon"/>
    <pv-select-button v-model="locale" :options="availableLocales" class="lang-switch">
      <template #option="slotProps">
        <span>{{ slotProps.option.toUpperCase() }}</span>
      </template>
    </pv-select-button>
  </div>
</template>

<style scoped>
.lang-switch-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.lang-switch-icon {
  color: #CBD5E1;
  font-size: 0.9rem;
}

/* Pill container (class falls through to PrimeVue's root .p-selectbutton) */
.lang-switch {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}

/* Each segment */
.lang-switch :deep(.p-togglebutton) {
  border: none;
  margin: 0;
  padding: 5px 13px;
  min-width: 40px;
  border-radius: 3px;
  background: transparent;
  color: #CBD5E1;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.lang-switch :deep(.p-togglebutton:not(.p-togglebutton-checked):hover) {
  color: #E2E8F0;
  background: rgba(148, 163, 184, 0.18);
}

/* Active segment */
.lang-switch :deep(.p-togglebutton.p-togglebutton-checked) {
  color: #FFFFFF;
  background: #0E7490;
  box-shadow: 0 1px 3px rgba(14, 116, 144, 0.35);
}

/* Remove PrimeVue's default active indicator bar */
.lang-switch :deep(.p-togglebutton::before),
.lang-switch :deep(.p-togglebutton.p-togglebutton-checked::before) {
  display: none;
}

.lang-switch :deep(.p-togglebutton-content) {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.lang-switch :deep(.p-togglebutton:focus-visible) {
  outline: 2px solid #0E7490;
  outline-offset: 2px;
}
</style>