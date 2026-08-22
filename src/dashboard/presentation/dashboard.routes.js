// Lazy-loaded dashboard views
const businessDashboard = () => import('./views/business-dashboard.vue');
const reportFilters     = () => import('./views/report-filters.vue');
const reportResult      = () => import('./views/report-result.vue');

/**
 * Route definitions for the Dashboard & Analytics bounded context.
 * These are child routes of the authenticated /app layout wrapper.
 *
 * @type {import('vue-router').RouteRecordRaw[]}
 */
const dashboardRoutes = [
    {
        path:      'dashboard',
        name:      'dashboard',
        component: businessDashboard,
        meta:      { title: 'Dashboard', requiredPermission: 'dashboard' }
    },
    {
        path:      'dashboard/reports/new',
        name:      'dashboard-report-filters',
        component: reportFilters,
        meta:      { title: 'Generate Report', requiredPermission: 'dashboard' }
    },
    {
        path:      'dashboard/reports/result',
        name:      'dashboard-report-result',
        component: reportResult,
        meta:      { title: 'Report Result', requiredPermission: 'dashboard' }
    }
];

export default dashboardRoutes;