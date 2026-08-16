const signIn         = () => import('./views/sign-in.vue');
const forgotPassword = () => import('./views/forgot-password.vue');
const settings       = () => import('./views/settings.vue');

/**
 * Public IAM routes (login, forgot-password) — no layout wrapper. Public
 * sign-up is closed: new businesses are provisioned directly by the platform
 * administrator via the API (see AuthenticationController.SignUp), never
 * through the app UI, so there is no '/sign-up' route. Settings route is
 * authenticated (under /app layout).
 *
 * @type {import('vue-router').RouteRecordRaw[]}
 */
const iamPublicRoutes = [
    { path: '/sign-in',         name: 'sign-in',         component: signIn,         meta: { title: 'Sign In'        } },
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