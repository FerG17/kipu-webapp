<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n }      from 'vue-i18n';
import useIamStore      from '../../application/iam.store.js';
import { UserAccount }  from '../../domain/model/user-account.entity.js';
import { roleLabelKey } from '../role-labels.js';

/**
 * InviteUserModal component for the Identity & Access Management bounded context.
 *
 * Inline modal for inviting a new team member from Settings → Users. Calls
 * the backend's real invite endpoint (POST /users) directly with a
 * temporary password the admin sets here — there is no email-invite flow.
 *
 * Business rules:
 * - firstName and lastName are each required (minimum 2 characters).
 * - email is required and must contain '@'.
 * - roleId is required (one of the roles loaded from the API).
 * - temporary password is required, minimum 8 characters.
 *
 * @component InviteUserModal
 */

const emit = defineEmits([
  /** Emitted after the user has been successfully created. */
  'invited',
  /** Emitted when the user closes the modal without saving. */
  'close'
]);

const { t }    = useI18n();
const iamStore = useIamStore();

const firstName = ref('');
const lastName  = ref('');
const email     = ref('');
const roleId    = ref('');
const password  = ref('');
const showPassword = ref(false);

/** @type {import('vue').Ref<Record<string, string>>} */
const fieldErrors = ref({});
const saving  = ref(false);
const submitError = ref('');

onMounted(() => {
  if (!iamStore.rolesLoaded) iamStore.fetchRoles();
});

/**
 * Resolves a role's position to a display label, same mapping used in settings.vue.
 * @param {string} position
 * @returns {string}
 */
function roleLabel(position) {
  return t(roleLabelKey(position));
}

const isFormValid = computed(() =>
    firstName.value.trim().length >= 2 &&
    lastName.value.trim().length >= 2 &&
    email.value.includes('@') &&
    roleId.value !== '' &&
    password.value.length >= 8
);

function validateForm() {
  fieldErrors.value = {};
  if (firstName.value.trim().length < 2)     fieldErrors.value.firstName = t('settings.invite-error-name');
  if (lastName.value.trim().length < 2)      fieldErrors.value.lastName  = t('settings.invite-error-last-name');
  if (!email.value.includes('@'))            fieldErrors.value.email    = t('settings.invite-error-email');
  if (roleId.value === '')                   fieldErrors.value.roleId   = t('settings.invite-error-role');
  if (password.value.length < 8)             fieldErrors.value.password = t('settings.invite-error-password');
  return Object.keys(fieldErrors.value).length === 0;
}

async function handleSubmit() {
  submitError.value = '';
  if (!validateForm() || saving.value) return;

  saving.value = true;

  const userAccount = new UserAccount({
    email:      email.value.trim(),
    firstName:  firstName.value.trim(),
    lastName:   lastName.value.trim(),
    businessId: iamStore.currentUser?.businessId ?? null,
    status:     'ACTIVE',
    roleId:     parseInt(roleId.value)
  });

  const result = await iamStore.addUser(userAccount, password.value);
  saving.value = false;

  if (result.success) {
    emit('invited');
  } else {
    submitError.value = t('settings.invite-error-generic');
  }
}
</script>

<template>
  <div
      class="fixed inset-0 z-50 flex align-items-end sm:align-items-center justify-content-center"
      style="background-color: rgba(0,0,0,0.5);"
      @click.self="emit('close')"
  >
    <div
        class="w-full border-round-top-2xl sm:border-round-2xl shadow-8"
        style="max-width: 420px; background-color: #fff; border: 1px solid #E2E8F0;"
    >
      <!-- Header -->
      <div class="flex align-items-center justify-content-between px-5 pt-5 pb-3" style="border-bottom: 1px solid #F1F5F9;">
        <h2 class="m-0" style="font-size: 1.05rem; font-weight: 700; color: #0B3558;">
          {{ t('settings.invite-modal-title') }}
        </h2>
        <button style="background: none; border: none; cursor: pointer; padding: 4px;" @click="emit('close')">
          <i class="pi pi-times" style="color: #94A3B8; font-size: 1.1rem;"/>
        </button>
      </div>

      <!-- Form -->
      <form class="px-5 pb-5 pt-4" style="display: flex; flex-direction: column; gap: 12px;" @submit.prevent="handleSubmit">

        <!-- First / last name -->
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 12px; display: grid;">
          <div>
            <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: #64748B;">
              {{ t('settings.invite-field-name') }} *
            </label>
            <input
                v-model="firstName" type="text" :placeholder="t('settings.invite-field-name-placeholder')"
                class="w-full border-round-lg px-3 py-2"
                style="border: 1px solid #E2E8F0; font-size: 0.88rem; color: #1E293B; outline: none;"
                @focus="(e) => e.target.style.borderColor = '#0E7490'"
                @blur="(e) => e.target.style.borderColor = fieldErrors.firstName ? '#EF4444' : '#E2E8F0'"
            />
            <small v-if="fieldErrors.firstName" style="color: #EF4444; font-size: 0.72rem;">{{ fieldErrors.firstName }}</small>
          </div>
          <div>
            <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: #64748B;">
              {{ t('settings.invite-field-last-name') }} *
            </label>
            <input
                v-model="lastName" type="text" :placeholder="t('settings.invite-field-last-name-placeholder')"
                class="w-full border-round-lg px-3 py-2"
                style="border: 1px solid #E2E8F0; font-size: 0.88rem; color: #1E293B; outline: none;"
                @focus="(e) => e.target.style.borderColor = '#0E7490'"
                @blur="(e) => e.target.style.borderColor = fieldErrors.lastName ? '#EF4444' : '#E2E8F0'"
            />
            <small v-if="fieldErrors.lastName" style="color: #EF4444; font-size: 0.72rem;">{{ fieldErrors.lastName }}</small>
          </div>
        </div>

        <!-- Email -->
        <div>
          <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: #64748B;">
            {{ t('settings.invite-field-email') }} *
          </label>
          <input
              v-model="email" type="email" :placeholder="t('settings.invite-field-email-placeholder')"
              class="w-full border-round-lg px-3 py-2"
              style="border: 1px solid #E2E8F0; font-size: 0.88rem; color: #1E293B; outline: none;"
              @focus="(e) => e.target.style.borderColor = '#0E7490'"
              @blur="(e) => e.target.style.borderColor = fieldErrors.email ? '#EF4444' : '#E2E8F0'"
          />
          <small v-if="fieldErrors.email" style="color: #EF4444; font-size: 0.72rem;">{{ fieldErrors.email }}</small>
        </div>

        <!-- Role -->
        <div>
          <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: #64748B;">
            {{ t('settings.invite-field-role') }} *
          </label>
          <select
              v-model="roleId"
              class="w-full border-round-lg px-3 py-2"
              style="border: 1px solid #E2E8F0; font-size: 0.88rem; color: #1E293B; outline: none; background: #fff;"
          >
            <option value="" disabled>{{ t('settings.invite-field-role-placeholder') }}</option>
            <option v-for="role in iamStore.roles" :key="role.id" :value="String(role.id)">
              {{ roleLabel(role.position) }}
            </option>
          </select>
          <small v-if="fieldErrors.roleId" style="color: #EF4444; font-size: 0.72rem;">{{ fieldErrors.roleId }}</small>
        </div>

        <!-- Temporary password -->
        <div>
          <label class="block mb-1" style="font-size: 0.78rem; font-weight: 600; color: #64748B;">
            {{ t('settings.invite-field-password') }} *
          </label>
          <div class="relative">
            <input
                v-model="password" :type="showPassword ? 'text' : 'password'"
                :placeholder="t('settings.invite-field-password-placeholder')"
                class="w-full border-round-lg px-3 py-2"
                style="border: 1px solid #E2E8F0; font-size: 0.88rem; color: #1E293B; outline: none; padding-right: 40px;"
                @focus="(e) => e.target.style.borderColor = '#0E7490'"
                @blur="(e) => e.target.style.borderColor = fieldErrors.password ? '#EF4444' : '#E2E8F0'"
            />
            <button
                type="button" class="absolute" style="right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94A3B8; cursor: pointer; padding: 4px;"
                @click="showPassword = !showPassword"
            >
              <i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size: 0.9rem;"/>
            </button>
          </div>
          <small v-if="fieldErrors.password" style="color: #EF4444; font-size: 0.72rem;">{{ fieldErrors.password }}</small>
          <p class="m-0 mt-1" style="font-size: 0.72rem; color: #94A3B8;">{{ t('settings.invite-field-password-hint') }}</p>
        </div>

        <p v-if="submitError" class="m-0" style="color: #EF4444; font-size: 0.78rem;">{{ submitError }}</p>

        <!-- Actions -->
        <div class="flex gap-2 mt-1">
          <button
              type="button"
              class="flex-1 border-round-xl py-3"
              style="border: 1px solid #E2E8F0; color: #64748B; font-size: 0.88rem; font-weight: 600; background: #fff; cursor: pointer;"
              @click="emit('close')"
          >
            {{ t('settings.invite-btn-cancel') }}
          </button>
          <button
              type="submit"
              class="flex-1 border-round-xl py-3"
              :style="{
                backgroundColor: isFormValid ? '#0B3558' : '#CBD5E1',
                color: '#fff', fontSize: '0.88rem', fontWeight: 600, border: 'none',
                cursor: isFormValid && !saving ? 'pointer' : 'not-allowed'
              }"
              :disabled="!isFormValid || saving"
          >
            <i v-if="saving" class="pi pi-spin pi-spinner"/>
            <span v-else>{{ t('settings.invite-btn-submit') }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
