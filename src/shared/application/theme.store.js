/**
 * Application service store for the manual light/dark/system theme toggle.
 *
 * `system` is resolved to a concrete `light`/`dark` value at runtime via
 * matchMedia instead of leaning on `prefers-color-scheme` in CSS — this is a
 * real app with JS available, not a static page, so resolving here lets both
 * plain CSS (tokens.css) and PrimeVue's own preset react to the exact same
 * `data-theme` attribute instead of running two independent mechanisms that
 * could disagree.
 *
 * @module useThemeStore
 */
import { defineStore }   from 'pinia';
import { computed, ref } from 'vue';

const STORAGE_KEY = 'kipu-theme-mode';

const useThemeStore = defineStore('theme', () => {
    const mode = ref(localStorage.getItem(STORAGE_KEY) || 'system');

    const systemPrefersDark = ref(
        typeof window !== 'undefined' && window.matchMedia
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
            : false
    );

    /**
     * The concrete theme actually applied to the document — `mode` resolved
     * to `light`/`dark`, following the OS preference when mode is `system`.
     * @type {import('vue').ComputedRef<'light'|'dark'>}
     */
    const resolvedTheme = computed(() =>
        mode.value === 'system' ? (systemPrefersDark.value ? 'dark' : 'light') : mode.value
    );

    /** Stamps `data-theme` on the document root so tokens.css / PrimeVue react. */
    function applyTheme() {
        document.documentElement.setAttribute('data-theme', resolvedTheme.value);
    }

    /**
     * Sets the theme mode, persists it, and re-applies it immediately.
     * @param {'light'|'dark'|'system'} newMode
     */
    function setMode(newMode) {
        mode.value = newMode;
        localStorage.setItem(STORAGE_KEY, newMode);
        applyTheme();
    }

    /**
     * Applies the current theme and starts listening for OS-level changes
     * (only relevant while mode is `system`). Called once from main.js after
     * the app mounts.
     */
    function initialize() {
        applyTheme();
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', (event) => {
            systemPrefersDark.value = event.matches;
            if (mode.value === 'system') applyTheme();
        });
    }

    return { mode, resolvedTheme, setMode, initialize };
});

export default useThemeStore;
