<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

/**
 * Report generation, result and history are now a single combined view
 * (report-filters.vue), matching the Claude Design mockup's one-page
 * "Reportes" layout instead of navigating between two screens. This route
 * is kept only so any old bookmark/link to it still lands somewhere useful.
 */
const router = useRouter();

onMounted(() => {
  router.replace({ name: 'dashboard-report-filters' });
});
</script>

<template>
  <div />
</template>
