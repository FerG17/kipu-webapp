<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import useIamStore from '../../application/iam.store.js';

const { t }    = useI18n();
const router   = useRouter();
const iamStore = useIamStore();

const form = ref({ fullName: '', businessName: '', businessType: '', email: '', password: '' });

const fieldErrors = ref({ fullName: '', businessName: '', businessType: '', email: '', password: '' });

const showPassword = ref(false);
const isLoading    = ref(false);
const localError   = ref('');

const businessTypeOptions = [
  { value: 'BODEGA',   icon: 'pi pi-shopping-cart', labelKey: 'sign-up.type-bodega',   descKey: 'sign-up.type-bodega-desc'   },
  { value: 'FARMACIA', icon: 'pi pi-heart',          labelKey: 'sign-up.type-farmacia', descKey: 'sign-up.type-farmacia-desc' }
];

function computePasswordStrength(password) {
  if (!password) return 0;
  if (password.length < 4)  return 1;
  if (password.length < 7)  return 2;
  if (password.length < 10) return 3;
  return 4;
}

const strengthLabelKeys = ['', 'sign-up.strength-weak', 'sign-up.strength-fair', 'sign-up.strength-good', 'sign-up.strength-strong'];
const strengthColors = ['', '#EF4444', '#FACC15', '#0E7490', '#16A34A'];

function resolveStrengthBarColor(level) { return strengthColors[level] || '#E2E8F0'; }
function strengthLabel(level) { return strengthLabelKeys[level] ? t(strengthLabelKeys[level]) : ''; }

function validateForm() {
  fieldErrors.value = { fullName: '', businessName: '', businessType: '', email: '', password: '' };
  let isValid = true;
  if (!form.value.fullName.trim())    { fieldErrors.value.fullName     = t('sign-up.error-full-name');    isValid = false; }
  if (!form.value.businessName.trim()) { fieldErrors.value.businessName = t('sign-up.error-business-name'); isValid = false; }
  if (!form.value.businessType)        { fieldErrors.value.businessType = t('sign-up.error-business-type'); isValid = false; }
  if (!form.value.email || !form.value.email.includes('@')) { fieldErrors.value.email = t('sign-up.error-email');    isValid = false; }
  if (!form.value.password || form.value.password.length < 8) { fieldErrors.value.password = t('sign-up.error-password'); isValid = false; }
  return isValid;
}

async function submitSignUp() {
  if (!validateForm()) return;
  isLoading.value = true;
  localError.value = '';
  try {
    await iamStore.signUp({ fullName: form.value.fullName, businessName: form.value.businessName, businessType: form.value.businessType, email: form.value.email, password: form.value.password });
    router.push({ name: 'dashboard' });
  } catch {
    localError.value = t('sign-up.error-submit-failed');
  } finally {
    isLoading.value = false;
  }
}

function navigateToSignIn() { router.push({ name: 'sign-in' }); }

function selectBusinessType(typeValue) {
  form.value.businessType = typeValue;
  fieldErrors.value.businessType = '';
}
</script>

<template>
  <div class="auth-screen flex min-h-screen" style="background-color: #FAFAF7;">

    <!-- ── Left panel (desktop only) ──────────────────────────────── -->
    <div
        class="hidden lg:flex flex-column justify-content-between p-8 relative overflow-hidden"
        style="width: 58%; background: linear-gradient(160deg, #0B3558 0%, #0E4A6B 60%, #0B3558 100%); flex-shrink: 0;"
    >
      <div class="absolute" style="top: -144px; right: -144px; width: 440px; height: 440px; border-radius: 50%; background-color: #0E7490; opacity: 0.10;"/>
      <div class="absolute" style="bottom: -176px; left: -112px; width: 400px; height: 400px; border-radius: 50%; background-color: #0E7490; opacity: 0.07;"/>
      <div class="absolute" style="top: 35%; left: -60px; width: 200px; height: 200px; border-radius: 50%; background-color: #BAE6FD; opacity: 0.06;"/>

      <!-- Logo -->
      <div class="relative flex align-items-center gap-3">
        <img src="../../../assets/qullqa_logo.jpeg" alt="Bodega Platform" style="width: 48px; height: 48px; object-fit: contain; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);"/>
        <span style="color: #FAFAF7; font-size: 1.35rem; font-weight: 700; letter-spacing: 0.02em;">Bodega Platform</span>
      </div>

      <!-- Center content -->
      <div class="relative flex flex-column gap-6">
        <div class="flex flex-column gap-3">
          <div class="flex align-items-center gap-2" style="width: fit-content; background-color: rgba(14,116,144,0.2); border: 1px solid rgba(14,116,144,0.4); border-radius: 20px; padding: 4px 12px;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background-color: #0E7490; display: inline-block;"/>
            <p class="m-0" style="color: #7DD3E8; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;">Únete gratis</p>
          </div>
          <h1 style="color: #FAFAF7; font-size: 2.2rem; font-weight: 700; line-height: 1.2; margin: 0;">
            Tu negocio, más<br/><span style="color: #7DD3E8;">inteligente</span> que nunca.
          </h1>
          <p style="color: #93B5C9; font-size: 0.97rem; line-height: 1.75; margin: 0; max-width: 400px;">
            Crea tu cuenta en segundos y empieza a controlar tu inventario con alertas, reportes y ventas en un solo lugar.
          </p>
        </div>

        <div class="flex flex-column gap-3">
          <div
              v-for="feature in [
                { icon: 'pi pi-check-circle', text: 'Registro en menos de 2 minutos',   color: '#6EE7B7', bg: 'rgba(110,231,183,0.15)' },
                { icon: 'pi pi-credit-card',  text: 'Sin tarjeta de crédito requerida', color: '#7DD3E8', bg: 'rgba(125,211,232,0.15)' },
                { icon: 'pi pi-lock',          text: 'Datos seguros y encriptados',       color: '#C4B5FD', bg: 'rgba(196,181,253,0.15)' }
              ]"
              :key="feature.text"
              class="flex align-items-center gap-3"
          >
            <div
                class="flex align-items-center justify-content-center border-round-lg flex-shrink-0"
                style="width: 36px; height: 36px;"
                :style="{ backgroundColor: feature.bg }"
            >
              <i :class="feature.icon" style="font-size: 0.9rem;" :style="{ color: feature.color }"/>
            </div>
            <span style="color: #BDD4E1; font-size: 0.9rem;">{{ feature.text }}</span>
          </div>
        </div>
      </div>

      <p class="relative m-0" style="color: rgba(255,255,255,0.25); font-size: 0.74rem;">© 2026 Bodega Platform</p>
    </div>

    <!-- ── Right panel ─────────────────────────────────────────────── -->
    <div class="flex-1 flex flex-column align-items-center justify-content-center px-4 sm:px-8 py-8 sm:py-10 overflow-y-auto">

      <!-- Mobile logo -->
      <div class="flex lg:hidden align-items-center gap-3 mb-6">
        <img src="../../../assets/qullqa_logo.jpeg" alt="Bodega Platform" style="width: 40px; height: 40px; border-radius: 8px;"/>
        <span style="font-size: 1.2rem; font-weight: 700; color: #0B3558;">Bodega Platform</span>
      </div>

      <div style="width: 100%; max-width: 420px;">

        <!-- Back link -->
        <button
            type="button"
            class="flex align-items-center gap-2 mb-5"
            style="background: none; border: none; color: #64748B; font-size: 0.85rem; font-weight: 500; cursor: pointer; padding: 0; transition: color 0.15s;"
            @click="navigateToSignIn"
            @mouseenter="(e) => e.currentTarget.style.color = '#0E7490'"
            @mouseleave="(e) => e.currentTarget.style.color = '#64748B'"
        >
          <i class="pi pi-arrow-left" style="font-size: 0.85rem;"/>
          {{ t('sign-up.back-link') }}
        </button>

        <!-- Title -->
        <div class="mb-5">
          <h2 class="m-0" style="font-size: 1.6rem; font-weight: 700; color: #0B3558; letter-spacing: -0.01em;">{{ t('sign-up.title') }}</h2>
          <p class="m-0 mt-1" style="color: #64748B; font-size: 0.92rem;">{{ t('sign-up.subtitle') }}</p>
        </div>

        <form @submit.prevent="submitSignUp" style="display: flex; flex-direction: column; gap: 1rem;">

          <!-- Full name -->
          <div class="auth-field">
            <label class="auth-label">{{ t('sign-up.full-name') }}</label>
            <div class="relative">
              <i class="pi pi-user absolute" style="left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.88rem; pointer-events: none;"/>
              <input v-model="form.fullName" type="text" :placeholder="t('sign-up.full-name-placeholder')" required class="auth-input" style="padding-left: 40px;"/>
            </div>
            <p v-if="fieldErrors.fullName" class="auth-error"><i class="pi pi-exclamation-circle" style="font-size: 0.72rem;"/> {{ fieldErrors.fullName }}</p>
          </div>

          <!-- Business name -->
          <div class="auth-field">
            <label class="auth-label">{{ t('sign-up.business-name') }}</label>
            <div class="relative">
              <i class="pi pi-building absolute" style="left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.88rem; pointer-events: none;"/>
              <input v-model="form.businessName" type="text" :placeholder="t('sign-up.business-placeholder')" required class="auth-input" style="padding-left: 40px;"/>
            </div>
            <p v-if="fieldErrors.businessName" class="auth-error"><i class="pi pi-exclamation-circle" style="font-size: 0.72rem;"/> {{ fieldErrors.businessName }}</p>
          </div>

          <!-- Business type -->
          <div class="auth-field">
            <label class="auth-label">{{ t('sign-up.business-type') }}</label>
            <div class="business-type-grid">
              <button
                  v-for="typeOption in businessTypeOptions"
                  :key="typeOption.value"
                  type="button"
                  class="border-round-xl p-3 text-left cursor-pointer"
                  style="transition: all 0.18s; display: flex; flex-direction: column; gap: 6px;"
                  :style="{
                    backgroundColor: form.businessType === typeOption.value ? '#E0F2FE' : '#F1F5F9',
                    border:          form.businessType === typeOption.value ? '1.5px solid #0E7490' : '1.5px solid #E2E8F0',
                    boxShadow:       form.businessType === typeOption.value ? '0 0 0 3px rgba(14,116,144,0.12)' : 'none'
                  }"
                  @click="selectBusinessType(typeOption.value)"
              >
                <div
                    class="flex align-items-center justify-content-center border-round-lg flex-shrink-0"
                    style="width: 32px; height: 32px; margin-bottom: 2px;"
                    :style="{ backgroundColor: form.businessType === typeOption.value ? 'rgba(14,116,144,0.15)' : '#E2E8F0' }"
                >
                  <i :class="typeOption.icon" style="font-size: 0.88rem;" :style="{ color: form.businessType === typeOption.value ? '#0E7490' : '#94A3B8' }"/>
                </div>
                <p class="m-0" style="font-size: 0.82rem; font-weight: 700;" :style="{ color: form.businessType === typeOption.value ? '#0E7490' : '#1E293B' }">
                  {{ t(typeOption.labelKey) }}
                </p>
                <p class="m-0" style="font-size: 0.74rem; color: #64748B; line-height: 1.4;">{{ t(typeOption.descKey) }}</p>
              </button>
            </div>
            <p v-if="fieldErrors.businessType" class="auth-error"><i class="pi pi-exclamation-circle" style="font-size: 0.72rem;"/> {{ fieldErrors.businessType }}</p>
          </div>

          <!-- Email -->
          <div class="auth-field">
            <label class="auth-label">{{ t('sign-up.email') }}</label>
            <div class="relative">
              <i class="pi pi-envelope absolute" style="left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.88rem; pointer-events: none;"/>
              <input v-model="form.email" type="email" :placeholder="t('sign-up.email-placeholder')" required class="auth-input" style="padding-left: 40px;"/>
            </div>
            <p v-if="fieldErrors.email" class="auth-error"><i class="pi pi-exclamation-circle" style="font-size: 0.72rem;"/> {{ fieldErrors.email }}</p>
          </div>

          <!-- Password + strength -->
          <div class="auth-field">
            <label class="auth-label">{{ t('sign-up.password') }}</label>
            <div class="relative">
              <i class="pi pi-lock absolute" style="left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.88rem; pointer-events: none;"/>
              <input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  :placeholder="t('sign-up.password-placeholder')"
                  required minlength="8"
                  class="auth-input"
                  style="padding-left: 40px; padding-right: 44px;"
              />
              <button
                  type="button"
                  class="absolute"
                  style="right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94A3B8; cursor: pointer; padding: 4px; border-radius: 6px; display: flex; transition: color 0.15s;"
                  @click="showPassword = !showPassword"
                  @mouseenter="(e) => e.currentTarget.style.color = '#0E7490'"
                  @mouseleave="(e) => e.currentTarget.style.color = '#94A3B8'"
              >
                <i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size: 0.95rem;"/>
              </button>
            </div>
            <!-- Strength bar + label -->
            <div v-if="form.password.length > 0" class="flex align-items-center gap-2 mt-1">
              <div class="flex gap-1 flex-1">
                <div
                    v-for="i in [1, 2, 3, 4]"
                    :key="i"
                    class="flex-1 border-round-lg"
                    style="height: 4px; transition: background-color 0.3s;"
                    :style="{ backgroundColor: computePasswordStrength(form.password) >= i ? resolveStrengthBarColor(computePasswordStrength(form.password)) : '#E2E8F0' }"
                />
              </div>
              <span style="font-size: 0.72rem; font-weight: 600; min-width: 42px; text-align: right;" :style="{ color: resolveStrengthBarColor(computePasswordStrength(form.password)) }">
                {{ strengthLabel(computePasswordStrength(form.password)) }}
              </span>
            </div>
            <p v-if="fieldErrors.password" class="auth-error"><i class="pi pi-exclamation-circle" style="font-size: 0.72rem;"/> {{ fieldErrors.password }}</p>
          </div>

          <!-- Error -->
          <div
              v-if="localError"
              class="flex align-items-center gap-2 p-3 border-round-lg"
              style="background-color: #FEE2E2; border: 1px solid #FECACA;"
          >
            <i class="pi pi-exclamation-circle flex-shrink-0" style="color: #DC2626; font-size: 0.9rem;"/>
            <p class="m-0" style="color: #DC2626; font-size: 0.875rem;">{{ localError }}</p>
          </div>

          <!-- Submit -->
          <button
              type="submit"
              :disabled="isLoading"
              class="w-full flex align-items-center justify-content-center gap-2 border-round-xl border-none mt-1"
              style="padding: 14px; font-size: 0.95rem; font-weight: 700; color: #fff; transition: all 0.2s; box-shadow: 0 4px 16px rgba(14,116,144,0.35); background: linear-gradient(135deg, #0E7490, #0B3558);"
              :style="{ opacity: isLoading ? 0.75 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }"
              @mouseenter="(e) => { if (!isLoading) { e.currentTarget.style.boxShadow = '0 6px 24px rgba(14,116,144,0.50)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }"
              @mouseleave="(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(14,116,144,0.35)'; e.currentTarget.style.transform = 'translateY(0)'; }"
          >
            <span v-if="isLoading" class="flex align-items-center gap-2">
              <span class="spin-ring"/>
              {{ t('sign-up.loading') }}
            </span>
            <span v-else>{{ t('sign-up.submit') }}</span>
          </button>

          <!-- Terms -->
          <p class="text-center m-0" style="color: #94A3B8; font-size: 0.78rem; line-height: 1.5;">
            {{ t('sign-up.terms-pre') }}
            <span style="color: #0E7490; font-weight: 600; cursor: pointer;">{{ t('sign-up.terms-link') }}</span>
            {{ t('sign-up.terms-and') }}
            <span style="color: #0E7490; font-weight: 600; cursor: pointer;">{{ t('sign-up.privacy-link') }}</span>.
          </p>
        </form>

        <!-- Sign in link -->
        <p class="text-center mt-4" style="color: #64748B; font-size: 0.875rem;">
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
/* Use dynamic viewport height so mobile browser chrome doesn't clip the layout. */
.auth-screen { min-height: 100vh; min-height: 100dvh; }

/* Desktop: lock the screen to the viewport so the left brand panel stays static
   and only the right form panel scrolls (the right panel has overflow-y-auto). */
@media (min-width: 1024px) {
  .auth-screen { height: 100vh; height: 100dvh; overflow: hidden; }
}

.business-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

@keyframes spin { to { transform: rotate(360deg); } }

.spin-ring {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
  display: inline-block; flex-shrink: 0;
}

.auth-field { display: flex; flex-direction: column; gap: 6px; }

.auth-label {
  display: block; margin-bottom: 6px;
  font-size: 0.875rem; font-weight: 600; color: #1E293B;
}

.auth-input {
  width: 100%; border-radius: 12px;
  padding: 12px 16px;
  background-color: #F1F5F9;
  border: 1.5px solid #E2E8F0;
  color: #0B3558; font-size: 0.92rem;
  outline: none; transition: all 0.2s;
  box-sizing: border-box;
}
.auth-input:focus {
  border-color: #0E7490;
  background-color: #fff;
  box-shadow: 0 0 0 3px rgba(14,116,144,0.12);
}

.auth-error {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: #DC2626;
  display: flex; align-items: center; gap: 4px;
}

.auth-link {
  background: none; border: none;
  color: #0E7490; font-size: 0.82rem; font-weight: 600;
  cursor: pointer; padding: 0; transition: color 0.15s;
}
.auth-link:hover { color: #0B3558; }

/* Mobile tweaks: 16px inputs prevent iOS focus-zoom; stack type cards on narrow screens. */
@media (max-width: 640px) {
  .auth-input { font-size: 16px; }
  .auth-screen h2 { font-size: 1.4rem; }
}
@media (max-width: 380px) {
  .business-type-grid { grid-template-columns: 1fr; }
}
</style>