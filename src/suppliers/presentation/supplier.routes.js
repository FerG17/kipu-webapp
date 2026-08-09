/**
 * Route definitions for the Supplier & Replenishment Management bounded context.
 *
 * All routes are nested under the authenticated Layout (/app) and require
 * a valid session (enforced by the global navigation guard in router.js).
 *
 * Routes:
 *   /app/suppliers          → SuppliersPage (tab: suppliers list)
 *
 * @type {import('vue-router').RouteRecordRaw[]}
 */
const supplierRoutes = [
    {
        path:      'suppliers',
        name:      'suppliers',
        component: () => import('./views/suppliers-page.vue'),
        meta:      { title: 'Suppliers' }
    }
];

export default supplierRoutes;
