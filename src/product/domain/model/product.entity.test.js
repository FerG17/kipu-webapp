import { describe, it, expect } from 'vitest';
import { Product, UnitOfSale } from './product.entity.js';

describe('Product', () => {
    describe('isSoldByWeight', () => {
        it('is false by default (unitOfSale defaults to UNIT)', () => {
            const product = new Product({ name: 'Coca Cola 1.5L' });
            expect(product.unitOfSale).toBe(UnitOfSale.UNIT);
            expect(product.isSoldByWeight).toBe(false);
        });

        it('is true for a product explicitly marked as sold by weight', () => {
            const product = new Product({ name: 'Arroz', unitOfSale: UnitOfSale.WEIGHT });
            expect(product.isSoldByWeight).toBe(true);
        });

        it('is false for a product explicitly marked as sold by unit', () => {
            const product = new Product({ name: 'Lata de atún', unitOfSale: UnitOfSale.UNIT });
            expect(product.isSoldByWeight).toBe(false);
        });
    });
});
