<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const { t }  = useI18n();
const router = useRouter();

const email      = ref('');
const isLoading  = ref(false);
const emailSent  = ref(false);
const localError = ref('');

async function submitRecovery() {
  if (!email.value || !email.value.includes('@')) {
    localError.value = t('sign-in.error-invalid-email');
    return;
  }
  localError.value = '';
  isLoading.value  = true;
  await new Promise(resolve => setTimeout(resolve, 1500));
  isLoading.value  = false;
  emailSent.value  = true;
}

function retrySubmit() { emailSent.value = false; email.value = ''; }
function navigateToSignIn() { router.push({ name: 'sign-in' }); }
</script>

<template>
  <div class="flex min-h-screen" style="background-color: #FAFAF7;">

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
            <p class="m-0" style="color: #7DD3E8; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;">Recupera tu acceso</p>
          </div>
          <h1 style="color: #FAFAF7; font-size: 2.2rem; font-weight: 700; line-height: 1.2; margin: 0;">
            Tu cuenta está<br/><span style="color: #7DD3E8;">segura</span> con nosotros.
          </h1>
          <p style="color: #93B5C9; font-size: 0.97rem; line-height: 1.75; margin: 0; max-width: 400px;">
            Si olvidaste tu contraseña, te enviaremos un enlace seguro para restablecerla en segundos.
          </p>
        </div>

        <div class="flex flex-column gap-3">
          <div
              v-for="step in [
                { icon: 'pi pi-envelope', text: 'Ingresa tu correo registrado',       color: '#7DD3E8', bg: 'rgba(125,211,232,0.15)', num: '1' },
                { icon: 'pi pi-inbox',    text: 'Revisa tu bandeja de entrada',       color: '#6EE7B7', bg: 'rgba(110,231,183,0.15)', num: '2' },
                { icon: 'pi pi-lock',     text: 'Crea una nueva contraseña segura',   color: '#C4B5FD', bg: 'rgba(196,181,253,0.15)', num: '3' }
              ]"
              :key="step.num"
              class="flex align-items-center gap-3"
          >
            <div class="flex align-items-center justify-content-center border-round-lg flex-shrink-0" style="width: 36px; height: 36px;" :style="{ backgroundColor: step.bg }">
              <i :class="step.icon" style="font-size: 0.9rem;" :style="{ color: step.color }"/>
            </div>
            <span style="color: #BDD4E1; font-size: 0.9rem;">{{ step.text }}</span>
          </div>
        </div>
      </div>

      <p class="relative m-0" style="color: rgba(255,255,255,0.25); font-size: 0.74rem;">© 2026 Bodega Platform</p>
    </div>

    <!-- ── Right panel ─────────────────────────────────────────────── -->
    <div class="flex-1 flex flex-column align-items-center justify-content-center px-5 sm:px-8 py-10 overflow-y-auto">

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
          {{ t('forgot-password.back-link') }}
        </button>

        <!-- Title -->
        <div class="mb-6">
          <h2 class="m-0" style="font-size: 1.6rem; font-weight: 700; color: #0B3558; letter-spacing: -0.01em;">{{ t('forgot-password.title') }}</h2>
          <p class="m-0 mt-1" style="color: #64748B; font-size: 0.92rem;">{{ t('forgot-password.subtitle') }}</p>
        </div>

        <!-- ── Success state ── -->
        <div v-if="emailSent" style="display: flex; flex-direction: column; gap: 1.5rem;">
          <div
              class="border-round-2xl p-6 flex flex-column align-items-center text-center gap-4"
              style="background: linear-gradient(135deg, #E0F2FE, #DBEAFE); border: 1.5px solid #BAE6FD;"
          >
            <div
                class="flex align-items-center justify-content-center border-circle"
                style="width: 64px; height: 64px; background: linear-gradient(135deg, #0E7490, #0B3558); box-shadow: 0 4px 16px rgba(14,116,144,0.35);"
            >
              <i class="pi pi-envelope" style="color: #fff; font-size: 1.5rem;"/>
            </div>
            <div>
              <p class="m-0" style="font-size: 1.05rem; font-weight: 700; color: #0B3558;">{{ t('forgot-password.success-title') }}</p>
              <p class="m-0 mt-2" style="color: #0E7490; font-size: 0.88rem; line-height: 1.6;">
                {{ t('forgot-password.success-body', { email: email }) }}
              </p>
            </div>
            <div class="flex align-items-center gap-2 p-2 border-round-lg w-full" style="background-color: rgba(14,116,144,0.08); justify-content: center;">
              <i class="pi pi-clock" style="color: #0E7490; font-size: 0.8rem;"/>
              <span style="font-size: 0.78rem; color: #0E7490; font-weight: 500;">El enlace expira en 30 minutos</span>
            </div>
          </div>

          <button
              type="button"
              class="w-full flex align-items-center justify-content-center gap-2 border-round-xl border-none cursor-pointer"
              style="padding: 14px; font-size: 0.95rem; font-weight: 700; color: #fff; transition: all 0.2s; box-shadow: 0 4px 16px rgba(14,116,144,0.35); background: linear-gradient(135deg, #0E7490, #0B3558);"
              @click="navigateToSignIn"
              @mouseenter="(e) => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(14,116,144,0.50)'; e.currentTarget.style.transform = 'translateY(-1px)'; }"
              @mouseleave="(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(14,116,144,0.35)'; e.currentTarget.style.transform = 'translateY(0)'; }"
          >
            <i class="pi pi-arrow-left" style="font-size: 0.85rem;"/>
            {{ t('forgot-password.back-to-login') }}
          </button>

          <p class="text-center m-0" style="color: #94A3B8; font-size: 0.82rem;">
            {{ t('forgot-password.resend-question') }}
            <button type="button" class="auth-link" style="font-weight: 700;" @click="retrySubmit">
              {{ t('forgot-password.resend-link') }}
            </button>
          </p>
        </div>

        <!-- ── Form state ── -->
        <form v-else @submit.prevent="submitRecovery" style="display: flex; flex-direction: column; gap: 1.25rem;">
          <div class="auth-field">
            <label class="auth-label">{{ t('forgot-password.email') }}</label>
            <div class="relative">
              <i class="pi pi-envelope absolute" style="left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.88rem; pointer-events: none;"/>
              <input
                  v-model="email"
                  type="email"
                  :placeholder="t('forgot-password.email-placeholder')"
                  required
                  class="auth-input"
                  style="padding-left: 40px;"
              />
            </div>
            <p v-if="localError" class="auth-error">
              <i class="pi pi-exclamation-circle" style="font-size: 0.72rem;"/>
              {{ localError }}
            </p>
          </div>

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
              {{ t('forgot-password.loading') }}
            </span>
            <span v-else class="flex align-items-center gap-2">
              <i class="pi pi-send" style="font-size: 0.85rem;"/>
              {{ t('forgot-password.submit') }}
            </span>
          </button>
        </form>

      </div>
    </div>
  </div>
</template>

<style scoped>
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
  color: #0E7490; font-size: inherit; font-weight: 600;
  cursor: pointer; padding: 0; transition: color 0.15s;
}
.auth-link:hover { color: #0B3558; }

.p-6 { padding: 1.5rem; }
</style>