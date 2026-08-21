import { describe, it, expect, vi, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useTodayLocalDateString } from './use-today-local-date.js';

function mountWithComposable(intervalMs) {
    const exposedRef = { value: null };
    const TestHost = defineComponent({
        setup() {
            exposedRef.value = useTodayLocalDateString(intervalMs);
            return () => h('div', exposedRef.value.value);
        }
    });
    const wrapper = mount(TestHost);
    return { wrapper, today: exposedRef.value };
}

describe('useTodayLocalDateString', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('initializes to today, in yyyy-mm-dd', () => {
        const { today, wrapper } = mountWithComposable();
        expect(today.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        wrapper.unmount();
    });

    it('flips to the next day once the system clock crosses local midnight', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-20T23:59:00'));
        const { today, wrapper } = mountWithComposable(60_000);
        const before = today.value;

        vi.setSystemTime(new Date('2026-08-21T00:01:00'));
        vi.advanceTimersByTime(60_000);

        expect(today.value).not.toBe(before);
        wrapper.unmount();
    });

    it('does not update the ref when the recheck lands on the same day', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-20T10:00:00'));
        const { today, wrapper } = mountWithComposable(60_000);

        vi.setSystemTime(new Date('2026-08-20T10:01:00'));
        vi.advanceTimersByTime(60_000);

        expect(today.value).toBe('2026-08-20');
        wrapper.unmount();
    });

    it('stops rechecking after unmount (clears its interval)', () => {
        vi.useFakeTimers();
        const clearSpy = vi.spyOn(globalThis, 'clearInterval');
        const { wrapper } = mountWithComposable(60_000);

        wrapper.unmount();

        expect(clearSpy).toHaveBeenCalledOnce();
    });
});
