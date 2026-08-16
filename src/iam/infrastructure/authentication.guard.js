import useIamStore from '../application/iam.store.js';
import { canAccessDashboard, canAccessSales, canAccessSuppliers } from '../application/permissions.js';

/**
 * Route names that are reachable without an authenticated session.
 * @type {string[]}
 */
const publicRouteNames = ['sign-in', 'forgot-password'];

/**
 * Maps a route's `meta.requiredPermission` value to the permissions.js
 * predicate that decides whether the current role may enter it — kept here
 * rather than importing every predicate route-by-route, so a route only has
 * to declare a short key.
 * @type {Record<string, (position: string|null) => boolean>}
 */
const permissionChecks = {
    dashboard: canAccessDashboard,
    sales:     canAccessSales,
    suppliers: canAccessSuppliers
};

/**
 * Navigation guard that protects authenticated routes from anonymous users,
 * and — for routes carrying `meta.requiredPermission` — from roles the real
 * backend would reject anyway (Fase B4's permission matrix). This is UX,
 * not the security boundary: every one of these is already enforced
 * server-side with a real 403; hiding the route (and the sidebar entry that
 * leads to it, see layout.vue) just avoids sending a role into a screen
 * that can only fail for them.
 *
 * Mirrors the Learning Center reference pattern: when there is no active
 * session and the target route is not public, the user is redirected to the
 * sign-in screen. This prevents landing on protected views (e.g. the POS)
 * without a businessId, which would otherwise issue queries with an undefined
 * scope and leave the data stores in a permanently "loaded but empty" state.
 *
 * @param {import('vue-router').RouteLocationNormalized} to - Target route.
 * @param {import('vue-router').RouteLocationNormalized} from - Current route.
 * @param {import('vue-router').NavigationGuardNext} next - Guard continuation callback.
 * @returns {void|Promise<void>}
 */
export const authenticationGuard = (to, from, next) => {
    const store        = useIamStore();
    const isAnonymous  = !store.isAuthenticated;
    const requiresAuth = !publicRouteNames.includes(to.name);

    if (isAnonymous && requiresAuth) return next({ name: 'sign-in' });

    const requiredPermission = to.matched
        .map(record => record.meta?.requiredPermission)
        .find(Boolean);
    if (!requiredPermission) return next();

    // Roles are fetched lazily today (layout.vue's onMounted) — awaited here
    // too, so the very first navigation right after sign-in isn't decided
    // against an empty roles catalog.
    const ensureRolesLoaded = store.rolesLoaded ? Promise.resolve() : store.fetchRoles();
    return ensureRolesLoaded.then(() => {
        const allowed = permissionChecks[requiredPermission](store.currentUserPosition);
        // 'products' is the one screen every role can read — a safe,
        // always-reachable fallback instead of a dead end.
        return next(allowed ? undefined : { name: 'products' });
    });
};
