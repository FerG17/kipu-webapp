/**
 * Shared position → i18n-key / style mapping for role display, within the
 * Identity & Access Management bounded context's presentation layer.
 *
 * `roles.position` (ADMIN/CASHIER/WAREHOUSE) is the single source of truth
 * for a role's identity; this module only maps that position to how it's
 * displayed, so every screen that shows a role label stays in sync when a
 * label's wording or color changes.
 *
 * @module role-labels
 */

/**
 * Maps a role's position to its i18n label key.
 * @param {string|null} position - One of ADMIN/CASHIER/WAREHOUSE, or null if unresolved.
 * @returns {string} i18n key to pass to t().
 */
export function roleLabelKey(position) {
    const keyByPosition = {
        ADMIN:     'settings.role-admin',
        CASHIER:   'settings.role-cashier',
        WAREHOUSE: 'settings.role-warehouse'
    };
    // Falls back to Warehouse (the least-privileged real role) instead of
    // silently mislabeling an unresolved position as Admin — this used to
    // fall back to a key literally named "role-seller" (Vendedor), which
    // showed CASHIER accounts as "Colaborador" and WAREHOUSE accounts as
    // "Vendedor" — backwards, since the cashier is the one who sells.
    return keyByPosition[position] ?? 'settings.role-warehouse';
}

/**
 * Maps a role's position to its badge background/text colors.
 * @param {string|null} position - One of ADMIN/CASHIER/WAREHOUSE, or null if unresolved.
 * @returns {{bg: string, color: string}}
 */
export function roleStyleByPosition(position) {
    const styleByPosition = {
        ADMIN:     { bg: '#FEE2E2', color: '#DC2626' },
        CASHIER:   { bg: '#EDE9FE', color: '#7C3AED' },
        WAREHOUSE: { bg: '#DBEAFE', color: '#1D4ED8' }
    };
    return styleByPosition[position] ?? styleByPosition.WAREHOUSE;
}
