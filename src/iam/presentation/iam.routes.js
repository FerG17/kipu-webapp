const signIn         = () => import('./views/sign-in.vue');
const signUp         = () => import('./views/sign-up.vue');
const forgotPassword = () => import('./views/forgot-password.vue');
const settings       = () => import('./views/settings.vue');

/**
 * Public IAM routes (login, register, forgot-password) — no layout wrapper.
 * Settings route is authenticated (under /app layout).
 *
 * @type {import('vue-router').RouteRecordRaw[]}
 */
const iamPublicRoutes = [
    { path: '/sign-in',         name: 'sign-in',         component: signIn,         meta: { title: 'Sign In'        } },
    { path: '/sign-up',         name: 'sign-up',         component: signUp,         meta: { title: 'Create Account' } },
    { path: '/forgot-password', name: 'forgot-password', component: forgotPassword, meta: { title: 'Forgot Password'} }
];

/**
 * Authenticated IAM routes (settings) — added to the /app layout children.
 * @type {import('vue-router').RouteRecordRaw[]}
 */
export const iamAuthenticatedRoutes = [
    { path: 'settings', name: 'settings', component: settings, meta: { title: 'Settings' } }
];

export default iamPublicRoutes;