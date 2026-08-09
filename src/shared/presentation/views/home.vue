<script setup>
import { useRouter } from 'vue-router';
import { useI18n }   from 'vue-i18n';
import useIamStore   from '../../../iam/application/iam.store.js';

const router   = useRouter();
const { t }    = useI18n();
const iamStore = useIamStore();
</script>

<template>
  <div class="flex flex-column align-items-center justify-content-center" style="min-height: 60vh; text-align: center;">
    <h1 class="m-0" style="color: #0B3558; font-size: 1.75rem; font-weight: 700;">
      {{ t('home.title') }}
    </h1>
    <p class="mt-2 mb-5" style="color: #64748B; font-size: 0.95rem; max-width: 480px;">
      {{ iamStore.currentUser ? t('home.content-personalized', { name: iamStore.currentUser.fullName }) : t('home.content') }}
    </p>
    <button
        class="border-round-xl border-none cursor-pointer"
        style="padding: 12px 28px; font-size: 0.9rem; font-weight: 700; color: #fff; background: linear-gradient(135deg, #0E7490, #0B3558);"
        @click="router.push({ name: 'dashboard' })"
    >
      {{ t('home.go-dashboard') }}
    </button>
  </div>
</template>

<style scoped>
</style>
