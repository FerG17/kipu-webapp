/**
 * Single source of truth for role-based UI gating, mirroring the backend's
 * real permission matrix (Fase B4, `RequestAuthorizationMiddleware` +
 * `[Authorize(...)]` attributes per controller) exactly — the backend
 * already enforces every one of these server-side, so this module is UX
 * (hide what would 403 anyway), not a security boundary.
 *
 * `position` is the role's position string (`role-labels.js`'s single
 * source of truth for role identity), resolved from a numeric `roleId` via
 * `iamStore.getRolePosition(roleId)`.
 *
 * @module permissions
 */

/** Dashboard/Reports — admin only. */
export function canAccessDashboard(position) {
    return position === 'ADMIN';
}

/** Sales/POS/Customers/Payment plans — admin + cashier. */
export function canAccessSales(position) {
    return position === 'ADMIN' || position === 'CASHIER';
}

/** Suppliers/Purchases — admin + warehouse. */
export function canAccessSuppliers(position) {
    return position === 'ADMIN' || position === 'WAREHOUSE';
}

/**
 * Products/Warehouses/Inventories/Batches writes (create, edit, delete,
 * stock intake) — admin + warehouse. Reads stay open to every role, so
 * there is no corresponding canAccessInventory.
 */
export function canWriteInventory(position) {
    return position === 'ADMIN' || position === 'WAREHOUSE';
}

/** Acknowledging/resolving alerts — admin + warehouse. */
export function canModerateAlerts(position) {
    return position === 'ADMIN' || position === 'WAREHOUSE';
}

/** Alert rule thresholds — admin only. */
export function canManageAlertRules(position) {
    return position === 'ADMIN';
}

/** Inviting/removing team members — admin only. */
export function canManageTeam(position) {
    return position === 'ADMIN';
}

/** Editing the business's own profile (name/address) — admin only. */
export function canEditBusinessProfile(position) {
    return position === 'ADMIN';
}
