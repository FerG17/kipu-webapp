<script setup>
import { useRouter } from 'vue-router';

defineProps({
  title:      { type: String, required: true },
  updatedAt:  { type: String, required: true },
});

const router = useRouter();

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push({ name: 'sign-in' });
}
</script>

<template>
  <div class="legal-screen">
    <header class="legal-header">
      <div class="legal-header-inner flex align-items-center justify-content-between">
        <div class="flex align-items-center gap-3">
          <span class="legal-brand-mark" aria-hidden="true">K</span>
          <span class="legal-brand-name">Kipu</span>
        </div>
        <button type="button" class="legal-back-btn flex align-items-center gap-2" @click="goBack">
          <i class="pi pi-arrow-left" style="font-size: 0.8rem;"/>
          Volver
        </button>
      </div>
    </header>

    <main class="legal-main">
      <div class="legal-content">
        <h1 class="legal-title">{{ title }}</h1>
        <p class="legal-updated">Última actualización: {{ updatedAt }}</p>

        <div class="legal-body">
          <slot/>
        </div>
      </div>
    </main>

    <footer class="legal-footer">
      <p class="m-0">© 2026 Kipu</p>
    </footer>
  </div>
</template>

<style scoped>
.legal-screen {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

.legal-header {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.legal-header-inner {
  max-width: 760px;
  margin: 0 auto;
  padding: 1rem 1.25rem;
}

.legal-brand-mark {
  width: 32px; height: 32px; border-radius: var(--radius-sm);
  background: var(--brand); color: var(--brand-ink);
  display: grid; place-items: center;
  font-family: var(--font-display); font-weight: 700; font-size: 0.95rem;
  flex-shrink: 0;
}
.legal-brand-name { color: var(--text); font-size: 1.05rem; font-weight: 700; font-family: var(--font-body); }

.legal-back-btn {
  background: none;
  border: 1.5px solid var(--border);
  color: var(--text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all 0.15s;
}
.legal-back-btn:hover { background: var(--surface-alt); border-color: var(--border-strong); color: var(--text); }

.legal-main { flex: 1; }
.legal-content {
  max-width: 760px;
  margin: 0 auto;
  padding: var(--space-6) 1.25rem var(--space-7);
}

.legal-title {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  color: var(--text);
  margin: 0;
}
.legal-updated { color: var(--text-faint); font-size: var(--text-xs); margin: var(--space-2) 0 0; }

.legal-body { margin-top: var(--space-6); color: var(--text); }
.legal-body :deep(h2) {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  color: var(--text);
  margin: var(--space-6) 0 var(--space-3);
}
.legal-body :deep(h2:first-child) { margin-top: 0; }
.legal-body :deep(p) {
  font-size: var(--text-base);
  line-height: 1.7;
  color: var(--text-muted);
  margin: 0 0 var(--space-4);
}
.legal-body :deep(ul) {
  margin: 0 0 var(--space-4);
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.legal-body :deep(li) {
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--text-muted);
}
.legal-body :deep(strong) { color: var(--text); font-weight: 700; }
.legal-body :deep(a) { color: var(--brand); font-weight: 600; }

.legal-footer {
  text-align: center;
  padding: var(--space-5) 1.25rem;
  color: var(--text-faint);
  font-size: var(--text-xs);
}

@media (max-width: 640px) {
  .legal-title { font-size: var(--text-xl); }
  .legal-content { padding: var(--space-5) 1rem var(--space-6); }
}
</style>
