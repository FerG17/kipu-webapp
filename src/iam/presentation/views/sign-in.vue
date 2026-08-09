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

function navigateToSignUp() { router.push({ name: 'sign-up' }); }
function navigateToForgotPassword() { router.push({ name: 'forgot-password' }); }
</script>

<template>
  <div class="auth-screen flex min-h-screen" style="background-color: #FAFAF7;">

    <!-- ── Left panel (desktop only) ──────────────────────────────── -->
    <div
        class="hidden lg:flex flex-column justify-content-between p-8 relative overflow-hidden"
        style="width: 58%; background: linear-gradient(160deg, #0B3558 0%, #0E4A6B 60%, #0B3558 100%); flex-shrink: 0;"
    >
      <!-- Decorative circles -->
      <div class="absolute" style="top: -144px; right: -144px; width: 440px; height: 440px; border-radius: 50%; background-color: #0E7490; opacity: 0.10;"/>
      <div class="absolute" style="bottom: -176px; left: -112px; width: 400px; height: 400px; border-radius: 50%; background-color: #0E7490; opacity: 0.07;"/>
      <div class="absolute" style="top: 50%; right: -80px; width: 280px; height: 280px; border-radius: 50%; background-color: #E0F2FE; opacity: 0.05; transform: translateY(-50%);"/>
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
            <p class="m-0" style="color: #7DD3E8; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;">
              Gestión inteligente
            </p>
          </div>
          <h1 style="color: #FAFAF7; font-size: 2.4rem; font-weight: 700; line-height: 1.2; margin: 0;">
            Controla tu inventario,<br/>
            <span style="color: #7DD3E8;">impulsa</span> tu rentabilidad.
          </h1>
          <p style="color: #93B5C9; font-size: 0.97rem; line-height: 1.75; margin: 0; max-width: 400px;">
            La plataforma diseñada para bodegas y farmacias independientes. Gestiona stock, ventas y alertas desde un solo lugar.
          </p>
        </div>

        <!-- Feature list -->
        <div class="flex flex-column gap-3">
          <div
              v-for="feature in [
                { icon: 'pi pi-chart-bar', text: 'Dashboard de inventario en tiempo real',  color: '#0E7490', bg: 'rgba(14,116,144,0.2)' },
                { icon: 'pi pi-bell',      text: 'Alertas de vencimiento y stock bajo',     color: '#7DD3E8', bg: 'rgba(125,211,232,0.15)' },
                { icon: 'pi pi-shield',    text: 'Control seguro de accesos por rol',        color: '#6EE7B7', bg: 'rgba(110,231,183,0.15)' }
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

        <!-- Stats strip -->
        <div class="flex gap-4 pt-2" style="border-top: 1px solid rgba(255,255,255,0.08);">
          <div v-for="stat in [{ value: '500+', label: 'Negocios' }, { value: '99.9%', label: 'Uptime' }, { value: '24/7', label: 'Soporte' }]" :key="stat.label">
            <p class="m-0" style="color: #FAFAF7; font-size: 1.1rem; font-weight: 700;">{{ stat.value }}</p>
            <p class="m-0" style="color: #64A0B8; font-size: 0.72rem;">{{ stat.label }}</p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <p class="relative m-0" style="color: rgba(255,255,255,0.25); font-size: 0.74rem;">© 2026 Bodega Platform</p>
    </div>

    <!-- ── Right panel ─────────────────────────────────────────────── -->
    <div class="flex-1 flex flex-column align-items-center justify-content-center px-4 sm:px-8 py-8 sm:py-10 overflow-y-auto">

      <!-- Mobile logo -->
      <div class="flex lg:hidden align-items-center gap-3 mb-8">
        <img src="../../../assets/qullqa_logo.jpeg" alt="Bodega Platform" style="width: 40px; height: 40px; object-fit: contain; border-radius: 8px;"/>
        <span style="font-size: 1.2rem; font-weight: 700; color: #0B3558;">Bodega Platform</span>
      </div>

      <div style="width: 100%; max-width: 420px;">

        <!-- Title -->
        <div class="mb-7">
          <h2 class="m-0" style="font-size: 1.6rem; font-weight: 700; color: #0B3558; letter-spacing: -0.01em;">{{ t('sign-in.title') }}</h2>
          <p class="m-0 mt-1" style="color: #64748B; font-size: 0.92rem;">{{ t('sign-in.subtitle') }}</p>
        </div>

        <!-- Form -->
        <form @submit.prevent="submitSignIn" style="display: flex; flex-direction: column; gap: 1.25rem;">

          <!-- Email -->
          <div class="auth-field">
            <label for="sign-in-email" class="auth-label">{{ t('sign-in.email') }}</label>
            <div class="relative">
              <i class="pi pi-envelope absolute" style="left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.88rem; pointer-events: none;"/>
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
              <button
                  type="button"
                  class="auth-link"
                  @click="navigateToForgotPassword"
              >
                {{ t('sign-in.forgot-password') }}
              </button>
            </div>
            <div class="relative">
              <i class="pi pi-lock absolute" style="left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.88rem; pointer-events: none;"/>
              <input
                  id="sign-in-password"
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  :placeholder="t('sign-in.password-placeholder')"
                  required
                  class="auth-input"
                  style="padding-left: 40px; padding-right: 44px;"
              />
              <button
                  type="button"
                  class="absolute"
                  style="right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94A3B8; cursor: pointer; padding: 4px; border-radius: 6px; display: flex; align-items: center; transition: color 0.15s;"
                  @click="showPassword = !showPassword"
                  @mouseenter="(e) => e.currentTarget.style.color = '#0E7490'"
                  @mouseleave="(e) => e.currentTarget.style.color = '#94A3B8'"
              >
                <i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size: 0.95rem;"/>
              </button>
            </div>
          </div>

          <!-- Remember me -->
          <div class="flex align-items-center gap-2">
            <button
                type="button"
                class="flex align-items-center justify-content-center border-round flex-shrink-0"
                style="width: 20px; height: 20px; border: none; cursor: pointer; transition: all 0.2s;"
                :style="{
                  backgroundColor: form.rememberMe ? '#0E7490' : '#F1F5F9',
                  border:          form.rememberMe ? 'none' : '1.5px solid #CBD5E1'
                }"
                @click="form.rememberMe = !form.rememberMe"
            >
              <i v-if="form.rememberMe" class="pi pi-check" style="color: #fff; font-size: 0.65rem;"/>
            </button>
            <span style="color: #64748B; font-size: 0.875rem;">{{ t('sign-in.remember-me') }}</span>
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
              class="w-full flex align-items-center justify-content-center gap-2 border-round-xl border-none"
              style="padding: 14px; font-size: 0.95rem; font-weight: 700; color: #fff; transition: all 0.2s; box-shadow: 0 4px 16px rgba(14,116,144,0.35); background: linear-gradient(135deg, #0E7490, #0B3558);"
              :style="{ opacity: isLoading ? 0.75 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }"
              @mouseenter="(e) => { if (!isLoading) { e.currentTarget.style.boxShadow = '0 6px 24px rgba(14,116,144,0.50)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }"
              @mouseleave="(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(14,116,144,0.35)'; e.currentTarget.style.transform = 'translateY(0)'; }"
          >
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

        <!-- Register link -->
        <p class="text-center mt-5" style="color: #64748B; font-size: 0.875rem;">
          {{ t('sign-in.no-account') }}
          <button type="button" class="auth-link" style="font-weight: 700;" @click="navigateToSignUp">
            {{ t('sign-in.register') }}
          </button>
        </p>
      </div>

      <p class="mt-8" style="color: #CBD5E1; font-size: 0.74rem;">
        © 2026 Bodega Platform · Todos los derechos reservados
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Use dynamic viewport height so mobile browser chrome doesn't clip the layout. */
.auth-screen { min-height: 100vh; min-height: 100dvh; }

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

.auth-link {
  background: none; border: none;
  color: #0E7490; font-size: 0.82rem; font-weight: 600;
  cursor: pointer; padding: 0;
  transition: color 0.15s;
}
.auth-link:hover { color: #0B3558; }

.mb-7 { margin-bottom: 1.75rem; }
.mb-8 { margin-bottom: 2rem; }

/* Mobile tweaks: 16px inputs prevent iOS focus-zoom; trim oversized title/spacing. */
@media (max-width: 640px) {
  .auth-input { font-size: 16px; }
  .auth-screen h2 { font-size: 1.4rem; }
  .mb-7 { margin-bottom: 1.25rem; }
  .mb-8 { margin-bottom: 1.5rem; }
}
</style>