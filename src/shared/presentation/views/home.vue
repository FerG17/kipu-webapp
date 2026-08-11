<script setup>
import { useRouter } from 'vue-router';
import { useI18n }   from 'vue-i18n';
import useIamStore   from '../../../iam/application/iam.store.js';

const router   = useRouter();
const { t }    = useI18n();
const iamStore = useIamStore();
</script>

<template>
  <div class="flex flex-column align-items-center justify-content-center home-view" style="min-height: 60vh; text-align: center;">
    <h1 class="m-0 home-title">
      {{ t('home.title') }}
    </h1>
    <p class="mt-2 mb-5 home-subtitle">
      {{ iamStore.currentUser ? t('home.content-personalized', { name: iamStore.currentUser.fullName }) : t('home.content') }}
    </p>
    <button class="home-cta border-round-xl border-none cursor-pointer" @click="router.push({ name: 'dashboard' })">
      {{ t('home.go-dashboard') }}
    </button>
  </div>
</template>

<style scoped>
.home-title { color: var(--text); font-size: 1.75rem; font-weight: 700; }
.home-subtitle { color: var(--text-muted); font-size: 0.95rem; max-width: 480px; }
.home-cta {
  padding: 12px 28px; font-size: 0.9rem; font-weight: 700;
  color: var(--brand-ink); background: var(--brand);
  font-family: var(--font-body); transition: filter 0.2s;
}
.home-cta:hover { filter: brightness(1.08); }
</style>
