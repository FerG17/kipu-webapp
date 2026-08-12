<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import useIamStore from '../../application/iam.store.js';

const { t }    = useI18n();
const router   = useRouter();
const iamStore = useIamStore();

const form = ref({ firstName: '', lastName: '', businessName: '', email: '', password: '' });

const fieldErrors = ref({ firstName: '', lastName: '', businessName: '', email: '', password: '' });

const showPassword = ref(false);
const isLoading    = ref(false);
const localError   = ref('');

function computePasswordStrength(password) {
  if (!password) return 0;
  if (password.length < 4)  return 1;
  if (password.length < 7)  return 2;
  if (password.length < 10) return 3;
  return 4;
}

const strengthLabelKeys = ['', 'sign-up.strength-weak', 'sign-up.strength-fair', 'sign-up.strength-good', 'sign-up.strength-strong'];
const strengthColors = ['', 'var(--status-critical-fg)', 'var(--status-warning-fg)', 'var(--brand)', 'var(--status-ok-fg)'];

function resolveStrengthBarColor(level) { return strengthColors[level] || 'var(--border-strong)'; }
function strengthLabel(level) { return strengthLabelKeys[level] ? t(strengthLabelKeys[level]) : ''; }

function validateForm() {
  fieldErrors.value = { firstName: '', lastName: '', businessName: '', email: '', password: '' };
  let isValid = true;
  if (!form.value.firstName.trim())    { fieldErrors.value.firstName    = t('sign-up.error-first-name');     isValid = false; }
  if (!form.value.lastName.trim())     { fieldErrors.value.lastName     = t('sign-up.error-last-name');      isValid = false; }
  if (!form.value.businessName.trim()) { fieldErrors.value.businessName = t('sign-up.error-business-name');  isValid = false; }
  if (!form.value.email || !form.value.email.includes('@')) { fieldErrors.value.email = t('sign-up.error-email');    isValid = false; }
  if (!form.value.password || form.value.password.length < 8) { fieldErrors.value.password = t('sign-up.error-password'); isValid = false; }
  return isValid;
}

/**
 * Sends firstName/lastName as two separate fields, matching the backend's
 * SignUpResource (Name, LastName) exactly — the original port asked for a
 * single "fullName" field and split it on the first space, which silently
 * produced an empty LastName for anyone who typed a single-word name.
 *
 * businessType is always "BODEGA": this product is a single bodega's own
 * system, not a multi-vertical SaaS signing up different kinds of shops —
 * the Bodega/Farmacia picker that used to be here implied the opposite.
 */
async function submitSignUp() {
  if (!validateForm()) return;
  isLoading.value = true;
  localError.value = '';
  try {
    await iamStore.signUp({
      firstName: form.value.firstName,
      lastName: form.value.lastName,
      businessName: form.value.businessName,
      businessType: 'BODEGA',
      email: form.value.email,
      password: form.value.password
    });
    router.push({ name: 'dashboard' });
  } catch {
    localError.value = t('sign-up.error-submit-failed');
  } finally {
    isLoading.value = false;
  }
}

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
      <div class="flex lg:hidden align-items-center gap-3 mb-6">
        <span class="auth-brand-mark auth-brand-mark--dark" aria-hidden="true">B</span>
        <span class="auth-brand-name auth-brand-name--dark">Bodega Platform</span>
      </div>

      <div style="width: 100%; max-width: 420px;">

        <!-- Back link -->
        <button type="button" class="auth-back-link flex align-items-center gap-2 mb-5" @click="navigateToSignIn">
          <i class="pi pi-arrow-left" style="font-size: 0.85rem;"/>
          {{ t('sign-up.back-link') }}
        </button>

        <!-- Title -->
        <div class="mb-5">
          <h2 class="m-0 auth-title">{{ t('sign-up.title') }}</h2>
          <p class="m-0 mt-1 auth-subtitle">{{ t('sign-up.subtitle') }}</p>
        </div>

        <form @submit.prevent="submitSignUp" style="display: flex; flex-direction: column; gap: 1rem;">

          <!-- First / last name -->
          <div class="name-grid">
            <div class="auth-field">
              <label class="auth-label">{{ t('sign-up.first-name') }}</label>
              <div class="relative">
                <i class="pi pi-user auth-input-icon absolute"/>
                <input v-model="form.firstName" type="text" :placeholder="t('sign-up.first-name-placeholder')" required class="auth-input" style="padding-left: 40px;"/>
              </div>
              <p v-if="fieldErrors.firstName" class="auth-error"><i class="pi pi-exclamation-circle" style="font-size: 0.72rem;"/> {{ fieldErrors.firstName }}</p>
            </div>
            <div class="auth-field">
              <label class="auth-label">{{ t('sign-up.last-name') }}</label>
              <input v-model="form.lastName" type="text" :placeholder="t('sign-up.last-name-placeholder')" required class="auth-input"/>
              <p v-if="fieldErrors.lastName" class="auth-error"><i class="pi pi-exclamation-circle" style="font-size: 0.72rem;"/> {{ fieldErrors.lastName }}</p>
            </div>
          </div>

          <!-- Business name -->
          <div class="auth-field">
            <label class="auth-label">{{ t('sign-up.business-name') }}</label>
            <div class="relative">
              <i class="pi pi-building auth-input-icon absolute"/>
              <input v-model="form.businessName" type="text" :placeholder="t('sign-up.business-placeholder')" required class="auth-input" style="padding-left: 40px;"/>
            </div>
            <p v-if="fieldErrors.businessName" class="auth-error"><i class="pi pi-exclamation-circle" style="font-size: 0.72rem;"/> {{ fieldErrors.businessName }}</p>
          </div>

          <!-- Email -->
          <div class="auth-field">
            <label class="auth-label">{{ t('sign-up.email') }}</label>
            <div class="relative">
              <i class="pi pi-envelope auth-input-icon absolute"/>
              <input v-model="form.email" type="email" :placeholder="t('sign-up.email-placeholder')" required class="auth-input" style="padding-left: 40px;"/>
            </div>
            <p v-if="fieldErrors.email" class="auth-error"><i class="pi pi-exclamation-circle" style="font-size: 0.72rem;"/> {{ fieldErrors.email }}</p>
          </div>

          <!-- Password + strength -->
          <div class="auth-field">
            <label class="auth-label">{{ t('sign-up.password') }}</label>
            <div class="relative">
              <i class="pi pi-lock auth-input-icon absolute"/>
              <input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  :placeholder="t('sign-up.password-placeholder')"
                  required minlength="8"
                  class="auth-input"
                  style="padding-left: 40px; padding-right: 44px;"
              />
              <button type="button" class="auth-visibility-btn absolute" @click="showPassword = !showPassword">
                <i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size: 0.95rem;"/>
              </button>
            </div>
            <!-- Strength bar + label -->
            <div v-if="form.password.length > 0" class="flex align-items-center gap-2 mt-1">
              <div class="flex gap-1 flex-1">
                <div
                    v-for="i in [1, 2, 3, 4]"
                    :key="i"
                    class="strength-bar flex-1 border-round-lg"
                    :style="{ backgroundColor: computePasswordStrength(form.password) >= i ? resolveStrengthBarColor(computePasswordStrength(form.password)) : 'var(--border)' }"
                />
              </div>
              <span class="strength-label" :style="{ color: resolveStrengthBarColor(computePasswordStrength(form.password)) }">
                {{ strengthLabel(computePasswordStrength(form.password)) }}
              </span>
            </div>
            <p v-if="fieldErrors.password" class="auth-error"><i class="pi pi-exclamation-circle" style="font-size: 0.72rem;"/> {{ fieldErrors.password }}</p>
          </div>

          <!-- Error -->
          <div v-if="localError" class="auth-error-box flex align-items-center gap-2 p-3 border-round-lg">
            <i class="pi pi-exclamation-circle flex-shrink-0" style="color: var(--status-critical-fg); font-size: 0.9rem;"/>
            <p class="m-0" style="color: var(--status-critical-fg); font-size: 0.875rem;">{{ localError }}</p>
          </div>

          <!-- Submit -->
          <button type="submit" :disabled="isLoading" class="auth-submit-btn w-full flex align-items-center justify-content-center gap-2 border-round-xl border-none mt-1">
            <span v-if="isLoading" class="flex align-items-center gap-2">
              <span class="spin-ring"/>
              {{ t('sign-up.loading') }}
            </span>
            <span v-else>{{ t('sign-up.submit') }}</span>
          </button>
        </form>

        <!-- Sign in link -->
        <p class="text-center mt-4 auth-footer-text">
          {{ t('sign-up.has-account') }}
          <button type="button" class="auth-link" style="font-weight: 700;" @click="navigateToSignIn">
            {{ t('sign-up.back-to-login') }}
          </button>
        </p>
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

.auth-feature-icon { width: 36px; height: 36px; background-color: color-mix(in srgb, var(--brand-ink) 12%, transparent); }
.auth-feature-icon i { color: var(--brand-ink); }
.auth-feature-text { color: color-mix(in srgb, var(--brand-ink) 85%, transparent); font-size: 0.9rem; }

.auth-hero-footer { color: color-mix(in srgb, var(--brand-ink) 30%, transparent); font-size: 0.74rem; }

.auth-form-panel { background: var(--bg); }

.auth-back-link { background: none; border: none; color: var(--text-muted); font-size: 0.85rem; font-weight: 500; cursor: pointer; padding: 0; transition: color 0.15s; }
.auth-back-link:hover { color: var(--brand); }

.auth-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
.auth-subtitle { color: var(--text-muted); font-size: 0.92rem; }

.name-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

.auth-field { display: flex; flex-direction: column; gap: 6px; }
.auth-label { display: block; margin-bottom: 6px; font-size: 0.875rem; font-weight: 600; color: var(--text); }

.auth-input-icon { left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-faint); font-size: 0.88rem; pointer-events: none; }

.auth-input {
  width: 100%; border-radius: 12px; padding: 12px 16px;
  background-color: var(--surface-alt); border: 1.5px solid var(--border);
  color: var(--text); font-size: 0.92rem; font-family: var(--font-body);
  outline: none; transition: all 0.2s; box-sizing: border-box;
}
.auth-input:focus {
  border-color: var(--accent); background-color: var(--surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

.auth-visibility-btn {
  right: 12px; top: 50%; transform: translateY(-50%);
  background: none; border: none; color: var(--text-faint); cursor: pointer;
  padding: 4px; border-radius: 6px; display: flex; transition: color 0.15s;
}
.auth-visibility-btn:hover { color: var(--brand); }

.auth-error { margin: 2px 0 0; font-size: 0.78rem; color: var(--status-critical-fg); display: flex; align-items: center; gap: 4px; }

.strength-bar { height: 4px; transition: background-color 0.3s; }
.strength-label { font-size: 0.72rem; font-weight: 600; min-width: 42px; text-align: right; }

.auth-error-box { background-color: var(--status-critical-bg); border: 1px solid color-mix(in srgb, var(--status-critical-fg) 30%, transparent); }

.auth-submit-btn {
  padding: 14px; font-size: 0.95rem; font-weight: 700; color: var(--brand-ink);
  font-family: var(--font-body); transition: all 0.2s; background: var(--brand); cursor: pointer;
}
.auth-submit-btn:hover:not(:disabled) { filter: brightness(1.08); }
.auth-submit-btn:disabled { opacity: 0.75; cursor: not-allowed; }

.auth-link { background: none; border: none; color: var(--brand); font-size: 0.82rem; font-weight: 600; cursor: pointer; padding: 0; transition: color 0.15s; }
.auth-link:hover { color: var(--accent); }

.auth-footer-text { color: var(--text-muted); font-size: 0.875rem; }

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

/* Mobile tweaks: 16px inputs prevent iOS focus-zoom; stack name fields on narrow screens. */
@media (max-width: 640px) {
  .auth-input { font-size: 16px; }
  .auth-title { font-size: 1.4rem; }
}
@media (max-width: 380px) {
  .name-grid { grid-template-columns: 1fr; }
}
</style>
