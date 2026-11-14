// Leaflet needs the DOM, and Pages serves static files only, so build a SPA.
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  ssr: false,
  devtools: { enabled: false },
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
