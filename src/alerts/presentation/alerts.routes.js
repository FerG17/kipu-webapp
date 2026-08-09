const activeAlertsDashboard     = () => import('./views/active-alerts-dashboard.vue');
const alertNotificationStatus   = () => import('./views/alert-notification-status.vue');

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
    },
    {
        path:      'alerts/:id',
        name:      'alert-detail',
        component: alertNotificationStatus,
        meta:      { title: 'Alert Detail' }
    }
];

export default alertsRoutes;