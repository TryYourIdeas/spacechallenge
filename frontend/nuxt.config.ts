// Leaflet needs the DOM, and Pages serves static files only, so build a SPA.
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  ssr: false,
  devtools: { enabled: false },
  // Override at build/run time with NUXT_PUBLIC_API_BASE (no trailing slash).
  // Empty = same origin (the Nuxt server serves the SPA and /api). For a separately hosted
  // static build (Pages) set NUXT_PUBLIC_API_BASE to the API's https origin, no trailing slash.
  runtimeConfig: { public: { apiBase: '' } },
  nitro: { compressPublicAssets: true },
  css: [
    '@fontsource-variable/geist',
    '@fontsource-variable/geist-mono',
    'leaflet/dist/leaflet.css',
    '~/assets/css/tokens.css',
  ],
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Layer Explorer',
      meta: [{ name: 'color-scheme', content: 'dark' }],
    },
  },
})
