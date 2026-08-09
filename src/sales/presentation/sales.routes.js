const salesLayout   = () => import('./views/sales-layout.vue');
const posScreen     = () => import('./views/pos-screen.vue');
const salesHistory  = () => import('./views/sales-history.vue');
const customerList  = () => import('./views/customer-list.vue');

/**
 * Route definitions for the Sales & POS Management bounded context.
 * These are child routes of the authenticated /app layout wrapper.
 *
 * Structure:
 * /app/sales              → redirect to /app/sales/pos
 * /app/sales/pos          → POS screen (product grid + cart)
 * /app/sales/history      → Sales history table
 * /app/sales/customers    → Customer list
 *
 * The parent route renders sales-layout.vue which contains the header,
 * stats bar, and tab navigation. The child routes render inside its <router-view>.
 *
 * @type {import('vue-router').RouteRecordRaw[]}
 */
const salesRoutes = [
    {
        path:      'sales',
        component: salesLayout,
        children:  [
            {
                path:     '',
                redirect: { name: 'pos-screen' }
            },
            {
                path:      'pos',
                name:      'pos-screen',
                component: posScreen,
                meta:      { title: 'Point of Sale' }
            },
            {
                path:      'history',
                name:      'sales-history',
                component: salesHistory,
                meta:      { title: 'Sales History' }
            },
            {
                path:      'customers',
                name:      'customer-list',
                component: customerList,
                meta:      { title: 'Customers' }
            }
        ]
    }
];

export default salesRoutes;