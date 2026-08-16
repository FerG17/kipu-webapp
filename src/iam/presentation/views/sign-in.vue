<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import useIamStore from '../../application/iam.store.js';

const { t }    = useI18n();
const router   = useRouter();
const iamStore = useIamStore();

const form = ref({ email: '', password: '', rememberMe: false });
const showPassword = ref(false);
const localError   = ref('');
const isLoading    = ref(false);

function validateForm() {
  if (!form.value.email || !form.value.password) {
    localError.value = t('sign-in.error-empty');
    return false;
  }
  if (!form.value.email.includes('@')) {
    localError.value = t('sign-in.error-invalid-email');
    return false;
  }
  localError.value = '';
  return true;
}

async function submitSignIn() {
  if (!validateForm()) return;
  isLoading.value = true;
  iamStore.errors = [];
  try {
    await iamStore.signIn(form.value.email, form.value.password);
    router.push({ name: 'dashboard' });
  } catch {
    localError.value = iamStore.errors.length > 0 ? t(iamStore.errors[0]) : t('sign-in.error-credentials');
  } finally {
    isLoading.value = false;
  }
}

function navigateToForgotPassword() { router.push({ name: 'forgot-password' }); }
</script>

<template>
  <div class="auth-screen flex min-h-screen">

    <!-- ── Left panel (desktop only) ──────────────────────────────── -->
    <div class="auth-hero hidden lg:flex flex-column justify-content-between p-8 relative overflow-hidden">
      <div class="auth-hero-circle auth-hero-circle--1" />
      <div class="auth-hero-circle auth-hero-circle--2" />

      <!-- Brand -->
      <div class="relative flex align-items-center gap-3">
        <span class="auth-brand-mark" aria-hidden="true">B</span>
        <span class="auth-brand-name">Bodega Platform</span>
      </div>

      <!-- Center content -->
      <div class="relative flex flex-column gap-6">
        <div class="flex flex-column gap-3">
          <div class="auth-eyebrow">
            <span class="auth-eyebrow-dot" />
            <p class="m-0">{{ t('auth-hero.eyebrow') }}</p>
          </div>
          <h1 class="auth-hero-title">{{ t('auth-hero.title') }}</h1>
          <p class="auth-hero-body">{{ t('auth-hero.body') }}</p>
        </div>

        <div class="flex flex-column gap-3">
          <div
              v-for="feature in [
                { icon: 'pi pi-bell', textKey: 'auth-hero.feature-inventory' },
                { icon: 'pi pi-credit-card', textKey: 'auth-hero.feature-sales' },
                { icon: 'pi pi-chart-bar', textKey: 'auth-hero.feature-reports' }
              ]"
              :key="feature.textKey"
              class="flex align-items-center gap-3"
          >
            <div class="auth-feature-icon flex align-items-center justify-content-center border-round-lg flex-shrink-0">
              <i :class="feature.icon" style="font-size: 0.9rem;"/>
            </div>
            <span class="auth-feature-text">{{ t(feature.textKey) }}</span>
          </div>
        </div>
      </div>

      <p class="relative m-0 auth-hero-footer">© 2026 Bodega Platform</p>
    </div>

    <!-- ── Right panel ─────────────────────────────────────────────── -->
    <div class="flex-1 flex flex-column align-items-center justify-content-center px-4 sm:px-8 py-8 sm:py-10 overflow-y-auto auth-form-panel">

      <!-- Mobile brand -->
      <div class="flex lg:hidden align-items-center gap-3 mb-8">
        <span class="auth-brand-mark auth-brand-mark--dark" aria-hidden="true">B</span>
        <span class="auth-brand-name auth-brand-name--dark">Bodega Platform</span>
      </div>

      <div style="width: 100%; max-width: 420px;">

        <!-- Title -->
        <div class="mb-7">
          <h2 class="m-0 auth-title">{{ t('sign-in.title') }}</h2>
          <p class="m-0 mt-1 auth-subtitle">{{ t('sign-in.subtitle') }}</p>
        </div>

        <!-- Form -->
        <form @submit.prevent="submitSignIn" style="display: flex; flex-direction: column; gap: 1.25rem;">

          <!-- Email -->
          <div class="auth-field">
            <label for="sign-in-email" class="auth-label">{{ t('sign-in.email') }}</label>
            <div class="relative">
              <i class="pi pi-envelope auth-input-icon absolute"/>
              <input
                  id="sign-in-email"
                  v-model="form.email"
                  type="email"
                  :placeholder="t('sign-in.email-placeholder')"
                  required
                  class="auth-input"
                  style="padding-left: 40px;"
              />
            </div>
          </div>

          <!-- Password -->
          <div class="auth-field">
            <div class="flex align-items-center justify-content-between mb-2">
              <label for="sign-in-password" class="auth-label" style="margin-bottom: 0;">{{ t('sign-in.password') }}</label>
              <button type="button" class="auth-link" @click="navigateToForgotPassword">
                {{ t('sign-in.forgot-password') }}
              </button>
            </div>
            <div class="relative">
              <i class="pi pi-lock auth-input-icon absolute"/>
              <input
                  id="sign-in-password"
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  :placeholder="t('sign-in.password-placeholder')"
                  required
                  class="auth-input"
                  style="padding-left: 40px; padding-right: 44px;"
              />
              <button type="button" class="auth-visibility-btn absolute" @click="showPassword = !showPassword">
                <i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size: 0.95rem;"/>
              </button>
            </div>
          </div>

          <!-- Remember me -->
          <div class="flex align-items-center gap-2">
            <button
                type="button"
                class="auth-checkbox flex align-items-center justify-content-center border-round flex-shrink-0"
                :class="{ 'auth-checkbox--checked': form.rememberMe }"
                @click="form.rememberMe = !form.rememberMe"
            >
              <i v-if="form.rememberMe" class="pi pi-check" style="color: var(--brand-ink); font-size: 0.65rem;"/>
            </button>
            <span class="auth-remember-text">{{ t('sign-in.remember-me') }}</span>
          </div>

          <!-- Error -->
          <div v-if="localError" class="auth-error-box flex align-items-center gap-2 p-3 border-round-lg">
            <i class="pi pi-exclamation-circle flex-shrink-0" style="color: var(--status-critical-fg); font-size: 0.9rem;"/>
            <p class="m-0" style="color: var(--status-critical-fg); font-size: 0.875rem;">{{ localError }}</p>
          </div>

          <!-- Submit -->
          <button type="submit" :disabled="isLoading" class="auth-submit-btn w-full flex align-items-center justify-content-center gap-2 border-round-xl border-none">
            <span v-if="isLoading" class="flex align-items-center gap-2">
              <span class="spin-ring"/>
              {{ t('sign-in.loading') }}
            </span>
            <span v-else class="flex align-items-center gap-2">
              {{ t('sign-in.submit') }}
              <i class="pi pi-arrow-right" style="font-size: 0.85rem;"/>
            </span>
          </button>
        </form>

      </div>

      <p class="mt-8 auth-copyright">© 2026 Bodega Platform</p>
    </div>
  </div>
</template>

<style scoped>
/* Use dynamic viewport height so mobile browser chrome doesn't clip the layout. */
.auth-screen { min-height: 100vh; min-height: 100dvh; background-color: var(--bg); }

/* Desktop: lock the screen to the viewport so the brand panel stays static
   and only the form panel scrolls. */
@media (min-width: 1024px) {
  .auth-screen { height: 100vh; height: 100dvh; overflow: hidden; }
}

.auth-hero {
  width: 56%;
  flex-shrink: 0;
  background: var(--brand);
}

.auth-hero-circle {
  position: absolute;
  border-radius: 50%;
  background-color: var(--accent);
}
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

.auth-hero-title { font-family: var(--font-display); color: var(--brand-ink); font-size: 2.3rem; font-weight: 700; line-height: 1.2; margin: 0; text-wrap: balance; }
.auth-hero-body { color: color-mix(in srgb, var(--brand-ink) 78%, transparent); font-size: 0.97rem; line-height: 1.75; margin: 0; max-width: 400px; }

.auth-feature-icon { width: 36px; height: 36px; background-color: color-mix(in srgb, var(--brand-ink) 12%, transparent); }
.auth-feature-icon i { color: var(--brand-ink); }
.auth-feature-text { color: color-mix(in srgb, var(--brand-ink) 85%, transparent); font-size: 0.9rem; }

.auth-hero-footer { color: color-mix(in srgb, var(--brand-ink) 30%, transparent); font-size: 0.74rem; }

.auth-form-panel { background: var(--bg); }

.auth-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
.auth-subtitle { color: var(--text-muted); font-size: 0.92rem; }

.auth-field { display: flex; flex-direction: column; gap: 6px; }
.auth-label { display: block; margin-bottom: 6px; font-size: 0.875rem; font-weight: 600; color: var(--text); }

.auth-input-icon { left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-faint); font-size: 0.88rem; pointer-events: none; }

.auth-input {
  width: 100%; border-radius: 12px;
  padding: 12px 16px;
  background-color: var(--surface-alt);
  border: 1.5px solid var(--border);
  color: var(--text); font-size: 0.92rem;
  font-family: var(--font-body);
  outline: none; transition: all 0.2s;
  box-sizing: border-box;
}
.auth-input:focus {
  border-color: var(--accent);
  background-color: var(--surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

.auth-visibility-btn {
  right: 12px; top: 50%; transform: translateY(-50%);
  background: none; border: none; color: var(--text-faint); cursor: pointer;
  padding: 4px; border-radius: 6px; display: flex; align-items: center;
  transition: color 0.15s;
}
.auth-visibility-btn:hover { color: var(--brand); }

.auth-checkbox {
  width: 20px; height: 20px; border: 1.5px solid var(--border-strong); cursor: pointer;
  background-color: var(--surface-alt); transition: all 0.2s;
}
.auth-checkbox--checked { background-color: var(--brand); border-color: var(--brand); }

.auth-remember-text { color: var(--text-muted); font-size: 0.875rem; }

.auth-error-box { background-color: var(--status-critical-bg); border: 1px solid color-mix(in srgb, var(--status-critical-fg) 30%, transparent); }

.auth-submit-btn {
  padding: 14px; font-size: 0.95rem; font-weight: 700; color: var(--brand-ink);
  font-family: var(--font-body);
  transition: all 0.2s; background: var(--brand); cursor: pointer;
}
.auth-submit-btn:hover:not(:disabled) { filter: brightness(1.08); }
.auth-submit-btn:disabled { opacity: 0.75; cursor: not-allowed; }

.auth-link { background: none; border: none; color: var(--brand); font-size: 0.82rem; font-weight: 600; cursor: pointer; padding: 0; transition: color 0.15s; }
.auth-link:hover { color: var(--accent); }

.auth-footer-text { color: var(--text-muted); font-size: 0.875rem; }
.auth-copyright { color: var(--text-faint); font-size: 0.74rem; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin-ring {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--brand-ink) 40%, transparent);
  border-top-color: var(--brand-ink);
  animation: spin 0.8s linear infinite;
  display: inline-block; flex-shrink: 0;
}
@media (prefers-reduced-motion: reduce) {
  .spin-ring { animation: none; }
}

.mb-7 { margin-bottom: 1.75rem; }
.mb-8 { margin-bottom: 2rem; }

/* Mobile tweaks: 16px inputs prevent iOS focus-zoom; trim oversized title/spacing. */
@media (max-width: 640px) {
  .auth-input { font-size: 16px; }
  .auth-title { font-size: 1.4rem; }
  .mb-7 { margin-bottom: 1.25rem; }
  .mb-8 { margin-bottom: 1.5rem; }
}
</style>
