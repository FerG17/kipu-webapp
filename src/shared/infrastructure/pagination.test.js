import { describe, it, expect, vi, afterEach } from 'vitest';
import { warnIfTruncated } from './pagination.js';

describe('warnIfTruncated', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('warns when the page returned fewer items than totalCount', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const response = { data: { totalCount: 250, items: new Array(200).fill({}) } };

        warnIfTruncated(response, 'Ventas');

        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0][0]).toContain('Ventas');
        expect(warnSpy.mock.calls[0][0]).toContain('200 of 250');
    });

    it('does not warn when every row fit on the page', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const response = { data: { totalCount: 5, items: new Array(5).fill({}) } };

        warnIfTruncated(response, 'Ventas');

        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn on a non-paginated response shape (plain array body)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const response = { data: [{ id: 1 }, { id: 2 }] };

        warnIfTruncated(response, 'Ventas');

        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not throw on a missing or malformed response', () => {
        expect(() => warnIfTruncated(undefined, 'Ventas')).not.toThrow();
        expect(() => warnIfTruncated({}, 'Ventas')).not.toThrow();
        expect(() => warnIfTruncated({ data: null }, 'Ventas')).not.toThrow();
    });
});
