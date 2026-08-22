import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { SaleStatus, PaymentMethod } from '../domain/model/sale.entity.js';

// The store instantiates `new SalesApi()` once at module scope and calls
// its methods directly (no dependency injection), so the module itself is
// mocked here — every `new SalesApi()` call returns the same `mockApi`
// object, whose methods each test configures individually.
const mockApi = {
    getSales: vi.fn(),
    getSalesRevenue: vi.fn(),
    getCustomers: vi.fn(),
    getCustomerById: vi.fn(),
    createSale: vi.fn(),
    updateSale: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    deleteCustomer: vi.fn(),
    getPendingPaymentPlans: vi.fn(),
    getPaymentPlanBySale: vi.fn(),
    createPaymentPlan: vi.fn(),
    registerInstallmentPayment: vi.fn(),
    revertInstallmentPayment: vi.fn()
};

vi.mock('../infrastructure/sales.api.js', () => ({
    SalesApi: vi.fn().mockImplementation(function SalesApi() {
        return mockApi;
    })
}));

// Imported after the mock so the store picks up the mocked SalesApi.
const { default: useSalesStore } = await import('./sales.store.js');

describe('sales.store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        for (const fn of Object.values(mockApi)) fn.mockReset();
    });

    describe('POS session — pure in-memory cart logic', () => {
        it('startNewSale opens an empty cart with a fresh idempotency key', () => {
            const store = useSalesStore();
            store.startNewSale(11);

            expect(store.currentSale).not.toBeNull();
            expect(store.currentSale.businessId).toBe(11);
            expect(store.currentSale.details).toEqual([]);
        });

        it('addDetailToCurrentSale fails with no active session', () => {
            const store = useSalesStore();
            const result = store.addDetailToCurrentSale({ productId: 1, quantity: 1, unitPrice: 10, availableStock: 5 });

            expect(result).toEqual({ success: false, errorKey: 'pos.error-no-active-sale' });
        });

        it('addDetailToCurrentSale rejects a non-positive quantity', () => {
            const store = useSalesStore();
            store.startNewSale(1);

            expect(store.addDetailToCurrentSale({ productId: 1, quantity: 0, unitPrice: 10, availableStock: 5 }))
                .toEqual({ success: false, errorKey: 'pos.error-quantity-invalid' });
        });

        it('addDetailToCurrentSale rejects a quantity over available stock', () => {
            const store = useSalesStore();
            store.startNewSale(1);

            expect(store.addDetailToCurrentSale({ productId: 1, quantity: 6, unitPrice: 10, availableStock: 5 }))
                .toEqual({ success: false, errorKey: 'pos.error-insufficient-stock' });
            expect(store.currentSale.details).toHaveLength(0);
        });

        it('addDetailToCurrentSale adds a new line for a product not yet in the cart', () => {
            const store = useSalesStore();
            store.startNewSale(1);
            const result = store.addDetailToCurrentSale({ productId: 7, quantity: 2, unitPrice: 15, availableStock: 10 });

            expect(result).toEqual({ success: true, errorKey: null });
            expect(store.currentSale.details).toHaveLength(1);
            expect(store.currentSale.details[0]).toMatchObject({ productId: 7, quantity: 2, unitPrice: 15 });
        });

        it('addDetailToCurrentSale merges into the existing line instead of duplicating it', () => {
            const store = useSalesStore();
            store.startNewSale(1);
            store.addDetailToCurrentSale({ productId: 7, quantity: 2, unitPrice: 15, availableStock: 10 });
            const result = store.addDetailToCurrentSale({ productId: 7, quantity: 3, unitPrice: 15, availableStock: 10 });

            expect(result).toEqual({ success: true, errorKey: null });
            expect(store.currentSale.details).toHaveLength(1);
            expect(store.currentSale.details[0].quantity).toBe(5);
        });

        it('addDetailToCurrentSale rejects a merge that would exceed stock, leaving the existing line untouched', () => {
            const store = useSalesStore();
            store.startNewSale(1);
            store.addDetailToCurrentSale({ productId: 7, quantity: 4, unitPrice: 15, availableStock: 5 });
            const result = store.addDetailToCurrentSale({ productId: 7, quantity: 4, unitPrice: 15, availableStock: 5 });

            expect(result).toEqual({ success: false, errorKey: 'pos.error-insufficient-stock' });
            expect(store.currentSale.details[0].quantity).toBe(4);
        });

        it('addDetailToCurrentSale — X5 Bloque D: accepts a fractional quantity (weight-sold product)', () => {
            const store = useSalesStore();
            store.startNewSale(1);

            const result = store.addDetailToCurrentSale({ productId: 9, quantity: 0.35, unitPrice: 12, availableStock: 5 });

            expect(result).toEqual({ success: true, errorKey: null });
            expect(store.currentSale.details[0].quantity).toBe(0.35);
        });

        it('updateDetailQuantity changes an existing line within stock', () => {
            const store = useSalesStore();
            store.startNewSale(1);
            store.addDetailToCurrentSale({ productId: 7, quantity: 2, unitPrice: 15, availableStock: 10 });

            const result = store.updateDetailQuantity({ productId: 7, newQuantity: 6, availableStock: 10 });

            expect(result).toEqual({ success: true, errorKey: null });
            expect(store.currentSale.details[0].quantity).toBe(6);
        });

        it('updateDetailQuantity rejects a quantity under 1 or over stock', () => {
            const store = useSalesStore();
            store.startNewSale(1);
            store.addDetailToCurrentSale({ productId: 7, quantity: 2, unitPrice: 15, availableStock: 10 });

            expect(store.updateDetailQuantity({ productId: 7, newQuantity: 0, availableStock: 10 }))
                .toEqual({ success: false, errorKey: 'pos.error-quantity-invalid' });
            expect(store.updateDetailQuantity({ productId: 7, newQuantity: 11, availableStock: 10 }))
                .toEqual({ success: false, errorKey: 'pos.error-insufficient-stock' });
            expect(store.currentSale.details[0].quantity).toBe(2);
        });

        it('updateDetailQuantity — X5 Bloque D: accepts a fractional quantity below 1 (weight-sold product)', () => {
            const store = useSalesStore();
            store.startNewSale(1);
            store.addDetailToCurrentSale({ productId: 9, quantity: 1, unitPrice: 12, availableStock: 5 });

            const result = store.updateDetailQuantity({ productId: 9, newQuantity: 0.25, availableStock: 5 });

            expect(result).toEqual({ success: true, errorKey: null });
            expect(store.currentSale.details[0].quantity).toBe(0.25);
        });

        it('removeDetailFromCurrentSale drops the matching line and leaves the rest', () => {
            const store = useSalesStore();
            store.startNewSale(1);
            store.addDetailToCurrentSale({ productId: 7, quantity: 1, unitPrice: 15, availableStock: 10 });
            store.addDetailToCurrentSale({ productId: 8, quantity: 1, unitPrice: 20, availableStock: 10 });

            store.removeDetailFromCurrentSale(7);

            expect(store.currentSale.details).toHaveLength(1);
            expect(store.currentSale.details[0].productId).toBe(8);
        });

        it('removeDetailFromCurrentSale is a no-op with no active session', () => {
            const store = useSalesStore();
            expect(() => store.removeDetailFromCurrentSale(7)).not.toThrow();
        });

        it('discardCurrentSale clears the session', () => {
            const store = useSalesStore();
            store.startNewSale(1);
            store.discardCurrentSale();
            expect(store.currentSale).toBeNull();
        });
    });

    describe('confirmSale', () => {
        it('rejects with no active session', async () => {
            const store = useSalesStore();
            const result = await store.confirmSale({ paymentMethod: PaymentMethod.CASH });
            expect(result).toMatchObject({ success: false, errorKey: 'pos.error-no-active-sale' });
        });

        it('rejects an empty cart', async () => {
            const store = useSalesStore();
            store.startNewSale(1);
            const result = await store.confirmSale({ paymentMethod: PaymentMethod.CASH });
            expect(result).toMatchObject({ success: false, errorKey: 'pos.error-empty-cart' });
        });

        it('rejects a missing or unrecognized payment method', async () => {
            const store = useSalesStore();
            store.startNewSale(1);
            store.addDetailToCurrentSale({ productId: 7, quantity: 1, unitPrice: 15, availableStock: 10 });

            expect(await store.confirmSale({})).toMatchObject({ success: false, errorKey: 'pos.error-no-payment-method' });
            expect(await store.confirmSale({ paymentMethod: 'BITCOIN' }))
                .toMatchObject({ success: false, errorKey: 'pos.error-no-payment-method' });
            expect(mockApi.createSale).not.toHaveBeenCalled();
        });

        // X4 Bloque 6: unitPrice/discount aren't part of the backend's sale
        // contract (SaleLineResource) — the backend always prices from the
        // product's own BasePrice and silently ignored a submitted unitPrice
        // even before it was removed from the wire shape entirely. The store
        // must never send them, mirroring SalesIntegrityTests on the backend.
        it('sends only productId/quantity per line — no unitPrice, no discount', async () => {
            const store = useSalesStore();
            store.startNewSale(1);
            store.addDetailToCurrentSale({ productId: 7, quantity: 2, unitPrice: 999, availableStock: 10, discount: 0.5 });
            mockApi.createSale.mockResolvedValue({ data: { id: 100, status: 'PAID', details: [] } });

            await store.confirmSale({ paymentMethod: PaymentMethod.CASH, customerId: 3, description: 'nota' });

            expect(mockApi.createSale).toHaveBeenCalledOnce();
            const sentResource = mockApi.createSale.mock.calls[0][0];
            expect(sentResource.lines).toEqual([{ productId: 7, quantity: 2 }]);
            expect(sentResource).toMatchObject({
                customerId: 3,
                paymentMethod: PaymentMethod.CASH,
                currency: 'PEN',
                description: 'nota'
            });
            expect(typeof sentResource.idempotencyKey).toBe('string');
            expect(sentResource.idempotencyKey.length).toBeGreaterThan(0);
        });

        it('on success, records the sale, clears the cart, and clears the idempotency key', async () => {
            const store = useSalesStore();
            store.startNewSale(1);
            store.addDetailToCurrentSale({ productId: 7, quantity: 1, unitPrice: 15, availableStock: 10 });
            mockApi.createSale.mockResolvedValue({ data: { id: 42, status: 'PAID', details: [] } });

            const result = await store.confirmSale({ paymentMethod: PaymentMethod.CASH });

            expect(result.success).toBe(true);
            expect(result.sale.id).toBe(42);
            expect(store.sales.map(sale => sale.id)).toContain(42);
            expect(store.currentSale).toBeNull();
        });

        it('surfaces the backend detail message and status on failure, without touching local state', async () => {
            const store = useSalesStore();
            store.startNewSale(1);
            store.addDetailToCurrentSale({ productId: 7, quantity: 5, unitPrice: 15, availableStock: 10 });
            mockApi.createSale.mockRejectedValue({
                response: { status: 409, data: { detail: 'Insufficient stock' } }
            });

            const result = await store.confirmSale({ paymentMethod: PaymentMethod.CASH });

            expect(result).toMatchObject({
                success: false,
                errorKey: 'pos.error-confirm-failed',
                errorDetail: 'Insufficient stock',
                status: 409
            });
            // The failed attempt must not have cleared the cart — the cashier
            // needs to see it to retry or fix it.
            expect(store.currentSale).not.toBeNull();
            expect(store.currentSale.details).toHaveLength(1);
        });

        it('handles a rejection with no HTTP response (network error) without throwing', async () => {
            const store = useSalesStore();
            store.startNewSale(1);
            store.addDetailToCurrentSale({ productId: 7, quantity: 1, unitPrice: 15, availableStock: 10 });
            mockApi.createSale.mockRejectedValue(new Error('Network Error'));

            const result = await store.confirmSale({ paymentMethod: PaymentMethod.CASH });

            expect(result).toMatchObject({ success: false, errorDetail: null, status: null });
        });
    });

    describe('cancelSale', () => {
        it('refuses to cancel an already-cancelled sale without calling the API', async () => {
            const store = useSalesStore();
            const result = await store.cancelSale({ id: 1, status: SaleStatus.CANCELLED });

            expect(result).toEqual({ success: false });
            expect(mockApi.updateSale).not.toHaveBeenCalled();
        });

        it('cancels a PAID sale and replaces it in local state', async () => {
            const store = useSalesStore();
            store.sales.push({ id: 5, status: SaleStatus.PAID });
            mockApi.updateSale.mockResolvedValue({ data: { id: 5, status: SaleStatus.CANCELLED } });

            const result = await store.cancelSale({ id: 5, status: SaleStatus.PAID });

            expect(result).toEqual({ success: true });
            expect(mockApi.updateSale).toHaveBeenCalledWith(5, { status: SaleStatus.CANCELLED });
            expect(store.sales.find(sale => sale.id === 5).status).toBe(SaleStatus.CANCELLED);
        });

        it('refreshes pending payment plans after cancelling, only if plans were already loaded', async () => {
            const store = useSalesStore();
            store.sales.push({ id: 5, status: SaleStatus.PAID });
            mockApi.updateSale.mockResolvedValue({ data: { id: 5, status: SaleStatus.CANCELLED } });
            mockApi.getPendingPaymentPlans.mockResolvedValue({ data: [] });
            store.paymentPlansLoaded = true;

            await store.cancelSale({ id: 5, status: SaleStatus.PAID });

            expect(mockApi.getPendingPaymentPlans).toHaveBeenCalledOnce();
        });

        it('returns success:false instead of throwing when the API call fails', async () => {
            const store = useSalesStore();
            mockApi.updateSale.mockRejectedValue(new Error('boom'));

            const result = await store.cancelSale({ id: 5, status: SaleStatus.PAID });

            expect(result).toEqual({ success: false });
        });
    });

    describe('registerInstallmentPayment — X5 #5: keeps the matching Sale.isFullyPaid in sync', () => {
        it('removes the plan from the pending list and marks the matching sale fully paid once complete', async () => {
            const store = useSalesStore();
            store.paymentPlans.push({ id: 9, saleId: 5 });
            store.sales.push({ id: 5, status: SaleStatus.CREDIT, isFullyPaid: false });
            mockApi.registerInstallmentPayment.mockResolvedValue({
                data: { id: 9, saleId: 5, totalInstallments: 2, paidInstallments: 2, isFullyPaid: true, isCancelled: false, payments: [] }
            });

            await store.registerInstallmentPayment(9);

            expect(store.paymentPlans.find(plan => plan.id === 9)).toBeUndefined();
            expect(store.sales.find(sale => sale.id === 5).isFullyPaid).toBe(true);
        });

        it('keeps the plan pending and the sale not fully paid when installments remain', async () => {
            const store = useSalesStore();
            store.paymentPlans.push({ id: 9, saleId: 5 });
            store.sales.push({ id: 5, status: SaleStatus.CREDIT, isFullyPaid: false });
            mockApi.registerInstallmentPayment.mockResolvedValue({
                data: { id: 9, saleId: 5, totalInstallments: 2, paidInstallments: 1, isFullyPaid: false, isCancelled: false, payments: [] }
            });

            await store.registerInstallmentPayment(9);

            expect(store.paymentPlans.find(plan => plan.id === 9)).toBeDefined();
            expect(store.sales.find(sale => sale.id === 5).isFullyPaid).toBe(false);
        });

        it('does not throw when the matching sale is not loaded locally', async () => {
            const store = useSalesStore();
            mockApi.registerInstallmentPayment.mockResolvedValue({
                data: { id: 9, saleId: 999, totalInstallments: 1, paidInstallments: 1, isFullyPaid: true, isCancelled: false, payments: [] }
            });

            await expect(store.registerInstallmentPayment(9)).resolves.toBeDefined();
        });
    });

    describe('revertInstallmentPayment — X5 #5: the mirror patch when a payment is undone', () => {
        it('marks the matching sale not fully paid again', async () => {
            const store = useSalesStore();
            store.sales.push({ id: 5, status: SaleStatus.CREDIT, isFullyPaid: true });
            mockApi.revertInstallmentPayment.mockResolvedValue({
                data: { id: 9, saleId: 5, totalInstallments: 2, paidInstallments: 1, isFullyPaid: false, isCancelled: false, payments: [] }
            });

            await store.revertInstallmentPayment(9);

            expect(store.sales.find(sale => sale.id === 5).isFullyPaid).toBe(false);
        });
    });
});
