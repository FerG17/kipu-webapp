import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * PrimeVue preset for the bodega — replaces the untouched "Material" default
 * (stock blue, generic-SaaS look the design review explicitly moved away
 * from) with the same warm terracotta used across the app's own chrome
 * (see styles/tokens.css — kept in sync by hand, since PrimeVue's token
 * format and the app's plain CSS variables don't share one). Fase F7.1:
 * recolored from the original deep teal to terracotta, reusing the tonal
 * ramp Claude Design generated in OKLCH for the redesign (`_ds/organic-.../
 * styles.css`, `--color-accent-100` through `-900`) as the 100-900 steps,
 * extended with 50/950 the same way the original teal ramp was.
 *
 * Only `primary` is overridden. PrimeVue's own neutral/surface scale (a
 * calm slate/zinc grey) is left as-is: it already reads as chosen rather
 * than default, and doesn't fight the terracotta — bespoke surfaces (the
 * sidebar, cards, chips) carry the cream/terracotta identity through
 * tokens.css instead, so only PrimeVue's own form controls and data tables
 * use this palette.
 *
 * darkModeSelector defaults to "system" (PrimeVue 5), so this preset follows
 * prefers-color-scheme the same way tokens.css does — no separate wiring
 * needed to keep the two in sync.
 */
const KipuPreset = definePreset(Aura, {
    semantic: {
        primary: {
            50: '#fff8f4',
            100: '#fff2eb',
            200: '#ffe1d0',
            300: '#ffc6a5',
            400: '#f6a06b',
            500: '#d67f48',
            600: '#b2622d',
            700: '#8c491a',
            800: '#643312',
            900: '#402310',
            950: '#2b1709'
        }
    }
});

export default KipuPreset;
