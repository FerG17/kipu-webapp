<script setup>
import { onMounted, ref, toRefs, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue';
import useIamStore from '../../application/iam.store.js';
import LanguageSwitcher from '../../../shared/presentation/components/language-switcher.vue';
import InviteUserModal from '../components/invite-user-modal.vue';
import { roleLabelKey, roleStyleByPosition } from '../role-labels.js';

const { t }    = useI18n();
const confirm  = useConfirm();
const iamStore = useIamStore();

const { users, usersLoaded, rolesLoaded, currentBusiness, businessLoaded } = toRefs(iamStore);
const { fetchUsers, fetchRoles, fetchBusiness, getRolePosition, deleteUser } = iamStore;

const activeTab = ref('profile');

const tabs = [
  { key: 'profile',     labelKey: 'settings.tab-profile',     icon: 'pi pi-user'      },
  { key: 'users',       labelKey: 'settings.tab-users',       icon: 'pi pi-users'     },
  { key: 'preferences', labelKey: 'settings.tab-preferences', icon: 'pi pi-sliders-h' },
  { key: 'security',    labelKey: 'settings.tab-security',    icon: 'pi pi-shield'    }
];

// businessType is not user-editable — this product is a single bodega's own
// system, not a multi-vertical SaaS, so there is nothing to pick. Kept as an
// internal field (always "BODEGA", loaded from the real business record) so
// saveProfile still sends a valid `type` to UpdateBusinessResource, which
// requires one.
const profileForm = ref({
  businessName: '',
  businessType: 'BODEGA',
  address:      '',
  phone:        '',
  fullName:     iamStore.currentUser ? iamStore.currentUser.fullName : '',
  email:        iamStore.currentUser ? iamStore.currentUser.email    : ''
});

/** Populates the profile form once the business/user data has loaded. */
function syncProfileFormFromStore() {
  if (currentBusiness.value) {
    profileForm.value.businessName = currentBusiness.value.name;
    profileForm.value.businessType = currentBusiness.value.type;
    profileForm.value.address      = currentBusiness.value.address;
  }
  if (iamStore.currentUser) {
    profileForm.value.fullName = iamStore.currentUser.fullName;
    profileForm.value.email    = iamStore.currentUser.email;
    profileForm.value.phone    = iamStore.currentUser.phone;
  }
}
watch(currentBusiness, syncProfileFormFromStore);

const savingProfile = ref(false);
const profileSaveState = ref(''); // '' | 'success' | 'error'

const securityForm   = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });
const securityErrors = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });
const securitySuccess = ref(false);
const securitySubmitting = ref(false);
const showNewPassword = ref(false);

const showInviteModal = ref(false);

const notificationsEnabled = ref(true);

onMounted(() => {
  if (!usersLoaded.value) fetchUsers(iamStore.currentUser?.businessId);
  if (!rolesLoaded.value) fetchRoles();
  if (!businessLoaded.value && iamStore.currentUser?.businessId) {
    fetchBusiness(iamStore.currentUser.businessId).then(syncProfileFormFromStore);
  } else {
    syncProfileFormFromStore();
  }
});

/**
 * Resolves a roleId to its display label via roles.position (the single
 * source of truth), instead of a hardcoded roleId → label mapping.
 */
function resolveRoleLabel(roleId) {
  return t(roleLabelKey(getRolePosition(roleId)));
}

function resolveRoleStyle(roleId) {
  return roleStyleByPosition(getRolePosition(roleId));
}

function resolveStatusStyle(status) {
  if (status === 'ACTIVE') return { background: '#DCFCE7', color: '#16A34A', label: t('settings.status-active') };
  return { background: '#F1F5F9', color: '#64748B', label: t('settings.status-inactive') };
}

function confirmDeleteUser(userAccount) {
  confirm.require({
    message: t('settings.confirm-delete-user', { name: userAccount.fullName }),
    header:  t('settings.delete-user-header'),
    icon:    'pi pi-exclamation-triangle',
    accept:  () => deleteUser(userAccount)
  });
}

/**
 * Persists the Profile tab (business fields + user fields) via the IAM store.
 * Both requests run in parallel since they touch independent aggregates
 * (Business and User).
 *
 * Business rule: re-syncs the form from both stores only after BOTH requests
 * have settled. The `watch(currentBusiness, ...)` below also re-syncs the
 * whole form (phone included) the instant updateBusiness resolves — if that
 * happens before updateUserProfile finishes, it was reading currentUser.phone
 * before the new value had landed, wiping the phone the user just typed back
 * to its old value until a full reload later re-fetched everything fresh.
 * Explicitly re-syncing here once both promises resolve makes the fix
 * order-independent instead of relying on request timing.
 */
async function saveProfile() {
  savingProfile.value = true;
  profileSaveState.value = '';

  const [businessResult, userResult] = await Promise.all([
    iamStore.updateBusiness({
      name:    profileForm.value.businessName,
      type:    profileForm.value.businessType,
      address: profileForm.value.address
    }),
    iamStore.updateUserProfile({
      fullName: profileForm.value.fullName,
      phone:    profileForm.value.phone
    })
  ]);
  syncProfileFormFromStore();

  savingProfile.value = false;
  profileSaveState.value = (businessResult.success && userResult.success) ? 'success' : 'error';
  setTimeout(() => { profileSaveState.value = ''; }, 3500);
}

async function submitPasswordChange() {
  securityErrors.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
  securitySuccess.value = false;
  let isValid = true;
  if (!securityForm.value.currentPassword)                                              { securityErrors.value.currentPassword = t('settings.error-current-password'); isValid = false; }
  if (!securityForm.value.newPassword || securityForm.value.newPassword.length < 8)     { securityErrors.value.newPassword     = t('settings.error-new-password');     isValid = false; }
  if (securityForm.value.newPassword !== securityForm.value.confirmPassword)            { securityErrors.value.confirmPassword  = t('settings.error-confirm-password'); isValid = false; }
  if (!isValid) return;

  securitySubmitting.value = true;
  const result = await iamStore.changePassword(securityForm.value.currentPassword, securityForm.value.newPassword);
  securitySubmitting.value = false;

  if (!result.success) {
    securityErrors.value.currentPassword = t(result.errorKey);
    return;
  }

  securitySuccess.value = true;
  securityForm.value    = { currentPassword: '', newPassword: '', confirmPassword: '' };
  setTimeout(() => { securitySuccess.value = false; }, 3500);
}

/** Called by InviteUserModal after a successful invite; refreshes the list state. */
function handleUserInvited() {
  showInviteModal.value = false;
}

function computePasswordStrength(password) {
  if (!password) return 0;
  if (password.length < 4)  return 1;
  if (password.length < 7)  return 2;
  if (password.length < 10) return 3;
  return 4;
}
const strengthColors = ['', '#EF4444', '#FACC15', '#0E7490', '#16A34A'];
const strengthLabelKeys = ['', 'sign-up.strength-weak', 'sign-up.strength-fair', 'sign-up.strength-good', 'sign-up.strength-strong'];
function strengthLabel(level) { return strengthLabelKeys[level] ? t(strengthLabelKeys[level]) : ''; }
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 1.25rem;">

    <!-- ── Header ─────────────────────────────────────────────────── -->
    <div class="flex align-items-start justify-content-between flex-wrap gap-3">
      <div>
        <h1 class="m-0" style="color: #0B3558; font-size: 1.5rem; font-weight: 700;">{{ t('settings.title') }}</h1>
        <p class="m-0 mt-1" style="color: #64748B; font-size: 0.82rem;">Gestiona tu perfil, usuarios y preferencias del sistema</p>
      </div>
      <!-- User avatar chip -->
      <div v-if="iamStore.currentUser" class="flex align-items-center gap-3 px-4 py-2 border-round-xl" style="background-color: #ffffff; border: 1px solid #E2E8F0; box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
        <div class="flex align-items-center justify-content-center border-circle flex-shrink-0" style="width: 36px; height: 36px; background: linear-gradient(135deg, #0E7490, #0B3558); font-size: 0.8rem; font-weight: 700; color: #fff;">
          {{ iamStore.currentUser.initials }}
        </div>
        <div>
          <p class="m-0" style="font-size: 0.85rem; font-weight: 600; color: #0B3558;">{{ iamStore.currentUser.fullName }}</p>
          <p class="m-0" style="font-size: 0.72rem; color: #64748B;">{{ iamStore.currentUser.email }}</p>
        </div>
      </div>
    </div>

    <!-- ── Tabs ────────────────────────────────────────────────────── -->
    <div style="overflow-x: auto; -ms-overflow-style: none; scrollbar-width: none;">
      <div class="flex" style="gap: 2px; background-color: #F1F5F9; border-radius: 12px; padding: 4px; width: fit-content; min-width: 100%;">
        <button
            v-for="tab in tabs"
            :key="tab.key"
            class="flex align-items-center gap-2 px-4 py-2 border-round-lg border-none cursor-pointer"
            style="white-space: nowrap; font-size: 0.875rem; transition: all 0.18s;"
            :style="{
              backgroundColor: activeTab === tab.key ? '#ffffff' : 'transparent',
              color:           activeTab === tab.key ? '#0B3558' : '#64748B',
              fontWeight:      activeTab === tab.key ? 700 : 400,
              boxShadow:       activeTab === tab.key ? '0 1px 6px rgba(0,0,0,0.10)' : 'none'
            }"
            @click="activeTab = tab.key"
        >
          <i :class="tab.icon" style="font-size: 0.88rem;" :style="{ color: activeTab === tab.key ? '#0E7490' : '#94A3B8' }"/>
          {{ t(tab.labelKey) }}
        </button>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         TAB: PROFILE
    ═══════════════════════════════════════════════════════════════ -->
    <div v-if="activeTab === 'profile'" class="border-round-xl overflow-hidden" style="background-color: #ffffff; border: 1px solid #E2E8F0; box-shadow: 0 1px 6px rgba(0,0,0,0.05);">

      <!-- Profile avatar header -->
      <div style="background: linear-gradient(135deg, #0B3558, #0E7490); padding: 2rem 1.5rem 3.5rem;">
        <div class="flex align-items-center gap-4">
          <div class="flex align-items-center justify-content-center border-circle" style="width: 72px; height: 72px; background-color: rgba(255,255,255,0.15); backdrop-filter: blur(4px); border: 3px solid rgba(255,255,255,0.3); font-size: 1.6rem; font-weight: 700; color: #fff; flex-shrink: 0;">
            {{ iamStore.currentUser ? iamStore.currentUser.initials : '?' }}
          </div>
          <div>
            <p class="m-0" style="font-size: 1.1rem; font-weight: 700; color: #fff;">{{ iamStore.currentUser ? iamStore.currentUser.fullName : '—' }}</p>
            <p class="m-0 mt-1" style="font-size: 0.82rem; color: rgba(255,255,255,0.7);">{{ iamStore.currentUser ? iamStore.currentUser.email : '—' }}</p>
            <span v-if="iamStore.currentUser" class="inline-block mt-2 border-round-3xl px-2 py-1" style="background-color: rgba(255,255,255,0.15); font-size: 0.72rem; font-weight: 600; color: #7DD3E8;">{{ resolveRoleLabel(iamStore.currentUser.roleId) }}</span>
          </div>
        </div>
      </div>

      <!-- Form area (pulled up with negative margin) -->
      <div class="px-5 pb-5" style="margin-top: -1.5rem;">
        <div class="border-round-xl p-5" style="background-color: #fff; border: 1px solid #E2E8F0; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
          <div class="flex align-items-center gap-2 mb-4">
            <i class="pi pi-building" style="color: #0E7490; font-size: 0.9rem;"/>
            <p class="m-0" style="font-size: 0.9rem; font-weight: 700; color: #0B3558;">{{ t('settings.profile-title') }}</p>
          </div>
          <div class="settings-form-grid">
            <div class="settings-field">
              <label class="settings-label"><i class="pi pi-building" style="font-size: 0.7rem;"/> {{ t('settings.field-business-name') }}</label>
              <input v-model="profileForm.businessName" type="text" class="settings-input"/>
            </div>
            <div class="settings-field">
              <label class="settings-label"><i class="pi pi-map-marker" style="font-size: 0.7rem;"/> {{ t('settings.field-address') }}</label>
              <input v-model="profileForm.address" type="text" class="settings-input"/>
            </div>
            <div class="settings-field">
              <label class="settings-label"><i class="pi pi-user" style="font-size: 0.7rem;"/> {{ t('settings.field-full-name') }}</label>
              <input v-model="profileForm.fullName" type="text" class="settings-input"/>
            </div>
            <div class="settings-field">
              <label class="settings-label"><i class="pi pi-phone" style="font-size: 0.7rem;"/> {{ t('settings.field-phone') }}</label>
              <input v-model="profileForm.phone" type="tel" class="settings-input"/>
            </div>
          </div>
        </div>
      </div>

      <div class="flex align-items-center justify-content-end gap-3 px-5 pb-5 pt-2">
        <span v-if="profileSaveState === 'success'" style="color: #16A34A; font-size: 0.82rem; font-weight: 600;">
          <i class="pi pi-check-circle"/> {{ t('settings.save-success') }}
        </span>
        <span v-else-if="profileSaveState === 'error'" style="color: #DC2626; font-size: 0.82rem; font-weight: 600;">
          <i class="pi pi-exclamation-circle"/> {{ t('settings.save-error') }}
        </span>
        <button
            class="flex align-items-center gap-2 px-5 py-2 border-round-xl border-none cursor-pointer"
            style="background: linear-gradient(135deg, #0E7490, #0B3558); color: #fff; font-size: 0.9rem; font-weight: 700; box-shadow: 0 2px 10px rgba(14,116,144,0.3); transition: all 0.18s;"
            :style="{ opacity: savingProfile ? 0.7 : 1, cursor: savingProfile ? 'not-allowed' : 'pointer' }"
            :disabled="savingProfile"
            @click="saveProfile"
            @mouseenter="(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(14,116,144,0.45)'; e.currentTarget.style.transform = 'translateY(-1px)'; }"
            @mouseleave="(e) => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(14,116,144,0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }"
        >
          <i v-if="savingProfile" class="pi pi-spin pi-spinner"/>
          <i v-else class="pi pi-check"/>
          {{ savingProfile ? t('settings.saving') : t('settings.save-changes') }}
        </button>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         TAB: USERS
    ═══════════════════════════════════════════════════════════════ -->
    <div v-if="activeTab === 'users'" class="border-round-xl overflow-hidden" style="background-color: #ffffff; border: 1px solid #E2E8F0; box-shadow: 0 1px 6px rgba(0,0,0,0.05);">
      <!-- Header row -->
      <div class="flex align-items-center justify-content-between px-5 py-4" style="border-bottom: 1px solid #E2E8F0; background-color: #F8FAFC;">
        <div class="flex align-items-center gap-2">
          <i class="pi pi-users" style="color: #0E7490; font-size: 0.9rem;"/>
          <h3 class="m-0" style="color: #0B3558; font-size: 0.92rem; font-weight: 700;">{{ t('settings.users-title') }}</h3>
          <span v-if="usersLoaded" class="border-round-3xl px-2" style="background-color: #E0F2FE; color: #0E7490; font-size: 0.7rem; font-weight: 700; padding: 2px 8px;">{{ users.length }}</span>
        </div>
        <button
            class="flex align-items-center gap-2 px-4 py-2 border-round-xl border-none cursor-pointer"
            style="background: linear-gradient(135deg, #0E7490, #0B3558); color: #fff; font-size: 0.82rem; font-weight: 700; box-shadow: 0 2px 8px rgba(14,116,144,0.3); transition: all 0.18s;"
            @click="showInviteModal = true"
            @mouseenter="(e) => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(14,116,144,0.45)'; e.currentTarget.style.transform = 'translateY(-1px)'; }"
            @mouseleave="(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(14,116,144,0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }"
        >
          <i class="pi pi-user-plus" style="font-size: 0.82rem;"/>
          {{ t('settings.invite-user') }}
        </button>
      </div>

      <InviteUserModal
          v-if="showInviteModal"
          @close="showInviteModal = false"
          @invited="handleUserInvited"
      />

      <!-- Loading -->
      <div v-if="!usersLoaded" class="flex justify-content-center align-items-center gap-3 py-8">
        <i class="pi pi-spin pi-spinner" style="font-size: 1.3rem; color: #0E7490;"/>
        <span style="color: #64748B; font-size: 0.88rem;">Cargando usuarios…</span>
      </div>

      <div v-else>
        <!-- Mobile: card list -->
        <div class="lg:hidden" style="display: flex; flex-direction: column;">
          <div
              v-for="(userAccount, index) in users"
              :key="userAccount.id"
              class="flex align-items-start gap-3 p-4"
              :style="{ borderBottom: index < users.length - 1 ? '1px solid #F1F5F9' : 'none' }"
          >
            <div class="flex align-items-center justify-content-center border-circle flex-shrink-0" style="width: 40px; height: 40px; background: linear-gradient(135deg, #0E7490, #0B3558); font-size: 0.8rem; font-weight: 700; color: #fff;">
              {{ userAccount.initials }}
            </div>
            <div style="flex: 1; min-width: 0;">
              <p class="m-0" style="color: #1E293B; font-weight: 700; font-size: 0.9rem;">{{ userAccount.fullName }}</p>
              <p class="m-0 mt-1" style="color: #64748B; font-size: 0.78rem;">{{ userAccount.email }}</p>
              <div class="flex align-items-center gap-2 mt-2 flex-wrap">
                <span
                    class="border-round-2xl px-2 py-1"
                    style="font-size: 0.7rem; font-weight: 700; display: inline-block;"
                    :style="{ backgroundColor: resolveRoleStyle(userAccount.roleId).bg, color: resolveRoleStyle(userAccount.roleId).color }"
                >
                  {{ resolveRoleLabel(userAccount.roleId) }}
                </span>
                <span
                    class="border-round-2xl px-2 py-1"
                    style="font-size: 0.7rem; font-weight: 700; display: inline-block;"
                    :style="{ backgroundColor: resolveStatusStyle(userAccount.status).background, color: resolveStatusStyle(userAccount.status).color }"
                >
                  {{ resolveStatusStyle(userAccount.status).label }}
                </span>
              </div>
            </div>
            <button
                class="flex align-items-center justify-content-center border-round-lg border-none cursor-pointer flex-shrink-0"
                style="width: 32px; height: 32px; background: none; transition: background-color 0.15s;"
                @click="confirmDeleteUser(userAccount)"
                @mouseenter="(e) => e.currentTarget.style.backgroundColor = '#FEE2E2'"
                @mouseleave="(e) => e.currentTarget.style.backgroundColor = 'transparent'"
            >
              <i class="pi pi-trash" style="color: #EF4444; font-size: 0.85rem;"/>
            </button>
          </div>
        </div>

        <!-- Desktop: table -->
        <div class="hidden lg:block" style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
            <tr style="background: linear-gradient(to right, #F8FAFC, #F1F5F9); border-bottom: 2px solid #E2E8F0;">
              <th v-for="col in [t('settings.col-name'), t('settings.col-email'), t('settings.col-role'), t('settings.col-status'), t('settings.col-actions')]"
                  :key="col" class="py-3 px-4 text-left"
                  style="color: #64748B; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap;"
                  :style="{ textAlign: col === t('settings.col-actions') ? 'right' : 'left' }"
              >{{ col }}</th>
            </tr>
            </thead>
            <tbody>
            <tr
                v-for="userAccount in users"
                :key="userAccount.id"
                class="user-row"
                style="border-bottom: 1px solid #F1F5F9; transition: background-color 0.1s;"
            >
              <td class="py-3 px-4">
                <div class="flex align-items-center gap-3">
                  <div class="flex align-items-center justify-content-center border-circle flex-shrink-0" style="width: 34px; height: 34px; background: linear-gradient(135deg, #0E7490, #0B3558); font-size: 0.72rem; font-weight: 700; color: #fff;">
                    {{ userAccount.initials }}
                  </div>
                  <span style="color: #1E293B; font-weight: 600; font-size: 0.88rem;">{{ userAccount.fullName }}</span>
                </div>
              </td>
              <td class="py-3 px-4" style="color: #64748B; font-size: 0.875rem;">{{ userAccount.email }}</td>
              <td class="py-3 px-4">
                <span
                    class="border-round-2xl px-3 py-1"
                    style="font-size: 0.7rem; font-weight: 700; display: inline-block;"
                    :style="{ backgroundColor: resolveRoleStyle(userAccount.roleId).bg, color: resolveRoleStyle(userAccount.roleId).color }"
                >
                  {{ resolveRoleLabel(userAccount.roleId) }}
                </span>
              </td>
              <td class="py-3 px-4">
                <span
                    class="border-round-2xl px-3 py-1 inline-flex align-items-center gap-1"
                    style="font-size: 0.7rem; font-weight: 700;"
                    :style="{ backgroundColor: resolveStatusStyle(userAccount.status).background, color: resolveStatusStyle(userAccount.status).color }"
                >
                  <span style="width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0;" :style="{ backgroundColor: resolveStatusStyle(userAccount.status).color }"/>
                  {{ resolveStatusStyle(userAccount.status).label }}
                </span>
              </td>
              <td class="py-3 px-4 text-right">
                <button
                    class="flex align-items-center justify-content-center border-round-lg border-none cursor-pointer ml-auto"
                    style="width: 32px; height: 32px; background: none; transition: all 0.15s;"
                    @click="confirmDeleteUser(userAccount)"
                    @mouseenter="(e) => { e.currentTarget.style.backgroundColor = '#FEE2E2'; e.currentTarget.style.transform = 'scale(1.1)'; }"
                    @mouseleave="(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }"
                >
                  <i class="pi pi-trash" style="color: #EF4444; font-size: 0.85rem;"/>
                </button>
              </td>
            </tr>
            </tbody>
          </table>
          <div v-if="!users.length" class="flex flex-column align-items-center py-10 gap-3">
            <div class="flex align-items-center justify-content-center border-round-xl" style="width: 56px; height: 56px; background-color: #F1F5F9;">
              <i class="pi pi-users" style="font-size: 1.5rem; color: #CBD5E1;"/>
            </div>
            <p class="m-0" style="color: #94A3B8; font-size: 0.88rem;">No hay usuarios registrados</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         TAB: PREFERENCES
    ═══════════════════════════════════════════════════════════════ -->
    <div v-if="activeTab === 'preferences'" class="border-round-xl overflow-hidden" style="background-color: #ffffff; border: 1px solid #E2E8F0; box-shadow: 0 1px 6px rgba(0,0,0,0.05);">
      <div class="px-5 py-4 flex align-items-center gap-2" style="border-bottom: 1px solid #E2E8F0; background-color: #F8FAFC;">
        <i class="pi pi-sliders-h" style="color: #0E7490; font-size: 0.9rem;"/>
        <h3 class="m-0" style="color: #0B3558; font-size: 0.92rem; font-weight: 700;">{{ t('settings.preferences-title') }}</h3>
      </div>
      <div class="px-5 py-4" style="display: flex; flex-direction: column; gap: 0;">

        <!-- Language row -->
        <div class="flex align-items-center justify-content-between py-4" style="border-bottom: 1px solid #F1F5F9;">
          <div class="flex align-items-center gap-3">
            <div class="flex align-items-center justify-content-center border-round-lg flex-shrink-0" style="width: 40px; height: 40px; background-color: #E0F2FE;">
              <i class="pi pi-globe" style="color: #0E7490; font-size: 1rem;"/>
            </div>
            <div>
              <p class="m-0" style="color: #1E293B; font-weight: 600; font-size: 0.9rem;">{{ t('settings.language-label') }}</p>
              <p class="m-0 mt-1" style="color: #64748B; font-size: 0.78rem;">Idioma de la interfaz</p>
            </div>
          </div>
          <language-switcher/>
        </div>

        <!-- Notifications row -->
        <div class="flex align-items-start justify-content-between py-4">
          <div class="flex align-items-start gap-3">
            <div class="flex align-items-center justify-content-center border-round-lg flex-shrink-0" style="width: 40px; height: 40px;" :style="{ backgroundColor: notificationsEnabled ? '#DCFCE7' : '#F1F5F9' }">
              <i class="pi pi-bell" style="font-size: 1rem;" :style="{ color: notificationsEnabled ? '#16A34A' : '#94A3B8' }"/>
            </div>
            <div style="padding-right: 1rem;">
              <p class="m-0" style="color: #1E293B; font-weight: 600; font-size: 0.9rem;">{{ t('settings.notifications-label') }}</p>
              <p class="m-0 mt-1" style="color: #64748B; font-size: 0.78rem; line-height: 1.4;">{{ t('settings.notifications-desc') }}</p>
            </div>
          </div>
          <!-- Toggle -->
          <button
              type="button"
              class="flex-shrink-0"
              style="width: 48px; height: 26px; border-radius: 13px; border: none; cursor: pointer; transition: background-color 0.2s; position: relative; margin-top: 2px;"
              :style="{ backgroundColor: notificationsEnabled ? '#0E7490' : '#CBD5E1' }"
              @click="notificationsEnabled = !notificationsEnabled"
          >
            <span
                class="absolute"
                style="width: 20px; height: 20px; border-radius: 50%; background-color: #fff; top: 3px; transition: left 0.2s; box-shadow: 0 1px 4px rgba(0,0,0,0.25);"
                :style="{ left: notificationsEnabled ? '25px' : '3px' }"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         TAB: SECURITY
    ═══════════════════════════════════════════════════════════════ -->
    <div v-if="activeTab === 'security'" class="border-round-xl overflow-hidden" style="background-color: #ffffff; border: 1px solid #E2E8F0; box-shadow: 0 1px 6px rgba(0,0,0,0.05);">
      <div class="px-5 py-4 flex align-items-center gap-2" style="border-bottom: 1px solid #E2E8F0; background-color: #F8FAFC;">
        <i class="pi pi-shield" style="color: #0E7490; font-size: 0.9rem;"/>
        <h3 class="m-0" style="color: #0B3558; font-size: 0.92rem; font-weight: 700;">{{ t('settings.security-title') }}</h3>
      </div>
      <div class="p-5">

        <!-- Success banner -->
        <div v-if="securitySuccess" class="flex align-items-center gap-3 p-4 border-round-xl mb-4" style="background-color: #F0FDF4; border: 1.5px solid #86EFAC;">
          <div class="flex align-items-center justify-content-center border-round-lg flex-shrink-0" style="width: 36px; height: 36px; background-color: #DCFCE7;">
            <i class="pi pi-check-circle" style="color: #16A34A; font-size: 1rem;"/>
          </div>
          <p class="m-0" style="color: #15803D; font-size: 0.9rem; font-weight: 600;">{{ t('settings.success-password') }}</p>
        </div>

        <form @submit.prevent="submitPasswordChange" style="max-width: 480px; display: flex; flex-direction: column; gap: 1.25rem;">
          <!-- Current password -->
          <div class="settings-field">
            <label class="settings-label"><i class="pi pi-lock" style="font-size: 0.7rem;"/> {{ t('settings.current-password') }}</label>
            <input v-model="securityForm.currentPassword" type="password" class="settings-input"/>
            <p v-if="securityErrors.currentPassword" class="settings-error"><i class="pi pi-exclamation-circle" style="font-size: 0.7rem;"/> {{ securityErrors.currentPassword }}</p>
          </div>

          <!-- New password + strength -->
          <div class="settings-field">
            <label class="settings-label"><i class="pi pi-key" style="font-size: 0.7rem;"/> {{ t('settings.new-password') }}</label>
            <div class="relative">
              <input v-model="securityForm.newPassword" :type="showNewPassword ? 'text' : 'password'" class="settings-input" style="padding-right: 44px;"/>
              <button type="button" class="absolute" style="right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94A3B8; cursor: pointer; padding: 4px; border-radius: 6px; display: flex; transition: color 0.15s;"
                @click="showNewPassword = !showNewPassword"
                @mouseenter="(e) => e.currentTarget.style.color = '#0E7490'"
                @mouseleave="(e) => e.currentTarget.style.color = '#94A3B8'"
              >
                <i :class="showNewPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size: 0.9rem;"/>
              </button>
            </div>
            <div v-if="securityForm.newPassword.length > 0" class="flex align-items-center gap-2 mt-1">
              <div class="flex gap-1 flex-1">
                <div v-for="i in [1,2,3,4]" :key="i" class="flex-1 border-round-lg" style="height: 4px; transition: background-color 0.3s;"
                  :style="{ backgroundColor: computePasswordStrength(securityForm.newPassword) >= i ? strengthColors[computePasswordStrength(securityForm.newPassword)] : '#E2E8F0' }"
                />
              </div>
              <span style="font-size: 0.72rem; font-weight: 600; min-width: 42px; text-align: right;" :style="{ color: strengthColors[computePasswordStrength(securityForm.newPassword)] }">
                {{ strengthLabel(computePasswordStrength(securityForm.newPassword)) }}
              </span>
            </div>
            <p v-if="securityErrors.newPassword" class="settings-error"><i class="pi pi-exclamation-circle" style="font-size: 0.7rem;"/> {{ securityErrors.newPassword }}</p>
          </div>

          <!-- Confirm password -->
          <div class="settings-field">
            <label class="settings-label"><i class="pi pi-check-circle" style="font-size: 0.7rem;"/> {{ t('settings.confirm-password') }}</label>
            <input v-model="securityForm.confirmPassword" type="password" class="settings-input"/>
            <p v-if="securityErrors.confirmPassword" class="settings-error"><i class="pi pi-exclamation-circle" style="font-size: 0.7rem;"/> {{ securityErrors.confirmPassword }}</p>
          </div>

          <button
              type="submit"
              class="flex align-items-center gap-2 px-5 py-2 border-round-xl border-none cursor-pointer"
              style="background: linear-gradient(135deg, #0E7490, #0B3558); color: #fff; font-size: 0.9rem; font-weight: 700; width: fit-content; box-shadow: 0 2px 10px rgba(14,116,144,0.3); transition: all 0.18s;"
              :style="{ opacity: securitySubmitting ? 0.7 : 1, cursor: securitySubmitting ? 'not-allowed' : 'pointer' }"
              :disabled="securitySubmitting"
              @mouseenter="(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(14,116,144,0.45)'; e.currentTarget.style.transform = 'translateY(-1px)'; }"
              @mouseleave="(e) => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(14,116,144,0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }"
          >
            <i v-if="securitySubmitting" class="pi pi-spin pi-spinner"/>
            <i v-else class="pi pi-lock"/>
            {{ t('settings.change-password') }}
          </button>
        </form>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Settings form grid: 1-col mobile → 2-col desktop */
.settings-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}
@media (min-width: 640px) {
  .settings-form-grid { grid-template-columns: repeat(2, 1fr); }
}

.settings-field { display: flex; flex-direction: column; gap: 6px; }

.settings-label {
  display: flex; align-items: center; gap: 5px;
  font-size: 0.8rem; font-weight: 700; color: #374151;
  letter-spacing: 0.02em;
}

.settings-input {
  width: 100%; border-radius: 10px;
  padding: 10px 14px;
  background-color: #F8FAFC;
  border: 1.5px solid #E2E8F0;
  color: #0B3558; font-size: 0.9rem;
  outline: none; transition: all 0.18s;
  box-sizing: border-box; font-family: inherit;
}
.settings-input:focus {
  border-color: #0E7490;
  background-color: #fff;
  box-shadow: 0 0 0 3px rgba(14,116,144,0.12);
}

.settings-error {
  margin: 2px 0 0;
  font-size: 0.77rem; color: #DC2626;
  display: flex; align-items: center; gap: 4px;
}

/* Table rows */
.user-row:hover { background-color: #F8FBFF; }

/* Hide scrollbar on tab bar */
div[style*="overflow-x: auto"]::-webkit-scrollbar { display: none; }
</style>