<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import LanguageSwitcher from './language-switcher.vue';
import useIamStore from '../../../iam/application/iam.store.js';
import useAlertsStore from '../../../alerts/application/alerts.store.js';
import { roleLabelKey } from '../../../iam/presentation/role-labels.js';

const { t }      = useI18n();
const router     = useRouter();
const route      = useRoute();
const iamStore   = useIamStore();
const alertsStore = useAlertsStore();

/**
 * Loads alerts as soon as the authenticated layout mounts so the sidebar/mobile
 * badge and critical-alert highlight reflect real data on every page, not only
 * after the user has visited the Alerts section at least once.
 * Also loads roles so the sidebar footer can resolve the real role label
 * instead of a static placeholder.
 */
onMounted(() => {
  const businessId = iamStore.currentUser?.businessId ?? null;
  if (businessId && !alertsStore.alertsLoaded) {
    alertsStore.fetchAlerts(businessId);
  }
  if (!iamStore.rolesLoaded) {
    iamStore.fetchRoles();
  }
});

/**
 * Resolves the current user's roleId to its display label via roles.position,
 * the same source of truth used in Settings — this used to be a hardcoded
 * "Administrador" string regardless of the actual logged-in user's role.
 */
const currentUserRoleLabel = computed(() => {
  const roleId = iamStore.currentUser?.roleId;
  if (roleId == null) return t('sidebar.admin-label');
  return t(roleLabelKey(iamStore.getRolePosition(roleId)));
});

/**
 * Controls whether the mobile sidebar drawer is visible.
 * On desktop (lg+) the sidebar is always visible via CSS.
 */
const sidebarOpen = ref(false);

/**
 * Toggles the mobile sidebar open/closed state.
 */
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}

/**
 * Closes the mobile sidebar overlay.
 */
function closeSidebar() {
  sidebarOpen.value = false;
}

/**
 * Navigation items for the sidebar menu.
 * Each entry maps a translation key, a PrimeIcons class and a route name.
 * The activeAlertCount badge is shown only for the alerts item.
 */
const menuItems = [
  { labelKey: 'option.dashboard',  icon: 'pi pi-th-large',      routeName: 'dashboard'       },
  { labelKey: 'option.inventory',  icon: 'pi pi-box',           routeName: 'products'        },
  { labelKey: 'option.sales',      icon: 'pi pi-shopping-cart', routeName: 'pos-screen'      },
  { labelKey: 'option.suppliers',  icon: 'pi pi-truck',         routeName: 'suppliers'       },
  { labelKey: 'option.alerts',     icon: 'pi pi-bell',          routeName: 'alerts',         showBadge: true },
  { labelKey: 'option.settings',   icon: 'pi pi-cog',           routeName: 'settings'        },
];

/**
 * Number of active (non-resolved) alerts for the sidebar badge.
 * Business rule: only alerts with status !== 'RESOLVED' are counted.
 * @type {import('vue').ComputedRef<number>}
 */
const activeAlertCount = computed(() =>
    alertsStore.alerts.filter(alert => alert.status !== 'RESOLVED').length
);

/**
 * Whether there is at least one critical alert still pending.
 * Used to visually emphasize the Alerts entry point (sidebar item and mobile bell)
 * beyond just the numeric badge, per UX heuristic recommendation.
 * @type {import('vue').ComputedRef<boolean>}
 */
const hasCriticalAlerts = computed(() => alertsStore.criticalActiveCount > 0);

/**
 * Navigates to the selected route and closes the mobile sidebar.
 * @param {string} routeName - Name of the target route.
 */
function navigateTo(routeName) {
  router.push({ name: routeName });
  closeSidebar();
}

/**
 * Returns true when the given route is the currently active route or one of its children.
 * Used to highlight the active sidebar item.
 * @param {string} routeName - Route name to check.
 * @returns {boolean}
 */
function isActiveRoute(routeName) {
  return route.name === routeName || route.matched.some(record => record.name === routeName);
}

/**
 * Signs the current user out and navigates to the sign-in view.
 *
 * Uses a full browser navigation (not router.push) on purpose: an SPA-only
 * transition leaves every other bounded context's Pinia store (products,
 * sales, alerts, etc.) alive in memory with the previous user's data and
 * "already loaded" flags still true, so the next account to sign in — even
 * a different business — would see stale data until a manual hard refresh.
 * A full reload guarantees every store starts clean, every time.
 */
function handleSignOut() {
  iamStore.signOut();
  window.location.href = router.resolve({ name: 'sign-in' }).href;
}
</script>

<template>
  <pv-toast/>
  <pv-confirm-dialog/>

  <div class="flex min-h-screen" style="background-color: #F8FAFC;">

    <!-- ── Mobile top bar ────────────────────────────────────────────── -->
    <div
        class="lg:hidden fixed top-0 left-0 right-0 z-50 flex align-items-center justify-content-between px-4"
        style="height: 56px; background-color: #0B3558; border-bottom: 1px solid rgba(255,255,255,0.08);"
    >
      <div class="flex align-items-center gap-2">
        <button
            class="flex align-items-center justify-content-center border-round-lg border-none cursor-pointer"
            style="width: 36px; height: 36px; background: none; color: #FAFAF7;"
            :aria-label="sidebarOpen ? t('sidebar.close-menu') : t('sidebar.open-menu')"
            :title="sidebarOpen ? t('sidebar.close-menu') : t('sidebar.open-menu')"
            @click="toggleSidebar"
        >
          <i :class="sidebarOpen ? 'pi pi-times' : 'pi pi-bars'" style="font-size: 1.1rem;"/>
        </button>
        <img src="../../../assets/qullqa_logo.jpeg" alt="Bodega Platform" style="height: 32px; border-radius: 6px;"/>
        <span style="color: #FAFAF7; font-weight: 700; font-size: 1rem;">Bodega Platform</span>
      </div>
      <div class="flex align-items-center gap-2">
        <language-switcher/>
        <!-- Mobile alert badge -->
        <button
            class="relative flex align-items-center justify-content-center border-round-lg border-none cursor-pointer"
            :class="{ 'alerts-btn-critical': hasCriticalAlerts }"
            style="width: 40px; height: 40px; background: none; color: #FAFAF7;"
            :aria-label="t('option.alerts')"
            :title="t('option.alerts')"
            @click="navigateTo('alerts')"
        >
          <i class="pi pi-bell" :style="{ fontSize: '1.3rem', color: hasCriticalAlerts ? '#F87171' : '#FAFAF7' }"/>
          <span
              v-if="activeAlertCount > 0"
              class="absolute flex align-items-center justify-content-center border-circle"
              style="top: 2px; right: 2px; width: 16px; height: 16px; background-color: #EF4444; color: #fff; font-size: 0.6rem; font-weight: 700;"
          >
                        {{ activeAlertCount > 9 ? '9+' : activeAlertCount }}
                    </span>
        </button>
      </div>
    </div>

    <!-- ── Sidebar ───────────────────────────────────────────────────── -->
    <aside
        class="fixed top-0 left-0 h-full z-40 flex flex-column"
        style="
                width: 224px;
                background-color: #0B3558;
                transition: transform 0.3s ease;
                flex-shrink: 0;
            "
        :style="{ transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }"
    >
      <!-- Logo (desktop only) -->
      <div
          class="hidden lg:flex flex-column align-items-center pt-5 pb-4 px-3"
          style="border-bottom: 1px solid rgba(255,255,255,0.08);"
      >
        <img src="../../../assets/qullqa_logo.jpeg" alt="Bodega Platform" style="width: 48px; height: 48px; border-radius: 10px; object-fit: contain;"/>
        <p class="m-0 mt-2" style="color: #FAFAF7; font-weight: 700; font-size: 1rem;">Bodega Platform</p>
        <p class="m-0" style="color: #7FA8BF; font-size: 0.7rem;">Store Manager</p>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 py-4 px-2 overflow-y-auto" style="display: flex; flex-direction: column; gap: 2px;">
        <button
            v-for="item in menuItems"
            :key="item.labelKey"
            class="relative w-full flex align-items-center gap-3 px-3 py-3 border-round-lg border-none cursor-pointer"
            :style="{
                        backgroundColor: isActiveRoute(item.routeName)
                            ? 'rgba(14,116,144,0.25)'
                            : (item.showBadge && hasCriticalAlerts ? 'rgba(239,68,68,0.14)' : 'transparent'),
                        color:           isActiveRoute(item.routeName)
                            ? '#FAFAF7'
                            : (item.showBadge && hasCriticalAlerts ? '#FCA5A5' : '#93B5C9'),
                        fontSize:        '0.88rem',
                        fontWeight:      isActiveRoute(item.routeName) ? 600 : 400,
                        transition:      'background-color 0.15s, color 0.15s'
                    }"
            @click="navigateTo(item.routeName)"
            @mouseenter="(event) => { if (!isActiveRoute(item.routeName)) event.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }"
            @mouseleave="(event) => { if (!isActiveRoute(item.routeName)) event.currentTarget.style.backgroundColor = (item.showBadge && hasCriticalAlerts) ? 'rgba(239,68,68,0.14)' : 'transparent'; }"
        >
          <i :class="item.icon" style="font-size: 1rem; flex-shrink: 0;"/>
          <span>{{ t(item.labelKey) }}</span>

          <!-- Alert badge -->
          <span
              v-if="item.showBadge && activeAlertCount > 0"
              class="ml-auto flex align-items-center justify-content-center border-circle"
              style="width: 18px; height: 18px; background-color: #EF4444; color: #fff; font-size: 0.62rem; font-weight: 700; flex-shrink: 0;"
          >
                        {{ activeAlertCount > 9 ? '9+' : activeAlertCount }}
                    </span>

          <!-- Active indicator bar -->
          <div
              v-if="isActiveRoute(item.routeName)"
              class="absolute"
              style="right: 0; top: 50%; transform: translateY(-50%); width: 3px; height: 20px; background-color: #0E7490; border-radius: 2px 0 0 2px;"
          />
        </button>
      </nav>

      <!-- Language switcher (desktop sidebar) -->
      <div
          class="hidden lg:flex justify-content-center px-3 py-3"
          style="border-top: 1px solid rgba(255,255,255,0.08);"
      >
        <language-switcher/>
      </div>

      <!-- User info + logout -->
      <div
          class="px-2 pb-4"
          style="border-top: 1px solid rgba(255,255,255,0.08);"
      >
        <div class="flex align-items-center gap-2 px-3 py-3">
          <div
              class="flex align-items-center justify-content-center border-circle flex-shrink-0"
              style="width: 34px; height: 34px; background-color: #0E7490; font-size: 0.72rem; font-weight: 700; color: #FAFAF7;"
          >
            {{ iamStore.currentUser ? iamStore.currentUser.initials : 'Q' }}
          </div>
          <div style="min-width: 0; flex: 1;">
            <p class="m-0" style="color: #FAFAF7; font-size: 0.78rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              {{ iamStore.currentUser ? iamStore.currentUser.fullName : 'Bodega Platform' }}
            </p>
            <p class="m-0" style="color: #7FA8BF; font-size: 0.68rem;">
              {{ currentUserRoleLabel }}
            </p>
          </div>
        </div>

        <button
            class="w-full flex align-items-center gap-3 px-3 py-2 border-round-lg border-none cursor-pointer"
            style="background: transparent; color: #93B5C9; font-size: 0.85rem; transition: background-color 0.15s, color 0.15s;"
            @click="handleSignOut"
            @mouseenter="(event) => { event.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; event.currentTarget.style.color = '#FAFAF7'; }"
            @mouseleave="(event) => { event.currentTarget.style.backgroundColor = 'transparent'; event.currentTarget.style.color = '#93B5C9'; }"
        >
          <i class="pi pi-sign-out" style="font-size: 1rem;"/>
          <span>{{ t('sidebar.logout') }}</span>
        </button>
      </div>
    </aside>

    <!-- Mobile overlay -->
    <div
        v-if="sidebarOpen"
        class="fixed inset-0 z-30 lg:hidden"
        style="background-color: rgba(0,0,0,0.5);"
        @click="closeSidebar"
    />

    <!-- ── Main content ───────────────────────────────────────────────── -->
    <main
        class="flex-1 min-w-0"
        style="margin-left: 0; transition: margin-left 0.3s ease; padding-top: 56px; display: flex; justify-content: center;"
    >
      <div class="px-4 py-6" style="width: 100%; max-width: 1200px;">
        <router-view/>
      </div>
    </main>

  </div>
</template>

<style scoped>
aside {
  padding-top: 56px;
}

.alerts-btn-critical {
  animation: alerts-critical-pulse 1.8s ease-in-out infinite;
}

@keyframes alerts-critical-pulse {
  0%, 100% { background-color: transparent; }
  50%      { background-color: rgba(239, 68, 68, 0.22); }
}

@media (min-width: 1024px) {
  aside {
    transform: translateX(0) !important;
    padding-top: 0 !important;
  }

  main {
    margin-left: 224px !important;
    padding-top: 0 !important;
  }
}
</style>