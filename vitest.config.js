import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Separate from vite.config.js on purpose: Vitest's `test` block isn't part
// of Vite's own config type, and keeping it out of the file Vite itself
// reads for `dev`/`build` avoids any chance of test-only settings leaking
// into those.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
