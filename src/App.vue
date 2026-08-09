<script setup>
import Layout from './shared/presentation/components/layout.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <router-view/>
</template>
