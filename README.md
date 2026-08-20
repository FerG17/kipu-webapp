# Kipu — kipu-webapp

Frontend for Kipu, a single-tenant warehouse/inventory management webapp: product catalog and stock, point-of-sale, purchase orders, low-stock/expiration alerts, and a sales dashboard. Vue 3 (`<script setup>`) + Vite + Pinia + PrimeVue, talking to the [kipu-platform](../kipu-platform) backend over a JSON REST API.

## Setup

```sh
npm install
npm run dev      # start the dev server (Vite)
npm run build    # production build
npm run preview  # preview a production build locally
```

The dev server expects the backend from `kipu-platform` running locally. Endpoint configuration lives in `.env.development` (tracked, no secrets — just the API base URL and per-resource paths, e.g. `VITE_BODEGA_API_BASE_URL`). To point at a different backend (e.g. a LAN IP), add a git-ignored `.env.development.local` overriding just the variables you need — Vite merges it on top automatically.

## IDE

[Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (or your IDE's built-in Vue support) is recommended over Vetur.
