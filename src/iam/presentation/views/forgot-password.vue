<script setup>
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const { t }  = useI18n();
const router = useRouter();

function navigateToSignIn() { router.push({ name: 'sign-in' }); }
</script>

<template>
  <div class="auth-screen flex min-h-screen">

    <!-- ── Left panel (desktop only) ──────────────────────────────── -->
    <div class="auth-hero hidden lg:flex flex-column justify-content-between p-8 relative overflow-hidden">
      <div class="auth-hero-circle auth-hero-circle--1" />
      <div class="auth-hero-circle auth-hero-circle--2" />

      <!-- Brand -->
      <div class="relative flex align-items-center gap-3">
        <span class="auth-brand-mark" aria-hidden="true">K</span>
        <span class="auth-brand-name">Kipu</span>
      </div>

      <div class="relative flex flex-column gap-6">
        <div class="flex flex-column gap-3">
          <div class="auth-eyebrow">
            <span class="auth-eyebrow-dot" />
            <p class="m-0">{{ t('auth-hero.eyebrow') }}</p>
          </div>
          <h1 class="auth-hero-title">{{ t('auth-hero.title') }}</h1>
          <p class="auth-hero-body">{{ t('auth-hero.body') }}</p>
        </div>
      </div>

      <p class="relative m-0 auth-hero-footer">© 2026 Kipu</p>
    </div>

    <!-- ── Right panel ─────────────────────────────────────────────── -->
    <div class="flex-1 flex flex-column align-items-center justify-content-center px-5 sm:px-8 py-10 overflow-y-auto auth-form-panel">

      <!-- Mobile brand -->
      <div class="flex lg:hidden align-items-center gap-3 mb-6">
        <span class="auth-brand-mark auth-brand-mark--dark" aria-hidden="true">K</span>
        <span class="auth-brand-name auth-brand-name--dark">Kipu</span>
      </div>

      <div style="width: 100%; max-width: 420px;">

        <button type="button" class="auth-back-link flex align-items-center gap-2 mb-5" @click="navigateToSignIn">
          <i class="pi pi-arrow-left" style="font-size: 0.85rem;"/>
          {{ t('forgot-password.back-link') }}
        </button>

        <div class="mb-6">
          <h2 class="m-0 auth-title">{{ t('forgot-password.title') }}</h2>
          <p class="m-0 mt-1 auth-subtitle">{{ t('forgot-password.subtitle') }}</p>
        </div>

        <!-- No real recovery flow exists yet: there is no email service wired
             up on the backend, and no admin-triggered password reset either
             — only self-service change-password (which needs the current
             one). A screen that pretends to send a reset email would tell a
             locked-out user to wait for something that never arrives. The
             honest, actually-actionable answer for a 2-3 person shop is to
             point them at their admin, who can remove and re-invite them. -->
        <div class="unavailable-card flex flex-column align-items-center text-center gap-3 border-round-xl p-5">
          <div class="unavailable-icon flex align-items-center justify-content-center border-circle">
            <i class="pi pi-user-edit" style="font-size: 1.4rem;"/>
          </div>
          <div>
            <p class="m-0 unavailable-title">{{ t('forgot-password.unavailable-title') }}</p>
            <p class="m-0 mt-2 unavailable-body">{{ t('forgot-password.unavailable-body') }}</p>
          </div>
        </div>

        <button type="button" class="auth-submit-btn w-full flex align-items-center justify-content-center gap-2 border-round-xl border-none mt-4" @click="navigateToSignIn">
          <i class="pi pi-arrow-left" style="font-size: 0.85rem;"/>
          {{ t('forgot-password.back-to-login') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-screen { min-height: 100vh; min-height: 100dvh; background-color: var(--bg); }

@media (min-width: 1024px) {
  .auth-screen { height: 100vh; height: 100dvh; overflow: hidden; }
}

.auth-hero { width: 56%; flex-shrink: 0; background: var(--brand); }

.auth-hero-circle { position: absolute; border-radius: 50%; background-color: var(--accent); }
.auth-hero-circle--1 { top: -144px; right: -144px; width: 440px; height: 440px; opacity: 0.14; }
.auth-hero-circle--2 { bottom: -176px; left: -112px; width: 400px; height: 400px; opacity: 0.09; }

.auth-brand-mark {
  width: 44px; height: 44px; border-radius: var(--radius-sm);
  background: var(--brand-ink); color: var(--brand);
  display: grid; place-items: center;
  font-family: var(--font-display); font-weight: 700; font-size: 1.2rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.18);
  flex-shrink: 0;
}
.auth-brand-mark--dark { background: var(--brand); color: var(--brand-ink); width: 40px; height: 40px; }
.auth-brand-name { color: var(--brand-ink); font-size: 1.2rem; font-weight: 700; letter-spacing: 0.01em; font-family: var(--font-body); }
.auth-brand-name--dark { color: var(--text); font-size: 1.1rem; }

.auth-eyebrow {
  display: flex; align-items: center; gap: 8px; width: fit-content;
  background-color: color-mix(in srgb, var(--accent) 22%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  border-radius: var(--radius-pill); padding: 4px 12px;
}
.auth-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background-color: var(--accent); display: inline-block; }
.auth-eyebrow p { color: color-mix(in srgb, var(--accent) 70%, white); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }

.auth-hero-title { font-family: var(--font-display); color: var(--brand-ink); font-size: 2rem; font-weight: 700; line-height: 1.2; margin: 0; text-wrap: balance; }
.auth-hero-body { color: color-mix(in srgb, var(--brand-ink) 78%, transparent); font-size: 0.97rem; line-height: 1.75; margin: 0; max-width: 400px; }

.auth-hero-footer { color: color-mix(in srgb, var(--brand-ink) 30%, transparent); font-size: 0.74rem; }

.auth-form-panel { background: var(--bg); }

.auth-back-link { background: none; border: none; color: var(--text-muted); font-size: 0.85rem; font-weight: 500; cursor: pointer; padding: 0; transition: color 0.15s; }
.auth-back-link:hover { color: var(--brand); }

.auth-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
.auth-subtitle { color: var(--text-muted); font-size: 0.92rem; }

.unavailable-card {
  background: var(--surface-alt);
  border: 1.5px solid var(--border);
}
.unavailable-icon {
  width: 56px; height: 56px;
  background: var(--brand-soft); color: var(--brand);
}
.unavailable-title { font-size: 1rem; font-weight: 700; color: var(--text); }
.unavailable-body { color: var(--text-muted); font-size: 0.875rem; line-height: 1.6; }

.auth-submit-btn {
  padding: 14px; font-size: 0.95rem; font-weight: 700; color: var(--brand-ink);
  font-family: var(--font-body); transition: all 0.2s; background: var(--brand); cursor: pointer;
}
.auth-submit-btn:hover { filter: brightness(1.08); }
</style>
