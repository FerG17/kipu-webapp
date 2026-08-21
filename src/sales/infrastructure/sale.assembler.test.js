import { describe, it, expect, vi, afterEach } from 'vitest';
import { SaleAssembler } from './sale.assembler.js';
import { Sale } from '../domain/model/sale.entity.js';

describe('SaleAssembler', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('toEntityFromResource', () => {
        it('builds a Sale carrying the resource fields over', () => {
            const sale = SaleAssembler.toEntityFromResource({ id: 7, status: 'PAID', totalAmount: 42 });
            expect(sale).toBeInstanceOf(Sale);
            expect(sale.id).toBe(7);
            expect(sale.status).toBe('PAID');
        });
    });

    describe('toEntitiesFromResponse', () => {
        it('maps a plain-array response body', () => {
            const response = { status: 200, data: [{ id: 1 }, { id: 2 }] };
            const sales = SaleAssembler.toEntitiesFromResponse(response);
            expect(sales).toHaveLength(2);
            expect(sales.every(sale => sale instanceof Sale)).toBe(true);
        });

        it("maps a paginated response body ({ items: [...] })", () => {
            const response = { status: 200, data: { items: [{ id: 1 }], totalCount: 1 } };
            const sales = SaleAssembler.toEntitiesFromResponse(response);
            expect(sales).toHaveLength(1);
        });

        it('returns an empty array and logs on a non-200 response, instead of throwing', () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const response = { status: 500, statusText: 'Internal Server Error', data: null };

            expect(SaleAssembler.toEntitiesFromResponse(response)).toEqual([]);
            expect(errorSpy).toHaveBeenCalledOnce();
        });
    });
});
