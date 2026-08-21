<script setup>
import { computed, onMounted, ref, toRefs, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm, useToast } from 'primevue';
import useIamStore from '../../application/iam.store.js';
import useThemeStore from '../../../shared/application/theme.store.js';
import LanguageSwitcher from '../../../shared/presentation/components/language-switcher.vue';
import InviteUserModal from '../components/invite-user-modal.vue';
import { roleLabelKey, roleStyleByPosition } from '../role-labels.js';
import { canManageTeam, canEditBusinessProfile } from '../../application/permissions.js';
import { isStrongPassword } from '../../domain/model/password-rules.js';

const { t }     = useI18n();
const confirm   = useConfirm();
const toast     = useToast();
const iamStore  = useIamStore();
const themeStore = useThemeStore();

/**
 * Options for the theme segmented control, in the same shape the tab bar
 * above already uses (key/labelKey/icon).
 */
const themeOptions = [
  { key: 'light',  labelKey: 'settings.theme-light',  icon: 'pi pi-sun'     },
  { key: 'dark',   labelKey: 'settings.theme-dark',   icon: 'pi pi-moon'    },
  { key: 'system', labelKey: 'settings.theme-system', icon: 'pi pi-desktop' }
];

const { users, usersLoaded, usersLoadFailed, rolesLoaded, currentBusiness, businessLoaded } = toRefs(iamStore);
const { fetchUsers, fetchRoles, fetchBusiness, getRolePosition, deleteUser, deactivateUser, reactivateUser } = iamStore;

const activeTab = ref('profile');

/**
 * Whether the current role may manage the team (invite/remove users) — the
 * backend's GET /users (team roster) is admin-only, so the Team tab isn't
 * just write-gated, it's not even readable for CASHIER/WAREHOUSE.
 * @type {import('vue').ComputedRef<boolean>}
 */
const canSeeTeamTab = computed(() => canManageTeam(iamStore.currentUserPosition));

/**
 * Whether the current role may edit the business's own profile fields
 * (name/address) — admin only. Personal fields (name/phone) stay editable
 * by anyone, self-o-admin per the backend.
 * @type {import('vue').ComputedRef<boolean>}
 */
const canEditBusiness = computed(() => canEditBusinessProfile(iamStore.currentUserPosition));

const tabs = computed(() => [
  { key: 'profile',     labelKey: 'settings.tab-profile',     icon: 'pi pi-user'      },
  ...(canSeeTeamTab.value ? [{ key: 'users', labelKey: 'settings.tab-users', icon: 'pi pi-users' }] : []),
  { key: 'preferences', labelKey: 'settings.tab-preferences', icon: 'pi pi-sliders-h' },
  { key: 'security',    labelKey: 'settings.tab-security',    icon: 'pi pi-shield'    }
]);

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
  firstName:    iamStore.currentUser ? iamStore.currentUser.firstName : '',
  lastName:     iamStore.currentUser ? iamStore.currentUser.lastName  : '',
  email:        iamStore.currentUser ? iamStore.currentUser.email     : ''
});

/** Populates the profile form once the business/user data has loaded. */
function syncProfileFormFromStore() {
  if (currentBusiness.value) {
    profileForm.value.businessName = currentBusiness.value.name;
    profileForm.value.businessType = currentBusiness.value.type;
    profileForm.value.address      = currentBusiness.value.address;
  }
  if (iamStore.currentUser) {
    profileForm.value.firstName = iamStore.currentUser.firstName;
    profileForm.value.lastName  = iamStore.currentUser.lastName;
    profileForm.value.email     = iamStore.currentUser.email;
    profileForm.value.phone     = iamStore.currentUser.phone;
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

onMounted(() => {
  const loadUsersIfAllowed = rolesLoaded.value
      ? Promise.resolve()
      : fetchRoles();
  // GET /users (team roster) is admin-only server-side — only fetch it once
  // the role is known to be ADMIN, instead of firing a request that always
  // 403s for CASHIER/WAREHOUSE.
  loadUsersIfAllowed.then(() => {
    if (!usersLoaded.value && canSeeTeamTab.value) fetchUsers(iamStore.currentUser?.businessId);
  });
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

/** An admin can't suspend or delete their own account — deactivating kills the session they'd need to undo it with. */
function isSelf(userAccount) {
  return iamStore.currentUser?.id === userAccount.id;
}

function resolveStatusStyle(status) {
  if (status === 'ACTIVE') return { background: 'var(--status-ok-bg)', color: 'var(--status-ok-fg)', label: t('settings.status-active') };
  return { background: 'var(--surface-alt)', color: 'var(--text-muted)', label: t('settings.status-inactive') };
}

function confirmDeleteUser(userAccount) {
  confirm.require({
    message: t('settings.confirm-delete-user', { name: userAccount.fullName }),
    header:  t('settings.delete-user-header'),
    icon:    'pi pi-exclamation-triangle',
    accept:  () => deleteUser(userAccount)
        .then(() => toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('settings.toast-delete-user-success', { name: userAccount.fullName }), life: 3500 }))
        .catch(error => {
          const title = error.response?.status === 409 ? error.response?.data?.title : null;
          const detail = title === 'CannotRemoveLastAdmin' ? t('settings.toast-delete-last-admin-error')
              : title === 'CannotRemoveOwnAccess' ? t('settings.toast-delete-own-account-error')
              : t('settings.toast-user-action-error');
          toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail, life: 4500 });
        })
  });
}

/**
 * Suspends still needs confirmation (it kicks the person out immediately),
 * reactivating doesn't — it only restores access, nothing destructive to walk back.
 */
function confirmDeactivateUser(userAccount) {
  confirm.require({
    message: t('settings.confirm-deactivate-user', { name: userAccount.fullName }),
    header:  t('settings.deactivate-user-header'),
    icon:    'pi pi-exclamation-triangle',
    accept:  () => deactivateUser(userAccount)
        .then(() => toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('settings.toast-deactivate-success', { name: userAccount.fullName }), life: 3500 }))
        .catch(error => {
          const isLastAdmin = error.response?.status === 409 && error.response?.data?.title === 'CannotRemoveLastAdmin';
          toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: isLastAdmin ? t('settings.toast-last-admin-error') : t('settings.toast-user-action-error'), life: 4500 });
        })
  });
}

function reactivateUserAccount(userAccount) {
  reactivateUser(userAccount)
      .then(() => toast.add({ severity: 'success', summary: t('common.toast-success-title'), detail: t('settings.toast-reactivate-success', { name: userAccount.fullName }), life: 3500 }))
      .catch(() => toast.add({ severity: 'error', summary: t('common.toast-error-title'), detail: t('settings.toast-user-action-error'), life: 4500 }));
}

/**
 * Persists the Profile tab (business fields + user fields) via the IAM store.
 * Both requests run in parallel since they touch independent aggregates
 * (Business and User).
 *
 * Business rule: `updateBusiness` is admin-only server-side — a non-admin
 * skips it entirely instead of firing a request that always 403s, which
 * used to mark the whole save as 'error' (Promise.all needs every result to
 * succeed) even when their own personal fields saved fine.
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
    canEditBusiness.value
        ? iamStore.updateBusiness({
          name:    profileForm.value.businessName,
          type:    profileForm.value.businessType,
          address: profileForm.value.address
        })
        : Promise.resolve({ success: true }),
    iamStore.updateUserProfile({
      firstName: profileForm.value.firstName,
      lastName:  profileForm.value.lastName,
      phone:     profileForm.value.phone
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
  if (!securityForm.value.currentPassword)                       { securityErrors.value.currentPassword = t('settings.error-current-password'); isValid = false; }
  if (!isStrongPassword(securityForm.value.newPassword))          { securityErrors.value.newPassword     = t('settings.error-new-password');     isValid = false; }
  if (securityForm.value.newPassword !== securityForm.value.confirmPassword) { securityErrors.value.confirmPassword = t('settings.error-confirm-password'); isValid = false; }
  if (!isValid) return;

  securitySubmitting.value = true;
  const result = await iamStore.changePassword(securityForm.value.currentPassword, securityForm.value.newPassword);
  securitySubmitting.value = false;

  if (!result.success) {
    // WeakPassword belongs under the new-password field; everything else
    // (wrong current password, a stale/conflicting write, network failure)
    // reads more naturally attached to the current-password field, which
    // is where this form already surfaces its one general error line.
    if (result.errorKey === 'iam-errors.weak-password') {
      securityErrors.value.newPassword = t(result.errorKey);
    } else {
      securityErrors.value.currentPassword = t(result.errorKey);
    }
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
const strengthColors = ['', 'var(--status-critical-fg)', 'var(--status-warning-fg)', 'var(--brand)', 'var(--status-ok-fg)'];
const strengthLabelKeys = ['', 'sign-up.strength-weak', 'sign-up.strength-fair', 'sign-up.strength-good', 'sign-up.strength-strong'];
function strengthLabel(level) { return strengthLabelKeys[level] ? t(strengthLabelKeys[level]) : ''; }
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 1.25rem;">

    <!-- ── Header ─────────────────────────────────────────────────── -->
    <div class="flex align-items-start justify-content-between flex-wrap gap-3">
      <div>
        <h1 class="m-0" style="color: var(--brand); font-size: 1.5rem; font-weight: 700;">{{ t('settings.title') }}</h1>
        <p class="m-0 mt-1" style="color: var(--text-muted); font-size: 0.82rem;">{{ t('settings.subtitle') }}</p>
      </div>
      <!-- User avatar chip -->
      <div v-if="iamStore.currentUser" class="flex align-items-center gap-3 px-4 py-2 border-round-xl" style="background-color: var(--surface); border: 1px solid var(--border); box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
        <div class="flex align-items-center justify-content-center border-circle flex-shrink-0" style="width: 36px; height: 36px; background: linear-gradient(135deg, var(--brand), var(--brand)); font-size: 0.8rem; font-weight: 700; color: var(--surface);">
          {{ iamStore.currentUser.initials }}
        </div>
        <div>
          <p class="m-0" style="font-size: 0.85rem; font-weight: 600; color: var(--brand);">{{ iamStore.currentUser.fullName }}</p>
          <p class="m-0" style="font-size: 0.72rem; color: var(--text-muted);">{{ iamStore.currentUser.email }}</p>
        </div>
      </div>
    </div>

    <!-- ── Tabs ────────────────────────────────────────────────────── -->
    <div style="overflow-x: auto; -ms-overflow-style: none; scrollbar-width: none;">
      <div class="flex" style="gap: 2px; background-color: var(--surface-alt); border-radius: 12px; padding: 4px; width: fit-content; min-width: 100%;">
        <button
            v-for="tab in tabs"
            :key="tab.key"
            class="flex align-items-center gap-2 px-4 py-2 border-round-lg border-none cursor-pointer"
            style="white-space: nowrap; font-size: 0.875rem; transition: all 0.18s;"
            :style="{
              backgroundColor: activeTab === tab.key ? 'var(--surface)' : 'transparent',
              color:           activeTab === tab.key ? 'var(--brand)' : 'var(--text-muted)',
              fontWeight:      activeTab === tab.key ? 700 : 400,
              boxShadow:       activeTab === tab.key ? '0 1px 6px rgba(0,0,0,0.10)' : 'none'
            }"
            @click="activeTab = tab.key"
        >
          <i :class="tab.icon" style="font-size: 0.88rem;" :style="{ color: activeTab === tab.key ? 'var(--brand)' : 'var(--text-faint)' }"/>
          {{ t(tab.labelKey) }}
        </button>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         TAB: PROFILE
    ═══════════════════════════════════════════════════════════════ -->
    <div v-if="activeTab === 'profile'" class="border-round-xl overflow-hidden" style="background-color: var(--surface); border: 1px solid var(--border); box-shadow: 0 1px 6px rgba(0,0,0,0.05);">

      <!-- Profile avatar header -->
      <div style="background: linear-gradient(135deg, var(--brand), var(--brand)); padding: 2rem 1.5rem 3.5rem;">
        <div class="flex align-items-center gap-4">
          <div class="flex align-items-center justify-content-center border-circle" style="width: 72px; height: 72px; background-color: rgba(255,255,255,0.15); backdrop-filter: blur(4px); border: 3px solid rgba(255,255,255,0.3); font-size: 1.6rem; font-weight: 700; color: var(--surface); flex-shrink: 0;">
            {{ iamStore.currentUser ? iamStore.currentUser.initials : '?' }}
          </div>
          <div>
            <p class="m-0" style="font-size: 1.1rem; font-weight: 700; color: var(--brand-ink);">{{ iamStore.currentUser ? iamStore.currentUser.fullName : '—' }}</p>
            <p class="m-0 mt-1" style="font-size: 0.82rem; color: rgba(255,255,255,0.7);">{{ iamStore.currentUser ? iamStore.currentUser.email : '—' }}</p>
            <span v-if="iamStore.currentUser" class="inline-block mt-2 border-round-3xl px-2 py-1" style="background-color: rgba(255,255,255,0.15); font-size: 0.72rem; font-weight: 600; color: var(--brand-ink);">{{ resolveRoleLabel(iamStore.currentUser.roleId) }}</span>
          </div>
        </div>
      </div>

      <!-- Form area (pulled up with negative margin) -->
      <div class="px-5 pb-5" style="margin-top: -1.5rem;">
        <div class="border-round-xl p-5" style="background-color: var(--surface); border: 1px solid var(--border); box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
          <div class="flex align-items-center gap-2 mb-4">
            <i class="pi pi-building" style="color: var(--brand); font-size: 0.9rem;"/>
            <p class="m-0" style="font-size: 0.9rem; font-weight: 700; color: var(--brand);">{{ t('settings.profile-title') }}</p>
          </div>
          <div class="settings-form-grid">
            <div class="settings-field">
              <label class="settings-label"><i class="pi pi-building" style="font-size: 0.7rem;"/> {{ t('settings.field-business-name') }}</label>
              <input v-model="profileForm.businessName" type="text" class="settings-input" :disabled="!canEditBusiness" :title="!canEditBusiness ? t('settings.field-admin-only') : undefined"/>
            </div>
            <div class="settings-field">
              <label class="settings-label"><i class="pi pi-map-marker" style="font-size: 0.7rem;"/> {{ t('settings.field-address') }}</label>
              <input v-model="profileForm.address" type="text" class="settings-input" :disabled="!canEditBusiness" :title="!canEditBusiness ? t('settings.field-admin-only') : undefined"/>
            </div>
            <div class="settings-field">
              <label class="settings-label"><i class="pi pi-user" style="font-size: 0.7rem;"/> {{ t('settings.field-first-name') }}</label>
              <input v-model="profileForm.firstName" type="text" class="settings-input" maxlength="50"/>
            </div>
            <div class="settings-field">
              <label class="settings-label"><i class="pi pi-user" style="font-size: 0.7rem;"/> {{ t('settings.field-last-name') }}</label>
              <input v-model="profileForm.lastName" type="text" class="settings-input" maxlength="50"/>
            </div>
            <div class="settings-field">
              <label class="settings-label"><i class="pi pi-phone" style="font-size: 0.7rem;"/> {{ t('settings.field-phone') }}</label>
              <input v-model="profileForm.phone" type="tel" class="settings-input"/>
            </div>
          </div>
        </div>
      </div>

      <div class="flex align-items-center justify-content-end gap-3 px-5 pb-5 pt-2">
        <span v-if="profileSaveState === 'success'" style="color: var(--status-ok-fg); font-size: 0.82rem; font-weight: 600;">
          <i class="pi pi-check-circle"/> {{ t('settings.save-success') }}
        </span>
        <span v-else-if="profileSaveState === 'error'" style="color: var(--status-critical-fg); font-size: 0.82rem; font-weight: 600;">
          <i class="pi pi-exclamation-circle"/> {{ t('settings.save-error') }}
        </span>
        <button
            class="flex align-items-center gap-2 px-5 py-2 border-round-xl border-none cursor-pointer"
            style="background: linear-gradient(135deg, var(--brand), var(--brand)); color: var(--surface); font-size: 0.9rem; font-weight: 700; box-shadow: 0 2px 10px rgba(198,113,57,0.3); transition: all 0.18s;"
            :style="{ opacity: savingProfile ? 0.7 : 1, cursor: savingProfile ? 'not-allowed' : 'pointer' }"
            :disabled="savingProfile"
            @click="saveProfile"
            @mouseenter="(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(198,113,57,0.45)'; e.currentTarget.style.transform = 'translateY(-1px)'; }"
            @mouseleave="(e) => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(198,113,57,0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }"
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
    <div v-if="activeTab === 'users'" class="border-round-xl overflow-hidden" style="background-color: var(--surface); border: 1px solid var(--border); box-shadow: 0 1px 6px rgba(0,0,0,0.05);">
      <!-- Header row -->
      <div class="flex align-items-center justify-content-between px-5 py-4" style="border-bottom: 1px solid var(--border); background-color: var(--surface-alt);">
        <div class="flex align-items-center gap-2">
          <i class="pi pi-users" style="color: var(--brand); font-size: 0.9rem;"/>
          <h3 class="m-0" style="color: var(--brand); font-size: 0.92rem; font-weight: 700;">{{ t('settings.users-title') }}</h3>
          <span v-if="usersLoaded" class="border-round-3xl px-2" style="background-color: var(--brand-soft); color: var(--brand); font-size: 0.7rem; font-weight: 700; padding: 2px 8px;">{{ users.length }}</span>
        </div>
        <button
            class="flex align-items-center gap-2 px-4 py-2 border-round-xl border-none cursor-pointer"
            style="background: linear-gradient(135deg, var(--brand), var(--brand)); color: var(--surface); font-size: 0.82rem; font-weight: 700; box-shadow: 0 2px 8px rgba(198,113,57,0.3); transition: all 0.18s;"
            @click="showInviteModal = true"
            @mouseenter="(e) => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(198,113,57,0.45)'; e.currentTarget.style.transform = 'translateY(-1px)'; }"
            @mouseleave="(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(198,113,57,0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }"
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

      <!-- Load failed -->
      <div v-if="usersLoadFailed" class="flex flex-column justify-content-center align-items-center gap-3 py-8">
        <i class="pi pi-exclamation-triangle" style="font-size: 1.3rem; color: var(--status-critical-fg);"/>
        <span style="color: var(--text-muted); font-size: 0.88rem;">{{ t('settings.error-load-users') }}</span>
        <button
            class="border-round-lg border-none cursor-pointer px-3 py-2"
            style="background: var(--surface-alt); color: var(--text); font-size: 0.82rem; font-weight: 600;"
            @click="fetchUsers(iamStore.currentUser?.businessId)"
        >{{ t('common.retry') }}</button>
      </div>

      <!-- Loading -->
      <div v-else-if="!usersLoaded" class="flex justify-content-center align-items-center gap-3 py-8">
        <i class="pi pi-spin pi-spinner" style="font-size: 1.3rem; color: var(--brand);"/>
        <span style="color: var(--text-muted); font-size: 0.88rem;">{{ t('settings.loading-users') }}</span>
      </div>

      <div v-else>
        <!-- Mobile: card list -->
        <div class="lg:hidden" style="display: flex; flex-direction: column;">
          <div
              v-for="(userAccount, index) in users"
              :key="userAccount.id"
              class="flex align-items-start gap-3 p-4"
              :style="{ borderBottom: index < users.length - 1 ? '1px solid var(--surface-alt)' : 'none' }"
          >
            <div class="flex align-items-center justify-content-center border-circle flex-shrink-0" style="width: 40px; height: 40px; background: linear-gradient(135deg, var(--brand), var(--brand)); font-size: 0.8rem; font-weight: 700; color: var(--surface);">
              {{ userAccount.initials }}
            </div>
            <div style="flex: 1; min-width: 0;">
              <p class="m-0" style="color: var(--text); font-weight: 700; font-size: 0.9rem;">{{ userAccount.fullName }}</p>
              <p class="m-0 mt-1" style="color: var(--text-muted); font-size: 0.78rem;">{{ userAccount.email }}</p>
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
            <div v-if="!isSelf(userAccount)" class="flex align-items-center gap-1 flex-shrink-0">
              <button
                  class="flex align-items-center justify-content-center border-round-lg border-none cursor-pointer"
                  style="width: 32px; height: 32px; background: none; transition: background-color 0.15s;"
                  :title="userAccount.status === 'ACTIVE' ? t('settings.action-deactivate') : t('settings.action-reactivate')"
                  @click="userAccount.status === 'ACTIVE' ? confirmDeactivateUser(userAccount) : reactivateUserAccount(userAccount)"
                  @mouseenter="(e) => e.currentTarget.style.backgroundColor = 'var(--status-warning-bg)'"
                  @mouseleave="(e) => e.currentTarget.style.backgroundColor = 'transparent'"
              >
                <i :class="userAccount.status === 'ACTIVE' ? 'pi pi-lock' : 'pi pi-lock-open'" style="color: var(--status-warning-fg); font-size: 0.85rem;"/>
              </button>
              <button
                  class="flex align-items-center justify-content-center border-round-lg border-none cursor-pointer"
                  style="width: 32px; height: 32px; background: none; transition: background-color 0.15s;"
                  :title="t('settings.delete-user-header')"
                  @click="confirmDeleteUser(userAccount)"
                  @mouseenter="(e) => e.currentTarget.style.backgroundColor = 'var(--status-critical-bg)'"
                  @mouseleave="(e) => e.currentTarget.style.backgroundColor = 'transparent'"
              >
                <i class="pi pi-trash" style="color: var(--status-critical-fg); font-size: 0.85rem;"/>
              </button>
            </div>
          </div>
        </div>

        <!-- Desktop: table -->
        <div class="hidden lg:block" style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
            <tr style="background: linear-gradient(to right, var(--surface-alt), var(--surface-alt)); border-bottom: 2px solid var(--border);">
              <th v-for="col in [t('settings.col-name'), t('settings.col-email'), t('settings.col-role'), t('settings.col-status'), t('settings.col-actions')]"
                  :key="col" class="py-3 px-4 text-left"
                  style="color: var(--text-muted); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap;"
                  :style="{ textAlign: col === t('settings.col-actions') ? 'right' : 'left' }"
              >{{ col }}</th>
            </tr>
            </thead>
            <tbody>
            <tr
                v-for="userAccount in users"
                :key="userAccount.id"
                class="user-row"
                style="border-bottom: 1px solid var(--surface-alt); transition: background-color 0.1s;"
            >
              <td class="py-3 px-4">
                <div class="flex align-items-center gap-3">
                  <div class="flex align-items-center justify-content-center border-circle flex-shrink-0" style="width: 34px; height: 34px; background: linear-gradient(135deg, var(--brand), var(--brand)); font-size: 0.72rem; font-weight: 700; color: var(--surface);">
                    {{ userAccount.initials }}
                  </div>
                  <span style="color: var(--text); font-weight: 600; font-size: 0.88rem;">{{ userAccount.fullName }}</span>
                </div>
              </td>
              <td class="py-3 px-4" style="color: var(--text-muted); font-size: 0.875rem;">{{ userAccount.email }}</td>
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
                <div v-if="!isSelf(userAccount)" class="flex align-items-center justify-content-end gap-1">
                  <button
                      class="flex align-items-center justify-content-center border-round-lg border-none cursor-pointer"
                      style="width: 32px; height: 32px; background: none; transition: all 0.15s;"
                      :title="userAccount.status === 'ACTIVE' ? t('settings.action-deactivate') : t('settings.action-reactivate')"
                      @click="userAccount.status === 'ACTIVE' ? confirmDeactivateUser(userAccount) : reactivateUserAccount(userAccount)"
                      @mouseenter="(e) => { e.currentTarget.style.backgroundColor = 'var(--status-warning-bg)'; e.currentTarget.style.transform = 'scale(1.1)'; }"
                      @mouseleave="(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }"
                  >
                    <i :class="userAccount.status === 'ACTIVE' ? 'pi pi-lock' : 'pi pi-lock-open'" style="color: var(--status-warning-fg); font-size: 0.85rem;"/>
                  </button>
                  <button
                      class="flex align-items-center justify-content-center border-round-lg border-none cursor-pointer"
                      style="width: 32px; height: 32px; background: none; transition: all 0.15s;"
                      :title="t('settings.delete-user-header')"
                      @click="confirmDeleteUser(userAccount)"
                      @mouseenter="(e) => { e.currentTarget.style.backgroundColor = 'var(--status-critical-bg)'; e.currentTarget.style.transform = 'scale(1.1)'; }"
                      @mouseleave="(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }"
                  >
                    <i class="pi pi-trash" style="color: var(--status-critical-fg); font-size: 0.85rem;"/>
                  </button>
                </div>
                <span v-else style="color: var(--text-faint); font-size: 0.72rem;">—</span>
              </td>
            </tr>
            </tbody>
          </table>
          <div v-if="!users.length" class="flex flex-column align-items-center py-10 gap-3">
            <div class="flex align-items-center justify-content-center border-round-xl" style="width: 56px; height: 56px; background-color: var(--surface-alt);">
              <i class="pi pi-users" style="font-size: 1.5rem; color: var(--text-faint);"/>
            </div>
            <p class="m-0" style="color: var(--text-faint); font-size: 0.88rem;">{{ t('settings.no-users') }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         TAB: PREFERENCES
    ═══════════════════════════════════════════════════════════════ -->
    <div v-if="activeTab === 'preferences'" class="border-round-xl overflow-hidden" style="background-color: var(--surface); border: 1px solid var(--border); box-shadow: 0 1px 6px rgba(0,0,0,0.05);">
      <div class="px-5 py-4 flex align-items-center gap-2" style="border-bottom: 1px solid var(--border); background-color: var(--surface-alt);">
        <i class="pi pi-sliders-h" style="color: var(--brand); font-size: 0.9rem;"/>
        <h3 class="m-0" style="color: var(--brand); font-size: 0.92rem; font-weight: 700;">{{ t('settings.preferences-title') }}</h3>
      </div>
      <div class="px-5 py-4" style="display: flex; flex-direction: column; gap: 0;">

        <!-- Theme row -->
        <div class="flex align-items-center justify-content-between py-4 flex-wrap gap-3" style="border-bottom: 1px solid var(--surface-alt);">
          <div class="flex align-items-center gap-3">
            <div class="flex align-items-center justify-content-center border-round-lg flex-shrink-0" style="width: 40px; height: 40px; background-color: var(--brand-soft);">
              <i class="pi pi-sun" style="color: var(--brand); font-size: 1rem;"/>
            </div>
            <div>
              <p class="m-0" style="color: var(--text); font-weight: 600; font-size: 0.9rem;">{{ t('settings.theme-label') }}</p>
              <p class="m-0 mt-1" style="color: var(--text-muted); font-size: 0.78rem;">{{ t('settings.theme-desc') }}</p>
            </div>
          </div>
          <div class="flex" style="gap: 2px; background-color: var(--surface-alt); border-radius: 10px; padding: 3px;">
            <button
                v-for="option in themeOptions"
                :key="option.key"
                type="button"
                class="flex align-items-center gap-2 px-3 py-2 border-round-lg border-none cursor-pointer"
                style="white-space: nowrap; font-size: 0.82rem; transition: all 0.18s;"
                :style="{
                  backgroundColor: themeStore.mode === option.key ? 'var(--surface)' : 'transparent',
                  color:           themeStore.mode === option.key ? 'var(--brand)' : 'var(--text-muted)',
                  fontWeight:      themeStore.mode === option.key ? 700 : 400,
                  boxShadow:       themeStore.mode === option.key ? '0 1px 6px rgba(0,0,0,0.10)' : 'none'
                }"
                @click="themeStore.setMode(option.key)"
            >
              <i :class="option.icon" style="font-size: 0.85rem;"/>
              <span class="hidden sm:inline">{{ t(option.labelKey) }}</span>
            </button>
          </div>
        </div>

        <!-- Language row -->
        <div class="flex align-items-center justify-content-between py-4">
          <div class="flex align-items-center gap-3">
            <div class="flex align-items-center justify-content-center border-round-lg flex-shrink-0" style="width: 40px; height: 40px; background-color: var(--brand-soft);">
              <i class="pi pi-globe" style="color: var(--brand); font-size: 1rem;"/>
            </div>
            <div>
              <p class="m-0" style="color: var(--text); font-weight: 600; font-size: 0.9rem;">{{ t('settings.language-label') }}</p>
              <p class="m-0 mt-1" style="color: var(--text-muted); font-size: 0.78rem;">{{ t('settings.language-desc') }}</p>
            </div>
          </div>
          <language-switcher/>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════
         TAB: SECURITY
    ═══════════════════════════════════════════════════════════════ -->
    <div v-if="activeTab === 'security'" class="border-round-xl overflow-hidden" style="background-color: var(--surface); border: 1px solid var(--border); box-shadow: 0 1px 6px rgba(0,0,0,0.05);">
      <div class="px-5 py-4 flex align-items-center gap-2" style="border-bottom: 1px solid var(--border); background-color: var(--surface-alt);">
        <i class="pi pi-shield" style="color: var(--brand); font-size: 0.9rem;"/>
        <h3 class="m-0" style="color: var(--brand); font-size: 0.92rem; font-weight: 700;">{{ t('settings.security-title') }}</h3>
      </div>
      <div class="p-5">

        <!-- Success banner -->
        <div v-if="securitySuccess" class="flex align-items-center gap-3 p-4 border-round-xl mb-4" style="background-color: var(--status-ok-bg); border: 1.5px solid color-mix(in srgb, var(--status-ok-fg) 35%, transparent);">
          <div class="flex align-items-center justify-content-center border-round-lg flex-shrink-0" style="width: 36px; height: 36px; background-color: var(--status-ok-bg);">
            <i class="pi pi-check-circle" style="color: var(--status-ok-fg); font-size: 1rem;"/>
          </div>
          <p class="m-0" style="color: var(--status-ok-fg); font-size: 0.9rem; font-weight: 600;">{{ t('settings.success-password') }}</p>
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
              <button type="button" class="absolute" style="right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-faint); cursor: pointer; padding: 4px; border-radius: 6px; display: flex; transition: color 0.15s;"
                @click="showNewPassword = !showNewPassword"
                @mouseenter="(e) => e.currentTarget.style.color = 'var(--brand)'"
                @mouseleave="(e) => e.currentTarget.style.color = 'var(--text-faint)'"
              >
                <i :class="showNewPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size: 0.9rem;"/>
              </button>
            </div>
            <div v-if="securityForm.newPassword.length > 0" class="flex align-items-center gap-2 mt-1">
              <div class="flex gap-1 flex-1">
                <div v-for="i in [1,2,3,4]" :key="i" class="flex-1 border-round-lg" style="height: 4px; transition: background-color 0.3s;"
                  :style="{ backgroundColor: computePasswordStrength(securityForm.newPassword) >= i ? strengthColors[computePasswordStrength(securityForm.newPassword)] : 'var(--border)' }"
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
              style="background: linear-gradient(135deg, var(--brand), var(--brand)); color: var(--surface); font-size: 0.9rem; font-weight: 700; width: fit-content; box-shadow: 0 2px 10px rgba(198,113,57,0.3); transition: all 0.18s;"
              :style="{ opacity: securitySubmitting ? 0.7 : 1, cursor: securitySubmitting ? 'not-allowed' : 'pointer' }"
              :disabled="securitySubmitting"
              @mouseenter="(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(198,113,57,0.45)'; e.currentTarget.style.transform = 'translateY(-1px)'; }"
              @mouseleave="(e) => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(198,113,57,0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }"
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
  font-size: 0.8rem; font-weight: 700; color: var(--text);
  letter-spacing: 0.02em;
}

.settings-input {
  width: 100%; border-radius: 10px;
  padding: 10px 14px;
  background-color: var(--surface-alt);
  border: 1.5px solid var(--border);
  color: var(--text); font-size: 0.9rem;
  outline: none; transition: all 0.18s;
  box-sizing: border-box; font-family: inherit;
}
.settings-input:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.settings-input:focus {
  border-color: var(--brand);
  background-color: var(--surface);
  box-shadow: 0 0 0 3px rgba(198,113,57,0.12);
}

.settings-error {
  margin: 2px 0 0;
  font-size: 0.77rem; color: var(--status-critical-fg);
  display: flex; align-items: center; gap: 4px;
}

/* Table rows */
.user-row:hover { background-color: var(--surface-alt); }

/* Hide scrollbar on tab bar */
div[style*="overflow-x: auto"]::-webkit-scrollbar { display: none; }
</style>