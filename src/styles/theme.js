import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * PrimeVue preset for the bodega — replaces the untouched "Material" default
 * (stock blue, generic-SaaS look the design review explicitly moved away
 * from) with the same deep teal used across the app's own chrome
 * (see styles/tokens.css — kept in sync by hand, since PrimeVue's token
 * format and the app's plain CSS variables don't share one).
 *
 * Only `primary` is overridden. PrimeVue's own neutral/surface scale (a
 * calm slate/zinc grey) is left as-is: it already reads as chosen rather
 * than default, and doesn't fight the teal — bespoke surfaces (the sidebar,
 * cards, chips) carry the paper/carbon identity through tokens.css instead,
 * so only PrimeVue's own form controls and data tables use this palette.
 *
 * darkModeSelector defaults to "system" (PrimeVue 5), so this preset follows
 * prefers-color-scheme the same way tokens.css does — no separate wiring
 * needed to keep the two in sync.
 */
const BodegaPreset = definePreset(Aura, {
    semantic: {
        primary: {
            50: '#f4f6f6',
            100: '#c8d4d4',
            200: '#9db2b2',
            300: '#728f90',
            400: '#466d6e',
            500: '#1B4B4C',
            600: '#174041',
            700: '#133535',
            800: '#0f292a',
            900: '#0b1e1e',
            950: '#071313'
        }
    }
});

export default BodegaPreset;
