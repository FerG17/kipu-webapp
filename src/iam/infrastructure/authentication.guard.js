import useIamStore from '../application/iam.store.js';

/**
 * Route names that are reachable without an authenticated session.
 * @type {string[]}
 */
const publicRouteNames = ['sign-in', 'sign-up', 'forgot-password'];

/**
 * Navigation guard that protects authenticated routes from anonymous users.
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
 * @returns {void}
 */
export const authenticationGuard = (to, from, next) => {
    const store        = useIamStore();
    const isAnonymous  = !store.isAuthenticated;
    const requiresAuth = !publicRouteNames.includes(to.name);

    if (isAnonymous && requiresAuth) return next({ name: 'sign-in' });
    return next();
};