import { ref, onUnmounted } from 'vue';
import { todayLocalDateString } from '../domain/model/local-date.js';

/**
 * Reactive 'yyyy-mm-dd' for today in local time, rechecked periodically so
 * a screen left open across local midnight splits "today" from "yesterday"
 * correctly instead of freezing on the date it happened to mount with.
 *
 * @param {number} [intervalMs=60000] - How often to recheck.
 * @returns {import('vue').Ref<string>}
 */
export function useTodayLocalDateString(intervalMs = 60000) {
    const today = ref(todayLocalDateString());

    const intervalId = setInterval(() => {
        const current = todayLocalDateString();
        if (current !== today.value) today.value = current;
    }, intervalMs);

    onUnmounted(() => clearInterval(intervalId));

    return today;
}
