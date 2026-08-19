<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import LanguageSwitcher from './language-switcher.vue';
import useIamStore from '../../../iam/application/iam.store.js';
import useAlertsStore from '../../../alerts/application/alerts.store.js';
import { roleLabelKey } from '../../../iam/presentation/role-labels.js';
import { canAccessDashboard, canAccessSales, canAccessSuppliers } from '../../../iam/application/permissions.js';

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
 * All navigation items for the sidebar menu.
 * Each entry maps a translation key, a PrimeIcons class and a route name.
 * The activeAlertCount badge is shown only for the alerts item. `access`
 * mirrors the route's own `meta.requiredPermission` guard (see
 * authentication.guard.js) — a role that can't reach a route shouldn't see
 * it in the menu either, so both stay in sync against the same predicate.
 */
const allMenuItems = [
  { labelKey: 'option.dashboard',  icon: 'pi pi-th-large',      routeName: 'dashboard',  access: canAccessDashboard },
  { labelKey: 'option.inventory',  icon: 'pi pi-box',           routeName: 'products'  },
  { labelKey: 'option.sales',      icon: 'pi pi-shopping-cart', routeName: 'pos-screen', access: canAccessSales     },
  { labelKey: 'option.suppliers',  icon: 'pi pi-truck',         routeName: 'suppliers',  access: canAccessSuppliers },
  { labelKey: 'option.alerts',     icon: 'pi pi-bell',          routeName: 'alerts',     showBadge: true },
  { labelKey: 'option.settings',   icon: 'pi pi-cog',           routeName: 'settings'  },
];

/**
 * Sidebar items visible to the current role — every item without an
 * `access` predicate is open to any role (Inventory/Alerts/Settings all
 * have read access for everyone, per Fase B4's matrix).
 * @type {import('vue').ComputedRef<Array>}
 */
const menuItems = computed(() =>
    allMenuItems.filter(item => !item.access || item.access(iamStore.currentUserPosition))
);

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
async function handleSignOut() {
  // Awaited so the backend sign-out call (clears the httpOnly cookie,
  // revokes the token) completes before the full-page navigation below can
  // cut it short.
  await iamStore.signOut();
  window.location.href = router.resolve({ name: 'sign-in' }).href;
}
</script>

<template>
  <pv-toast :breakpoints="{ '576px': { width: '92vw', left: '4vw', right: '4vw' } }"/>
  <pv-confirm-dialog/>

  <div class="bodega-shell flex min-h-screen">

    <!-- ── Mobile top bar ────────────────────────────────────────────── -->
    <div class="bodega-topbar lg:hidden fixed top-0 left-0 right-0 z-50 flex align-items-center justify-content-between px-4">
      <div class="flex align-items-center gap-2">
        <button
            class="bodega-icon-btn flex align-items-center justify-content-center border-round-lg border-none cursor-pointer"
            :aria-label="sidebarOpen ? t('sidebar.close-menu') : t('sidebar.open-menu')"
            :title="sidebarOpen ? t('sidebar.close-menu') : t('sidebar.open-menu')"
            @click="toggleSidebar"
        >
          <i :class="sidebarOpen ? 'pi pi-times' : 'pi pi-bars'" style="font-size: 1.1rem;"/>
        </button>
        <div class="bodega-brand">
          <span class="bodega-brand-mark" aria-hidden="true">K</span>
          <span class="bodega-brand-name">Kipu</span>
        </div>
      </div>
      <div class="flex align-items-center gap-2">
        <language-switcher/>
        <!-- Mobile alert badge -->
        <button
            class="bodega-icon-btn relative flex align-items-center justify-content-center border-round-lg border-none cursor-pointer"
            :class="{ 'alerts-btn-critical': hasCriticalAlerts }"
            :aria-label="t('option.alerts')"
            :title="t('option.alerts')"
            @click="navigateTo('alerts')"
        >
          <i class="pi pi-bell" :class="{ 'bodega-icon-critical': hasCriticalAlerts }" style="font-size: 1.3rem;"/>
          <span v-if="activeAlertCount > 0" class="bodega-badge absolute flex align-items-center justify-content-center border-circle">
            {{ activeAlertCount > 9 ? '9+' : activeAlertCount }}
          </span>
        </button>
      </div>
    </div>

    <!-- ── Sidebar ───────────────────────────────────────────────────── -->
    <aside
        class="bodega-sidebar fixed top-0 left-0 h-full z-40 flex flex-column"
        :style="{ transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }"
    >
      <!-- Brand mark (desktop only) -->
      <div class="hidden lg:flex flex-column align-items-center pt-5 pb-4 px-3 bodega-sidebar-brand">
        <span class="bodega-brand-mark bodega-brand-mark--lg" aria-hidden="true">K</span>
        <p class="m-0 mt-2 bodega-sidebar-title">Kipu</p>
        <p class="m-0 bodega-sidebar-subtitle">{{ t('sidebar.tagline') }}</p>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 py-4 px-2 overflow-y-auto bodega-nav">
        <button
            v-for="item in menuItems"
            :key="item.labelKey"
            class="bodega-nav-item relative w-full flex align-items-center gap-3 px-3 py-3 border-round-lg border-none cursor-pointer"
            :class="{
              'bodega-nav-item--active': isActiveRoute(item.routeName),
              'bodega-nav-item--critical': item.showBadge && hasCriticalAlerts && !isActiveRoute(item.routeName)
            }"
            @click="navigateTo(item.routeName)"
        >
          <i :class="item.icon" style="font-size: 1rem; flex-shrink: 0;"/>
          <span>{{ t(item.labelKey) }}</span>

          <span v-if="item.showBadge && activeAlertCount > 0" class="bodega-badge ml-auto flex align-items-center justify-content-center border-circle" style="position: static;">
            {{ activeAlertCount > 9 ? '9+' : activeAlertCount }}
          </span>

          <div v-if="isActiveRoute(item.routeName)" class="bodega-nav-active-bar absolute"/>
        </button>
      </nav>

      <!-- Language switcher (desktop sidebar) -->
      <div class="hidden lg:flex justify-content-center px-3 py-3 bodega-sidebar-footer-divider">
        <language-switcher/>
      </div>

      <!-- User info + logout -->
      <div class="px-2 pb-4 bodega-sidebar-footer-divider">
        <div class="flex align-items-center gap-2 px-3 py-3">
          <div class="bodega-avatar flex align-items-center justify-content-center border-circle flex-shrink-0">
            {{ iamStore.currentUser ? iamStore.currentUser.initials : 'B' }}
          </div>
          <div style="min-width: 0; flex: 1;">
            <p class="m-0 bodega-sidebar-username">
              {{ iamStore.currentUser ? iamStore.currentUser.fullName : 'Kipu' }}
            </p>
            <p class="m-0 bodega-sidebar-userrole">
              {{ currentUserRoleLabel }}
            </p>
          </div>
        </div>

        <button class="bodega-signout-btn w-full flex align-items-center gap-3 px-3 py-2 border-round-lg border-none cursor-pointer" @click="handleSignOut">
          <i class="pi pi-sign-out" style="font-size: 1rem;"/>
          <span>{{ t('sidebar.logout') }}</span>
        </button>
      </div>
    </aside>

    <!-- Mobile overlay -->
    <div
        v-if="sidebarOpen"
        class="fixed inset-0 z-30 lg:hidden bodega-overlay"
        @click="closeSidebar"
    />

    <!-- ── Main content ───────────────────────────────────────────────── -->
    <main class="bodega-main flex-1 min-w-0">
      <div class="px-4 py-6 bodega-main-inner">
        <router-view/>
      </div>
    </main>

  </div>
</template>

<style scoped>
.bodega-shell {
  background-color: var(--bg);
}

.bodega-topbar {
  height: 56px;
  background-color: var(--brand);
  border-bottom: 1px solid var(--border-strong);
}

.bodega-brand { display: flex; align-items: center; gap: 8px; }
.bodega-brand-mark {
  width: 30px; height: 30px; border-radius: var(--radius-sm);
  background: var(--brand-ink); color: var(--brand);
  display: grid; place-items: center;
  font-family: var(--font-display); font-weight: 700; font-size: 1rem;
  flex-shrink: 0;
}
.bodega-brand-mark--lg { width: 44px; height: 44px; font-size: 1.3rem; }
.bodega-brand-name { color: var(--brand-ink); font-weight: 700; font-size: 1rem; font-family: var(--font-body); }

.bodega-icon-btn {
  width: 36px; height: 36px; background: none; color: var(--brand-ink); border: none;
}
.bodega-icon-critical { color: var(--status-critical-fg); }

.bodega-badge {
  top: 2px; right: 2px; width: 16px; height: 16px;
  background-color: var(--status-critical-fg); color: #fff;
  font-size: 0.6rem; font-weight: 700;
}

.bodega-sidebar {
  width: 224px;
  background-color: var(--brand);
  transition: transform 0.3s ease;
  flex-shrink: 0;
  padding-top: 56px;
}

.bodega-sidebar-brand { border-bottom: 1px solid rgba(255,255,255,0.12); }
.bodega-sidebar-title { color: var(--brand-ink); font-weight: 700; font-size: 1rem; font-family: var(--font-body); }
.bodega-sidebar-subtitle { color: color-mix(in srgb, var(--brand-ink) 65%, transparent); font-size: 0.7rem; }

.bodega-nav-item {
  color: color-mix(in srgb, var(--brand-ink) 75%, transparent);
  font-size: 0.88rem;
  font-weight: 400;
  background: transparent;
  transition: background-color 0.15s, color 0.15s;
}
.bodega-nav-item:hover { background-color: rgba(255,255,255,0.08); }
.bodega-nav-item--active {
  background-color: color-mix(in srgb, var(--accent) 24%, transparent);
  color: var(--brand-ink);
  font-weight: 600;
}
.bodega-nav-item--critical {
  /* Needs to read as MORE urgent than the plain active state, not less —
     mixing the critical color down to 55% against --brand-ink (the old
     value) landed weaker than --active's full-strength --brand-ink, so an
     alert item ended up looking more washed out than an ordinary selected
     one instead of standing out from it. */
  background-color: color-mix(in srgb, var(--status-critical-fg) 28%, transparent);
  color: var(--brand-ink);
  font-weight: 600;
}
.bodega-nav-active-bar {
  right: 0; top: 50%; transform: translateY(-50%);
  width: 3px; height: 20px; background-color: var(--accent);
  border-radius: 2px 0 0 2px;
}

.bodega-sidebar-footer-divider { border-top: 1px solid rgba(255,255,255,0.12); }

.bodega-avatar {
  width: 34px; height: 34px;
  background-color: var(--accent); color: var(--accent-ink);
  font-size: 0.72rem; font-weight: 700; font-family: var(--font-body);
}
.bodega-sidebar-username {
  color: var(--brand-ink); font-size: 0.78rem; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bodega-sidebar-userrole { color: color-mix(in srgb, var(--brand-ink) 65%, transparent); font-size: 0.68rem; }

.bodega-signout-btn {
  background: transparent; color: color-mix(in srgb, var(--brand-ink) 75%, transparent);
  font-size: 0.85rem; transition: background-color 0.15s, color 0.15s;
}
.bodega-signout-btn:hover { background-color: rgba(255,255,255,0.08); color: var(--brand-ink); }

.bodega-overlay { background-color: rgba(0,0,0,0.5); }

.bodega-main { padding-top: 56px; display: flex; justify-content: center; }
.bodega-main-inner { width: 100%; max-width: 1200px; }

.alerts-btn-critical { animation: alerts-critical-pulse 1.8s ease-in-out infinite; }

@keyframes alerts-critical-pulse {
  0%, 100% { background-color: transparent; }
  50%      { background-color: color-mix(in srgb, var(--status-critical-fg) 22%, transparent); }
}

@media (prefers-reduced-motion: reduce) {
  .alerts-btn-critical { animation: none; }
}

@media (min-width: 1024px) {
  .bodega-sidebar {
    transform: translateX(0) !important;
    padding-top: 0 !important;
  }
  .bodega-main {
    margin-left: 224px !important;
    padding-top: 0 !important;
  }
}
</style>
