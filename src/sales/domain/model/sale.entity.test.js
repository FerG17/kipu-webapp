import { describe, it, expect } from 'vitest';
import { Sale, SaleStatus, PaymentMethod } from './sale.entity.js';
import { SaleDetail } from './sale-detail.entity.js';

describe('Sale', () => {
    describe('subtotal', () => {
        it('sums the lineTotal of every detail', () => {
            const sale = new Sale({
                details: [
                    { productId: 1, quantity: 2, unitPrice: 10 }, // 20
                    { productId: 2, quantity: 1, unitPrice: 5.5 }  // 5.5
                ]
            });
            expect(sale.subtotal).toBe(25.5);
        });

        it('is 0 for an empty cart', () => {
            expect(new Sale({}).subtotal).toBe(0);
        });

        it('hydrates plain-object details into real SaleDetail instances so lineTotal works', () => {
            const sale = new Sale({ details: [{ productId: 1, quantity: 2, unitPrice: 3 }] });
            expect(sale.details[0]).toBeInstanceOf(SaleDetail);
        });

        it('does not double-wrap details that are already SaleDetail instances', () => {
            const detail = new SaleDetail({ productId: 1, quantity: 1, unitPrice: 10 });
            const sale = new Sale({ details: [detail] });
            expect(sale.details[0]).toBe(detail);
        });
    });

    describe('status getters', () => {
        it.each([
            [SaleStatus.PAID, 'isPaid'],
            [SaleStatus.CREDIT, 'isCredit'],
            [SaleStatus.CANCELLED, 'isCancelled']
        ])('status %s makes only %s true', (status, trueGetter) => {
            const sale = new Sale({ status });
            expect(sale.isPaid).toBe(trueGetter === 'isPaid');
            expect(sale.isCredit).toBe(trueGetter === 'isCredit');
            expect(sale.isCancelled).toBe(trueGetter === 'isCancelled');
        });
    });

    it('exposes the exact PaymentMethod values the backend accepts', () => {
        expect(Object.values(PaymentMethod)).toEqual(['CASH', 'CARD', 'YAPE', 'PLIN', 'CREDIT']);
    });
});
