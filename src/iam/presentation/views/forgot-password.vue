<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import useIamStore from '../../application/iam.store.js';

const { t }    = useI18n();
const router   = useRouter();
const iamStore = useIamStore();

/** email -> code -> password -> success */
const step = ref('email');

const email       = ref('');
const code        = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const showNewPassword = ref(false);

const localError = ref('');
const isLoading  = ref(false);
const resendNotice = ref(false);

function navigateToSignIn() { router.push({ name: 'sign-in' }); }

async function submitEmail() {
  localError.value = '';
  if (!email.value || !email.value.includes('@')) {
    localError.value = t('sign-in.error-invalid-email');
    return;
  }
  isLoading.value = true;
  await iamStore.requestPasswordReset(email.value);
  isLoading.value = false;
  step.value = 'code';
}

async function resendCode() {
  isLoading.value = true;
  await iamStore.requestPasswordReset(email.value);
  isLoading.value = false;
  code.value = '';
  resendNotice.value = true;
  setTimeout(() => { resendNotice.value = false; }, 3500);
}

function backToEmailStep() {
  step.value = 'email';
  code.value = '';
  localError.value = '';
}

async function submitCode() {
  localError.value = '';
  if (!code.value || code.value.length !== 6) {
    localError.value = t('forgot-password.error-code-length');
    return;
  }
  isLoading.value = true;
  const result = await iamStore.verifyResetCode(email.value, code.value);
  isLoading.value = false;
  if (!result.success) {
    localError.value = t('forgot-password.error-invalid-code');
    return;
  }
  step.value = 'password';
}

function computePasswordStrength(password) {
  if (!password) return 0;
  if (password.length < 4)  return 1;
  if (password.length < 7)  return 2;
  if (password.length < 10) return 3;
  return 4;
}
const strengthColors = ['', 'var(--status-critical-fg)', 'var(--status-warning-fg)', 'var(--brand)', 'var(--status-ok-fg)'];
const strengthLabelKeys = ['', 'sign-up.strength-weak', 'sign-up.strength-fair', 'sign-up.strength-good', 'sign-up.strength-strong'];
function strengthLabel(level) { return strengthLabelKeys[level] ? t(strengthLabelKeys[level]) : ''; }

async function submitNewPassword() {
  localError.value = '';
  if (!newPassword.value || newPassword.value.length < 8) {
    localError.value = t('forgot-password.error-password-length');
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    localError.value = t('forgot-password.error-password-mismatch');
    return;
  }
  isLoading.value = true;
  const result = await iamStore.resetPassword(email.value, code.value, newPassword.value);
  isLoading.value = false;
  if (!result.success) {
    localError.value = t('forgot-password.error-reset-failed');
    return;
  }
  step.value = 'success';
}
</script>

<template>
  <div class="auth-screen flex min-h-screen">

    <!-- ── Left panel (desktop only) ──────────────────────────────── -->
    <div class="auth-hero hidden lg:flex flex-column justify-content-between p-8 relative overflow-hidden">
      <div class="auth-hero-circle auth-hero-circle--1" />
      <div class="auth-hero-circle auth-hero-circle--2" />

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

        <button
            v-if="step !== 'success'"
            type="button"
            class="auth-back-link flex align-items-center gap-2 mb-5"
            @click="step === 'email' ? navigateToSignIn() : backToEmailStep()"
        >
          <i class="pi pi-arrow-left" style="font-size: 0.85rem;"/>
          {{ step === 'email' ? t('forgot-password.back-link') : t('forgot-password.change-email-link') }}
        </button>

        <!-- ── Step 1: email ─────────────────────────────────────── -->
        <template v-if="step === 'email'">
          <div class="mb-6">
            <h2 class="m-0 auth-title">{{ t('forgot-password.title') }}</h2>
            <p class="m-0 mt-1 auth-subtitle">{{ t('forgot-password.subtitle') }}</p>
          </div>

          <form @submit.prevent="submitEmail" style="display: flex; flex-direction: column; gap: 1.25rem;">
            <div class="auth-field">
              <label for="forgot-email" class="auth-label">{{ t('sign-in.email') }}</label>
              <div class="relative">
                <i class="pi pi-envelope auth-input-icon absolute"/>
                <input
                    id="forgot-email"
                    v-model="email"
                    type="email"
                    :placeholder="t('sign-in.email-placeholder')"
                    required
                    class="auth-input"
                    style="padding-left: 40px;"
                />
              </div>
            </div>

            <div v-if="localError" class="auth-error-box flex align-items-center gap-2 p-3 border-round-lg">
              <i class="pi pi-exclamation-circle flex-shrink-0" style="color: var(--status-critical-fg); font-size: 0.9rem;"/>
              <p class="m-0" style="color: var(--status-critical-fg); font-size: 0.875rem;">{{ localError }}</p>
            </div>

            <button type="submit" :disabled="isLoading" class="auth-submit-btn w-full flex align-items-center justify-content-center gap-2 border-round-xl border-none">
              <span v-if="isLoading" class="flex align-items-center gap-2">
                <span class="spin-ring"/>
                {{ t('forgot-password.sending') }}
              </span>
              <span v-else class="flex align-items-center gap-2">
                {{ t('forgot-password.submit-request') }}
                <i class="pi pi-arrow-right" style="font-size: 0.85rem;"/>
              </span>
            </button>
          </form>
        </template>

        <!-- ── Step 2: code ──────────────────────────────────────── -->
        <template v-else-if="step === 'code'">
          <div class="mb-6">
            <h2 class="m-0 auth-title">{{ t('forgot-password.step-code-title') }}</h2>
            <p class="m-0 mt-1 auth-subtitle">{{ t('forgot-password.step-code-subtitle', { email }) }}</p>
          </div>

          <form @submit.prevent="submitCode" style="display: flex; flex-direction: column; gap: 1.25rem;">
            <div class="auth-field">
              <label for="forgot-code" class="auth-label">{{ t('forgot-password.code-label') }}</label>
              <div class="relative">
                <i class="pi pi-key auth-input-icon absolute"/>
                <input
                    id="forgot-code"
                    v-model="code"
                    type="text"
                    inputmode="numeric"
                    maxlength="6"
                    autocomplete="one-time-code"
                    :placeholder="t('forgot-password.code-placeholder')"
                    required
                    class="auth-input"
                    style="padding-left: 40px; letter-spacing: 0.35em; font-weight: 700;"
                    @input="code = code.replace(/\D/g, '').slice(0, 6)"
                />
              </div>
            </div>

            <button type="button" class="auth-link" style="width: fit-content;" @click="resendCode" :disabled="isLoading">
              {{ resendNotice ? t('forgot-password.resend-success') : t('forgot-password.resend-link') }}
            </button>

            <div v-if="localError" class="auth-error-box flex align-items-center gap-2 p-3 border-round-lg">
              <i class="pi pi-exclamation-circle flex-shrink-0" style="color: var(--status-critical-fg); font-size: 0.9rem;"/>
              <p class="m-0" style="color: var(--status-critical-fg); font-size: 0.875rem;">{{ localError }}</p>
            </div>

            <button type="submit" :disabled="isLoading" class="auth-submit-btn w-full flex align-items-center justify-content-center gap-2 border-round-xl border-none">
              <span v-if="isLoading" class="flex align-items-center gap-2">
                <span class="spin-ring"/>
                {{ t('forgot-password.verifying') }}
              </span>
              <span v-else class="flex align-items-center gap-2">
                {{ t('forgot-password.verify-submit') }}
                <i class="pi pi-arrow-right" style="font-size: 0.85rem;"/>
              </span>
            </button>
          </form>
        </template>

        <!-- ── Step 3: new password ──────────────────────────────── -->
        <template v-else-if="step === 'password'">
          <div class="mb-6">
            <h2 class="m-0 auth-title">{{ t('forgot-password.step-password-title') }}</h2>
            <p class="m-0 mt-1 auth-subtitle">{{ t('forgot-password.step-password-subtitle') }}</p>
          </div>

          <form @submit.prevent="submitNewPassword" style="display: flex; flex-direction: column; gap: 1.25rem;">
            <div class="auth-field">
              <label for="forgot-new-password" class="auth-label">{{ t('forgot-password.new-password-label') }}</label>
              <div class="relative">
                <i class="pi pi-lock auth-input-icon absolute"/>
                <input
                    id="forgot-new-password"
                    v-model="newPassword"
                    :type="showNewPassword ? 'text' : 'password'"
                    :placeholder="t('sign-up.password-placeholder')"
                    required
                    class="auth-input"
                    style="padding-left: 40px; padding-right: 44px;"
                />
                <button type="button" class="auth-visibility-btn absolute" @click="showNewPassword = !showNewPassword">
                  <i :class="showNewPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size: 0.95rem;"/>
                </button>
              </div>
              <div v-if="newPassword.length > 0" class="flex align-items-center gap-2 mt-1">
                <div class="flex gap-1 flex-1">
                  <div v-for="i in [1,2,3,4]" :key="i" class="flex-1 border-round-lg" style="height: 4px; transition: background-color 0.3s;"
                    :style="{ backgroundColor: computePasswordStrength(newPassword) >= i ? strengthColors[computePasswordStrength(newPassword)] : 'var(--border)' }"
                  />
                </div>
                <span style="font-size: 0.72rem; font-weight: 600; min-width: 42px; text-align: right;" :style="{ color: strengthColors[computePasswordStrength(newPassword)] }">
                  {{ strengthLabel(computePasswordStrength(newPassword)) }}
                </span>
              </div>
            </div>

            <div class="auth-field">
              <label for="forgot-confirm-password" class="auth-label">{{ t('forgot-password.confirm-password-label') }}</label>
              <div class="relative">
                <i class="pi pi-lock auth-input-icon absolute"/>
                <input
                    id="forgot-confirm-password"
                    v-model="confirmPassword"
                    type="password"
                    required
                    class="auth-input"
                    style="padding-left: 40px;"
                />
              </div>
            </div>

            <div v-if="localError" class="auth-error-box flex align-items-center gap-2 p-3 border-round-lg">
              <i class="pi pi-exclamation-circle flex-shrink-0" style="color: var(--status-critical-fg); font-size: 0.9rem;"/>
              <p class="m-0" style="color: var(--status-critical-fg); font-size: 0.875rem;">{{ localError }}</p>
            </div>

            <button type="submit" :disabled="isLoading" class="auth-submit-btn w-full flex align-items-center justify-content-center gap-2 border-round-xl border-none">
              <span v-if="isLoading" class="flex align-items-center gap-2">
                <span class="spin-ring"/>
                {{ t('forgot-password.resetting') }}
              </span>
              <span v-else class="flex align-items-center gap-2">
                {{ t('forgot-password.reset-submit') }}
                <i class="pi pi-check" style="font-size: 0.85rem;"/>
              </span>
            </button>
          </form>
        </template>

        <!-- ── Step 4: success ───────────────────────────────────── -->
        <template v-else>
          <div class="unavailable-card flex flex-column align-items-center text-center gap-3 border-round-xl p-5">
            <div class="unavailable-icon flex align-items-center justify-content-center border-circle" style="background: var(--status-ok-bg); color: var(--status-ok-fg);">
              <i class="pi pi-check-circle" style="font-size: 1.4rem;"/>
            </div>
            <div>
              <p class="m-0 unavailable-title">{{ t('forgot-password.success-title') }}</p>
              <p class="m-0 mt-2 unavailable-body">{{ t('forgot-password.success-body') }}</p>
            </div>
          </div>

          <button type="button" class="auth-submit-btn w-full flex align-items-center justify-content-center gap-2 border-round-xl border-none mt-4" @click="navigateToSignIn">
            {{ t('forgot-password.success-cta') }}
            <i class="pi pi-arrow-right" style="font-size: 0.85rem;"/>
          </button>
        </template>
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

.auth-link { background: none; border: none; color: var(--brand); font-size: 0.82rem; font-weight: 600; cursor: pointer; padding: 0; transition: color 0.15s; }
.auth-link:hover:not(:disabled) { color: var(--accent); }
.auth-link:disabled { opacity: 0.6; cursor: not-allowed; }

.auth-error-box { background-color: var(--status-critical-bg); border: 1px solid color-mix(in srgb, var(--status-critical-fg) 30%, transparent); }

.unavailable-card {
  background: var(--surface-alt);
  border: 1.5px solid var(--border);
}
.unavailable-icon { width: 56px; height: 56px; }
.unavailable-title { font-size: 1rem; font-weight: 700; color: var(--text); }
.unavailable-body { color: var(--text-muted); font-size: 0.875rem; line-height: 1.6; }

.auth-submit-btn {
  padding: 14px; font-size: 0.95rem; font-weight: 700; color: var(--brand-ink);
  font-family: var(--font-body); transition: all 0.2s; background: var(--brand); cursor: pointer;
}
.auth-submit-btn:hover:not(:disabled) { filter: brightness(1.08); }
.auth-submit-btn:disabled { opacity: 0.75; cursor: not-allowed; }

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

@media (max-width: 640px) {
  .auth-input { font-size: 16px; }
  .auth-title { font-size: 1.4rem; }
}
</style>
