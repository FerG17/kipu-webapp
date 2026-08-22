import { describe, it, expect } from 'vitest';
import { SaleDetail } from './sale-detail.entity.js';

describe('SaleDetail.lineTotal', () => {
    it('is quantity × unitPrice with no discount', () => {
        const detail = new SaleDetail({ quantity: 3, unitPrice: 10 });
        expect(detail.lineTotal).toBe(30);
    });

    it('applies discount as a decimal fraction of the gross amount', () => {
        const detail = new SaleDetail({ quantity: 2, unitPrice: 50, discount: 0.1 });
        // 100 gross, 10% off => 90
        expect(detail.lineTotal).toBe(90);
    });

    it('rounds to two decimal places', () => {
        const detail = new SaleDetail({ quantity: 3, unitPrice: 10.005 });
        // 30.015 -> rounds to 30.02, not floating-point noise like 30.014999999999997
        expect(detail.lineTotal).toBe(30.02);
    });

    it('defaults to quantity 1 and unitPrice 0 when omitted', () => {
        const detail = new SaleDetail({});
        expect(detail.lineTotal).toBe(0);
    });
});
