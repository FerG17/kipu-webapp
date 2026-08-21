import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { todayLocalDateString } from './local-date.js';

describe('todayLocalDateString', () => {
    const originalTz = process.env.TZ;

    afterEach(() => {
        vi.useRealTimers();
        process.env.TZ = originalTz;
    });

    it('returns yyyy-mm-dd', () => {
        expect(todayLocalDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    // The whole reason this function exists (see its own doc comment): in a
    // timezone behind UTC, the last few hours of a local day are already
    // "tomorrow" in UTC. A naive `new Date().toISOString().slice(0, 10)`
    // reads as tomorrow's date during exactly that window — this is the bug
    // QA16-style regressions look like, so the fix is pinned here.
    it('reads as the LOCAL calendar day, not the UTC one, in the last hours of a Lima day', () => {
        process.env.TZ = 'America/Lima'; // UTC-5, no DST
        vi.useFakeTimers();
        // 2026-08-20 23:30 in Lima == 2026-08-21 04:30 UTC.
        vi.setSystemTime(new Date('2026-08-21T04:30:00.000Z'));

        const naiveUtcDate = new Date().toISOString().slice(0, 10);
        expect(naiveUtcDate).toBe('2026-08-21'); // confirms the trap is real at this instant

        expect(todayLocalDateString()).toBe('2026-08-20');
    });

    it('agrees with the UTC date well within the local day (no boundary involved)', () => {
        process.env.TZ = 'America/Lima';
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-20T15:00:00.000Z')); // 2026-08-20 10:00 Lima

        expect(todayLocalDateString()).toBe('2026-08-20');
    });
});
