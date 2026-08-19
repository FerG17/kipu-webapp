const activeAlertsDashboard     = () => import('./views/active-alerts-dashboard.vue');

/**
 * Route definitions for the Alerts & Operational Monitoring bounded context.
 * These are child routes of the authenticated /app layout wrapper.
 *
 * @type {import('vue-router').RouteRecordRaw[]}
 */
const alertsRoutes = [
    {
        path:      'alerts',
        name:      'alerts',
        component: activeAlertsDashboard,
        meta:      { title: 'Alerts' }
    }
];

export default alertsRoutes;