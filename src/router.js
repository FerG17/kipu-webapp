import { createRouter, createWebHistory } from 'vue-router';
import iamPublicRoutes from './iam/presentation/iam.routes.js';
import Layout from './shared/presentation/components/layout.vue';
import dashboardRoutes from './dashboard/presentation/dashboard.routes.js';
import {iamAuthenticatedRoutes} from "./iam/presentation/iam.routes.js";
import Home from './shared/presentation/views/home.vue';
import productRoutes from './product/presentation/product.routes.js';
import alertsRoutes from './alerts/presentation/alerts.routes.js';
import salesRoutes from './sales/presentation/sales.routes.js';
import { authenticationGuard } from './iam/infrastructure/authentication.guard.js';
import suppliersRoutes from './suppliers/presentation/supplier.routes.js';


const pageNotFound = () => import('./shared/presentation/views/page-not-found.vue');

/**
 * Route definitions.
 *
 * Public routes (no layout/sidebar):
 *   /sign-in, /forgot-password
 *
 * Authenticated routes (wrapped by Layout):
 *   /home, /about, and future bounded context paths.
 *
 * @type {import('vue-router').RouteRecordRaw[]}
 */
const routes = [
    // Redirect Sign-in
    {path: '/', redirect: '/sign-in'},

    // Public IAM routes
    ...iamPublicRoutes,

    // Authenticated routes wrapped in the sidebar Layout
    {
        path:      '/app',
        component: Layout,
        children: [
            { path: 'home',  name: 'home',  component: Home,  meta: { title: 'Home' } },
            ...dashboardRoutes,
            ...productRoutes,
            ...alertsRoutes,
            ...salesRoutes,
            ...iamAuthenticatedRoutes,
            ...suppliersRoutes,
        ]
    },

    // Catch-all 404
    { path: '/:pathMatch(.*)*', name: 'not-found', component: pageNotFound, meta: { title: 'Page Not Found' } }
];

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: routes,
});

/**
 * Global navigation guard.
 * Updates the browser document title on every route change.
 *
 * @param {import('vue-router').RouteLocationNormalized} to - Target route.
 * @param {import('vue-router').RouteLocationNormalized} from - Previous route.
 * @param {import('vue-router').NavigationGuardNext} next - Guard continuation callback.
 * @returns {void}
 */
router.beforeEach((to, from, next) => {
    const baseTitle = 'Bodega Platform';
    document.title  = `${baseTitle} - ${to.meta['title'] ?? ''}`;
    return authenticationGuard(to, from, next);
});

export default router;
