import { describe, it, expect } from 'vitest';
import {
    canAccessDashboard,
    canAccessSales,
    canAccessSuppliers,
    canWriteInventory,
    canModerateAlerts,
    canManageAlertRules,
    canManageTeam,
    canEditBusinessProfile,
    canEditCustomers,
    canCancelSales,
    canRevertInstallmentPayments
} from './permissions.js';

// Mirrors the backend's real permission matrix (RequestAuthorizationMiddleware
// + [Authorize(...)] per controller) — this module is UX only (hide what
// would 403 anyway), so the only thing worth testing is that the matrix
// itself matches what's documented, one role/function pair at a time.
const ADMIN = 'ADMIN';
const CASHIER = 'CASHIER';
const WAREHOUSE = 'WAREHOUSE';

describe('permissions', () => {
    it.each([
        ['canAccessDashboard', canAccessDashboard, [ADMIN]],
        ['canAccessSales', canAccessSales, [ADMIN, CASHIER]],
        ['canAccessSuppliers', canAccessSuppliers, [ADMIN, WAREHOUSE]],
        ['canWriteInventory', canWriteInventory, [ADMIN, WAREHOUSE]],
        ['canModerateAlerts', canModerateAlerts, [ADMIN, WAREHOUSE]],
        ['canManageAlertRules', canManageAlertRules, [ADMIN]],
        ['canManageTeam', canManageTeam, [ADMIN]],
        ['canEditBusinessProfile', canEditBusinessProfile, [ADMIN]],
        ['canEditCustomers', canEditCustomers, [ADMIN]],
        ['canCancelSales', canCancelSales, [ADMIN]],
        ['canRevertInstallmentPayments', canRevertInstallmentPayments, [ADMIN]]
    ])('%s grants exactly %j and denies every other role', (_name, fn, allowedRoles) => {
        for (const role of [ADMIN, CASHIER, WAREHOUSE]) {
            expect(fn(role)).toBe(allowedRoles.includes(role));
        }
    });

    it.each([
        canAccessDashboard, canAccessSales, canAccessSuppliers, canWriteInventory,
        canModerateAlerts, canManageAlertRules, canManageTeam, canEditBusinessProfile,
        canEditCustomers, canCancelSales, canRevertInstallmentPayments
    ])('denies an unrecognized or missing role (fn #%#)', (fn) => {
        expect(fn('SOME_UNKNOWN_ROLE')).toBe(false);
        expect(fn(undefined)).toBe(false);
        expect(fn(null)).toBe(false);
    });
});
