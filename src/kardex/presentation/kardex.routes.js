const kardexPage = () => import('./views/kardex-page.vue');

/**
 * Route definitions for the Kardex bounded context — the stock-movement
 * ledger, extracted out of Inventario's own "Movimientos" tab (X6 feedback
 * #1+#2+#4) into its own top-level section.
 *
 * @type {import('vue-router').RouteRecordRaw[]}
 */
const kardexRoutes = [
    {
        path:      'kardex',
        name:      'kardex',
        component: kardexPage,
        meta:      { title: 'Kardex' }
    }
];

export default kardexRoutes;
