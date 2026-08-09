<script setup>
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const unavailableRoute = router.currentRoute.value.fullPath;
const { t } = useI18n();
</script>

<template>
  <div class="align-content-start justify-content-start m-4">
    <h1>{{ t('page-not-found.title') }}</h1>
    <p>{{ t('page-not-found.content', { 'unavailable-route': unavailableRoute }) }}</p>
    <router-link to="/home">{{ t('page-not-found.go-home') }}</router-link>
  </div>
</template>

<style scoped>
</style>
