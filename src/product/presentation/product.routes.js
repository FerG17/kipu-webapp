const productList = () => import('./views/product-list.vue');

/**
 * Route definitions for the Product & Inventory Management bounded context.
 * All views are consolidated in product-list.vue with internal tab switching,
 * matching the Figma prototype's single-page layout.
 *
 * @type {import('vue-router').RouteRecordRaw[]}
 */
const productRoutes = [
    {
        path:      'inventory',
        name:      'products',
        component: productList,
        meta:      { title: 'Inventory' }
    }
];

export default productRoutes;