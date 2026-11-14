// Leaflet needs the DOM, and Pages serves static files only, so build a SPA.
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  ssr: false,
  devtools: { enabled: false },
  // Override at build/run time with NUXT_PUBLIC_API_BASE (no trailing slash).
  runtimeConfig: { public: { apiBase: 'http://127.0.0.1:8080' } },
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
